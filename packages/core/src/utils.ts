import { PATTERNS, type PatternSlug } from "./taxonomy";

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

/** Version label used when a capture has none, e.g. `Oct 2026`. */
export function versionLabel(date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** `https://www.linear.app/pricing` → `linear.app` */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}

/** Best-effort app name from a hostname or page title: `linear.app` → `Linear`. */
export function appNameFromUrl(url: string, title?: string | null): string {
  const siteFromTitle = title
    ?.split(/\s[|–—·-]\s/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((a, b) => a.length - b.length)[0];
  if (siteFromTitle && siteFromTitle.length <= 24) return siteFromTitle;
  const host = hostnameOf(url).split(".");
  const base = host.length > 1 ? host[host.length - 2]! : host[0]!;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const patternBySegment = new Map<string, PatternSlug>();
for (const pattern of PATTERNS) {
  for (const segment of "match" in pattern ? pattern.match : []) {
    if (!patternBySegment.has(segment)) patternBySegment.set(segment, pattern.slug);
  }
}

/**
 * Suggest screen patterns for a captured page from its URL path and title.
 * `https://x.com/` → `["landing"]`, `/blog/my-post` → `["article"]`, `/pricing` → `["pricing"]`.
 */
export function suggestPatterns(url: string, title?: string | null): PatternSlug[] {
  const found = new Set<PatternSlug>();
  let segments: string[] = [];
  try {
    segments = new URL(url).pathname
      .split("/")
      .map((segment) => segment.toLowerCase())
      .filter(Boolean);
  } catch {
    // not a URL; rely on title
  }
  // skip locale prefixes like /en or /en-us
  if (segments[0] && /^[a-z]{2}(?:-[a-z]{2})?$/u.test(segments[0])) segments = segments.slice(1);

  if (segments.length === 0) found.add("landing");
  const first = segments[0];
  if (first) {
    const pattern = patternBySegment.get(first);
    if (pattern === "blog" && segments.length > 1) found.add("article");
    else if (pattern) found.add(pattern);
  }
  for (const segment of segments.slice(1)) {
    const pattern = patternBySegment.get(segment);
    if (pattern && pattern !== "landing") found.add(pattern);
  }

  if (title && found.size === 0) {
    const words = title.toLowerCase();
    for (const [segment, pattern] of patternBySegment) {
      if (segment.length >= 4 && new RegExp(`\\b${segment}\\b`, "u").test(words)) {
        found.add(pattern);
      }
    }
  }
  if (found.size === 0 && segments.length > 0) found.add("detail");
  return [...found].slice(0, 3);
}

/** Path on an Screen Commons instance for a media key. */
export function mediaPath(key: string): string {
  return `/media/${key}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Detect image type and pixel dimensions from file header bytes (PNG, JPEG, WebP). */
export function readImageHeader(
  bytes: Uint8Array,
): { type: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: 89 50 4E 47, IHDR width/height at 16/20
  if (bytes.length > 24 && view.getUint32(0) === 0x89504e47) {
    return { type: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  // WebP: RIFF....WEBP
  if (bytes.length > 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
    if (chunk === "VP8X") {
      const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
      const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
      return { type: "image/webp", width, height };
    }
    if (chunk === "VP8 ") {
      return {
        type: "image/webp",
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const b0 = bytes[21]!;
      const b1 = bytes[22]!;
      const b2 = bytes[23]!;
      const b3 = bytes[24]!;
      return {
        type: "image/webp",
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
    return null;
  }
  // JPEG: scan for SOF0..SOF15 (excluding DHT/DAC/JPG markers)
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          type: "image/jpeg",
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }
  return null;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
