import { base64ToBytes, bytesToBase64 } from "@screen-commons/core/utils";

import { dominantColor } from "../lib/color";
import type { Rect } from "../lib/geometry";

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export interface EncodedImage {
  blob: Blob;
  type: ImageType;
  width: number;
  height: number;
}

export function base64ToBlob(base64: string, type: string): Blob {
  return new Blob([base64ToBytes(base64) as Uint8Array<ArrayBuffer>], { type });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/su.exec(dataUrl);
  if (!match) throw new Error("Unexpected capture data");
  const [, type = "image/png", isBase64, data = ""] = match;
  return isBase64 ? base64ToBlob(data, type) : new Blob([decodeURIComponent(data)], { type });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

export function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

function canvas2d(
  width: number,
  height: number,
): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(width)),
    Math.max(1, Math.round(height)),
  );
  const context = canvas.getContext("2d");
  if (!context) throw new Error("OffscreenCanvas 2D context unavailable");
  return [canvas, context];
}

/** Crop a region (device pixels) out of a bitmap into a PNG. */
export async function cropToPng(bitmap: ImageBitmap, rect: Rect): Promise<EncodedImage> {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const width = Math.max(1, Math.min(bitmap.width - x, Math.round(rect.width)));
  const height = Math.max(1, Math.min(bitmap.height - y, Math.round(rect.height)));
  const [canvas, context] = canvas2d(width, height);
  context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  return {
    blob: await canvas.convertToBlob({ type: "image/png" }),
    type: "image/png",
    width,
    height,
  };
}

/** Compose stitched tiles onto one canvas and encode as PNG. */
export async function composeTiles(
  width: number,
  height: number,
  tiles: { bitmap: ImageBitmap; destY: number; srcHeight: number }[],
): Promise<EncodedImage> {
  const [canvas, context] = canvas2d(width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const tile of tiles) {
    context.drawImage(
      tile.bitmap,
      0,
      0,
      Math.min(tile.bitmap.width, width),
      tile.srcHeight,
      0,
      tile.destY,
      Math.min(tile.bitmap.width, width),
      tile.srcHeight,
    );
  }
  return {
    blob: await canvas.convertToBlob({ type: "image/png" }),
    type: "image/png",
    width: canvas.width,
    height: canvas.height,
  };
}

/** Dominant colour from a 24x24 downsample of the top of the image. */
export function dominantColorOf(bitmap: ImageBitmap): string | null {
  const [, context] = canvas2d(24, 24);
  const sh = Math.min(bitmap.height, bitmap.width * 1.25);
  context.drawImage(bitmap, 0, 0, bitmap.width, sh, 0, 0, 24, 24);
  return dominantColor(context.getImageData(0, 0, 24, 24).data);
}
