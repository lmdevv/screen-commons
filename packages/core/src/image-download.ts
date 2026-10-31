import type { ErrorCode } from "./api";
import { LIMITS } from "./limits";
import { sniffImage } from "./image-policy";

/**
 * Download of an `upload_screen` image URL, shared by the remote and local servers so both apply
 * one policy and refuse with one message. Only hosts that are public by name are allowed outside
 * local development. Nothing here resolves DNS: a public name pointing at a private address is
 * stopped by the Workers network on the remote server, and not at all on the local one.
 */
export class ImageDownloadError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ImageDownloadError";
    this.code = code;
  }
}

export interface DownloadImageOptions {
  /** Local development: also allow http, localhost and IP addresses. */
  allowLocal?: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

const MAX_REDIRECTS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const USE_BASE64 = "or send the image as base64";

/** Whether an instance's own origin is this machine, which is what `allowLocal` is for. */
export function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** Why a URL can't be fetched, or null. URL parsing has already normalized forms like `0x7f.1`. */
function refusal(url: URL, allowLocal: boolean): string | null {
  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:"))
    return `must use https, not ${url.protocol.slice(0, -1)}`;
  if (url.username || url.password) return "must not contain a username or password";
  if (allowLocal) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/u, "");
  const local =
    host.startsWith("[") ||
    /^\d+\.\d+\.\d+\.\d+$/u.test(host) ||
    !host.includes(".") ||
    /\.(?:localhost|local|internal)$/u.test(host);
  return local ? `must use a public hostname, not ${url.hostname}` : null;
}

function checkUrl(url: URL, allowLocal: boolean, what: string) {
  const reason = refusal(url, allowLocal);
  if (reason) {
    throw new ImageDownloadError(
      "bad_request",
      `${what} ${reason}. Use another URL, ${USE_BASE64}.`,
    );
  }
}

async function readCapped(response: Response, maxBytes: number, host: string): Promise<Uint8Array> {
  const tooLarge = (size: string) =>
    new ImageDownloadError(
      "payload_too_large",
      `The image at ${host} is ${size} bytes; the limit is ${maxBytes}. Use a smaller image.`,
    );
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLarge(String(declared));
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  for (;;) {
    const part = await reader?.read();
    if (!part || part.done) break;
    total += part.value.byteLength;
    // The declared length is only a hint, so the cap applies to what actually arrives.
    if (total > maxBytes) {
      await reader?.cancel().catch(() => undefined);
      throw tooLarge(`over ${maxBytes}`);
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * The image at `url`, validated as a complete, still PNG, JPEG or WebP. Redirects are followed by
 * hand so each hop passes the same checks. Messages name hosts only, because redirect targets
 * are often signed URLs.
 */
export async function downloadImage(
  url: string,
  options: DownloadImageOptions = {},
): Promise<Uint8Array> {
  const { allowLocal = false, timeoutMs = 20_000, maxBytes = LIMITS.maxImageBytes } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const signal = AbortSignal.timeout(timeoutMs);
  let host = url;
  const timedOut = () =>
    new ImageDownloadError(
      "unprocessable",
      `Downloading image.url from ${host} timed out after ${Math.round(timeoutMs / 1000)} seconds. Retry, ${USE_BASE64}.`,
    );

  const download = async (): Promise<Uint8Array> => {
    let current: URL;
    try {
      current = new URL(url);
    } catch {
      throw new ImageDownloadError("bad_request", "image.url is not a valid URL.");
    }
    checkUrl(current, allowLocal, "image.url");
    host = current.host;
    for (let hop = 0; ; hop += 1) {
      const response = await doFetch(current, {
        redirect: "manual",
        signal,
        headers: {
          accept: "image/webp,image/png,image/jpeg",
          "user-agent": "screen-commons-image-download",
        },
      });
      if (REDIRECTS.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        if (!location || hop === MAX_REDIRECTS) {
          throw new ImageDownloadError(
            "unprocessable",
            `image.url at ${host} ${location ? `redirected more than ${MAX_REDIRECTS} times` : "redirected without a Location"}. Use the final URL, ${USE_BASE64}.`,
          );
        }
        current = new URL(location, current);
        checkUrl(current, allowLocal, `image.url redirected to ${current.host}, which`);
        host = current.host;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new ImageDownloadError(
          "unprocessable",
          `Could not download image.url from ${host} (HTTP ${response.status}). Check that it is public and hasn't expired, ${USE_BASE64}.`,
        );
      }
      const bytes = await readCapped(response, maxBytes, host);
      if (!sniffImage(bytes)) {
        const type = response.headers.get("content-type")?.split(";")[0] ?? "an unknown type";
        throw new ImageDownloadError(
          "unsupported_media_type",
          `image.url at ${host} returned ${type}, not a complete, still PNG, JPEG or WebP image.`,
        );
      }
      return bytes;
    }
  };

  // One deadline over every hop and the body, in any runtime, whatever fetch does with the signal.
  const deadline = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(timedOut()), { once: true });
  });
  try {
    return await Promise.race([download(), deadline]);
  } catch (error) {
    if (error instanceof ImageDownloadError) throw error;
    if (signal.aborted) throw timedOut();
    throw new ImageDownloadError(
      "unprocessable",
      `Could not connect to ${host} to download image.url. Check the URL, ${USE_BASE64}.`,
    );
  }
}
