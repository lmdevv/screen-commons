import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ImagesBinding } from "@cloudflare/workers-types";
import {
  DISPLAY_POLICY,
  ScreenCommonsApiError,
  WEBP_MAX_DIMENSION,
  readImageHeader,
  type BackfillDisplayInput,
  type BackfillDisplayResult,
} from "@screen-commons/core";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { deriveDisplayImage, deriveThumbnail, type DecodedImage } from "../src/server/display";
import { makePng, makeWebp } from "./images";
import {
  Session,
  b64,
  baseUrl,
  captureScreen,
  d1,
  keyClient,
  uniqueSuffix,
  wranglerLocal,
} from "./helpers";

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** A real WebP header for any size, padded to `bytes` (what sniffImage checks). */
function webpOf(width: number, height: number, bytes = 0): Uint8Array {
  const image = makeWebp(width, height);
  const out = new Uint8Array(Math.max(bytes, image.byteLength));
  out.set(image);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Images binding derivations (fake binding)
// ---------------------------------------------------------------------------------------------

type Call = { transform: Record<string, unknown> | null; quality: number };

function fakeImages(respond: (call: Call) => Uint8Array): ImagesBinding & { calls: Call[] } {
  const calls: Call[] = [];
  const binding = {
    calls,
    input: () => {
      let transform: Record<string, unknown> | null = null;
      const chain = {
        transform(options: Record<string, unknown>) {
          transform = options;
          return chain;
        },
        async output(options: { quality: number }) {
          const call = { transform, quality: options.quality };
          calls.push(call);
          const bytes = respond(call);
          return { response: () => new Response(bytes as Uint8Array<ArrayBuffer>) };
        },
      };
      return chain;
    },
  };
  return binding as unknown as ImagesBinding & { calls: Call[] };
}

const pngSource = (width: number, height: number, bytes = 2_000_000): DecodedImage => ({
  data: new Uint8Array(bytes),
  type: "image/png",
  width,
  height,
});

describe("server derivations", () => {
  it("encodes non-WebP sources at the first quality within the target", async () => {
    const images = fakeImages(({ quality }) => webpOf(1280, 800, quality === 90 ? 900_000 : 100));
    const result = await deriveDisplayImage(images, pngSource(1280, 800));
    expect(result).toMatchObject({
      status: "derived",
      image: { type: "image/webp", width: 1280, height: 800 },
    });
    expect(images.calls).toEqual([{ transform: null, quality: 90 }]);
  });

  it("leaves display-ready WebP alone and keeps a source WebP can't beat", async () => {
    const images = fakeImages(() => webpOf(1280, 800, 3_000_000));
    const webp: DecodedImage = { ...pngSource(1280, 800), type: "image/webp" };
    expect(await deriveDisplayImage(images, webp)).toEqual({ status: "kept" });
    expect(images.calls).toEqual([]);
    expect(await deriveDisplayImage(images, pngSource(1280, 800))).toEqual({ status: "kept" });
  });

  it("scales pages taller than WebP allows, accepting the binding's ±1px rounding", async () => {
    const images = fakeImages(() => webpOf(274, WEBP_MAX_DIMENSION, 500_000));
    const result = await deriveDisplayImage(images, pngSource(300, 18_000));
    expect(result).toMatchObject({ status: "derived", image: { width: 274 } });
    expect(images.calls[0]!.transform).toEqual({ height: WEBP_MAX_DIMENSION, fit: "scale-down" });
  });

  it("reports binding failures instead of returning something else", async () => {
    const source = pngSource(1280, 800);
    expect(await deriveDisplayImage(undefined, source)).toMatchObject({ status: "failed" });
    expect(await deriveThumbnail(undefined, source, "desktop")).toMatchObject({ status: "failed" });
    const throwing = fakeImages(() => {
      throw new Error("images: 9422 internal error");
    });
    expect(await deriveDisplayImage(throwing, source)).toEqual({
      status: "failed",
      reason: "images: 9422 internal error",
    });
    // a different format, a different size, an unreadable file, or too many bytes
    const png = fakeImages(() => makePng(1280, 800));
    expect(await deriveDisplayImage(png, source)).toMatchObject({
      status: "failed",
      reason: "the binding returned image/png",
    });
    const cropped = fakeImages(() => webpOf(640, 300));
    expect(await deriveThumbnail(cropped, source, "desktop")).toMatchObject({ status: "failed" });
    const garbage = fakeImages(() => new TextEncoder().encode("RIFF nope"));
    expect(await deriveThumbnail(garbage, source, "desktop")).toMatchObject({ status: "failed" });
    const huge = fakeImages(() => webpOf(4096, 4000, DISPLAY_POLICY.full.maxBytes + 1));
    expect(await deriveDisplayImage(huge, pngSource(4096, 4000, 14_000_000))).toMatchObject({
      status: "failed",
    });
    expect(huge.calls.map((call) => call.quality)).toEqual([90, 80, 70]);
  });

  it("crops thumbnails from the top and never upscales", async () => {
    const images = fakeImages(({ transform }) =>
      webpOf(Number(transform!.width), Number(transform!.height ?? 200), 20_000),
    );
    expect(await deriveThumbnail(images, pngSource(2880, 9000), "desktop")).toMatchObject({
      status: "derived",
      image: { width: 640, height: 400 },
    });
    expect(images.calls[0]!.transform).toEqual({
      width: 640,
      height: 400,
      fit: "cover",
      gravity: "top",
    });
    expect(await deriveThumbnail(images, pngSource(320, 200), "desktop")).toMatchObject({
      image: { width: 320, height: 200 },
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Intake through the API (local Images binding)
// ---------------------------------------------------------------------------------------------

const suffix = uniqueSuffix();
let adminKey: string;
let memberKey: string;

beforeAll(async () => {
  const credentials = inject("admin");
  const admin = await Session.signIn(credentials.email, credentials.password);
  adminKey = (await admin.client().createKey("display tests")).token;
  const member = await Session.signUp("Display member", `display-${suffix}@screen-commons.test`);
  memberKey = (await member.client().createKey("display member")).token;
});

async function apiError(promise: Promise<unknown>): Promise<ScreenCommonsApiError> {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(ScreenCommonsApiError);
  return error as ScreenCommonsApiError;
}

async function fetchImage(path: string) {
  const response = await fetch(`${baseUrl()}${path}`);
  expect(response.status).toBe(200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, header: readImageHeader(bytes), type: response.headers.get("content-type") };
}

async function upload(image: Uint8Array, thumbnail: Uint8Array | null, name = "Display") {
  const header = readImageHeader(image)!;
  const thumb = thumbnail && readImageHeader(thumbnail)!;
  const result = await keyClient(adminKey).captures({
    app: { name: `${name} ${suffix}` },
    screens: [
      captureScreen({
        image: { type: header.type, base64: b64(Buffer.from(image)) },
        ...(thumb ? { thumbnail: { type: thumb.type, base64: b64(Buffer.from(thumbnail)) } } : {}),
        width: header.width,
        height: header.height,
      }),
    ],
  });
  return keyClient(adminKey).getScreen(result.screens[0]!.id);
}

describe("display images on upload", () => {
  it("converts PNG uploads to a versioned WebP derivative and keeps the original private", async () => {
    const png = makePng(1280, 800, 9101, { noise: true });
    const sha = sha256(png);
    const screen = await upload(png, makeWebp(640, 400));
    expect(screen.imageUrl).toBe(`/media/img/${sha}.v1.webp`);
    expect({ width: screen.width, height: screen.height }).toEqual({ width: 1280, height: 800 });
    const display = await fetchImage(screen.imageUrl);
    expect(display.type).toBe("image/webp");
    expect(display.header).toEqual({ type: "image/webp", width: 1280, height: 800 });
    // the client's WebP thumbnail is used as sent
    expect(screen.thumbUrl).toMatch(/^\/media\/thumb\/[0-9a-f]{64}\.webp$/u);
    // the retained original is never served, under either key
    for (const key of [`orig/${sha}.png`, `img/${sha}.png`]) {
      expect((await fetch(`${baseUrl()}/media/${key}`)).status).toBe(404);
    }
    // a re-upload of the same PNG is recognised as a duplicate
    expect((await upload(png, makeWebp(640, 400))).id).toBe(screen.id);
  });

  it("stores display-ready WebP exactly as sent (no second lossy pass)", async () => {
    const webp = makeWebp(1280, 800, [12, 80, 200, 255]);
    const screen = await upload(webp, makeWebp(640, 400));
    expect(screen.imageUrl).toBe(`/media/img/${sha256(webp)}.webp`);
    expect(Buffer.from((await fetchImage(screen.imageUrl)).bytes).equals(webp)).toBe(true);
  });

  it("scales pages taller than WebP allows and generates the missing thumbnail", async () => {
    const response = await fetch(`${baseUrl()}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${adminKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "upload_screen",
          arguments: {
            app: { name: `Tall ${suffix}`, platform: "web" },
            image: { type: "image/png", base64: b64(makePng(300, 18_000, 77)) },
          },
        },
      }),
    });
    const result = (await response.json()).result;
    expect(result.isError).toBeUndefined();
    const screen = await keyClient(adminKey).getScreen(
      JSON.parse(result.content[0].text).screen.id,
    );
    expect(screen.height).toBe(WEBP_MAX_DIMENSION);
    expect(Math.abs(screen.width - 273)).toBeLessThanOrEqual(1);
    const display = await fetchImage(screen.imageUrl);
    expect(display.header).toEqual({
      type: "image/webp",
      width: screen.width,
      height: screen.height,
    });
    expect(screen.thumbUrl).toMatch(/^\/media\/thumb\/[0-9a-f]{64}\.v1-desktop\.webp$/u);
    expect((await fetchImage(screen.thumbUrl)).header).toEqual({
      type: "image/webp",
      width: 300,
      height: 188,
    });
  });

  it("replaces a PNG/JPEG client thumbnail (no WebP encoder) with a WebP one", async () => {
    const png = makePng(1280, 800, 9102);
    const screen = await upload(png, makePng(640, 400, 9103));
    expect(screen.thumbUrl).toBe(`/media/thumb/${sha256(png)}.v1-desktop.webp`);
    expect((await fetchImage(screen.thumbUrl)).header).toEqual({
      type: "image/webp",
      width: 640,
      height: 400,
    });
  });

  it("rejects relabelled and truncated files instead of storing them", async () => {
    const api = keyClient(adminKey);
    const png = makePng(320, 200, 9104);
    const relabelled = await apiError(
      api.captures({
        app: { name: `Relabelled ${suffix}` },
        screens: [captureScreen({ image: { type: "image/webp", base64: b64(png) } })],
      }),
    );
    expect(relabelled.status).toBe(415);
    expect(relabelled.message).toContain("declared as image/webp but is image/png");
    const truncated = await apiError(
      api.captures({
        app: { name: `Truncated ${suffix}` },
        screens: [
          captureScreen({ image: { type: "image/png", base64: b64(png.subarray(0, -20)) } }),
        ],
      }),
    );
    expect(truncated.status).toBe(415);
  });

  it("rejects a full page sent as its own thumbnail", async () => {
    const error = await apiError(
      keyClient(adminKey).captures({
        app: { name: `Full thumb ${suffix}` },
        screens: [
          captureScreen({
            image: { type: "image/png", base64: b64(makePng(320, 3000, 9105)) },
            thumbnail: { type: "image/webp", base64: b64(makeWebp(320, 3000)) },
          }),
        ],
      }),
    );
    expect(error.status).toBe(400);
    expect(error.message).toContain("isn't a thumbnail");
  });
});

// ---------------------------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------------------------

async function backfillAll(input: BackfillDisplayInput = {}) {
  const items: BackfillDisplayResult["items"] = [];
  let cursor: string | undefined;
  let page: BackfillDisplayResult;
  do {
    page = await keyClient(adminKey).backfillDisplay({ ...input, cursor });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { items, remaining: page.remaining };
}

/** Store `data` in local R2 the way pre-policy uploads did (no derivative metadata). */
async function putLegacy(key: string, data: Uint8Array, type: string) {
  const file = join(await mkdtemp(join(tmpdir(), "screen-commons-legacy-")), "object");
  await writeFile(file, data);
  await wranglerLocal([
    "r2",
    "object",
    "put",
    `screen-commons-media/${key}`,
    "--file",
    file,
    "--content-type",
    type,
  ]);
}

describe("display backfill", () => {
  it("brings pre-policy screens up to the current version, once", async () => {
    // Two rows as they looked before the policy: (a) a PNG shown as the full image and, through
    // the old fallback, as its own thumbnail; (b) a PNG with a proper client thumbnail.
    const pngA = makePng(1280, 800, 9201, { noise: true });
    const pngB = makePng(320, 200, 9202, { noise: true });
    const [shaA, shaB] = [sha256(pngA), sha256(pngB)];
    const a = await upload(makeWebp(1280, 800, [1, 2, 3, 255]), makeWebp(640, 400), "Legacy A");
    const b = await upload(makeWebp(320, 200, [4, 5, 6, 255]), makeWebp(160, 100), "Legacy B");
    await putLegacy(`img/${shaA}.png`, pngA, "image/png");
    await putLegacy(`img/${shaB}.png`, pngB, "image/png");
    const reset = "original_key = NULL, display_version = NULL";
    await d1(
      `UPDATE screen SET image_key = 'img/${shaA}.png', thumb_key = 'img/${shaA}.png', thumb_width = 1280, thumb_height = 800, ${reset} WHERE id = '${a.id}'`,
    );
    await d1(`UPDATE screen SET image_key = 'img/${shaB}.png', ${reset} WHERE id = '${b.id}'`);
    const bThumb = (await keyClient(adminKey).getScreen(b.id)).thumbUrl;

    const error = await apiError(keyClient(memberKey).backfillDisplay());
    expect(error.status).toBe(403);

    const ours = (items: BackfillDisplayResult["items"]) =>
      items.filter((item) => [a.id, b.id].includes(item.screenId));
    const dry = await backfillAll({ dryRun: true });
    expect(ours(dry.items).map((item) => item.action)).toEqual(["pending", "pending"]);
    expect((await keyClient(adminKey).getScreen(a.id)).imageUrl).toBe(`/media/img/${shaA}.png`);

    const run = await backfillAll({ limit: 1 });
    expect(run.items.find((item) => item.screenId === a.id)).toEqual({
      screenId: a.id,
      action: "updated",
      imageKey: `img/${shaA}.v1.webp`,
      thumbKey: `thumb/${shaA}.v1-desktop.webp`,
    });
    expect(run.items.find((item) => item.screenId === b.id)).toMatchObject({
      action: "updated",
      imageKey: `img/${shaB}.v1.webp`,
    });
    expect(run.remaining).toBe(0);

    const screenA = await keyClient(adminKey).getScreen(a.id);
    expect((await fetchImage(screenA.imageUrl)).header).toEqual({
      type: "image/webp",
      width: 1280,
      height: 800,
    });
    expect((await fetchImage(screenA.thumbUrl)).header).toEqual({
      type: "image/webp",
      width: 640,
      height: 400,
    });
    // b's valid client thumbnail is kept; the replaced PNGs are retained but no longer served
    expect((await keyClient(adminKey).getScreen(b.id)).thumbUrl).toBe(bThumb);
    expect(
      await d1(`SELECT original_key, display_version FROM screen WHERE id = '${a.id}'`),
    ).toEqual([{ original_key: `img/${shaA}.png`, display_version: DISPLAY_POLICY.version }]);
    expect((await fetch(`${baseUrl()}/media/img/${shaA}.png`)).status).toBe(404);

    expect(ours((await backfillAll()).items)).toEqual([]);
  });
});
