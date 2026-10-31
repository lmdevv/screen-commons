/** Upload and paging limits. Kept free of zod so browser bundles can import them cheaply. */
export const LIMITS = {
  /** Maximum accepted full-size image, bytes. */
  maxImageBytes: 15 * 1024 * 1024,
  maxThumbnailBytes: 1024 * 1024,
  maxImageWidth: 4096,
  maxImageHeight: 20_000,
  /**
   * Largest source a client decodes before scaling it to fit: the most pixels the server stores,
   * in any shape. A PNG of 1.6 billion pixels can be 1.5 MB, so bytes alone don't bound decoding.
   */
  maxSourcePixels: 4096 * 20_000,
  thumbnailWidth: 640,
  maxScreensPerBatch: 50,
  /** Decoded image bytes (images + thumbnails + logo) per upload request; split larger batches. */
  maxBatchBytes: 28 * 1024 * 1024,
  /** Raw request body bytes for upload endpoints (base64 JSON batch, multipart, MCP). */
  maxRequestBytes: 40 * 1024 * 1024,
  maxFlowSteps: 60,
  /** Step thumbnails `get_flow` returns inline; a longer flow lists the rest as URLs only. */
  maxFlowImages: 20,
  pageSize: 30,
  maxPageSize: 100,
} as const;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
