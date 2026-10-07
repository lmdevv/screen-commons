import { LIMITS, type Viewport } from "@open-ui/core";
import sharp from "sharp";

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export interface EncodedImage {
  buffer: Buffer;
  type: ImageType;
  width: number;
  height: number;
}

/** WebP cannot encode images larger than this on either edge. */
export const WEBP_MAX_DIMENSION = 16_383;

/** Thumbnail aspect limits (width / height): desktop crops to 16:10, mobile to 9:19.5. */
export const THUMBNAIL_MAX_ASPECT: Record<Viewport, number> = {
  desktop: 16 / 10,
  mobile: 9 / 19.5,
};

/**
 * Thumbnail geometry: scale to `width`, then crop from the top so the result is no taller than
 * `width / maxAspect`. Returns the resized height before cropping and the final crop height.
 */
export function thumbnailGeometry(
  source: { width: number; height: number },
  options: { width?: number; maxAspect?: number } = {},
): { width: number; resizedHeight: number; height: number } {
  const width = options.width ?? LIMITS.thumbnailWidth;
  const maxAspect = options.maxAspect ?? THUMBNAIL_MAX_ASPECT.desktop;
  const resizedHeight = Math.max(1, Math.round((source.height * width) / source.width));
  const maxHeight = Math.max(1, Math.round(width / maxAspect));
  return { width, resizedHeight, height: Math.min(resizedHeight, maxHeight) };
}

export async function imageSize(input: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(input).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

export interface ThumbnailOptions {
  width?: number;
  /** Minimum width/height ratio; taller images are cropped from the top. */
  maxAspect?: number;
  viewport?: Viewport;
  quality?: number;
}

/** 640px-wide WebP thumbnail with a top-anchored crop (per spec). */
export async function makeThumbnail(
  input: Buffer,
  options: ThumbnailOptions = {},
): Promise<EncodedImage> {
  const source = await imageSize(input);
  const geometry = thumbnailGeometry(source, {
    width: options.width,
    maxAspect: options.maxAspect ?? THUMBNAIL_MAX_ASPECT[options.viewport ?? "desktop"],
  });
  let quality = options.quality ?? 82;
  // Resize first (fast path through shrink-on-load), then crop the top.
  const resized = await sharp(input, { limitInputPixels: false })
    .resize({ width: geometry.width, height: geometry.resizedHeight, fit: "fill" })
    .toBuffer();
  for (;;) {
    const buffer = await sharp(resized)
      .extract({ left: 0, top: 0, width: geometry.width, height: geometry.height })
      .webp({ quality, effort: 4 })
      .toBuffer();
    if (buffer.byteLength <= LIMITS.maxThumbnailBytes || quality <= 40) {
      return { buffer, type: "image/webp", width: geometry.width, height: geometry.height };
    }
    quality -= 15;
  }
}

/**
 * Encode a full-size capture for upload: WebP (default q90) unless the image exceeds WebP's
 * dimension limit or the WebP would be larger than the PNG, in which case the PNG is kept.
 */
export async function encodeWebp(input: Buffer, quality = 90): Promise<EncodedImage> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const original: EncodedImage = {
    buffer: input,
    type:
      meta.format === "jpeg" ? "image/jpeg" : meta.format === "webp" ? "image/webp" : "image/png",
    width,
    height,
  };
  if (original.type === "image/webp") return original;
  if (width > WEBP_MAX_DIMENSION || height > WEBP_MAX_DIMENSION) {
    if (original.type === "image/png") return original;
    return { ...original, buffer: await sharp(input).png().toBuffer(), type: "image/png" };
  }
  const webp = await sharp(input, { limitInputPixels: false })
    .webp({ quality, effort: 4, smartSubsample: true })
    .toBuffer();
  if (webp.byteLength >= input.byteLength) return original;
  return { buffer: webp, type: "image/webp", width, height };
}

/** Dominant colour of an image as `#rrggbb`. */
export async function dominantColor(input: Buffer): Promise<string> {
  const { data, info } = await sharp(input, { limitInputPixels: false })
    .resize({ width: 96, height: 96, fit: "inside", kernel: "nearest" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Most common 4-bit-per-channel bucket, then the mean of the real pixels in that bucket.
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let index = 0; index + 2 < data.length; index += info.channels) {
    const r = data[index]!;
    const g = data[index + 1]!;
    const b = data[index + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  let best = { count: 1, r: 0, g: 0, b: 0 };
  let bestCount = 0;
  for (const bucket of buckets.values()) {
    if (bucket.count > bestCount) {
      best = bucket;
      bestCount = bucket.count;
    }
  }
  const hex = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value / best.count)))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

export interface PreviewOptions {
  /** Max output width, px. Default 1280. */
  maxWidth?: number;
  /** Max output height (taller images are cropped from the top), px. Default 7800. */
  maxHeight?: number;
  /** Byte budget for the preview. Default ~950 KB. */
  maxBytes?: number;
}

/**
 * Downscale an image into a compact preview for a model's context window (WebP, under
 * `maxBytes`). Tall pages are cropped from the top after scaling; `truncated` reports that.
 */
export async function makePreview(
  input: Buffer,
  options: PreviewOptions = {},
): Promise<EncodedImage & { truncated: boolean }> {
  const source = await imageSize(input);
  const maxBytes = options.maxBytes ?? 950_000;
  let maxWidth = Math.min(options.maxWidth ?? 1280, source.width);
  const maxHeight = options.maxHeight ?? 7800;
  let quality = 80;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scaledHeight = Math.max(1, Math.round((source.height * maxWidth) / source.width));
    const height = Math.min(scaledHeight, maxHeight);
    const buffer = await sharp(input, { limitInputPixels: false })
      .resize({ width: maxWidth, height: scaledHeight, fit: "fill" })
      .extract({ left: 0, top: 0, width: maxWidth, height })
      .webp({ quality })
      .toBuffer();
    if (buffer.byteLength <= maxBytes || attempt === 7) {
      return {
        buffer,
        type: "image/webp",
        width: maxWidth,
        height,
        truncated: scaledHeight > height,
      };
    }
    if (quality > 55) quality -= 12;
    else maxWidth = Math.max(320, Math.round(maxWidth * 0.75));
  }
  throw new Error("unreachable");
}

/** Normalize any supported raster/SVG image to a square-ish PNG logo, max 256px. */
export async function toLogoPng(input: Buffer, size = 256): Promise<EncodedImage> {
  const image = sharp(input, { density: 300 });
  const buffer = await image
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, type: "image/png", width: meta.width ?? size, height: meta.height ?? size };
}
