import type { ProcessedImage, ProcessingPhase } from "./types";

export const IMAGE_LIMITS = {
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  fullQuality: 0.9,
  maxBytes: 15 * 1024 * 1024,
  maxFullWidth: 2560,
  maxHeight: 16_000,
  maxMegapixels: 20,
  maxTallAspectRatio: 12,
  thumbnailQuality: 0.78,
  thumbnailWidth: 480,
} as const;

export interface ImageProgress {
  fileName: string;
  percent: number;
  phase: ProcessingPhase;
}

interface SerializedVariant {
  bytes: ArrayBuffer;
  height: number;
  sha256: string;
  width: number;
}

export interface SerializedProcessedImage {
  full: SerializedVariant;
  original: ProcessedImage["original"];
  perceptualHash: string;
  thumbnail: SerializedVariant;
}

export type ImageWorkerRequest = { file: File; id: string; type: "process" };

export type ImageWorkerResponse =
  | { id: string; percent: number; phase: ProcessingPhase; type: "progress" }
  | { id: string; image: SerializedProcessedImage; type: "complete" }
  | { error: string; id: string; type: "error" };

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

function readAscii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function isAnimatedPng(bytes: Uint8Array) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const type = readAscii(bytes, offset + 4, 4);
    if (type === "acTL") return true;
    if (type === "IEND") return false;
    offset += 12 + length;
  }
  return false;
}

function isAnimatedWebp(bytes: Uint8Array) {
  if (bytes.length < 16) return false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = readAscii(bytes, offset, 4);
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    if (type === "ANIM" || type === "ANMF") return true;
    offset += 8 + size + (size % 2);
  }
  return false;
}

function assertFileSignature(mimeType: string, bytes: Uint8Array) {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 && readAscii(bytes, 1, 3) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a;
  const isWebp = readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP";
  const matches =
    (mimeType === "image/jpeg" && isJpeg) ||
    (mimeType === "image/png" && isPng) ||
    (mimeType === "image/webp" && isWebp);
  if (!matches) {
    throw new ImageValidationError("The file contents do not match its JPEG, PNG, or WebP type.");
  }
}

export function validateImageBytes(file: File, bytes: Uint8Array) {
  if (
    !IMAGE_LIMITS.acceptedMimeTypes.includes(
      file.type as (typeof IMAGE_LIMITS.acceptedMimeTypes)[number],
    )
  ) {
    throw new ImageValidationError("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size === 0) throw new ImageValidationError("This image is empty.");
  if (file.size > IMAGE_LIMITS.maxBytes) {
    throw new ImageValidationError("This image is larger than 15 MB.");
  }
  assertFileSignature(file.type, bytes);
  if (file.type === "image/png" && isAnimatedPng(bytes)) {
    throw new ImageValidationError("Animated PNG files are not supported. Export a still image.");
  }
  if (file.type === "image/webp" && isAnimatedWebp(bytes)) {
    throw new ImageValidationError("Animated WebP files are not supported. Export a still image.");
  }
}

export function validateImageDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0)
    throw new ImageValidationError("The image dimensions are invalid.");
  if (width * height > IMAGE_LIMITS.maxMegapixels * 1_000_000) {
    throw new ImageValidationError("This image exceeds 20 megapixels. Resize it before uploading.");
  }
  if (height > IMAGE_LIMITS.maxHeight || height / width > IMAGE_LIMITS.maxTallAspectRatio) {
    throw new ImageValidationError(
      "This full-page capture is too tall to review reliably. Split it into focused screens.",
    );
  }
}

export async function sha256Hex(value: ArrayBuffer | Blob) {
  const bytes = value instanceof Blob ? await value.arrayBuffer() : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function variantSize(width: number, height: number, maxWidth: number) {
  const scale = Math.min(1, maxWidth / width);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function perceptualHash(pixels: Uint8ClampedArray) {
  const luminance: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    luminance.push(
      (pixels[index] ?? 0) * 0.299 +
        (pixels[index + 1] ?? 0) * 0.587 +
        (pixels[index + 2] ?? 0) * 0.114,
    );
  }
  const average = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  let hash = "";
  for (let offset = 0; offset < luminance.length; offset += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      if ((luminance[offset + bit] ?? 0) >= average) nibble |= 1 << (3 - bit);
    }
    hash += nibble.toString(16);
  }
  return hash;
}

export async function processImageOffscreen(
  file: File,
  onProgress: (phase: ProcessingPhase, percent: number) => void,
): Promise<SerializedProcessedImage> {
  onProgress("validating", 5);
  const sourceBytes = await file.arrayBuffer();
  validateImageBytes(file, new Uint8Array(sourceBytes));
  onProgress("decoding", 18);
  const bitmap = await createImageBitmap(file);

  try {
    validateImageDimensions(bitmap.width, bitmap.height);
    const fullSize = variantSize(bitmap.width, bitmap.height, IMAGE_LIMITS.maxFullWidth);
    const thumbSize = variantSize(bitmap.width, bitmap.height, IMAGE_LIMITS.thumbnailWidth);
    onProgress("converting", 30);

    const fullCanvas = new OffscreenCanvas(fullSize.width, fullSize.height);
    const fullContext = fullCanvas.getContext("2d", { alpha: true });
    if (!fullContext) throw new Error("Your browser could not create an image canvas.");
    fullContext.drawImage(bitmap, 0, 0, fullSize.width, fullSize.height);
    const fullBlob = await fullCanvas.convertToBlob({
      type: "image/webp",
      quality: IMAGE_LIMITS.fullQuality,
    });

    onProgress("converting", 58);
    const thumbnailCanvas = new OffscreenCanvas(thumbSize.width, thumbSize.height);
    const thumbnailContext = thumbnailCanvas.getContext("2d", { alpha: true });
    if (!thumbnailContext) throw new Error("Your browser could not create a thumbnail canvas.");
    thumbnailContext.drawImage(bitmap, 0, 0, thumbSize.width, thumbSize.height);
    const thumbnailBlob = await thumbnailCanvas.convertToBlob({
      type: "image/webp",
      quality: IMAGE_LIMITS.thumbnailQuality,
    });

    onProgress("hashing", 74);
    const hashCanvas = new OffscreenCanvas(8, 8);
    const hashContext = hashCanvas.getContext("2d", { willReadFrequently: true });
    if (!hashContext) throw new Error("Your browser could not inspect this image.");
    hashContext.drawImage(bitmap, 0, 0, 8, 8);
    const pixels = hashContext.getImageData(0, 0, 8, 8).data;
    const [sourceSha256, fullSha256, thumbnailSha256, fullBytes, thumbnailBytes] =
      await Promise.all([
        sha256Hex(sourceBytes),
        sha256Hex(fullBlob),
        sha256Hex(thumbnailBlob),
        fullBlob.arrayBuffer(),
        thumbnailBlob.arrayBuffer(),
      ]);
    onProgress("ready", 100);
    return {
      full: {
        bytes: fullBytes,
        height: fullSize.height,
        sha256: fullSha256,
        width: fullSize.width,
      },
      original: {
        byteLength: file.size,
        fileName: file.name,
        height: bitmap.height,
        mimeType: file.type,
        sha256: sourceSha256,
        width: bitmap.width,
      },
      perceptualHash: perceptualHash(pixels),
      thumbnail: {
        bytes: thumbnailBytes,
        height: thumbSize.height,
        sha256: thumbnailSha256,
        width: thumbSize.width,
      },
    };
  } finally {
    bitmap.close();
  }
}

function deserializeImage(image: SerializedProcessedImage): ProcessedImage {
  return {
    ...image,
    full: {
      ...image.full,
      blob: new Blob([image.full.bytes], { type: "image/webp" }),
      byteLength: image.full.bytes.byteLength,
      mimeType: "image/webp",
    },
    thumbnail: {
      ...image.thumbnail,
      blob: new Blob([image.thumbnail.bytes], { type: "image/webp" }),
      byteLength: image.thumbnail.bytes.byteLength,
      mimeType: "image/webp",
    },
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Image processing failed. Try exporting the image again.";
}

async function processWithWorker(file: File, onProgress: (progress: ImageProgress) => void) {
  const worker = new Worker(new URL("../../workers/image-processing.worker.ts", import.meta.url), {
    type: "module",
  });
  const id = crypto.randomUUID();
  return new Promise<ProcessedImage>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ImageWorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === "progress") {
        onProgress({ fileName: file.name, percent: message.percent, phase: message.phase });
      } else if (message.type === "complete") {
        worker.terminate();
        resolve(deserializeImage(message.image));
      } else {
        worker.terminate();
        reject(new Error(message.error));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The image worker stopped unexpectedly."));
    };
    const request: ImageWorkerRequest = { file, id, type: "process" };
    worker.postMessage(request);
  });
}

export async function processImage(
  file: File,
  onProgress: (progress: ImageProgress) => void,
): Promise<ProcessedImage> {
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
    try {
      return await processWithWorker(file, onProgress);
    } catch (error) {
      onProgress({ fileName: file.name, percent: 2, phase: "validating" });
      try {
        return await processImageOnMainThread(file, onProgress);
      } catch (fallbackError) {
        throw new Error(errorMessage(fallbackError), { cause: error });
      }
    }
  }
  return processImageOnMainThread(file, onProgress);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("WebP conversion is unavailable in this browser.")),
      "image/webp",
      quality,
    );
  });
}

async function processImageOnMainThread(
  file: File,
  onProgress: (progress: ImageProgress) => void,
): Promise<ProcessedImage> {
  onProgress({ fileName: file.name, percent: 5, phase: "validating" });
  const sourceBytes = await file.arrayBuffer();
  validateImageBytes(file, new Uint8Array(sourceBytes));
  onProgress({ fileName: file.name, percent: 18, phase: "decoding" });
  const bitmap = await createImageBitmap(file);
  try {
    validateImageDimensions(bitmap.width, bitmap.height);
    const fullSize = variantSize(bitmap.width, bitmap.height, IMAGE_LIMITS.maxFullWidth);
    const thumbSize = variantSize(bitmap.width, bitmap.height, IMAGE_LIMITS.thumbnailWidth);
    const draw = (width: number, height: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Your browser could not create an image canvas.");
      context.drawImage(bitmap, 0, 0, width, height);
      return { canvas, context };
    };

    onProgress({ fileName: file.name, percent: 30, phase: "converting" });
    const full = draw(fullSize.width, fullSize.height);
    const fullBlob = await canvasToBlob(full.canvas, IMAGE_LIMITS.fullQuality);
    onProgress({ fileName: file.name, percent: 58, phase: "converting" });
    const thumbnail = draw(thumbSize.width, thumbSize.height);
    const thumbnailBlob = await canvasToBlob(thumbnail.canvas, IMAGE_LIMITS.thumbnailQuality);
    const hash = draw(8, 8).context.getImageData(0, 0, 8, 8).data;
    onProgress({ fileName: file.name, percent: 74, phase: "hashing" });
    const [sourceSha256, fullSha256, thumbnailSha256] = await Promise.all([
      sha256Hex(sourceBytes),
      sha256Hex(fullBlob),
      sha256Hex(thumbnailBlob),
    ]);
    onProgress({ fileName: file.name, percent: 100, phase: "ready" });
    return {
      full: {
        blob: fullBlob,
        byteLength: fullBlob.size,
        height: fullSize.height,
        mimeType: "image/webp",
        sha256: fullSha256,
        width: fullSize.width,
      },
      original: {
        byteLength: file.size,
        fileName: file.name,
        height: bitmap.height,
        mimeType: file.type,
        sha256: sourceSha256,
        width: bitmap.width,
      },
      perceptualHash: perceptualHash(hash),
      thumbnail: {
        blob: thumbnailBlob,
        byteLength: thumbnailBlob.size,
        height: thumbSize.height,
        mimeType: "image/webp",
        sha256: thumbnailSha256,
        width: thumbSize.width,
      },
    };
  } finally {
    bitmap.close();
  }
}

export async function processImagesSequentially(
  files: File[],
  onProgress: (index: number, progress: ImageProgress) => void,
  signal?: AbortSignal,
) {
  const results: Array<{ error?: string; file: File; image?: ProcessedImage }> = [];
  for (const [index, file] of files.entries()) {
    if (signal?.aborted) throw new DOMException("Processing cancelled", "AbortError");
    try {
      const image = await processImage(file, (progress) => onProgress(index, progress));
      results.push({ file, image });
    } catch (error) {
      results.push({ error: errorMessage(error), file });
    }
  }
  return results;
}
