import { describe, expect, it } from "vitest";

import {
  DISPLAY_POLICY,
  MEDIA_KEY_PATTERN,
  WEBP_MAX_DIMENSION,
  derivativeKey,
  displaySize,
  encodeWithinBudget,
  isDisplayReady,
  isThumbnailOf,
  keepSource,
  sniffImage,
  thumbnailBox,
  type EncodedResult,
} from "./image-policy";
import { base64ToBytes } from "./utils";

// 3x2 images encoded by libwebp / libpng.
const LOSSY = base64ToBytes(
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoDAAIAAUAmJaACdLoB+AADsAD+9hNf/izkYjs83/4E78Cd+BO/8AAAAAA=",
);
const LOSSLESS = base64ToBytes("UklGRh4AAABXRUJQVlA4TBEAAAAvAkAAAAdQhSJXof+BiOh/AAA=");
const ALPHA = base64ToBytes(
  "UklGRl4AAABXRUJQVlA4WAoAAAAQAAAAAgAAAQAAQUxQSAcAAAAAgICAgICAAFZQOCAwAAAA0AEAnQEqAwACAAFAJiWgAnS6AfgAA7AA/vYTX/4s5GI7PN/+BO/AnfgTv/AAAAAA",
);
const PNG = base64ToBytes(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4wcUFQQxwFgA4GAUp6mv7BgAAAABJRU5ErkJggg==",
);

describe("displaySize", () => {
  it("keeps images that fit and never upscales", () => {
    expect(displaySize(2880, 1800)).toEqual({ width: 2880, height: 1800, scaled: false });
    expect(displaySize(64, 64)).toEqual({ width: 64, height: 64, scaled: false });
    expect(displaySize(4096, WEBP_MAX_DIMENSION).scaled).toBe(false);
  });

  it("scales tall pages down to WebP's height limit, keeping the aspect", () => {
    const size = displaySize(2880, 20_000);
    expect(size).toEqual({ width: 2359, height: WEBP_MAX_DIMENSION, scaled: true });
    expect(size.width / size.height).toBeCloseTo(2880 / 20_000, 3);
    expect(displaySize(1170, 16_384)).toEqual({ width: 1170, height: 16_383, scaled: true });
  });

  it("scales wide images down to the width limit", () => {
    expect(displaySize(8192, 1000)).toEqual({ width: 4096, height: 500, scaled: true });
  });
});

describe("thumbnailBox", () => {
  it("crops tall desktop shots from the top to 16:10", () => {
    expect(thumbnailBox(2880, 9000, "desktop")).toEqual({
      width: 640,
      height: 400,
      sourceHeight: 1800,
      cropped: true,
    });
    expect(thumbnailBox(1280, 2400, "desktop")).toMatchObject({ width: 640, height: 400 });
  });

  it("keeps short images' aspect and never upscales", () => {
    expect(thumbnailBox(1440, 900, "desktop")).toEqual({
      width: 640,
      height: 400,
      sourceHeight: 900,
      cropped: false,
    });
    expect(thumbnailBox(320, 200, "desktop")).toEqual({
      width: 320,
      height: 200,
      sourceHeight: 200,
      cropped: false,
    });
  });

  it("uses 9:19.5 for mobile", () => {
    expect(thumbnailBox(900, 3000, "mobile")).toMatchObject({ width: 640, height: 1387 });
    expect(thumbnailBox(1170, 2000, "mobile")).toMatchObject({ width: 640, height: 1094 });
  });
});

describe("isThumbnailOf", () => {
  it("accepts top crops at 1x or 2x and either kind's ratio", () => {
    expect(isThumbnailOf({ width: 640, height: 400 }, { width: 2880, height: 9000 })).toBe(true);
    expect(isThumbnailOf({ width: 1280, height: 800 }, { width: 2880, height: 1800 })).toBe(true);
    expect(isThumbnailOf({ width: 640, height: 1387 }, { width: 1280, height: 9000 })).toBe(true);
    expect(isThumbnailOf({ width: 320, height: 200 }, { width: 320, height: 200 })).toBe(true);
  });

  it("rejects full pages, upscales and stretched images", () => {
    // a 1000x9000 page sent as its own "thumbnail"
    expect(isThumbnailOf({ width: 1000, height: 9000 }, { width: 1000, height: 9000 })).toBe(false);
    expect(isThumbnailOf({ width: 640, height: 400 }, { width: 320, height: 200 })).toBe(false);
    expect(isThumbnailOf({ width: 640, height: 600 }, { width: 2880, height: 1800 })).toBe(false);
  });
});

describe("source decisions", () => {
  const source = { type: "image/png" as const, width: 2880, height: 1800, bytes: 500_000 };

  it("only treats WebP within the limits as display-ready", () => {
    expect(isDisplayReady({ ...source, type: "image/webp" })).toBe(true);
    expect(isDisplayReady(source)).toBe(false);
    expect(isDisplayReady({ ...source, type: "image/webp", height: 20_000 })).toBe(false);
    expect(
      isDisplayReady({ ...source, type: "image/webp", bytes: DISPLAY_POLICY.full.maxBytes + 1 }),
    ).toBe(false);
  });

  it("keeps a compact source rather than a larger derivative, unless it must be resized", () => {
    expect(keepSource(source, 400_000)).toBe(false);
    expect(keepSource(source, 500_000)).toBe(true);
    expect(keepSource({ ...source, height: 20_000 }, 900_000)).toBe(false);
  });
});

describe("encodeWithinBudget", () => {
  const result = (bytes: number, overrides: Partial<EncodedResult> = {}): EncodedResult => ({
    type: "image/webp",
    width: 100,
    height: 50,
    bytes,
    ...overrides,
  });
  const budget = { qualities: [0.9, 0.8, 0.7], targetBytes: 1000, maxBytes: 5000 };

  it("steps down the quality ladder until the image fits", async () => {
    const tried: number[] = [];
    const outcome = await encodeWithinBudget(
      async (quality) => {
        tried.push(quality);
        return result(quality > 0.75 ? 2000 : 900);
      },
      { width: 100, height: 50 },
      budget,
    );
    expect(tried).toEqual([0.9, 0.8, 0.7]);
    expect(outcome).toMatchObject({ status: "ok", quality: 0.7, image: { bytes: 900 } });
  });

  it("accepts the final attempt above the target but enforces the hard limit", async () => {
    expect(
      await encodeWithinBudget(async () => result(4000), { width: 100, height: 50 }, budget),
    ).toMatchObject({ status: "ok", quality: 0.7, image: { bytes: 4000 } });
    expect(
      await encodeWithinBudget(async () => result(5001), { width: 100, height: 50 }, budget),
    ).toEqual({ status: "over_budget", bytes: 5001 });
  });

  it("reports encoders that fall back to another format or change the size", async () => {
    expect(
      await encodeWithinBudget(
        async () => result(10, { type: "image/png" }),
        { width: 100, height: 50 },
        budget,
      ),
    ).toEqual({ status: "unsupported", type: "image/png" });
    // Chromium crops canvases taller than 16,383px instead of failing.
    const cropped = await encodeWithinBudget(
      async () => result(10, { width: 100, height: WEBP_MAX_DIMENSION }),
      { width: 100, height: 17_000 },
      budget,
    );
    expect(cropped.status).toBe("invalid");
  });
});

describe("sniffImage", () => {
  it("reads lossy, lossless and extended (alpha) WebP plus PNG", () => {
    expect(sniffImage(LOSSY)).toEqual({ type: "image/webp", width: 3, height: 2 });
    expect(sniffImage(LOSSLESS)).toEqual({ type: "image/webp", width: 3, height: 2 });
    expect(sniffImage(ALPHA)).toEqual({ type: "image/webp", width: 3, height: 2 });
    expect(sniffImage(PNG)).toEqual({ type: "image/png", width: 3, height: 2 });
  });

  it("rejects truncated files and corrupt WebP frame headers", () => {
    expect(sniffImage(LOSSY.subarray(0, LOSSY.length - 4))).toBeNull();
    expect(sniffImage(PNG.subarray(0, PNG.length - 12))).toBeNull();
    const corrupt = LOSSY.slice();
    corrupt[23] = 0;
    expect(sniffImage(corrupt)).toBeNull();
    expect(sniffImage(new TextEncoder().encode("RIFF....WEBPVP8 not really an image"))).toBeNull();
  });
});

describe("media keys", () => {
  const sha = "a".repeat(64);

  it("versions derivative keys and keeps them servable", () => {
    expect(derivativeKey("img", sha)).toBe(`img/${sha}.v1.webp`);
    expect(derivativeKey("thumb", sha, "mobile")).toBe(`thumb/${sha}.v1-mobile.webp`);
    for (const key of [
      `img/${sha}.png`,
      `img/${sha}.v1.webp`,
      `thumb/${sha}.v1-desktop.webp`,
      `orig/${sha}.jpg`,
      `logo/${sha}.png`,
    ]) {
      expect(key).toMatch(MEDIA_KEY_PATTERN);
    }
    expect(`img/${sha}.v1-tablet.webp`).not.toMatch(MEDIA_KEY_PATTERN);
    expect(`img/${sha}.gif`).not.toMatch(MEDIA_KEY_PATTERN);
  });
});
