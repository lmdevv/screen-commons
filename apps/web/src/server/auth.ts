import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { users } from "@open-ui/db";

import { getDb } from "../services";

export type AppRole = "contributor" | "trusted_contributor" | "reviewer" | "administrator";

export type LocalUser = {
  id: string;
  clerkUserId: string;
  displayName: string;
  primaryEmail: string | null;
  avatarUrl: string | null;
  role: AppRole;
  status: "active" | "suspended" | "deleted";
};

export class AuthorizationError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

export async function requireLocalUser(): Promise<LocalUser> {
  const session = await auth();
  if (!session.userId) throw new AuthorizationError("Authentication required", 401);

  const db = getDb();
  const existing = await db.query.users.findFirst({
    where: (table, operators) => operators.eq(table.clerkUserId, session.userId!),
  });
  if (existing) {
    if (existing.status !== "active") throw new AuthorizationError("Account is not active", 403);
    return existing as LocalUser;
  }

  const identity = await clerkClient().users.getUser(session.userId);
  const primaryEmail =
    identity.emailAddresses.find((email) => email.id === identity.primaryEmailAddressId)
      ?.emailAddress ?? null;
  const displayName =
    [identity.firstName, identity.lastName].filter(Boolean).join(" ") ||
    identity.username ||
    primaryEmail ||
    "Contributor";
  const now = new Date();
  const id = crypto.randomUUID();
  const requestedRole = identity.publicMetadata.openUiRole;
  const role: AppRole =
    typeof requestedRole === "string" && requestedRole in roleRank
      ? (requestedRole as AppRole)
      : "contributor";
  const [created] = await db
    .insert(users)
    .values({
      id,
      clerkUserId: session.userId,
      displayName,
      primaryEmail,
      avatarUrl: identity.imageUrl,
      role,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();
  if (created) return created as LocalUser;

  const concurrentlyCreated = await db.query.users.findFirst({
    where: (table, operators) => operators.eq(table.clerkUserId, session.userId!),
  });
  if (!concurrentlyCreated) throw new Error("Could not provision the authenticated user");
  if (concurrentlyCreated.status !== "active") {
    throw new AuthorizationError("Account is not active", 403);
  }
  return concurrentlyCreated as LocalUser;
}

const roleRank: Record<AppRole, number> = {
  contributor: 0,
  trusted_contributor: 1,
  reviewer: 2,
  administrator: 3,
};

export async function requireRole(minimum: AppRole): Promise<LocalUser> {
  const user = await requireLocalUser();
  if (roleRank[user.role] < roleRank[minimum]) {
    throw new AuthorizationError(`${minimum} role required`, 403);
  }
  return user;
}

export function canManageSubmission(user: LocalUser, ownerId: string): boolean {
  return user.id === ownerId || user.role === "reviewer" || user.role === "administrator";
}
