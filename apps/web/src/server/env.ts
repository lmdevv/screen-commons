import { AsyncLocalStorage } from "node:async_hooks";

import type { ImagesBinding } from "@cloudflare/workers-types";
import { env } from "cloudflare:workers";
import { createDb, type Db } from "@screen-commons/db";
import { getRequest } from "@tanstack/react-start/server";

export { env };

let cachedDb: { binding: unknown; db: Db } | undefined;

/** Drizzle instance over the `DB` binding (cached per isolate). */
export function getDb(): Db {
  if (!cachedDb || cachedDb.binding !== env.DB) {
    if (env.SC_D1_COUNTER === "1") countD1Rows(env.DB);
    cachedDb = { binding: env.DB, db: createDb(env.DB) };
  }
  return cachedDb.db;
}

const requestRows = new AsyncLocalStorage<{ rows: number }>();

interface D1Meta {
  meta?: { rows_read?: number; rows_written?: number };
}
type D1Transport = ((...args: unknown[]) => Promise<D1Meta | D1Meta[]>) & {
  uncounted?: D1Transport;
};

/**
 * `raw()`, which Drizzle uses for most reads, drops `meta`, so this taps the binding's own
 * transport (`_send`, or `_query` under `d1_binding_jsrpc`) on the session every statement goes
 * through.
 */
function countD1Rows(binding: unknown) {
  const session = (binding as { alwaysPrimarySession?: Record<string, D1Transport | undefined> })
    .alwaysPrimarySession;
  const transports = ["_send", "_query"].filter((name) => typeof session?.[name] === "function");
  if (!session || transports.length === 0) {
    throw new Error("SC_D1_COUNTER=1, but this runtime's D1 binding has no transport to count");
  }
  for (const name of transports) {
    const send = session[name]!.uncounted ?? session[name]!;
    const counted: D1Transport = async function (this: unknown, ...args: unknown[]) {
      const tally = requestRows.getStore();
      const results = await send.apply(this, args);
      if (tally) {
        for (const { meta } of [results].flat()) {
          tally.rows += (meta?.rows_read ?? 0) + (meta?.rows_written ?? 0);
        }
      }
      return results;
    };
    counted.uncounted = send;
    session[name] = counted;
  }
}

/** Test servers honour `x-test-d1-counter: off`, so one server tests the header present and absent. */
export async function withD1RowCount(
  request: Request,
  respond: () => Promise<Response>,
): Promise<Response> {
  const off =
    env.SC_D1_COUNTER !== "1" ||
    (env.SCREEN_COMMONS_TEST_FAULTS === "1" && request.headers.get("x-test-d1-counter") === "off");
  if (off) return respond();
  const tally = { rows: 0 };
  const response = await requestRows.run(tally, respond);
  const counted = new Response(response.body, response);
  counted.headers.set("x-sc-d1-rows", String(tally.rows));
  return counted;
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
