/** Upload and paging limits. Kept free of zod so browser bundles can import them cheaply. */
export const LIMITS = {
  /** Maximum accepted full-size image, bytes. */
  maxImageBytes: 15 * 1024 * 1024,
  maxThumbnailBytes: 1024 * 1024,
  maxImageWidth: 4096,
  maxImageHeight: 20_000,
  thumbnailWidth: 640,
  maxScreensPerBatch: 50,
  /** Decoded image bytes (images + thumbnails + logo) per upload request; split larger batches. */
  maxBatchBytes: 28 * 1024 * 1024,
  /** Raw request body bytes for upload endpoints (base64 JSON batch, multipart, MCP). */
  maxRequestBytes: 40 * 1024 * 1024,
  maxFlowSteps: 60,
  pageSize: 30,
  maxPageSize: 100,
} as const;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
