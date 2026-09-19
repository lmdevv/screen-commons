import type { LibraryProduct } from "./types";

export async function loadPublishedCatalog(): Promise<LibraryProduct[]> {
  const response = await fetch("/api/catalog");
  const body = (await response.json()) as { error?: string; products?: LibraryProduct[] };
  if (!response.ok) throw new Error(body.error || "Published catalog could not be loaded.");
  return body.products ?? [];
}

export async function loadSignedMediaUrl(imageKey: string): Promise<string> {
  const response = await fetch("/api/media-sign", {
    body: JSON.stringify({ key: imageKey }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as { error?: string; url?: string };
  if (!response.ok || !body.url) throw new Error(body.error || "Media could not be signed.");
  return body.url;
}
