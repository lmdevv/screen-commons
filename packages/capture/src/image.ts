import {
  DISPLAY_POLICY,
  displaySize,
  encodeWithinBudget,
  isDisplayReady,
  keepSource,
  sniffImage,
  thumbnailBox,
  type EncodeOutcome,
  type StoredImageType,
  type Viewport,
} from "@screen-commons/core";
import sharp from "sharp";

export type ImageType = StoredImageType;

export interface EncodedImage {
  buffer: Buffer;
  type: ImageType;
  width: number;
  height: number;
}

export async function imageSize(input: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(input).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/**
 * Try lossless WebP when the lossy result is above this share of the source: flat UI (docs,
 * forms, text on solid colour) is often smaller lossless than at q90 and loses nothing, while
 * photos and gradients never are. In the corpus, every page where lossless won was above 0.45.
 */
const LOSSLESS_TRY_RATIO = 0.4;

const SOURCE_TYPES: Record<string, ImageType> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

async function encoded(buffer: Buffer): Promise<EncodedImage & { bytes: number }> {
  const header = sniffImage(buffer);
  if (!header) throw new Error("The encoder produced an unreadable image");
  return { buffer, ...header, bytes: buffer.byteLength };
}

function check<T>(outcome: EncodeOutcome<T>, what: string): T {
  if (outcome.status === "ok") return outcome.image;
  if (outcome.status === "over_budget") {
    throw new Error(
      `${what} is ${outcome.bytes} bytes at the lowest quality; the limit is exceeded`,
    );
  }
  throw new Error(`${what} could not be encoded as WebP (${outcome.status})`);
}

/**
 * Encode a capture as its display image (`DISPLAY_POLICY.full`): WebP, scaled down to fit 4096 ×
 * 16,383 (aspect kept, never upscaled), alpha kept. WebP inputs that already fit are returned
 * untouched, and the source is kept when it needs no resize and WebP wouldn't be smaller, so an
 * already-compact image never goes through another lossy pass.
 */
export async function encodeDisplay(input: Buffer): Promise<EncodedImage> {
  const meta = await sharp(input).metadata();
  const type = SOURCE_TYPES[meta.format ?? ""];
  if (!type || !meta.width || !meta.height) throw new Error("Not a PNG, JPEG or WebP image");
  const source = { type, width: meta.width, height: meta.height, bytes: input.byteLength };
  if (isDisplayReady(source))
    return { buffer: input, type, width: source.width, height: source.height };

  const size = displaySize(source.width, source.height);
  const pipeline = () => {
    const image = sharp(input, { limitInputPixels: false });
    return size.scaled
      ? image.resize({ width: size.width, height: size.height, fit: "fill", kernel: "lanczos3" })
      : image;
  };
  let best = check(
    await encodeWithinBudget(
      async (quality) =>
        encoded(
          await pipeline()
            .webp({ quality: Math.round(quality * 100), effort: 4, smartSubsample: true })
            .toBuffer(),
        ),
      size,
      DISPLAY_POLICY.full,
    ),
    "The display image",
  );
  if (best.bytes > source.bytes * LOSSLESS_TRY_RATIO) {
    const lossless = await encoded(await pipeline().webp({ lossless: true, effort: 4 }).toBuffer());
    if (lossless.bytes < best.bytes) best = lossless;
  }
  if (keepSource(source, best.bytes)) {
    return { buffer: input, type, width: source.width, height: source.height };
  }
  return { buffer: best.buffer, type: best.type, width: best.width, height: best.height };
}

export interface ThumbnailOptions {
  /** Desktop thumbnails crop to 16:10, mobile ones to 9:19.5. Default desktop. */
  viewport?: Viewport;
}

/** Thumbnail (`DISPLAY_POLICY.thumbnail`): ≤640px wide WebP, never upscaled, top-anchored crop. */
export async function makeThumbnail(
  input: Buffer,
  options: ThumbnailOptions = {},
): Promise<EncodedImage> {
  const source = await imageSize(input);
  const box = thumbnailBox(source.width, source.height, options.viewport ?? "desktop");
  // Crop the top first so tall pages aren't resized in full, then scale the crop.
  const cropped = await sharp(input, { limitInputPixels: false })
    .extract({ left: 0, top: 0, width: source.width, height: box.sourceHeight })
    .resize({ width: box.width, height: box.height, fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
  const image = check(
    await encodeWithinBudget(
      async (quality) =>
        encoded(
          await sharp(cropped)
            .webp({ quality: Math.round(quality * 100), effort: 4, smartSubsample: true })
            .toBuffer(),
        ),
      box,
      DISPLAY_POLICY.thumbnail,
    ),
    "The thumbnail",
  );
  return { buffer: image.buffer, type: image.type, width: image.width, height: image.height };
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
