import {
  ImageBudgetError,
  createCanvas,
  encodeDisplayImage,
  encodeThumbnail,
  readEncoded,
  type EncodedBlob,
} from "@screen-commons/core/canvas";
import { LIMITS } from "@screen-commons/core/limits";

/**
 * Client-side image processing for uploads: decode, validate dimensions, then encode the display
 * image and the 640px top-anchored thumbnail per the shared display policy (WebP-first, see
 * `@screen-commons/core/image-policy`) and pick a dominant colour. Runs in a Web Worker
 * (OffscreenCanvas) when available, otherwise on the main thread.
 */
export const IMAGE_LIMITS = {
  maxImageBytes: LIMITS.maxImageBytes,
  maxImageWidth: LIMITS.maxImageWidth,
  maxImageHeight: LIMITS.maxImageHeight,
  minImageSide: 64,
} as const;

export interface ProcessedImage {
  /** Size of the selected file. */
  width: number;
  height: number;
  /**
   * What gets uploaded: WebP within the byte budget (very tall pages scaled to 16,383px), or the
   * file itself when it already is display-ready WebP, when WebP wouldn't be smaller, or when the
   * browser can't encode WebP (the server converts it then).
   */
  image: Blob;
  imageWidth: number;
  imageHeight: number;
  thumbnail: Blob;
  thumbnailWidth: number;
  thumbnailHeight: number;
  /** `#rrggbb` */
  dominantColor: string;
}

export class ImageValidationError extends Error {}

const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0");

/** Average colour of a small downscale, weighted towards the top (where the UI chrome is). */
function dominantColor(source: CanvasImageSource, width: number, height: number): string {
  const size = 24;
  const [, context] = createCanvas(size, size);
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

/** Decode → validate → display image + thumbnail + dominant colour. Throws `ImageValidationError` on bad input. */
export async function processImage(file: Blob, kind: "web" | "mobile"): Promise<ProcessedImage> {
  if (file.size > IMAGE_LIMITS.maxImageBytes) {
    throw new ImageValidationError("Larger than 15 MB");
  }
  // Typed by its bytes, never by the file name or the browser's guess.
  const original = await readEncoded(file);
  let bitmap: ImageBitmap | undefined;
  try {
    if (original) bitmap = await createImageBitmap(original.blob);
  } catch {
    // reported below
  }
  if (!original || !bitmap)
    throw new ImageValidationError("Not a readable PNG, JPEG or WebP image");
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

    // One after the other, so only one large canvas is alive at a time (iOS caps canvas memory).
    let image: EncodedBlob;
    let thumbnail: EncodedBlob;
    try {
      image = await encodeDisplayImage(bitmap, original);
      thumbnail = await encodeThumbnail(bitmap, kind === "web" ? "desktop" : "mobile");
    } catch (error) {
      if (error instanceof ImageBudgetError) throw new ImageValidationError(error.message);
      throw error;
    }

    return {
      width,
      height,
      image: image.blob,
      imageWidth: image.width,
      imageHeight: image.height,
      thumbnail: thumbnail.blob,
      thumbnailWidth: thumbnail.width,
      thumbnailHeight: thumbnail.height,
      dominantColor: dominantColor(bitmap, width, height),
    };
  } finally {
    bitmap.close();
  }
}
