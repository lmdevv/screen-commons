const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

let lastTime = 0;
let sequence = 0;

function encode(value: number, length: number): string {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out = ALPHABET[value % 32]! + out;
    value = Math.floor(value / 32);
  }
  return out;
}

/**
 * 26-char, lowercase, time-ordered id (ULID-like): 10 chars of ms timestamp, 4 chars of
 * per-isolate sequence (keeps ids monotonic within a millisecond), 12 random chars.
 */
export function newId(): string {
  const now = Date.now();
  if (now === lastTime) sequence += 1;
  else {
    lastTime = now;
    sequence = 0;
  }
  const random = crypto.getRandomValues(new Uint8Array(12));
  let tail = "";
  for (const byte of random) tail += ALPHABET[byte % 32];
  return encode(now, 10) + encode(sequence, 4) + tail;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function base64UrlDecode(text: string): string {
  const padded = text.replace(/-/gu, "+").replace(/_/gu, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}
