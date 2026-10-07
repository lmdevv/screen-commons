import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { authSchema, user as userTable } from "@open-ui/db";
import { betterAuth } from "better-auth/minimal";
import { count } from "drizzle-orm";

import { env, getDb } from "./env";

const DEV_SECRET = "open-ui-insecure-development-secret-change-me";

function createAuth() {
  const db = getDb();
  const baseURL = env.APP_URL || "http://localhost:5173";
  const secret =
    env.BETTER_AUTH_SECRET || (baseURL.startsWith("http://localhost") ? DEV_SECRET : "");
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  const github =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : undefined;

  return betterAuth({
    appName: "Open UI",
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema, transaction: false }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    socialProviders: github,
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "member", input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // The first account ever created on an instance becomes its admin.
          before: async (data) => {
            const [row] = await db.select({ total: count() }).from(userTable);
            return { data: { ...data, role: (row?.total ?? 0) === 0 ? "admin" : "member" } };
          },
        },
      },
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
