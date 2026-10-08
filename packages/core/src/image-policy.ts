/**
 * Display image policy shared by every screenshot intake path: the website uploader, the
 * extension, seed, local MCP and remote API/MCP uploads (the server normalizes whatever a client
 * couldn't encode). Viewers and grids only ever load display images: the full image and its
 * thumbnail, both WebP-first. Retained originals live under their own keys and are never used for
 * display.
 *
 * Targets were measured on the 156 seed captures (2880×1800: light, dark, text-heavy,
 * photo/gradient) and tall pages up to 2880×20000, with libwebp (sharp) and Chromium's canvas
 * encoder; see "Display images" in apps/web/content/docs/architecture.md. SSIM figures are luma
 * SSIM of the worst 128×128 tile, the small-text proxy.
 *
 * Zod-free so browser bundles (uploader worker, extension) can import it cheaply.
 */
import { LIMITS } from "./limits";
import { readImageHeader } from "./utils";

export type StoredImageType = "image/png" | "image/jpeg" | "image/webp";

/** libwebp can't encode either edge beyond this; Chromium silently crops taller canvases to it. */
export const WEBP_MAX_DIMENSION = 16_383;

export const DISPLAY_POLICY = {
  /** Bump when the targets below change; server-derived keys carry it (`img/<sha>.v1.webp`). */
  version: 1,
  type: "image/webp",
  full: {
    /**
     * WebP qualities (0–1) tried in order until the image fits `targetBytes`. q0.9 is
     * indistinguishable on text (SSIM ≥ 0.977 on text pages, ≥ 0.93 on photo heroes; median
     * 138 KiB at 2880×1800). q0.8 (~0.78x the bytes) still keeps text sharp; q0.7 (~0.68x) softens
     * gradients and 1x dark text, so it's the last resort.
     */
    qualities: [0.9, 0.8, 0.7],
    /**
     * Lower qualities are only tried above this. No 2880×1800 capture comes near it (max 0.7 MiB
     * at q0.9); only tall, dense pages do (a 2359×16,383 page as dense as the densest capture is
     * ~5.2 MiB at q0.9, ~4.1 MiB at q0.8).
     */
    targetBytes: 4 * 1024 * 1024,
    maxBytes: LIMITS.maxImageBytes,
    maxWidth: LIMITS.maxImageWidth,
    /** Taller images are scaled down to this height (aspect kept), never tiled or cropped. */
    maxHeight: WEBP_MAX_DIMENSION,
    /**
     * Also try lossless WebP when the lossy result is above this share of a PNG source: flat UI
     * (auth pages, sparse docs, plain pricing) is often smaller lossless than at q0.9 and loses
     * nothing. Lossless won on 54 of 156 captures, every one at or above this ratio, and on none
     * of the 92 below it (where it is ~3x larger and costs ~1 s per capture to try).
     */
    losslessTryRatio: 0.4,
  },
  thumbnail: {
    width: LIMITS.thumbnailWidth,
    /** q0.82: median 16 KiB (max 41) at 640×400, SSIM ≥ 0.97; q0.9 costs ~35% more bytes. */
    qualities: [0.82, 0.7, 0.55],
    targetBytes: 256 * 1024,
    maxBytes: LIMITS.maxThumbnailBytes,
  },
} as const;

export type ThumbnailKind = "desktop" | "mobile";

/** Max height/width ratio of a thumbnail: 16:10 for desktop, 9:19.5 for mobile. */
export const THUMBNAIL_MAX_RATIO: Record<ThumbnailKind, number> = {
  desktop: 10 / 16,
  mobile: 19.5 / 9,
};

/** Web apps get desktop thumbnails; iOS and Android get the taller mobile crop. */
export const thumbnailKindFor = (platform: string): ThumbnailKind =>
  platform === "web" ? "desktop" : "mobile";

/**
 * Whether `thumb` can be a thumbnail of `source`: no wider than the source (never upscaled) or 2x
 * the thumbnail width (HiDPI encoders), and a top crop no taller than the source's aspect or the
 * mobile ratio (the extension picks desktop/mobile by viewport, not platform). Rejects a full
 * page sent as its own thumbnail.
 *
 * A display image at WebP's height limit may have been scaled down from a wider source (750 ×
 * 20,000 → 614 × 16,383), and a thumbnail sized from that source (640px wide) is still a
 * downscale of it, so up to the thumbnail width is accepted there.
 */
export function isThumbnailOf(thumb: ImageSize, source: ImageSize): boolean {
  const sourceWidth =
    source.height >= WEBP_MAX_DIMENSION
      ? Math.max(source.width, DISPLAY_POLICY.thumbnail.width)
      : source.width;
  if (thumb.width > Math.min(sourceWidth, DISPLAY_POLICY.thumbnail.width * 2)) return false;
  const ratio = Math.min(source.height / source.width, THUMBNAIL_MAX_RATIO.mobile);
  // Encoders round the height to whole pixels.
  return thumb.height <= Math.round(thumb.width * ratio) + 1;
}

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Size of the display image for a source: within `maxWidth` × `maxHeight`, same aspect ratio,
 * never upscaled. `scaled` is true when the source has to be resized.
 */
export function displaySize(width: number, height: number): ImageSize & { scaled: boolean } {
  const { maxWidth, maxHeight } = DISPLAY_POLICY.full;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  if (scale === 1) return { width, height, scaled: false };
  return {
    width: Math.max(1, Math.min(maxWidth, Math.round(width * scale))),
    height: Math.max(1, Math.min(maxHeight, Math.round(height * scale))),
    scaled: true,
  };
}

export interface ThumbnailBox extends ImageSize {
  /** Source rows (from the top) the thumbnail shows. */
  sourceHeight: number;
  /** True when the scaled image is taller than the max ratio and gets cropped from the top. */
  cropped: boolean;
}

/**
 * Thumbnail geometry for a `width` × `height` source: ≤640px wide and never wider than the
 * source's display image (`displaySize`, what the server checks thumbnails against: a 750 ×
 * 20,000 page displays at 614 × 16,383, so its thumbnail is 614px wide), top-anchored crop to the
 * kind's max ratio. `sourceHeight` is in source rows: encoders draw from the source, never from
 * the display image.
 */
export function thumbnailBox(width: number, height: number, kind: ThumbnailKind): ThumbnailBox {
  const ratio = THUMBNAIL_MAX_RATIO[kind];
  const display = displaySize(width, height);
  const targetWidth = Math.min(DISPLAY_POLICY.thumbnail.width, display.width);
  const scaledHeight = Math.max(1, Math.round((display.height * targetWidth) / display.width));
  const maxHeight = Math.max(1, Math.round(targetWidth * ratio));
  return {
    width: targetWidth,
    height: Math.min(scaledHeight, maxHeight),
    sourceHeight: Math.min(height, Math.max(1, Math.round(width * ratio))),
    cropped: scaledHeight > maxHeight,
  };
}

export interface SourceImage extends ImageSize {
  type: StoredImageType;
  bytes: number;
}

/** An image that can be displayed as-is: WebP, within the display size and byte budget. */
export function isDisplayReady(image: SourceImage): boolean {
  return (
    image.type === DISPLAY_POLICY.type &&
    !displaySize(image.width, image.height).scaled &&
    image.bytes <= DISPLAY_POLICY.full.maxBytes
  );
}

/**
 * Keep the source instead of a WebP derivative that doesn't save bytes: re-encoding an already
 * compact image only adds a lossy generation. Only when the source needs no resize and fits.
 */
export function keepSource(source: SourceImage, derivedBytes: number): boolean {
  return (
    !displaySize(source.width, source.height).scaled &&
    source.bytes <= DISPLAY_POLICY.full.maxBytes &&
    derivedBytes >= source.bytes
  );
}

/**
 * Input limits of the Cloudflare Images binding
 * (https://developers.cloudflare.com/images/get-started/limits/,
 * https://developers.cloudflare.com/images/transform-images/bindings/). The server never sends
 * the binding a source outside them: production rejects it, and the local binding (a
 * "low-fidelity offline" version) enforces none of them, so local runs wouldn't notice.
 */
export const IMAGES_BINDING_LIMITS = {
  /** "12,000 pixels" on either edge, for formats other than WebP and AVIF. */
  maxDimension: 12_000,
  /** "100 MP" of image area. */
  maxArea: 100_000_000,
  /** `.input()` accepts at most "20 MB". */
  maxBytes: 20_000_000,
} as const;

/** Whether the Images binding accepts `image` as input (`IMAGES_BINDING_LIMITS`). */
export function bindingAccepts(image: SourceImage): boolean {
  const { maxDimension, maxArea, maxBytes } = IMAGES_BINDING_LIMITS;
  return (
    image.bytes <= maxBytes &&
    image.width * image.height <= maxArea &&
    (image.type === "image/webp" || Math.max(image.width, image.height) <= maxDimension)
  );
}

/**
 * Why a screen's media is, as documented, not a server derivative although its display version
 * is current (so the backfill doesn't retry it forever):
 * - `binding_limits`: a PNG/JPEG source outside `IMAGES_BINDING_LIMITS` (pages taller than
 *   12,000px). It is displayed as uploaded; clients encode such pages themselves.
 * - `no_binding`: the instance has no Images binding (self-hosted). The source is displayed as
 *   uploaded, and the backfill re-checks it once a binding is configured.
 * - `unconvertible`: the binding's output was unusable (wrong type or size, or over the byte
 *   budget at the lowest quality); a retry would produce the same.
 */
export const DISPLAY_EXCEPTIONS = ["binding_limits", "no_binding", "unconvertible"] as const;
export type DisplayException = (typeof DISPLAY_EXCEPTIONS)[number];

/** What an encoder produced, as read back from the encoded bytes (never the requested values). */
export interface EncodedResult extends ImageSize {
  type: string;
  bytes: number;
}

export type EncodeOutcome<T> =
  | { status: "ok"; image: T; quality: number }
  /** The encoder returned another format (Safari's canvas returns PNG for WebP requests). */
  | { status: "unsupported"; type: string }
  /** The encoder changed the dimensions (e.g. cropped a tall canvas). */
  | { status: "invalid"; message: string }
  /** Even the last quality exceeded the hard limit; `bytes` is the final attempt's size. */
  | { status: "over_budget"; bytes: number };

export interface EncodeBudget {
  qualities: readonly number[];
  /** Soft target: the next quality is tried while a result is above it. */
  targetBytes: number;
  /** Hard limit, enforced on the final attempt. */
  maxBytes: number;
}

/**
 * Run a WebP quality ladder: encode at each quality until the result is within `targetBytes`;
 * the final attempt is accepted up to `maxBytes`. Every attempt's actual type and dimensions are
 * checked against `expected` (± `tolerance` px, for resizers that round differently), and the hard
 * limit is enforced after the final attempt, so a caller can never mistake an oversized or
 * relabelled result for a display image.
 */
export async function encodeWithinBudget<T extends EncodedResult>(
  encode: (quality: number) => Promise<T>,
  expected: ImageSize,
  budget: EncodeBudget,
  tolerance = 0,
): Promise<EncodeOutcome<T>> {
  let last: { image: T; quality: number } | undefined;
  for (const quality of budget.qualities) {
    const image = await encode(quality);
    if (image.type !== DISPLAY_POLICY.type) return { status: "unsupported", type: image.type };
    if (
      Math.abs(image.width - expected.width) > tolerance ||
      Math.abs(image.height - expected.height) > tolerance
    ) {
      return {
        status: "invalid",
        message: `encoder produced ${image.width}x${image.height}, expected ${expected.width}x${expected.height}`,
      };
    }
    if (image.bytes <= budget.targetBytes) return { status: "ok", image, quality };
    last = { image, quality };
  }
  if (last && last.image.bytes <= budget.maxBytes) return { status: "ok", ...last };
  return { status: "over_budget", bytes: last?.image.bytes ?? 0 };
}

/**
 * Type and dimensions read from a whole encoded file, never from a declared type or file name.
 * Null unless the header parses, the image is still (an animated WebP would display only its
 * first frame) and the file is complete, so truncated uploads and encoder output are rejected
 * too: the RIFF length is covered (WebP), an `IEND` chunk is reached (PNG), or an end-of-image
 * marker follows the scan (JPEG). Trailing bytes after the end are tolerated.
 */
export function sniffImage(bytes: Uint8Array): (ImageSize & { type: StoredImageType }) | null {
  const header = readImageHeader(bytes);
  if (!header || header.width < 1 || header.height < 1) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const complete =
    header.type === "image/webp"
      ? stillWebpComplete(bytes, view)
      : header.type === "image/png"
        ? pngComplete(view)
        : jpegComplete(bytes);
  return complete ? header : null;
}

/** RIFF length covered, and no VP8X animation flag. */
function stillWebpComplete(bytes: Uint8Array, view: DataView): boolean {
  if (view.getUint32(4, true) + 8 > bytes.byteLength) return false;
  const extended = String.fromCharCode(...bytes.subarray(12, 16)) === "VP8X";
  return !(extended && (bytes[20]! & 0x02) !== 0);
}

/** Walks the chunks (length, type, data, CRC) to `IEND`; a truncated file runs out first. */
function pngComplete(view: DataView): boolean {
  for (let offset = 8; offset + 12 <= view.byteLength; offset += 12 + view.getUint32(offset)) {
    if (view.getUint32(offset + 4) === 0x49454e44) return true;
  }
  return false;
}

/**
 * Walks the marker segments to the first start-of-scan, then looks for the end-of-image marker
 * after it, from the end. Entropy-coded data never contains `FF D9` (0xFF bytes are stuffed), so
 * a file cut anywhere in the scan has none.
 */
function jpegComplete(bytes: Uint8Array): boolean {
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda) break;
    if (marker === 0xff) offset += 1;
    else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) offset += 2;
    else offset += 2 + ((bytes[offset + 2]! << 8) | bytes[offset + 3]!);
  }
  for (let index = bytes.byteLength - 2; index > offset; index -= 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Media keys
// ---------------------------------------------------------------------------------------------

export const IMAGE_EXTENSIONS: Record<StoredImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * `img/<sha256>.<ext>` (stored as uploaded), `img/<sha256>.v1.webp` (derived by the server from
 * the source with that hash under policy version 1), `thumb/<sha256>.v1-desktop.webp` (thumbnail
 * generated from a full image), `orig/<sha256>.<ext>` (retained original) and `logo/…`.
 */
export const MEDIA_KEY_PATTERN =
  /^(?:img|thumb|logo|orig)\/[0-9a-f]{64}(?:\.v\d+(?:-desktop|-mobile)?)?\.(?:png|jpg|webp)$/u;

/**
 * Key of a display derivative: addressed by the source's content hash plus the policy version, so
 * the same source is derived once per version (retries and backfills reuse it) and a policy change
 * produces new immutable URLs instead of changing what an old URL serves.
 */
export function derivativeKey(
  kind: "img" | "thumb",
  sourceSha256: string,
  thumbnailKind?: ThumbnailKind,
): string {
  const variant = thumbnailKind ? `-${thumbnailKind}` : "";
  return `${kind}/${sourceSha256}.v${DISPLAY_POLICY.version}${variant}.webp`;
}
