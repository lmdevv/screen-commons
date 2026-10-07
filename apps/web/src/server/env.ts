import { env } from "cloudflare:workers";
import { createDb, type Db } from "@open-ui/db";

export { env };

let cachedDb: { binding: unknown; db: Db } | undefined;

/** Drizzle instance over the `DB` binding (cached per isolate). */
export function getDb(): Db {
  if (!cachedDb || cachedDb.binding !== env.DB) {
    cachedDb = { binding: env.DB, db: createDb(env.DB) };
  }
  return cachedDb.db;
}

export function getMedia() {
  return env.MEDIA;
}

export function getImages() {
  return env.IMAGES;
}

/** Public origin of this instance, e.g. `http://localhost:5173`. */
export function appOrigin(request?: Request): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/u, "");
  return request ? new URL(request.url).origin : "http://localhost:5173";
}
