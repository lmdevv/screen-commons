import type { ImagesBinding } from "@cloudflare/workers-types";
import { env } from "cloudflare:workers";
import { createDb, type Db } from "@screen-commons/db";
import { getRequest } from "@tanstack/react-start/server";

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

/**
 * The Images binding, if the instance has one. Test servers (`SCREEN_COMMONS_TEST_FAULTS=1` in
 * their dev vars; never set in production) can simulate a failing or missing binding per request
 * with an `x-test-images: fail | missing` header, so those paths are tested end to end.
 */
export function getImages(): ImagesBinding | undefined {
  if (env.SCREEN_COMMONS_TEST_FAULTS === "1") {
    let fault: string | null = null;
    try {
      fault = getRequest().headers.get("x-test-images");
    } catch {
      // outside a request
    }
    if (fault === "missing") return undefined;
    if (fault === "fail") return failingImages;
  }
  return env.IMAGES;
}

const failingImages = {
  input: () => ({
    transform() {
      return this;
    },
    output: () => Promise.reject(new Error("images: simulated binding failure (x-test-images)")),
  }),
} as unknown as ImagesBinding;

/** Public origin of this instance, e.g. `http://localhost:5173`. */
export function appOrigin(request?: Request): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/u, "");
  return request ? new URL(request.url).origin : "http://localhost:5173";
}
