/**
 * Canvas encoders for the display policy, shared by the browser extension (service worker) and
 * the website uploader (Web Worker, or the main thread without OffscreenCanvas). Node intake paths
 * (seed, local MCP) use sharp in packages/capture instead; the server normalizes what neither
 * could encode.
 *
 * Every result is read back from the encoded bytes (`sniffImage`), so a browser that ignores the
 * requested type (Safari returns PNG for WebP) or changes the size is detected, never relabelled.
 *
 * Not exported from the package index: import `@screen-commons/core/canvas` (DOM types only).
 */
import {
  DISPLAY_POLICY,
  displaySize,
  encodeWithinBudget,
  isDisplayReady,
  keepSource,
  sniffImage,
  thumbnailBox,
  type ImageSize,
  type StoredImageType,
  type ThumbnailKind,
} from "./image-policy";
import { LIMITS } from "./limits";
import { formatBytes } from "./utils";

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Anything `drawImage` accepts whose pixel size is known (ImageBitmap, canvas). */
export type Drawable = CanvasImageSource & ImageSize;

export interface EncodedBlob extends ImageSize {
  blob: Blob;
  type: StoredImageType;
  bytes: number;
}

/** Image too large to upload even after the final encoding attempt. */
export class ImageBudgetError extends Error {}

/** JPEG qualities for browsers without a WebP encoder, when the source can't be sent as-is. */
const JPEG_FALLBACK_QUALITIES = [0.92, 0.85, 0.7];

export function createCanvas(width: number, height: number): [AnyCanvas, Context2D] {
  let canvas: AnyCanvas;
  if (typeof OffscreenCanvas !== "undefined") canvas = new OffscreenCanvas(width, height);
  else {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d") as Context2D | null;
  if (!context) throw new Error("Canvas 2D context unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return [canvas, context];
}

export function canvasToBlob(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      type,
      quality,
    ),
  );
}

/**
 * Type and dimensions read from a blob's bytes (its declared type is ignored); null unless it is a
 * complete PNG, JPEG or WebP. The returned blob carries the sniffed type.
 */
export async function readEncoded(blob: Blob): Promise<EncodedBlob | null> {
  const header = sniffImage(new Uint8Array(await blob.arrayBuffer()));
  if (!header) return null;
  return {
    blob: blob.type === header.type ? blob : new Blob([blob], { type: header.type }),
    ...header,
    bytes: blob.size,
  };
}

async function encodeCanvas(canvas: AnyCanvas, type: string, quality?: number) {
  const encoded = await readEncoded(await canvasToBlob(canvas, type, quality));
  if (!encoded) throw new Error(`The browser produced an unreadable ${type} image`);
  return encoded;
}

const fitsServer = (image: EncodedBlob) =>
  image.bytes <= LIMITS.maxImageBytes &&
  image.width <= LIMITS.maxImageWidth &&
  image.height <= LIMITS.maxImageHeight;

/** Canvas `source` drawn over white: JPEG has no alpha, and would otherwise turn it black. */
function flatten(source: AnyCanvas): AnyCanvas {
  const [canvas, context] = createCanvas(source.width, source.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, source.width, source.height);
  context.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Free a canvas's pixels now rather than at garbage collection: a 4096 × 16,383 canvas holds
 * 256 MiB, and iOS Safari caps the total canvas memory of a page.
 */
function release(...canvases: (AnyCanvas | undefined)[]) {
  for (const canvas of canvases) {
    if (!canvas) continue;
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Whether this browser's canvas encodes WebP (Safari returns PNG instead), probed on a 1×1 canvas
 * so no full-size canvas is allocated just to find out.
 */
export async function canEncodeWebp(): Promise<boolean> {
  const [canvas] = createCanvas(1, 1);
  try {
    const probe = await readEncoded(await canvasToBlob(canvas, DISPLAY_POLICY.type, 0.8));
    return probe?.type === DISPLAY_POLICY.type;
  } catch {
    return false;
  } finally {
    release(canvas);
  }
}

/**
 * The display image for a capture or upload (`DISPLAY_POLICY.full`): WebP scaled to fit 4096 ×
 * 16,383 (aspect kept, never upscaled), alpha kept, within the byte budget.
 *
 * - `original` (the encoded source, when there is one) is returned untouched when it is already
 *   display-ready WebP, or when it needs no resize and WebP wouldn't be smaller, so an optimized
 *   image never takes another lossy pass.
 * - Without a WebP encoder (Safari) the original is sent as-is when the server accepts it (the
 *   server converts it), without drawing it at all; otherwise a PNG, then JPEG, of the display
 *   size.
 * - Throws `ImageBudgetError` when even the final attempt exceeds the byte limit.
 */
export async function encodeDisplayImage(
  source: Drawable,
  original?: EncodedBlob | null,
): Promise<EncodedBlob> {
  if (original && isDisplayReady(original)) return original;
  const webp = await canEncodeWebp();
  if (!webp && original && fitsServer(original)) return original;
  const size = displaySize(source.width, source.height);
  const [canvas, context] = createCanvas(size.width, size.height);
  let flat: AnyCanvas | undefined;
  try {
    context.drawImage(source, 0, 0, size.width, size.height);
    if (webp) {
      const outcome = await encodeWithinBudget(
        (quality) => encodeCanvas(canvas, DISPLAY_POLICY.type, quality),
        size,
        DISPLAY_POLICY.full,
      );
      if (outcome.status === "ok") {
        let best = outcome.image;
        if (
          original?.type === "image/png" &&
          best.bytes > original.bytes * DISPLAY_POLICY.full.losslessTryRatio
        ) {
          // Chromium encodes quality 1 as lossless WebP (Firefox as lossy q100, which never wins).
          const lossless = await encodeCanvas(canvas, DISPLAY_POLICY.type, 1);
          if (
            lossless.type === DISPLAY_POLICY.type &&
            lossless.width === size.width &&
            lossless.height === size.height &&
            lossless.bytes < best.bytes
          ) {
            best = lossless;
          }
        }
        return original && keepSource(original, best.bytes) ? original : best;
      }
      if (outcome.status === "over_budget") {
        throw new ImageBudgetError(
          `The image is ${formatBytes(outcome.bytes)} even at the lowest quality; the limit is ${formatBytes(DISPLAY_POLICY.full.maxBytes)}`,
        );
      }
      // An unusable WebP encoder (wrong size): the server converts what it accepts.
      if (original && fitsServer(original)) return original;
    }

    const png = await encodeCanvas(canvas, "image/png");
    if (png.bytes <= DISPLAY_POLICY.full.maxBytes) return png;
    flat = flatten(canvas);
    let last = png;
    for (const quality of JPEG_FALLBACK_QUALITIES) {
      last = await encodeCanvas(flat, "image/jpeg", quality);
      if (last.type === "image/jpeg" && last.bytes <= DISPLAY_POLICY.full.maxBytes) return last;
    }
    throw new ImageBudgetError(
      `The image is ${formatBytes(last.bytes)} even at the lowest quality; the limit is ${formatBytes(DISPLAY_POLICY.full.maxBytes)}`,
    );
  } finally {
    release(canvas, flat);
  }
}

/**
 * Thumbnail (`DISPLAY_POLICY.thumbnail`): ≤640px wide WebP, never upscaled and no wider than the
 * display image, cropped from the top to the kind's max ratio. Browsers without a WebP encoder
 * get a JPEG within the same budget; the server derives the WebP thumbnail for those.
 */
export async function encodeThumbnail(source: Drawable, kind: ThumbnailKind): Promise<EncodedBlob> {
  const webp = await canEncodeWebp();
  const box = thumbnailBox(source.width, source.height, kind);
  const [canvas, context] = createCanvas(box.width, box.height);
  let flat: AnyCanvas | undefined;
  try {
    context.drawImage(source, 0, 0, source.width, box.sourceHeight, 0, 0, box.width, box.height);
    const { maxBytes, targetBytes, qualities } = DISPLAY_POLICY.thumbnail;
    if (webp) {
      const outcome = await encodeWithinBudget(
        (quality) => encodeCanvas(canvas, DISPLAY_POLICY.type, quality),
        box,
        DISPLAY_POLICY.thumbnail,
      );
      // An "invalid" WebP (wrong size) falls through to JPEG like a missing encoder.
      if (outcome.status === "ok") return outcome.image;
      if (outcome.status === "over_budget") {
        throw new ImageBudgetError(
          `The thumbnail is ${formatBytes(outcome.bytes)}; the limit is ${formatBytes(maxBytes)}`,
        );
      }
    }
    flat = flatten(canvas);
    let last: EncodedBlob | undefined;
    for (const quality of qualities) {
      last = await encodeCanvas(flat, "image/jpeg", quality);
      if (last.type !== "image/jpeg" || last.width !== box.width || last.height !== box.height) {
        throw new Error("This browser can't encode thumbnails");
      }
      if (last.bytes <= targetBytes) return last;
    }
    if (last && last.bytes <= maxBytes) return last;
    throw new ImageBudgetError(
      `The thumbnail is ${formatBytes(last?.bytes ?? 0)}; the limit is ${formatBytes(maxBytes)}`,
    );
  } finally {
    release(canvas, flat);
  }
}
