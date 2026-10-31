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

/** How much of a refused body is read before giving up on leaving the connection reusable. */
const DRAIN_BYTES = LIMITS.maxRequestBytes * 2;
const DRAIN_MS = 3_000;

/**
 * Read and discard the rest of a body, up to the bounds above. The deadline covers `pending`, a read
 * already in flight, so a client that stops sending can't hold the answer back.
 */
async function drain(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pending: Promise<unknown> = Promise.resolve(),
): Promise<void> {
  const deadline = Date.now() + DRAIN_MS;
  const beforeDeadline = <T>(work: Promise<T>, expired: T): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(expired), deadline - Date.now());
      }),
    ]).finally(() => clearTimeout(timer));
  };
  let drained = 0;
  try {
    await beforeDeadline(pending, undefined);
    while (drained <= DRAIN_BYTES && Date.now() < deadline) {
      const { done, value } = await beforeDeadline<ReadableStreamReadResult<Uint8Array>>(
        reader.read(),
        { done: true, value: undefined },
      );
      if (done) break;
      drained += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Answering with part of a body unread makes the runtime drop the connection under the client: a
 * client still sending can lose the answer to a reset, and a proxy that reuses the connection fails
 * its next request. So read what's left first, within limits, rather than decoding or keeping it.
 */
export async function drainBody(request: Request): Promise<void> {
  if (!request.body || Number(request.headers.get("content-length") ?? 0) > DRAIN_BYTES) return;
  await drain(request.body.getReader());
}

/**
 * Wrap a request so its body stream errors as soon as more than `limit` bytes have been read,
 * whatever Content-Length says (or when it's absent, e.g. chunked uploads). The returned `drain`
 * finishes reading whatever the handler left, for `drainBody`'s reason.
 */
export function limitRequestBody(
  request: Request,
  limit: number,
): { request: Request; drain: () => Promise<void> } {
  if (!request.body) return { request, drain: async () => undefined };
  const reader = request.body.getReader();
  let seen = 0;
  // A reader takes one read at a time, and a handler can give up with one still in flight.
  let reading: Promise<unknown> = Promise.resolve();
  const limited = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const read = reader.read();
      reading = read.catch(() => undefined);
      const { done, value } = await read;
      if (done) return controller.close();
      seen += value.byteLength;
      if (seen > limit) controller.error(new BodyTooLargeError(limit));
      else controller.enqueue(value);
    },
  });
  return {
    request: new Request(request, { body: limited, duplex: "half" } as RequestInit),
    drain: () => drain(reader, reading),
  };
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
