import { sql } from "drizzle-orm";

import { getDb, getMedia } from "../env";
import { getPrincipal, isAdmin } from "../principal";

const KEY_PATTERN = /^(?:img|thumb|logo)\/[0-9a-f]{64}\.(?:png|jpg|webp)$/u;
const IMMUTABLE = "public, max-age=31536000, immutable";

const PRIVATE = "private, no-store";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Who may read a key: one indexed lookup over screen.image_key / screen.thumb_key /
 * app.logo_key. Returns null when nothing references it.
 */
async function mediaAccess(key: string) {
  const rows = await getDb().all<{ status: string; contributor_id: string | null }>(sql`
    SELECT status, contributor_id FROM screen WHERE image_key = ${key}
    UNION ALL SELECT status, contributor_id FROM screen WHERE thumb_key = ${key}
    UNION ALL SELECT status, contributor_id FROM app WHERE logo_key = ${key}
    LIMIT 50`);
  if (rows.length === 0) return null;
  return {
    published: rows.some((row) => row.status === "published"),
    contributors: new Set(rows.flatMap((row) => (row.contributor_id ? [row.contributor_id] : []))),
  };
}

/**
 * GET/HEAD /media/<key>: streams an R2 object.
 * - Referenced by published content → public, immutable (keys are content hashes), ETag/304.
 * - Only referenced by pending/rejected content → its contributor or an admin, `private, no-store`.
 * - Anyone else, or unreferenced keys → 404.
 */
export async function serveMedia(request: Request, key: string): Promise<Response> {
  if (!KEY_PATTERN.test(key)) return notFound();
  const access = await mediaAccess(key);
  if (!access) return notFound();
  if (!access.published) {
    const principal = await getPrincipal(request).catch(() => null);
    if (!principal || !(isAdmin(principal) || access.contributors.has(principal.user.id))) {
      return notFound();
    }
  }
  const cacheControl = access.published ? IMMUTABLE : PRIVATE;
  const media = getMedia();
  const head = await media.head(key);
  if (!head) return notFound();

  const headers = new Headers({
    etag: head.httpEtag,
    "cache-control": cacheControl,
    "content-type": head.httpMetadata?.contentType ?? "application/octet-stream",
    ...(access.published
      ? { "access-control-allow-origin": "*" }
      : { vary: "cookie, authorization" }),
    "x-content-type-options": "nosniff",
  });
  const ifNoneMatch = request.headers.get("if-none-match");
  if (
    ifNoneMatch &&
    ifNoneMatch.split(/\s*,\s*/u).some((tag) => tag === head.httpEtag || tag === "*")
  ) {
    return new Response(null, { status: 304, headers });
  }
  headers.set("content-length", String(head.size));
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });

  const object = await media.get(key);
  if (!object) return notFound();
  return new Response(object.body as unknown as ReadableStream, { status: 200, headers });
}

/** Read an R2 object fully (MCP image content). */
export async function readMedia(key: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const object = await getMedia().get(key);
  if (!object) return null;
  return {
    bytes: new Uint8Array(await object.arrayBuffer()),
    type: object.httpMetadata?.contentType ?? "image/png",
  };
}
