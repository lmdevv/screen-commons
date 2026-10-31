import type { ErrorCode } from "./api";
import { LIMITS } from "./limits";
import { sniffImage } from "./image-policy";

/**
 * Download of an image URL, shared by the remote and local servers and the CLI so all of them apply
 * one policy and refuse with one message. Only hosts that are public by name are allowed outside
 * local development.
 *
 * Nothing in this file resolves DNS, because the Workers runtime has no DNS API. Node callers pass
 * `fetch` from `packages/mcp/src/public-fetch.ts`, which checks and pins the resolved addresses on
 * every hop. A Worker uses its own fetch, so on the remote server a public name that resolves to a
 * private address is not refused by this code, and this code does not know what the platform does
 * with that connection.
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
  /** Node: pass the address-checking fetch. See the note above. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  /** What messages call the URL. */
  label?: string;
  /** How messages end, naming what the caller can do instead of giving a URL. */
  alternative?: string;
}

const MAX_REDIRECTS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const USE_BASE64 = "or send the image as base64";
const FOR_A_FILE = "For a file on disk, use { path } on the local server or the screen-commons CLI";

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
    return `must use ${allowLocal ? "http or https" : "https"}, not ${url.protocol.slice(0, -1)}`;
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

function checkUrl(url: URL, allowLocal: boolean, what: string, alternative: string) {
  const reason = refusal(url, allowLocal);
  if (reason) {
    throw new ImageDownloadError(
      "bad_request",
      `${what} ${reason}. ${url.protocol === "file:" && alternative === USE_BASE64 ? FOR_A_FILE : "Use another URL"}, ${alternative}.`,
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
  const {
    allowLocal = false,
    timeoutMs = 20_000,
    maxBytes = LIMITS.maxImageBytes,
    label = "image.url",
    alternative = USE_BASE64,
  } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const signal = AbortSignal.timeout(timeoutMs);
  let host = url;
  const timedOut = () =>
    new ImageDownloadError(
      "unprocessable",
      `Downloading ${label} from ${host} timed out after ${Math.round(timeoutMs / 1000)} seconds. Retry, ${alternative}.`,
    );

  const download = async (): Promise<Uint8Array> => {
    let current: URL;
    try {
      current = new URL(url);
    } catch {
      throw new ImageDownloadError("bad_request", `${label} is not a valid URL.`);
    }
    checkUrl(current, allowLocal, label, alternative);
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
            `${label} at ${host} ${location ? `redirected more than ${MAX_REDIRECTS} times` : "redirected without a Location"}. Use the final URL, ${alternative}.`,
          );
        }
        current = new URL(location, current);
        checkUrl(current, allowLocal, `${label} redirected to ${current.host}, which`, alternative);
        host = current.host;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new ImageDownloadError(
          "unprocessable",
          `Could not download ${label} from ${host} (HTTP ${response.status}). Check that it is public and hasn't expired, ${alternative}.`,
        );
      }
      const bytes = await readCapped(response, maxBytes, host);
      if (!sniffImage(bytes)) {
        const type = response.headers.get("content-type")?.split(";")[0] ?? "an unknown type";
        throw new ImageDownloadError(
          "unsupported_media_type",
          `${label} at ${host} returned ${type}, not a complete, still PNG, JPEG or WebP image.`,
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
      `Could not connect to ${host} to download ${label}. Check the URL, ${alternative}.`,
    );
  }
}
