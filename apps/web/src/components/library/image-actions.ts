/** Clipboard / download helpers for screenshots (all client-side). */
import type { Screen } from "@screen-commons/core";

type Downloadable = Pick<Screen, "id" | "imageUrl" | "title"> & {
  app: Pick<Screen["app"], "name" | "slug">;
};

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 60) || "screen"
  );
}

export function screenFileName(screen: Downloadable, type: string, index?: number): string {
  const prefix = index === undefined ? "" : `${String(index + 1).padStart(2, "0")}-`;
  const name = `${screen.app.slug}-${slugify(screen.title ?? screen.id)}`;
  return `${prefix}${name}.${EXTENSIONS[type] ?? "png"}`;
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn’t load the image (${response.status})`);
  return response.blob();
}

async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (png) => (png ? resolve(png) : reject(new Error("Couldn’t encode PNG"))),
      "image/png",
    ),
  );
}

/**
 * Copy the full image to the clipboard as PNG. The ClipboardItem gets a promise so Safari keeps
 * the user-activation window while the image downloads.
 */
export async function copyImageToClipboard(url: string): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("This browser can’t copy images");
  }
  const png = fetchBlob(url).then(toPng);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export async function downloadScreen(screen: Downloadable): Promise<void> {
  const blob = await fetchBlob(screen.imageUrl);
  saveBlob(blob, screenFileName(screen, blob.type));
}

/** Zip the full images (stored, not recompressed — they're already compressed) and download. */
export async function downloadScreensZip(
  screens: readonly Downloadable[],
  zipName: string,
): Promise<void> {
  const [{ zip }, files] = await Promise.all([
    import("fflate"),
    mapLimit(screens, 4, async (screen, index) => {
      const blob = await fetchBlob(screen.imageUrl);
      return [
        screenFileName(screen, blob.type, index),
        new Uint8Array(await blob.arrayBuffer()),
      ] as const;
    }),
  ]);
  const archive = await new Promise<Uint8Array>((resolve, reject) =>
    zip(Object.fromEntries(files), { level: 0 }, (error, data) =>
      error ? reject(error) : resolve(data),
    ),
  );
  saveBlob(new Blob([archive as BlobPart], { type: "application/zip" }), `${slugify(zipName)}.zip`);
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
