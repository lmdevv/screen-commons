import { readImageHeader } from "@screen-commons/core";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { DEV_AUTH_SECRET, resolveAuthSecret } from "../src/server/auth-config";
import { makePng } from "./images";
import { Session, b64, baseUrl, captureScreen, keyClient, uniqueSuffix } from "./helpers";

const suffix = uniqueSuffix();
let adminKey: string;

beforeAll(async () => {
  const credentials = inject("admin");
  const admin = await Session.signIn(credentials.email, credentials.password);
  adminKey = (await admin.client().createKey("platform tests")).token;
});

describe("auth secret configuration", () => {
  it("only falls back to the public dev secret for localhost instances", () => {
    expect(resolveAuthSecret("https://ui.example.com", "real-secret")).toBe("real-secret");
    expect(resolveAuthSecret("http://localhost:5173", undefined)).toBe(DEV_AUTH_SECRET);
    expect(resolveAuthSecret("http://127.0.0.1:8787", "")).toBe(DEV_AUTH_SECRET);
    expect(() => resolveAuthSecret("https://ui.example.com", undefined)).toThrow(
      /BETTER_AUTH_SECRET is not set/u,
    );
    expect(() => resolveAuthSecret("http://localhost.evil.com", undefined)).toThrow();
  });
});

describe("sign-up responses report the real role", () => {
  it("returns admin for the first account and member afterwards", async () => {
    expect(inject("adminSignUpRole")).toBe("admin");
    const response = await fetch(`${baseUrl()}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl() },
      body: JSON.stringify({
        name: "Second",
        email: `second-${suffix}@screen-commons.test`,
        password: "password-123",
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().length).toBeGreaterThan(0);
    expect((await response.json()).user.role).toBe("member");
  });
});

describe("server-side thumbnails", () => {
  async function uploadAndFetchThumb(platform: "web" | "ios", width: number, height: number) {
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
            app: { name: `Thumbs ${platform} ${suffix}`, platform },
            image: { type: "image/png", base64: b64(makePng(width, height, width + height)) },
          },
        },
      }),
    });
    const result = (await response.json()).result;
    expect(result.isError).toBeUndefined();
    const { screen: uploaded } = JSON.parse(result.content[0].text);
    const screen = await keyClient(adminKey).getScreen(uploaded.id);
    expect(screen.thumbUrl).not.toBe(screen.imageUrl);
    const thumb = Buffer.from(await (await fetch(`${baseUrl()}${screen.thumbUrl}`)).arrayBuffer());
    expect(thumb.byteLength).toBeLessThanOrEqual(1024 * 1024);
    return readImageHeader(thumb);
  }

  it("generates a cropped 640px WebP for tall web uploads without a thumbnail", async () => {
    expect(await uploadAndFetchThumb("web", 1280, 2400)).toEqual({
      type: "image/webp",
      width: 640,
      height: 400,
    });
  });

  it("uses the 9:19.5 mobile aspect for iOS apps", async () => {
    expect(await uploadAndFetchThumb("ios", 900, 3000)).toEqual({
      type: "image/webp",
      width: 640,
      height: 1387,
    });
  });
});

describe("app slugs are globally unique", () => {
  it("suffixes the platform on collisions and upserts per platform", async () => {
    const api = keyClient(adminKey);
    const name = `Twin ${suffix}`;
    const base = `twin-${suffix}`;
    const web = await api.captures({ app: { name, platform: "web" }, screens: [captureScreen()] });
    const ios = await api.captures({ app: { name, platform: "ios" }, screens: [captureScreen()] });
    expect(web.app.slug).toBe(base);
    expect(ios.app.slug).toBe(`${base}-ios`);
    expect(ios.app.id).not.toBe(web.app.id);

    expect((await api.getApp(base)).platform).toBe("web");
    expect((await api.getApp(`${base}-ios`)).platform).toBe("ios");

    // upserts land on the platform's own app, whether addressed by name or by the base slug
    const byName = await api.captures({
      app: { name, platform: "ios" },
      screens: [captureScreen()],
    });
    const bySlug = await api.captures({
      app: { name, slug: base, platform: "ios" },
      screens: [captureScreen()],
    });
    const webAgain = await api.captures({
      app: { name, slug: base, platform: "web" },
      screens: [captureScreen()],
    });
    expect(byName.app.id).toBe(ios.app.id);
    expect(bySlug.app.id).toBe(ios.app.id);
    expect(webAgain.app.id).toBe(web.app.id);

    const android = await api.captures({
      app: { name, slug: base, platform: "android" },
      screens: [captureScreen()],
    });
    expect(android.app.slug).toBe(`${base}-android`);
  });
});
