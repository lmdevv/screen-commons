import {
  captureBatchInputSchema,
  captureScreenSchema,
  type CaptureBatchInput,
  type OpenUiClient,
} from "@open-ui/core";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import {
  decodeIco,
  dominantColor,
  encodeWebp,
  imageSize,
  makePreview,
  makeThumbnail,
  prepareScreen,
  thumbnailGeometry,
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

describe("thumbnail geometry", () => {
  it("crops desktop captures to 16:10 from the top", () => {
    expect(thumbnailGeometry({ width: 2880, height: 1800 })).toEqual({
      width: 640,
      resizedHeight: 400,
      height: 400,
    });
    expect(thumbnailGeometry({ width: 1440, height: 9000 })).toEqual({
      width: 640,
      resizedHeight: 4000,
      height: 400,
    });
    expect(thumbnailGeometry({ width: 1440, height: 600 })).toEqual({
      width: 640,
      resizedHeight: 267,
      height: 267,
    });
  });
  it("crops mobile captures to 9:19.5", () => {
    expect(thumbnailGeometry({ width: 1170, height: 2532 }, { maxAspect: 9 / 19.5 })).toEqual({
      width: 640,
      resizedHeight: 1385,
      height: 1385,
    });
    expect(thumbnailGeometry({ width: 1170, height: 9000 }, { maxAspect: 9 / 19.5 }).height).toBe(
      1387,
    );
  });
});

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

  it("encodes WebP when smaller and keeps PNG beyond WebP limits", async () => {
    const png = await noisy(800, 500);
    const webp = await encodeWebp(png);
    expect(webp.type).toBe("image/webp");
    expect(webp.buffer.byteLength).toBeLessThan(png.byteLength);
    expect([webp.width, webp.height]).toEqual([800, 500]);

    const huge = await solid(100, 17_000);
    const kept = await encodeWebp(huge);
    expect(kept.type).toBe("image/png");
    expect(kept.buffer).toBe(huge);
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
    } as unknown as OpenUiClient;
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
