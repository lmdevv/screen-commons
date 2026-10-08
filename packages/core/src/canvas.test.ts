import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ImageBudgetError,
  encodeDisplayImage,
  encodeThumbnail,
  readEncoded,
  type Drawable,
  type EncodedBlob,
} from "./canvas";
import { DISPLAY_POLICY, WEBP_MAX_DIMENSION } from "./image-policy";

// Synthetic files: valid headers (what sniffImage checks) padded to the requested byte size.
function webp(width: number, height: number, bytes: number): Uint8Array {
  const out = new Uint8Array(Math.max(bytes, 32));
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, out.length - 8, true);
  out.set(new TextEncoder().encode("WEBPVP8L"), 8);
  view.setUint32(16, out.length - 20, true);
  out[20] = 0x2f;
  view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  return out;
}

function png(width: number, height: number, bytes: number): Uint8Array {
  const out = new Uint8Array(Math.max(bytes, 57));
  const view = new DataView(out.buffer);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  view.setUint32(8, 13);
  out.set(new TextEncoder().encode("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  // IDAT filling the rest, then IEND (PNG completeness walks the chunks)
  view.setUint32(33, out.length - 57);
  out.set(new TextEncoder().encode("IDAT"), 37);
  out.set(new TextEncoder().encode("IEND"), out.length - 8);
  return out;
}

function jpeg(width: number, height: number, bytes: number): Uint8Array {
  const out = new Uint8Array(Math.max(bytes, 32));
  const view = new DataView(out.buffer);
  out.set([0xff, 0xd8, 0xff, 0xc0], 0);
  view.setUint16(4, 17);
  out[6] = 8;
  view.setUint16(7, height);
  view.setUint16(9, width);
  // start of scan after the frame header, end of image last
  out.set([0xff, 0xda, 0x00, 0x02], 21);
  out.set([0xff, 0xd9], out.length - 2);
  return out;
}

type Encoder = (
  type: string,
  quality: number | undefined,
  width: number,
  height: number,
) => Uint8Array;

let encoder: Encoder;
/** Encodes of real canvases; the 1×1 WebP support probe is counted in `probes`. */
const calls: { type: string; quality?: number; width: number; height: number }[] = [];
let probes = 0;
const canvases: FakeCanvas[] = [];

class FakeCanvas {
  draws: unknown[][] = [];
  constructor(
    public width: number,
    public height: number,
  ) {
    canvases.push(this);
  }
  getContext() {
    return {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillStyle: "",
      fillRect: () => undefined,
      drawImage: (...args: unknown[]) => this.draws.push(args),
    };
  }
  async convertToBlob({ type, quality }: { type: string; quality?: number }) {
    if (this.width === 1 && this.height === 1) probes += 1;
    else calls.push({ type, quality, width: this.width, height: this.height });
    return new Blob([encoder(type, quality, this.width, this.height) as Uint8Array<ArrayBuffer>], {
      type,
    });
  }
}

/** A Chromium-like encoder: WebP/PNG/JPEG of the canvas size, with bytes chosen per call. */
const browser =
  (bytesFor: (type: string, quality?: number) => number): Encoder =>
  (type, quality, width, height) => {
    const bytes = bytesFor(type, quality);
    if (type === "image/webp") return webp(width, height, bytes);
    if (type === "image/jpeg") return jpeg(width, height, bytes);
    return png(width, height, bytes);
  };

/** Safari: every type it can't encode comes back as PNG. */
const safari =
  (bytes: number): Encoder =>
  (type, _quality, width, height) =>
    type === "image/jpeg" ? jpeg(width, height, bytes) : png(width, height, bytes);

const source = (width: number, height: number) => ({ width, height }) as unknown as Drawable;

async function original(bytes: Uint8Array): Promise<EncodedBlob> {
  return (await readEncoded(new Blob([bytes as Uint8Array<ArrayBuffer>])))!;
}

beforeEach(() => {
  calls.length = 0;
  probes = 0;
  canvases.length = 0;
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
});
afterEach(() => vi.unstubAllGlobals());

describe("readEncoded", () => {
  it("types blobs by their bytes, not their declared type", async () => {
    const blob = new Blob([png(10, 20, 100) as Uint8Array<ArrayBuffer>], { type: "image/webp" });
    const read = await readEncoded(blob);
    expect(read).toMatchObject({ type: "image/png", width: 10, height: 20, bytes: 100 });
    expect(read!.blob.type).toBe("image/png");
    expect(await readEncoded(new Blob(["GIF89a not supported"]))).toBeNull();
  });
});

describe("encodeDisplayImage", () => {
  it("returns display-ready WebP untouched (no second lossy pass)", async () => {
    encoder = browser(() => 1);
    const input = await original(webp(2880, 1800, 400_000));
    expect(await encodeDisplayImage(source(2880, 1800), input)).toBe(input);
    expect(calls).toEqual([]);
  });

  it("encodes PNG captures as WebP at the first quality that meets the target", async () => {
    encoder = browser((_type, quality) => (quality === 0.9 ? 900_000 : 1));
    const input = await original(png(2880, 1800, 3_000_000));
    const image = await encodeDisplayImage(source(2880, 1800), input);
    expect(image).toMatchObject({ type: "image/webp", width: 2880, height: 1800, bytes: 900_000 });
    expect(calls.map((call) => call.quality)).toEqual([0.9]);
  });

  it("steps down for large images and prefers lossless when it is smaller", async () => {
    encoder = browser((_type, quality) =>
      quality === 1 ? 3_000_000 : quality === 0.7 ? 3_500_000 : 6_000_000,
    );
    const input = await original(png(2880, 1800, 7_000_000));
    const image = await encodeDisplayImage(source(2880, 1800), input);
    expect(calls.map((call) => call.quality)).toEqual([0.9, 0.8, 0.7, 1]);
    expect(image).toMatchObject({ type: "image/webp", bytes: 3_000_000 });
  });

  it("keeps a compact source when WebP isn't smaller", async () => {
    encoder = browser(() => 300_000);
    const input = await original(png(1440, 900, 200_000));
    expect(await encodeDisplayImage(source(1440, 900), input)).toBe(input);
  });

  it("scales very tall pages to WebP's height limit instead of letting the encoder crop", async () => {
    encoder = browser(() => 2_000_000);
    const input = await original(png(2880, 20_000, 14_000_000));
    const image = await encodeDisplayImage(source(2880, 20_000), input);
    expect(image).toMatchObject({ type: "image/webp", width: 2359, height: WEBP_MAX_DIMENSION });
    expect(calls.every((call) => call.height === WEBP_MAX_DIMENSION)).toBe(true);
  });

  it("enforces the byte limit after the final attempt", async () => {
    encoder = browser(() => DISPLAY_POLICY.full.maxBytes + 1);
    const input = await original(png(4096, 16_000, 15_000_000));
    await expect(encodeDisplayImage(source(4096, 16_000), input)).rejects.toThrow(ImageBudgetError);
  });

  it("sends the source for the server to convert when the browser can't encode WebP", async () => {
    encoder = safari(500_000);
    const input = await original(png(2880, 20_000, 9_000_000));
    expect(await encodeDisplayImage(source(2880, 20_000), input)).toBe(input);
    // found out on a 1×1 probe: the 2359×16,383 canvas is never allocated
    expect(probes).toBe(1);
    expect(canvases.map(({ width, height }) => [width, height])).toEqual([[0, 0]]);
  });

  it("releases its canvases once encoded", async () => {
    encoder = browser(() => 900_000);
    await encodeDisplayImage(source(2880, 1800), await original(png(2880, 1800, 3_000_000)));
    await encodeThumbnail(source(2880, 1800), "desktop");
    expect(canvases.every(({ width, height }) => width === 0 && height === 0)).toBe(true);
  });

  it("falls back to PNG, then JPEG, when the source can't be sent as-is", async () => {
    encoder = (type, _quality, width, height) =>
      type === "image/jpeg"
        ? jpeg(width, height, 2_000_000)
        : png(width, height, DISPLAY_POLICY.full.maxBytes + 1);
    const image = await encodeDisplayImage(source(3000, 2000));
    expect(image).toMatchObject({ type: "image/jpeg", width: 3000, height: 2000 });
    // the probe found no WebP encoder, so no WebP attempt at full size
    expect(calls.map((call) => call.type)).toEqual(["image/png", "image/jpeg"]);
  });
});

describe("encodeThumbnail", () => {
  it("crops the top of tall pages to 16:10 at 640px", async () => {
    encoder = browser(() => 20_000);
    const thumb = await encodeThumbnail(source(2880, 9000), "desktop");
    expect(thumb).toMatchObject({ type: "image/webp", width: 640, height: 400, bytes: 20_000 });
    expect(calls).toEqual([{ type: "image/webp", quality: 0.82, width: 640, height: 400 }]);
  });

  it("sizes tall narrow pages from their display image, drawing from the source", async () => {
    encoder = browser(() => 20_000);
    // 750×20,000 displays at 614×16,383 and 390×18,000 at 355×16,383: the thumbnail is never
    // wider than the display image the server checks it against
    const tall = await encodeThumbnail(source(750, 20_000), "mobile");
    expect(tall).toMatchObject({ width: 614, height: 1330 });
    expect(canvases.at(-1)!.draws[0]).toEqual([
      expect.anything(),
      0,
      0,
      750,
      1625,
      0,
      0,
      614,
      1330,
    ]);
    expect(await encodeThumbnail(source(390, 18_000), "mobile")).toMatchObject({
      width: 355,
      height: 769,
    });
  });

  it("never upscales small images", async () => {
    encoder = browser(() => 5_000);
    expect(await encodeThumbnail(source(320, 200), "desktop")).toMatchObject({
      width: 320,
      height: 200,
    });
  });

  it("uses JPEG within the budget when the browser can't encode WebP", async () => {
    encoder = safari(30_000);
    const thumb = await encodeThumbnail(source(900, 3000), "mobile");
    expect(thumb).toMatchObject({ type: "image/jpeg", width: 640, height: 1387 });
  });

  it("never returns a thumbnail over the hard limit", async () => {
    encoder = browser(() => DISPLAY_POLICY.thumbnail.maxBytes + 1);
    await expect(encodeThumbnail(source(2880, 1800), "desktop")).rejects.toThrow(ImageBudgetError);
  });
});
