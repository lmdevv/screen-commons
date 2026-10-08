import {
  captureBatchInputSchema,
  captureScreenSchema,
  isThumbnailOf,
  sniffImage,
  type CaptureBatchInput,
  type ScreenCommonsClient,
} from "@screen-commons/core";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import {
  decodeIco,
  dominantColor,
  encodeDisplay,
  imageSize,
  makePreview,
  makeThumbnail,
  prepareScreen,
  uploadCaptures,
} from "../src/index";

const solid = (width: number, height: number, background = "#3366cc") =>
  sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();

/** A noisy image so WebP/PNG sizes are realistic. */
const noisy = async (width: number, height: number) => {
  const raw = Buffer.alloc(width * height * 3);
  let state = 0x2545f491;
  for (let index = 0; index < raw.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    raw[index] = state & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
};

describe("image encoding", () => {
  it("makes 640px WebP thumbnails anchored at the top", async () => {
    // top half red, bottom half blue: the 16:10 crop of a tall image keeps only red
    const tall = await sharp({
      create: { width: 1440, height: 4000, channels: 3, background: "#0000ff" },
    })
      .composite([{ input: await solid(1440, 2000, "#ff0000"), top: 0, left: 0 }])
      .png()
      .toBuffer();
    const thumb = await makeThumbnail(tall);
    expect(thumb.type).toBe("image/webp");
    expect([thumb.width, thumb.height]).toEqual([640, 400]);
    expect(await imageSize(thumb.buffer)).toEqual({ width: 640, height: 400 });
    expect(await dominantColor(thumb.buffer)).toMatch(/^#f[0-9a-f]0[0-9a-f]0[0-9a-f]$/u);
    const mobile = await makeThumbnail(await solid(1170, 2532), { viewport: "mobile" });
    expect([mobile.width, mobile.height]).toEqual([640, 1385]);
  });

  it("sizes thumbnails of tall narrow pages from their display image", async () => {
    // 750×20,000 displays at 614×16,383 and 390×18,000 at 355×16,383; the server checks the
    // thumbnail against the display image, so it can't be wider
    for (const [width, height, thumb] of [
      [750, 20_000, [614, 1330]],
      [390, 18_000, [355, 769]],
    ] as const) {
      const { screen } = await prepareScreen({
        png: await solid(width, height),
        sourceUrl: "https://example.com/tall",
        viewport: "mobile",
      });
      const image = sniffImage(Buffer.from(screen.image.base64, "base64"))!;
      const thumbnail = sniffImage(Buffer.from(screen.thumbnail.base64, "base64"))!;
      expect([image.width, image.height]).toEqual([thumb[0], 16_383]);
      expect([thumbnail.width, thumbnail.height]).toEqual(thumb);
      expect(isThumbnailOf(thumbnail, image)).toBe(true);
    }
  });

  it("never upscales thumbnails and enforces the WebP output", async () => {
    const small = await makeThumbnail(await solid(320, 200));
    expect([small.type, small.width, small.height]).toEqual(["image/webp", 320, 200]);
    expect(sniffImage(small.buffer)).toEqual({ type: "image/webp", width: 320, height: 200 });
  });

  it("encodes PNG captures as WebP display images, checked from the encoded bytes", async () => {
    const png = await noisy(800, 500);
    const display = await encodeDisplay(png);
    expect(display.type).toBe("image/webp");
    expect(display.buffer.byteLength).toBeLessThan(png.byteLength);
    expect(sniffImage(display.buffer)).toEqual({ type: "image/webp", width: 800, height: 500 });
  });

  it("returns WebP inputs untouched instead of re-encoding them", async () => {
    const webp = await sharp(await noisy(400, 300))
      .webp({ quality: 60 })
      .toBuffer();
    expect((await encodeDisplay(webp)).buffer).toBe(webp);
  });

  it("keeps a compact source when WebP wouldn't be smaller", async () => {
    const jpeg = await sharp(await noisy(400, 300))
      .jpeg({ quality: 20 })
      .toBuffer();
    const display = await encodeDisplay(jpeg);
    expect(display.type).toBe("image/jpeg");
    expect(display.buffer).toBe(jpeg);
  });

  it("scales pages taller than WebP allows down to 16,383px, keeping the aspect", async () => {
    const display = await encodeDisplay(await solid(1000, 17_000));
    expect(sniffImage(display.buffer)).toEqual({ type: "image/webp", width: 964, height: 16_383 });
  });

  it("keeps alpha", async () => {
    const translucent = await sharp({
      create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: await noisy(100, 100), top: 50, left: 100 }])
      .png()
      .toBuffer();
    const display = await encodeDisplay(translucent);
    expect(display.type).toBe("image/webp");
    const { data } = await sharp(display.buffer).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    expect(data[3]).toBe(0);
    expect(data[(100 * 300 + 150) * 4 + 3]).toBe(255);
  });

  it("uses lossless WebP for flat UI when it beats lossy", async () => {
    const lines = Array.from(
      { length: 40 },
      (_, index) =>
        `<text x="24" y="${40 + index * 22}" font-family="sans-serif" font-size="14" fill="#18181b">Settings · Billing · Members · API keys · Webhooks · ${index}</text>`,
    ).join("");
    const ui = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="920"><rect width="100%" height="100%" fill="#ffffff"/><rect x="0" y="0" width="1200" height="20" fill="#2563eb"/>${lines}</svg>`,
      ),
    )
      .png()
      .toBuffer();
    const display = await encodeDisplay(ui);
    expect(display.type).toBe("image/webp");
    // VP8L = lossless bitstream: small text survives pixel-exact.
    expect(display.buffer.subarray(12, 16).toString("ascii")).toBe("VP8L");
    const [a, b] = await Promise.all(
      [ui, display.buffer].map((buffer) => sharp(buffer).removeAlpha().raw().toBuffer()),
    );
    expect(Buffer.compare(a!, b!)).toBe(0);
  });

  it("only tries lossless WebP for PNG sources", async () => {
    const jpeg = await sharp(await noisy(800, 500))
      .jpeg({ quality: 95 })
      .toBuffer();
    const webp = vi.spyOn(sharp.prototype, "webp");
    try {
      await encodeDisplay(jpeg);
      expect(webp).toHaveBeenCalled();
      expect(webp.mock.calls.some(([options]) => options?.lossless)).toBe(false);
    } finally {
      webp.mockRestore();
    }
  });

  it("computes dominant colours as hex", async () => {
    expect(await dominantColor(await solid(64, 64, "#ffffff"))).toBe("#ffffff");
    expect(await dominantColor(await solid(64, 64, "#000000"))).toBe("#000000");
  });

  it("downsizes previews under the byte budget", async () => {
    const preview = await makePreview(await noisy(2880, 1800), { maxBytes: 300_000 });
    expect(preview.buffer.byteLength).toBeLessThanOrEqual(300_000);
    expect(preview.width).toBeLessThanOrEqual(1280);
    expect(preview.truncated).toBe(false);
    const tall = await makePreview(await solid(1440, 20_000));
    expect([tall.width, tall.height, tall.truncated]).toEqual([1280, 7800, true]);
  });

  it("decodes ICO files with embedded PNG and 32-bit BMP entries", async () => {
    const png16 = await solid(16, 16, "#00ff00");
    const header = Buffer.alloc(6 + 16 * 2);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(2, 4);
    // BMP entry 32x32 BGRA (blue)
    const size = 32;
    const dib = Buffer.alloc(40 + size * size * 4 + (size * size) / 8);
    dib.writeUInt32LE(40, 0);
    dib.writeInt32LE(size, 4);
    dib.writeInt32LE(size * 2, 8);
    dib.writeUInt16LE(1, 12);
    dib.writeUInt16LE(32, 14);
    for (let index = 0; index < size * size; index += 1) {
      dib[40 + index * 4] = 255; // B
      dib[40 + index * 4 + 3] = 255; // A
    }
    const pngOffset = header.length;
    const bmpOffset = pngOffset + png16.length;
    header[6] = 16;
    header[7] = 16;
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png16.length, 14);
    header.writeUInt32LE(pngOffset, 18);
    header[22] = 32;
    header[23] = 32;
    header.writeUInt16LE(32, 28);
    header.writeUInt32LE(dib.length, 30);
    header.writeUInt32LE(bmpOffset, 34);
    const ico = Buffer.concat([header, png16, dib]);
    const decoded = await decodeIco(ico);
    expect(decoded).not.toBeNull();
    expect(await imageSize(decoded!)).toEqual({ width: 32, height: 32 });
    expect(await dominantColor(decoded!)).toBe("#0000ff");
  });
});

describe("prepareScreen + uploadCaptures", () => {
  it("produces schema-valid capture screens", async () => {
    const { screen, image, thumbnail } = await prepareScreen({
      png: await noisy(1440, 900),
      sourceUrl: "https://linear.app/pricing",
      title: "Pricing –   Linear",
      text: "  Plans\n\n for   everyone ",
      capturedAt: "2026-10-01T00:00:00.000Z",
      stepLabel: "Pricing",
    });
    expect(captureScreenSchema.parse(screen)).toBeTruthy();
    expect(screen.patterns).toEqual(["pricing"]);
    expect(screen.title).toBe("Pricing – Linear");
    expect(screen.text).toBe("Plans for everyone");
    expect(screen.version).toBe("Oct 2026");
    expect(screen.width).toBe(1440);
    expect(image.type).toBe("image/webp");
    expect(thumbnail.height).toBe(400);
  });

  it("splits large batches and creates the flow from returned ids", async () => {
    const { screen } = await prepareScreen({
      png: await solid(200, 100),
      sourceUrl: "https://x.com/",
    });
    const batch: CaptureBatchInput = {
      app: { name: "X", websiteUrl: "https://x.com" },
      screens: [1, 2, 3].map((index) => ({ ...screen, stepLabel: `Step ${index}` })),
      flow: { name: "Exploring", type: "exploring" },
      source: "seed",
    };
    expect(captureBatchInputSchema.parse(batch)).toBeTruthy();
    let counter = 0;
    const captures = vi.fn(async (input: CaptureBatchInput) => ({
      app: {
        id: "app_1",
        slug: "x",
        name: "X",
        platform: "web" as const,
        logoUrl: null,
        accentColor: null,
      },
      screens: input.screens.map(() => ({
        id: `s${++counter}`,
        status: "published" as const,
        url: `/screens/s${counter}`,
      })),
      flow: null,
    }));
    const createFlow = vi.fn(async () => ({ flow: { id: "f1", status: "published" } }));
    const client = {
      baseUrl: "http://localhost:5173",
      captures,
      createFlow,
    } as unknown as ScreenCommonsClient;
    const result = await uploadCaptures(client, batch, { maxBatchBytes: 1 });
    expect(captures).toHaveBeenCalledTimes(3);
    expect(captures.mock.calls.every(([input]) => input.flow === undefined)).toBe(true);
    expect(createFlow).toHaveBeenCalledWith({
      appId: "app_1",
      name: "Exploring",
      type: "exploring",
      description: undefined,
      steps: [
        { screenId: "s1", label: "Step 1" },
        { screenId: "s2", label: "Step 2" },
        { screenId: "s3", label: "Step 3" },
      ],
    });
    expect(result.screens[0]?.url).toBe("http://localhost:5173/screens/s1");
    expect(result.flow?.url).toBe("http://localhost:5173/flows/f1");

    captures.mockClear();
    const single = await uploadCaptures(client, batch);
    expect(captures).toHaveBeenCalledTimes(1);
    expect(captures.mock.calls[0]?.[0].flow?.name).toBe("Exploring");
    expect(single.screens).toHaveLength(3);
  });
});
