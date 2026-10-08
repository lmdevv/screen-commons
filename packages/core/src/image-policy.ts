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
 */
export function isThumbnailOf(thumb: ImageSize, source: ImageSize): boolean {
  if (thumb.width > Math.min(source.width, DISPLAY_POLICY.thumbnail.width * 2)) return false;
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

/** Thumbnail geometry: ≤640px wide (never upscaled), top-anchored crop to the kind's max ratio. */
export function thumbnailBox(width: number, height: number, kind: ThumbnailKind): ThumbnailBox {
  const ratio = THUMBNAIL_MAX_RATIO[kind];
  const targetWidth = Math.min(DISPLAY_POLICY.thumbnail.width, width);
  const scaledHeight = Math.max(1, Math.round((height * targetWidth) / width));
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
 * Null unless the header parses and, for WebP and PNG, the file is complete (RIFF length covered,
 * IEND present), so truncated uploads and encoder output are rejected too.
 */
export function sniffImage(bytes: Uint8Array): (ImageSize & { type: StoredImageType }) | null {
  const header = readImageHeader(bytes);
  if (!header || header.width < 1 || header.height < 1) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.type === "image/webp" && view.getUint32(4, true) + 8 > bytes.byteLength) return null;
  if (header.type === "image/png" && view.getUint32(bytes.byteLength - 8) !== 0x49454e44) {
    return null;
  }
  return header;
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
