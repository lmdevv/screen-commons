import { getMedia } from "../env";

const KEY_PATTERN = /^(?:img|thumb|logo)\/[0-9a-f]{64}\.(?:png|jpg|webp)$/u;
const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * GET/HEAD /media/<key>: streams an R2 object. Keys are content hashes, so responses are public
 * and immutable; conditional requests get 304 via the ETag.
 */
export async function serveMedia(request: Request, key: string): Promise<Response> {
  if (!KEY_PATTERN.test(key)) return new Response("Not found", { status: 404 });
  const media = getMedia();
  const head = await media.head(key);
  if (!head) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    etag: head.httpEtag,
    "cache-control": IMMUTABLE,
    "content-type": head.httpMetadata?.contentType ?? "application/octet-stream",
    "access-control-allow-origin": "*",
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
  if (!object) return new Response("Not found", { status: 404 });
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
