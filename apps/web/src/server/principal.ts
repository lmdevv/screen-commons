import type { Role, User } from "@screen-commons/core";

import { getAuth } from "./auth";
import { verifyToken } from "./keys";

export interface PrincipalUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  createdAt: Date;
}

/** Who is making a request: a signed-in browser session or an API key. */
export interface Principal {
  user: PrincipalUser;
  via: "session" | "key";
  keyId?: string;
}

export function isAdmin(principal: Principal | null | undefined): boolean {
  return principal?.user.role === "admin";
}

export function toUser(principal: Principal): User {
  const { user } = principal;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

function normalizeUser(raw: {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: unknown;
  createdAt: Date | string;
}): PrincipalUser {
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    image: raw.image ?? null,
    role: raw.role === "admin" ? "admin" : "member",
    createdAt: new Date(raw.createdAt),
  };
}

export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/iu.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

/** Session lookup only (cookies). */
export async function getSessionPrincipal(headers: Headers): Promise<Principal | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  return { user: normalizeUser(session.user), via: "session" };
}

/**
 * Unified auth: `Authorization: Bearer sc_…` (any origin) or the Better Auth session cookie
 * (same-origin only — cross-origin requests never authenticate with cookies).
 */
export async function getPrincipal(
  request: Request,
  options: { allowCookies?: boolean } = {},
): Promise<Principal | null> {
  const token = bearerToken(request);
  if (token) {
    const found = await verifyToken(token);
    if (!found) return null;
    return { user: normalizeUser(found.user), via: "key", keyId: found.key.id };
  }
  if (options.allowCookies === false) return null;
  return getSessionPrincipal(request.headers);
}
