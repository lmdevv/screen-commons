import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { authSchema, user } from "@screen-commons/db";
import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { eq } from "drizzle-orm";

import { resolveAuthSecret } from "./auth-config";
import { env, getDb } from "./env";

function createAuth() {
  const db = getDb();
  const baseURL = env.APP_URL || "http://localhost:5173";
  const secret = resolveAuthSecret(baseURL, env.BETTER_AUTH_SECRET);
  const github =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : undefined;

  return betterAuth({
    appName: "Screen Commons",
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema, transaction: false }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    socialProviders: github,
    user: {
      additionalFields: {
        // The first account ever created is promoted to admin atomically by the
        // `user_bootstrap_admin` database trigger (packages/db/migrations/0002_integrity.sql).
        role: { type: "string", required: false, defaultValue: "member", input: false },
      },
    },
    hooks: {
      // The role is set by a trigger *after* the insert, so the user object Better Auth returns
      // from sign-up is stale; re-read it so the first account sees "admin" right away.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const returned = ctx.context.returned as { user?: { id?: string; role?: string } } | null;
        const id = returned && typeof returned === "object" ? returned.user?.id : undefined;
        if (!id) return;
        const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, id));
        if (!row || row.role === returned!.user!.role) return;
        return ctx.json({ ...returned, user: { ...returned!.user, role: row.role } });
      }),
    },
    advanced: { useSecureCookies: baseURL.startsWith("https://") },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cached: { binding: unknown; auth: Auth } | undefined;

/** Better Auth instance (cached per isolate). */
export function getAuth(): Auth {
  if (!cached || cached.binding !== env.DB) cached = { binding: env.DB, auth: createAuth() };
  return cached.auth;
}

export function githubEnabled(): boolean {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}
