/**
 * Creates short-lived HMAC grants for private R2 objects. The secret remains server-only; clients
 * receive a key, expiry, and signature that authorize exactly one read or write operation. Web
 * Crypto accepts byte buffers, so TextEncoder converts the secret and signed payload to UTF-8.
 */
const encoder = new TextEncoder();

const MAX_TTL_SECONDS = 5 * 60;

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function safeObjectKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 512 &&
    !key.startsWith("/") &&
    !key.includes("..") &&
    !key.includes("\\") &&
    /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/u.test(key)
  );
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  if (encoder.encode(secret).byteLength < 32) {
    throw new Error("MEDIA_SIGNING_KEY must contain at least 32 bytes");
  }

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function signaturePayload(key: string, expires: number, purpose: "read" | "write"): ArrayBuffer {
  return encoder.encode(`${purpose}\n${expires}\n${key}`).buffer as ArrayBuffer;
}

export type SignedMediaGrant = {
  key: string;
  expires: number;
  signature: string;
};

export async function createMediaGrant(
  secret: string,
  key: string,
  purpose: "read" | "write",
  ttlSeconds = MAX_TTL_SECONDS,
): Promise<SignedMediaGrant> {
  if (!safeObjectKey(key)) {
    throw new Error("Invalid media object key");
  }

  const boundedTtl = Math.max(1, Math.min(ttlSeconds, MAX_TTL_SECONDS));
  const expires = Math.floor(Date.now() / 1000) + boundedTtl;
  const cryptoKey = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    signaturePayload(key, expires, purpose),
  );

  return { key, expires, signature: toBase64Url(signature) };
}

export async function verifyMediaGrant(
  secret: string,
  grant: SignedMediaGrant,
  purpose: "read" | "write",
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (
    !safeObjectKey(grant.key) ||
    !Number.isSafeInteger(grant.expires) ||
    grant.expires < nowSeconds ||
    grant.expires > nowSeconds + MAX_TTL_SECONDS
  ) {
    return false;
  }

  let provided: ArrayBuffer;
  try {
    const padded = grant.signature.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    provided = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      .buffer as ArrayBuffer;
  } catch {
    return false;
  }

  const cryptoKey = await importHmacKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    cryptoKey,
    provided,
    signaturePayload(grant.key, grant.expires, purpose),
  );
}

export function mediaGrantUrl(origin: string, grant: SignedMediaGrant): string {
  const url = new URL("/media", origin);
  url.searchParams.set("key", grant.key);
  url.searchParams.set("expires", String(grant.expires));
  url.searchParams.set("signature", grant.signature);
  return url.toString();
}
