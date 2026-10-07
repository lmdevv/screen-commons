import {
  suggestPatterns,
  versionLabel,
  type CaptureBatchInput,
  type CaptureBatchResult,
  type CaptureScreen,
  type ElementSlug,
  type OpenUiClient,
  type PageMetadata,
  type PatternSlug,
  type Viewport,
} from "@open-ui/core";

import { MAX_SCREEN_TEXT, type IconCandidate } from "./extract";
import { dominantColor, encodeWebp, makeThumbnail, toLogoPng, type EncodedImage } from "./image";

export interface ToCaptureScreenInput {
  /** Full-size capture (PNG, or any format sharp reads). */
  png: Buffer;
  /** Page URL; used for auto-tagging when `patterns` is omitted. */
  sourceUrl?: string;
  title?: string | null;
  viewport?: Viewport;
  patterns?: PatternSlug[];
  elements?: ElementSlug[];
  tags?: string[];
  text?: string | null;
  version?: string;
  capturedAt?: string;
  stepLabel?: string;
  /** WebP quality for the full image. Default 90. */
  quality?: number;
}

export interface PreparedScreen {
  screen: CaptureScreen;
  image: EncodedImage;
  thumbnail: EncodedImage;
}

/** Turn a raw capture into a core `CaptureScreen` (full image + thumbnail, base64). */
export async function prepareScreen(input: ToCaptureScreenInput): Promise<PreparedScreen> {
  const [image, thumbnail, color] = await Promise.all([
    encodeWebp(input.png, input.quality ?? 90),
    makeThumbnail(input.png, { viewport: input.viewport ?? "desktop" }),
    dominantColor(input.png).catch(() => undefined),
  ]);
  const title = input.title?.replace(/\s+/gu, " ").trim().slice(0, 160) || undefined;
  const text = input.text?.replace(/\s+/gu, " ").trim().slice(0, MAX_SCREEN_TEXT) || undefined;
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const screen: CaptureScreen = {
    image: { type: image.type, base64: image.buffer.toString("base64") },
    thumbnail: { type: thumbnail.type, base64: thumbnail.buffer.toString("base64") },
    width: image.width,
    height: image.height,
    title,
    sourceUrl: input.sourceUrl || undefined,
    patterns: (
      input.patterns ??
      (input.sourceUrl || title ? suggestPatterns(input.sourceUrl ?? "", title) : [])
    ).slice(0, 8),
    elements: input.elements ?? [],
    tags: input.tags ?? [],
    version: input.version ?? versionLabel(new Date(capturedAt)),
    dominantColor: color,
    capturedAt,
    text,
    stepLabel: input.stepLabel?.slice(0, 80),
  };
  return { screen, image, thumbnail };
}

export async function toCaptureScreen(input: ToCaptureScreenInput): Promise<CaptureScreen> {
  return (await prepareScreen(input)).screen;
}

// ---------------------------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------------------------

/** Decode the best entry of an ICO file into PNG bytes (embedded PNG or 32-bit BMP). */
export async function decodeIco(bytes: Buffer): Promise<Buffer | null> {
  if (bytes.length < 22 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return null;
  const count = bytes.readUInt16LE(4);
  const entries: { size: number; bpp: number; length: number; offset: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const base = 6 + index * 16;
    if (base + 16 > bytes.length) break;
    entries.push({
      size: bytes[base]! || 256,
      bpp: bytes.readUInt16LE(base + 6),
      length: bytes.readUInt32LE(base + 8),
      offset: bytes.readUInt32LE(base + 12),
    });
  }
  entries.sort((a, b) => b.size - a.size || b.bpp - a.bpp);
  const { default: sharp } = await import("sharp");
  for (const entry of entries) {
    if (entry.offset + entry.length > bytes.length) continue;
    const data = bytes.subarray(entry.offset, entry.offset + entry.length);
    if (data.readUInt32BE(0) === 0x89504e47) return Buffer.from(data);
    // BITMAPINFOHEADER: 40 bytes, height is doubled (XOR + AND masks), rows bottom-up BGRA.
    if (data.readUInt32LE(0) !== 40) continue;
    const width = data.readInt32LE(4);
    const height = Math.abs(data.readInt32LE(8)) / 2;
    const bpp = data.readUInt16LE(14);
    if (bpp !== 32 || width <= 0 || height <= 0) continue;
    const pixels = Buffer.alloc(width * height * 4);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y += 1) {
      const src = 40 + (height - 1 - y) * rowBytes;
      for (let x = 0; x < width; x += 1) {
        const s = src + x * 4;
        const d = (y * width + x) * 4;
        pixels[d] = data[s + 2]!;
        pixels[d + 1] = data[s + 1]!;
        pixels[d + 2] = data[s]!;
        pixels[d + 3] = data[s + 3]!;
      }
    }
    return sharp(pixels, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
  }
  return null;
}

export interface FetchLogoOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Fetch an app logo for a page: apple-touch-icon > largest declared icon > favicon, normalized
 * to PNG (≤256px). Returns `undefined` when nothing usable could be fetched.
 */
export async function fetchLogo(
  metadata: Pick<PageMetadata, "url" | "faviconUrl"> & { icons?: IconCandidate[] },
  options: FetchLogoOptions = {},
): Promise<{ type: "image/png"; base64: string; width: number; height: number } | undefined> {
  const doFetch = options.fetch ?? fetch;
  let origin: string;
  try {
    origin = new URL(metadata.url).origin;
  } catch {
    return undefined;
  }
  const candidates = [
    ...(metadata.icons ?? [])
      .filter((icon) => !icon.rel.includes("mask-icon"))
      .map((icon) => icon.url),
    `${origin}/apple-touch-icon.png`,
    metadata.faviconUrl,
    `${origin}/favicon.ico`,
  ].filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index);

  let best: EncodedImage | undefined;
  for (const url of candidates.slice(0, 6)) {
    try {
      const response = await doFetch(url, {
        headers: { accept: "image/*" },
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      });
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) continue;
      const decoded = (await decodeIco(bytes)) ?? bytes;
      const logo = await toLogoPng(decoded);
      if (!best || logo.width > best.width) best = logo;
      if (best.width >= 128) break;
    } catch {
      // try the next candidate
    }
  }
  if (!best) return undefined;
  return {
    type: "image/png",
    base64: best.buffer.toString("base64"),
    width: best.width,
    height: best.height,
  };
}

// ---------------------------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------------------------

export interface UploadOptions {
  /** Split into several requests above this many base64 bytes. Default 40 MB. */
  maxBatchBytes?: number;
}

const absolute = (baseUrl: string, url: string) => {
  try {
    return new URL(url, `${baseUrl}/`).href;
  } catch {
    return url;
  }
};

/**
 * POST a capture batch. Large batches are split into several `captures` requests (flow omitted)
 * and the flow is then created from the returned screen ids, so screens are never duplicated.
 * Returned URLs are absolute.
 */
export async function uploadCaptures(
  client: OpenUiClient,
  batch: CaptureBatchInput,
  options: UploadOptions = {},
): Promise<CaptureBatchResult> {
  const maxBytes = options.maxBatchBytes ?? 40 * 1024 * 1024;
  const sizeOf = (screen: CaptureScreen) =>
    screen.image.base64.length + screen.thumbnail.base64.length + (screen.text?.length ?? 0) + 2048;
  const total = batch.screens.reduce((sum, screen) => sum + sizeOf(screen), 0);
  const fix = (result: CaptureBatchResult): CaptureBatchResult => ({
    ...result,
    screens: result.screens.map((screen) => ({
      ...screen,
      url: absolute(client.baseUrl, screen.url),
    })),
    flow: result.flow ? { ...result.flow, url: absolute(client.baseUrl, result.flow.url) } : null,
  });
  if (total <= maxBytes) return fix(await client.captures(batch));

  const chunks: CaptureScreen[][] = [];
  let current: CaptureScreen[] = [];
  let currentSize = 0;
  for (const screen of batch.screens) {
    const size = sizeOf(screen);
    if (current.length > 0 && currentSize + size > maxBytes) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(screen);
    currentSize += size;
  }
  if (current.length) chunks.push(current);

  let app: CaptureBatchResult["app"] | undefined;
  const screens: CaptureBatchResult["screens"] = [];
  for (const [index, chunk] of chunks.entries()) {
    const result = await client.captures({
      app: app ? { ...batch.app, slug: app.slug } : batch.app,
      logo: index === 0 ? batch.logo : undefined,
      screens: chunk,
      source: batch.source,
    });
    app ??= result.app;
    screens.push(...result.screens);
  }
  let flow: CaptureBatchResult["flow"] = null;
  if (batch.flow && app && screens.length >= 2) {
    const created = await client.createFlow({
      appId: app.id,
      name: batch.flow.name,
      type: batch.flow.type,
      description: batch.flow.description,
      steps: screens.map((screen, index) => ({
        screenId: screen.id,
        label: batch.screens[index]?.stepLabel,
      })),
    });
    flow = { id: created.flow.id, status: created.flow.status, url: `/flows/${created.flow.id}` };
  }
  return fix({ app: app!, screens, flow });
}
