import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ImagesBinding } from "@cloudflare/workers-types";
import {
  DISPLAY_POLICY,
  IMAGES_BINDING_LIMITS,
  ScreenCommonsApiError,
  WEBP_MAX_DIMENSION,
  readImageHeader,
  type BackfillDisplayInput,
  type BackfillDisplayResult,
} from "@screen-commons/core";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { deriveDisplayImage, deriveThumbnail, type DecodedImage } from "../src/server/display";
import { ServiceError, unavailable } from "../src/server/errors";
import { errorResponse } from "../src/server/http/responses";
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

  it("scales images wider than the display limit, accepting the binding's ±1px rounding", async () => {
    const images = fakeImages(() => webpOf(4096, 820, 500_000));
    const result = await deriveDisplayImage(images, pngSource(5000, 1000));
    expect(result).toMatchObject({ status: "derived", image: { width: 4096, height: 820 } });
    expect(images.calls[0]!.transform).toEqual({ width: 4096, fit: "scale-down" });
  });

  it("never sends the binding a source outside its input limits", async () => {
    const images = fakeImages(() => webpOf(640, 400));
    // PNG/JPEG taller than 12,000px, or over 20 MB
    for (const source of [
      pngSource(390, 18_000),
      pngSource(750, 20_000),
      { ...pngSource(1280, 12_001), type: "image/jpeg" as const },
      pngSource(1280, 800, IMAGES_BINDING_LIMITS.maxBytes + 1),
    ]) {
      const failure = { status: "failed", exception: "binding_limits" };
      expect(await deriveDisplayImage(images, source)).toMatchObject(failure);
      expect(await deriveThumbnail(images, source, "mobile")).toMatchObject(failure);
    }
    expect(images.calls).toEqual([]);
  });

  it("makes thumbnails of tall WebP display images, no wider than they are", async () => {
    const images = fakeImages(({ transform }) =>
      webpOf(Number(transform!.width), Number(transform!.height), 20_000),
    );
    // what a client sends for a 390×18,000 page: 355×16,383 WebP
    const webp: DecodedImage = { ...pngSource(355, WEBP_MAX_DIMENSION), type: "image/webp" };
    expect(await deriveThumbnail(images, webp, "mobile")).toMatchObject({
      status: "derived",
      image: { width: 355, height: 769 },
    });
    expect(images.calls[0]!.transform).toEqual({
      width: 355,
      height: 769,
      fit: "cover",
      gravity: "top",
    });
  });

  it("tells failures a retry can fix from ones it can't", async () => {
    const source = pngSource(1280, 800);
    const missing = { status: "failed", exception: "no_binding" };
    expect(await deriveDisplayImage(undefined, source)).toMatchObject(missing);
    expect(await deriveThumbnail(undefined, source, "desktop")).toMatchObject(missing);
    // the binding call itself failed (binding or network error, quota): retryable
    const throwing = fakeImages(() => {
      throw new Error("images: 9422 internal error");
    });
    expect(await deriveDisplayImage(throwing, source)).toEqual({
      status: "failed",
      reason: "images: 9422 internal error",
    });
    // a different format, a different size, an unreadable file, or too many bytes: the same
    // input would get the same output
    const unconvertible = { status: "failed", exception: "unconvertible" };
    const png = fakeImages(() => makePng(1280, 800));
    expect(await deriveDisplayImage(png, source)).toMatchObject({
      ...unconvertible,
      reason: "the binding returned image/png",
    });
    const cropped = fakeImages(() => webpOf(640, 300));
    expect(await deriveThumbnail(cropped, source, "desktop")).toMatchObject(unconvertible);
    const garbage = fakeImages(() => new TextEncoder().encode("RIFF nope"));
    expect(await deriveThumbnail(garbage, source, "desktop")).toMatchObject(unconvertible);
    const huge = fakeImages(() => webpOf(4096, 4000, DISPLAY_POLICY.full.maxBytes + 1));
    expect(await deriveDisplayImage(huge, pngSource(4096, 4000, 14_000_000))).toMatchObject(
      unconvertible,
    );
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

type Fault = { images?: "fail" | "missing" };

async function upload(
  image: Uint8Array,
  thumbnail: Uint8Array | null,
  name = "Display",
  fault: Fault = {},
) {
  const header = readImageHeader(image)!;
  const thumb = thumbnail && readImageHeader(thumbnail)!;
  const result = await keyClient(adminKey, fault).captures({
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

/** Remote MCP `upload_screen` (no thumbnail): the tool result, and its text. */
async function mcpUpload(
  image: { type: string; base64: string },
  name: string,
  fault: Fault = {},
): Promise<{ isError?: boolean; text: string }> {
  const response = await fetch(`${baseUrl()}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${adminKey}`,
      ...(fault.images ? { "x-test-images": fault.images } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "upload_screen",
        arguments: { app: { name: `${name} ${suffix}`, platform: "web" }, image },
      },
    }),
  });
  const { result } = (await response.json()) as {
    result: { isError?: boolean; content: { text: string }[] };
  };
  return { isError: result.isError, text: result.content[0]!.text };
}

const mcpScreenId = (text: string) => (JSON.parse(text) as { screen: { id: string } }).screen.id;

async function displayState(id: string) {
  const [row] = (await d1(
    `SELECT image_key, original_key, display_version, display_exception FROM screen WHERE id = '${id}'`,
  )) as {
    image_key: string;
    original_key: string | null;
    display_version: number | null;
    display_exception: string | null;
  }[];
  return row!;
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

  it("accepts tall narrow pages as clients encode them, with either thumbnail sizing", async () => {
    // a 750×20,000 page displays at 614×16,383: current clients size its thumbnail from that
    // (614 wide), older ones from the source (640 wide)
    for (const [index, [width, height]] of [
      [614, 1330],
      [640, 1387],
    ].entries()) {
      const webp = makeWebp(614, WEBP_MAX_DIMENSION, [index, 90, 160, 255]);
      const screen = await upload(webp, makeWebp(width!, height!), "Tall narrow");
      expect(screen.imageUrl).toBe(`/media/img/${sha256(webp)}.webp`);
      expect((await fetchImage(screen.thumbUrl)).header).toEqual({
        type: "image/webp",
        width,
        height,
      });
    }
  });

  it("makes the thumbnail of a tall WebP display image sent without one", async () => {
    // what a client encodes a 390×18,000 page to
    const webp = makeWebp(355, WEBP_MAX_DIMENSION, [30, 140, 70, 255]);
    const result = await mcpUpload({ type: "image/webp", base64: b64(webp) }, "Tall WebP");
    expect(result.isError).toBeUndefined();
    const screen = await keyClient(adminKey).getScreen(mcpScreenId(result.text));
    expect(screen.imageUrl).toBe(`/media/img/${sha256(webp)}.webp`);
    expect(screen.thumbUrl).toBe(`/media/thumb/${sha256(webp)}.v1-desktop.webp`);
    expect((await fetchImage(screen.thumbUrl)).header).toEqual({
      type: "image/webp",
      width: 355,
      height: 222,
    });
  });

  it("keeps PNG pages beyond the binding's limits as uploaded, under a documented exception", async () => {
    // 18,000px tall: past the binding's 12,000px input limit, so it is never sent there
    const png = makePng(390, 18_000, 9301);
    const screen = await upload(png, makeWebp(355, 769), "Over limits");
    expect(screen.imageUrl).toBe(`/media/img/${sha256(png)}.png`);
    expect((await fetchImage(screen.imageUrl)).header).toEqual({
      type: "image/png",
      width: 390,
      height: 18_000,
    });
    expect(await displayState(screen.id)).toMatchObject({
      display_version: DISPLAY_POLICY.version,
      display_exception: "binding_limits",
    });
    // permanent: the backfill doesn't pick it up
    const dry = await backfillAll({ dryRun: true });
    expect(dry.items.map((item) => item.screenId)).not.toContain(screen.id);

    // without a thumbnail, only the client can make one: 422, not a retry loop
    const tall = await mcpUpload(
      { type: "image/png", base64: b64(makePng(300, 13_000, 9302)) },
      "Over limits",
    );
    expect(tall.isError).toBe(true);
    expect(tall.text).toMatch(/^unprocessable: .*too tall .*Send a thumbnail .*as WebP/u);
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
    // an animated WebP would display only its first frame
    const animated = Buffer.from(makeWebp(320, 200));
    const vp8x = Buffer.alloc(18);
    vp8x.write("VP8X", 0, "ascii");
    vp8x.writeUInt32LE(10, 4);
    vp8x[8] = 0x02; // animation flag
    vp8x.writeUIntLE(319, 12, 3);
    vp8x.writeUIntLE(199, 15, 3);
    const extended = Buffer.concat([animated.subarray(0, 12), vp8x, animated.subarray(12)]);
    extended.writeUInt32LE(extended.length - 8, 4);
    const rejected = await apiError(
      api.captures({
        app: { name: `Animated ${suffix}` },
        screens: [captureScreen({ image: { type: "image/webp", base64: b64(extended) } })],
      }),
    );
    expect(rejected.status).toBe(415);
    expect(rejected.message).toContain("still PNG, JPEG or WebP");
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
// Images binding failures (simulated per request: `x-test-images`)
// ---------------------------------------------------------------------------------------------

describe("binding failures", () => {
  it("tells clients when to retry, and which failures a retry can't fix", () => {
    const retry = errorResponse(unavailable("Images binding failed"));
    expect(retry.status).toBe(503);
    expect(retry.headers.get("retry-after")).toBe("60");
    const permanent = errorResponse(new ServiceError("unprocessable", "send a thumbnail"));
    expect(permanent.status).toBe(422);
    expect(permanent.headers.has("retry-after")).toBe(false);
  });

  it("displays the source as uploaded when the binding fails, and the backfill converts it", async () => {
    const png = makePng(1280, 800, 9401, { noise: true });
    const sha = sha256(png);
    const screen = await upload(png, makePng(640, 400, 9402), "Binding down", { images: "fail" });
    expect(screen.imageUrl).toBe(`/media/img/${sha}.png`);
    expect((await fetchImage(screen.imageUrl)).type).toBe("image/png");
    // the client's PNG thumbnail stands in (never the full image)
    expect((await fetchImage(screen.thumbUrl)).header).toEqual({
      type: "image/png",
      width: 640,
      height: 400,
    });
    expect(await displayState(screen.id)).toMatchObject({
      display_version: null,
      display_exception: null,
    });

    const run = await backfillAll();
    expect(run.items.find((item) => item.screenId === screen.id)).toMatchObject({
      action: "updated",
      imageKey: `img/${sha}.v1.webp`,
      thumbKey: `thumb/${sha}.v1-desktop.webp`,
    });
    expect((await fetchImage(`/media/img/${sha}.v1.webp`)).type).toBe("image/webp");
    expect(await displayState(screen.id)).toMatchObject({
      original_key: `img/${sha}.png`,
      display_version: DISPLAY_POLICY.version,
    });
  });

  it("answers MCP uploads it can't make a thumbnail for: 503 to retry, 422 to fix", async () => {
    const image = { type: "image/png", base64: b64(makePng(1280, 800, 9403)) };
    const down = await mcpUpload(image, "Binding down MCP", { images: "fail" });
    expect(down.isError).toBe(true);
    expect(down.text).toMatch(/^unavailable: .*Retry in 60 seconds\.$/u);
    const missing = await mcpUpload(image, "No binding MCP", { images: "missing" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/^unprocessable: .*no Images binding.*Send a thumbnail/u);
    // nothing was created: the same upload succeeds once the binding is back
    const ok = await mcpUpload(image, "Binding down MCP");
    expect(ok.isError).toBeUndefined();
  });

  it("stores uploads as sent without a binding, and converts them once there is one", async () => {
    const png = makePng(1280, 800, 9404, { noise: true });
    const sha = sha256(png);
    const screen = await upload(png, makePng(640, 400, 9405), "No binding", { images: "missing" });
    expect(screen.imageUrl).toBe(`/media/img/${sha}.png`);
    expect(await displayState(screen.id)).toMatchObject({
      display_version: DISPLAY_POLICY.version,
      display_exception: "no_binding",
    });
    // not retried while the instance still has no binding…
    const without = await backfillAll({}, { images: "missing" });
    expect(without.items.map((item) => item.screenId)).not.toContain(screen.id);
    // …and converted once it has one
    const run = await backfillAll();
    expect(run.items.find((item) => item.screenId === screen.id)).toMatchObject({
      action: "updated",
      imageKey: `img/${sha}.v1.webp`,
    });
    expect(await displayState(screen.id)).toMatchObject({ display_exception: null });
  });

  it("recognises duplicates before calling the binding", async () => {
    const png = makePng(1280, 800, 9406, { noise: true });
    const first = await upload(png, makeWebp(640, 400), "Duplicate");
    // the binding is down, but nothing needs it: same screen, no 503
    expect((await upload(png, makePng(640, 400, 9407), "Duplicate", { images: "fail" })).id).toBe(
      first.id,
    );
    const image = { type: "image/png", base64: b64(png) };
    const viaMcp = await mcpUpload(image, "Duplicate", { images: "fail" });
    expect(viaMcp.isError).toBeUndefined();
    expect(mcpScreenId(viaMcp.text)).toBe(first.id);
  });

  it("types MCP uploads by their bytes, not a mislabelled image.type", async () => {
    const png = makePng(640, 400, 9408);
    const result = await mcpUpload({ type: "image/webp", base64: b64(png) }, "Mislabelled");
    expect(result.isError).toBeUndefined();
    const screen = await keyClient(adminKey).getScreen(mcpScreenId(result.text));
    expect(screen.imageUrl).toMatch(
      new RegExp(`^/media/img/${sha256(png)}\\.(?:v1\\.webp|png)$`, "u"),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------------------------

async function backfillAll(input: BackfillDisplayInput = {}, fault: Fault = {}) {
  const items: BackfillDisplayResult["items"] = [];
  let cursor: string | undefined;
  let page: BackfillDisplayResult;
  do {
    page = await keyClient(adminKey, fault).backfillDisplay({ ...input, cursor });
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
    // other tests' rows share the database: check these two, not the global remainder
    for (const id of [a.id, b.id]) {
      expect((await displayState(id)).display_version).toBe(DISPLAY_POLICY.version);
    }

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

  it("never demotes a converted screen to its original when a rerun can't derive", async () => {
    const png = makePng(1280, 800, 9501, { noise: true });
    const sha = sha256(png);
    const screen = await upload(png, makeWebp(640, 400), "Converted");
    expect(screen.imageUrl).toBe(`/media/img/${sha}.v1.webp`);
    // As if converted under an older policy version: its derivative under that version's key,
    // and no derivative for the current one yet.
    const derivative = await fetchImage(screen.imageUrl);
    await putLegacy(`img/${sha}.v0.webp`, derivative.bytes, "image/webp");
    await wranglerLocal(["r2", "object", "delete", `screen-commons-media/img/${sha}.v1.webp`]);
    await d1(
      `UPDATE screen SET image_key = 'img/${sha}.v0.webp', display_version = 0 WHERE id = '${screen.id}'`,
    );

    const failed = await backfillAll({}, { images: "fail" });
    expect(failed.items.find((item) => item.screenId === screen.id)).toMatchObject({
      action: "failed",
      imageKey: `img/${sha}.v0.webp`,
    });
    // still the WebP derivative, never the retained original
    const after = await keyClient(adminKey).getScreen(screen.id);
    expect(after.imageUrl).toBe(`/media/img/${sha}.v0.webp`);
    expect(Buffer.from((await fetchImage(after.imageUrl)).bytes).equals(derivative.bytes)).toBe(
      true,
    );
    expect(await displayState(screen.id)).toEqual({
      image_key: `img/${sha}.v0.webp`,
      original_key: `orig/${sha}.png`,
      display_version: null,
      display_exception: null,
    });
    expect((await fetch(`${baseUrl()}/media/orig/${sha}.png`)).status).toBe(404);

    // with the binding back, the current version is derived from the original again
    const run = await backfillAll();
    expect(run.items.find((item) => item.screenId === screen.id)).toMatchObject({
      action: "updated",
      imageKey: `img/${sha}.v1.webp`,
    });
    expect(await displayState(screen.id)).toMatchObject({
      original_key: `orig/${sha}.png`,
      display_version: DISPLAY_POLICY.version,
    });
  });
});
