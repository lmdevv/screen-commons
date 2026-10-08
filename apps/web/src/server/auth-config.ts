/** Public, well-known secret: only ever acceptable for a local development instance. */
export const DEV_AUTH_SECRET = "screen-commons-insecure-development-secret-change-me";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * The Better Auth secret: `BETTER_AUTH_SECRET` when set; the public dev secret only when the
 * instance itself runs on localhost; otherwise a configuration error (never a silent fallback).
 */
export function resolveAuthSecret(appUrl: string, secret: string | undefined): string {
  if (secret) return secret;
  if (isLocalUrl(appUrl)) return DEV_AUTH_SECRET;
  throw new Error(
    `BETTER_AUTH_SECRET is not set, and APP_URL (${appUrl}) is not localhost. ` +
      "Set it with `wrangler secret put BETTER_AUTH_SECRET` (any long random string).",
  );
}
