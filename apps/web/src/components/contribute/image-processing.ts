/**
 * Client-side image processing for uploads (the Worker never processes images): decode, validate
 * dimensions, generate the 640px top-anchored thumbnail and a dominant colour. Runs in a Web
 * Worker (OffscreenCanvas) when available, otherwise on the main thread.
 *
 * Mirrors `LIMITS` in @open-ui/core (kept local so zod stays out of the bundle).
 */
export const IMAGE_LIMITS = {
  maxImageBytes: 15 * 1024 * 1024,
  maxImageWidth: 4096,
  maxImageHeight: 20_000,
  minImageSide: 64,
  thumbnailWidth: 640,
  maxThumbnailBytes: 1024 * 1024,
} as const;

/** Thumbnail crop: at most 16:10 for desktop, 9:19.5 for phones; taller images are cut at the bottom. */
export const MAX_THUMB_RATIO = { web: 10 / 16, mobile: 19.5 / 9 } as const;

export interface ProcessedImage {
  width: number;
  height: number;
  thumbnail: Blob;
  thumbnailWidth: number;
  thumbnailHeight: number;
  /** `#rrggbb` */
  dominantColor: string;
}

export class ImageValidationError extends Error {}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function encode(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      type,
      quality,
    ),
  );
}

const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0");

/** Average colour of a small downscale, weighted towards the top (where the UI chrome is). */
function dominantColor(source: CanvasImageSource, width: number, height: number): string {
  const size = 24;
  const canvas = makeCanvas(size, size);
  const context = canvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!context) return "#f4f4f5";
  const cropHeight = Math.min(height, width);
  context.drawImage(source, 0, 0, width, cropHeight, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
    n += 1;
  }
  if (n === 0) return "#f4f4f5";
  return `#${hex(r / n)}${hex(g / n)}${hex(b / n)}`;
}

/** Decode → validate → thumbnail + dominant colour. Throws `ImageValidationError` on bad input. */
export async function processImage(file: Blob, kind: "web" | "mobile"): Promise<ProcessedImage> {
  if (file.size > IMAGE_LIMITS.maxImageBytes) {
    throw new ImageValidationError("Larger than 15 MB");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageValidationError("Not a readable PNG, JPEG or WebP image");
  }
  try {
    const { width, height } = bitmap;
    if (width > IMAGE_LIMITS.maxImageWidth) {
      throw new ImageValidationError(`Wider than ${IMAGE_LIMITS.maxImageWidth}px (${width}px)`);
    }
    if (height > IMAGE_LIMITS.maxImageHeight) {
      throw new ImageValidationError(
        `Taller than ${IMAGE_LIMITS.maxImageHeight.toLocaleString("en-US")}px (${height}px)`,
      );
    }
    if (width < IMAGE_LIMITS.minImageSide || height < IMAGE_LIMITS.minImageSide) {
      throw new ImageValidationError("Too small to be a screenshot");
    }

    const thumbWidth = Math.min(IMAGE_LIMITS.thumbnailWidth, width);
    const scale = thumbWidth / width;
    const scaledHeight = Math.max(1, Math.round(height * scale));
    const thumbHeight = Math.min(scaledHeight, Math.round(thumbWidth * MAX_THUMB_RATIO[kind]));
    // Top-anchored crop: take the top `thumbHeight / scale` source pixels.
    const sourceHeight = Math.min(height, Math.round(thumbHeight / scale));

    const canvas = makeCanvas(thumbWidth, thumbHeight);
    const context = canvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!context) throw new Error("Canvas is not available");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, sourceHeight, 0, 0, thumbWidth, thumbHeight);

    let thumbnail = await encode(canvas, "image/webp", 0.82);
    // Safari can't encode WebP and silently returns PNG: JPEG is smaller.
    if (thumbnail.type !== "image/webp") thumbnail = await encode(canvas, "image/jpeg", 0.85);
    if (thumbnail.size > IMAGE_LIMITS.maxThumbnailBytes) {
      thumbnail = await encode(canvas, "image/jpeg", 0.7);
    }

    return {
      width,
      height,
      thumbnail,
      thumbnailWidth: thumbWidth,
      thumbnailHeight: thumbHeight,
      dominantColor: dominantColor(bitmap, width, height),
    };
  } finally {
    bitmap.close();
  }
}
