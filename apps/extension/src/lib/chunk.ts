import { LIMITS } from "@screen-commons/core/schemas";

/** Request body budget per batch (base64 inflates by 4/3); well under Workers' 100 MB limit. */
export const MAX_BATCH_BYTES = 32 * 1024 * 1024;

/** Approximate JSON bytes contributed by one screen: base64 image + thumbnail + metadata. */
export function estimateScreenBytes(
  imageBytes: number,
  thumbnailBytes: number,
  textLength = 0,
): number {
  return Math.ceil(((imageBytes + thumbnailBytes) * 4) / 3) + textLength + 2048;
}

/**
 * Split items into ordered chunks of at most `maxCount` items and roughly `maxBytes` each.
 * An item larger than `maxBytes` on its own gets a chunk to itself. Returns index groups.
 */
export function chunkByBudget(
  sizes: readonly number[],
  { maxCount = LIMITS.maxScreensPerBatch, maxBytes = MAX_BATCH_BYTES } = {},
): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let bytes = 0;
  sizes.forEach((size, index) => {
    if (current.length > 0 && (current.length >= maxCount || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(index);
    bytes += size;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}
