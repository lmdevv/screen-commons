import type { ImagesBinding } from "@cloudflare/workers-types";
import { LIMITS } from "@screen-commons/core";

type ImageStream = Parameters<ImagesBinding["input"]>[0];

/** Maximum thumbnail aspect (height / width): 16:10 for web, 9:19.5 for mobile platforms. */
export const MAX_THUMB_ASPECT = { web: 10 / 16, mobile: 19.5 / 9 } as const;

export interface ThumbnailBox {
  width: number;
  height: number;
  /** True when the scaled image is taller than the max aspect and gets cropped from the top. */
  cropped: boolean;
}

/** Target thumbnail size: ≤640px wide (never upscaled), top-anchored crop to the max aspect. */
export function thumbnailBox(width: number, height: number, platform: string): ThumbnailBox {
  const aspect = platform === "web" ? MAX_THUMB_ASPECT.web : MAX_THUMB_ASPECT.mobile;
  const targetWidth = Math.min(LIMITS.thumbnailWidth, width);
  const scaledHeight = Math.max(1, Math.round((height * targetWidth) / width));
  const maxHeight = Math.max(1, Math.round(targetWidth * aspect));
  return {
    width: targetWidth,
    height: Math.min(scaledHeight, maxHeight),
    cropped: scaledHeight > maxHeight,
  };
}

/**
 * Generate a WebP thumbnail with the Cloudflare Images binding. Returns null (and logs) when the
 * binding is unavailable or fails, so callers can fall back to the full image.
 */
export async function generateThumbnail(
  images: ImagesBinding | undefined,
  data: Uint8Array,
  size: { width: number; height: number },
  platform: string,
): Promise<Uint8Array | null> {
  if (!images) {
    console.warn(
      "screen-commons: IMAGES binding unavailable; using the full image as the thumbnail",
    );
    return null;
  }
  const box = thumbnailBox(size.width, size.height, platform);
  try {
    for (const quality of [80, 60, 40]) {
      const result = await images
        .input(new Blob([data as Uint8Array<ArrayBuffer>]).stream() as unknown as ImageStream)
        .transform(
          box.cropped
            ? { width: box.width, height: box.height, fit: "cover", gravity: "top" }
            : { width: box.width, fit: "scale-down" },
        )
        .output({ format: "image/webp", quality });
      const bytes = new Uint8Array(await result.response().arrayBuffer());
      if (bytes.byteLength <= LIMITS.maxThumbnailBytes) return bytes;
    }
    console.warn(
      "screen-commons: generated thumbnail exceeds the size limit; using the full image",
    );
  } catch (error) {
    console.warn("screen-commons: thumbnail generation failed; using the full image", error);
  }
  return null;
}
