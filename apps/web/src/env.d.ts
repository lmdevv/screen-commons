/** Bindings and vars from wrangler.jsonc + secrets from .dev.vars / `wrangler secret put`. */
interface CloudflareEnv {
  DB: import("@cloudflare/workers-types").D1Database;
  MEDIA: import("@cloudflare/workers-types").R2Bucket;
  /** Cloudflare Images (optional: thumbnails fall back to the full image without it). */
  IMAGES?: import("@cloudflare/workers-types").ImagesBinding;
  APP_URL: string;
  BETTER_AUTH_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

declare module "cloudflare:workers" {
  export const env: CloudflareEnv;
  export function waitUntil(promise: Promise<unknown>): void;
}
