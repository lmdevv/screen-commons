import { LIMITS } from "@screen-commons/core";

import { ServiceError } from "../errors";

/** JSON bodies for everything that isn't an upload (auth, saves, keys, reviews…). */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

/** Paths that accept image uploads get the upload limit; everything else the default. */
export function bodyLimitFor(pathname: string): number {
  if (
    pathname === "/api/v1/captures" ||
    pathname === "/api/v1/screens" ||
    pathname === "/mcp" ||
    pathname.startsWith("/_serverFn")
  ) {
    return LIMITS.maxRequestBytes;
  }
  return DEFAULT_BODY_LIMIT;
}

export const bodyTooLarge = (limit: number) =>
  new ServiceError("payload_too_large", `Request body exceeds ${limit} bytes`);

export function declaredTooLarge(request: Request, limit: number): boolean {
  const declared = Number(request.headers.get("content-length") ?? 0);
  return Number.isFinite(declared) && declared > limit;
}

/** Thrown through the body stream when it grows past its limit. */
export class BodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`Request body exceeds ${limit} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/**
 * Wrap a request so its body stream errors as soon as more than `limit` bytes have been read,
 * whatever Content-Length says (or when it's absent, e.g. chunked uploads).
 */
export function limitRequestBody(request: Request, limit: number): Request {
  if (!request.body) return request;
  let seen = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > limit) controller.error(new BodyTooLargeError(limit));
      else controller.enqueue(chunk);
    },
  });
  return new Request(request, { body: request.body.pipeThrough(counter) } as RequestInit);
}

/** Read a request body fully, counting streamed bytes; throws `payload_too_large` past `limit`. */
export async function readBodyLimited(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (declaredTooLarge(request, limit)) throw bodyTooLarge(limit);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw bodyTooLarge(limit);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw bodyTooLarge(error.limit);
    throw error;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
