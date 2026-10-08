import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { findChrome } from "@screen-commons/capture";
import {
  browserTools,
  catalogTools,
  readImageHeader,
  type BridgeMessage,
} from "@screen-commons/core";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { startFixtureSite, type FixtureSite } from "../../capture/test/fixture-server";
import { BridgeServer } from "../src/bridge";
import type { McpConfig } from "../src/config";
import { HeadlessDriver } from "../src/drivers";
import { createScreenCommonsMcpServer, type ScreenCommonsMcp } from "../src/server";
import { API_KEY, startMockApi, type MockApi } from "./mock-api";

type ToolContent = { type: string; text?: string; data?: string; mimeType?: string };
type ToolResponse = { content: ToolContent[]; isError?: boolean };

const chrome = findChrome();
let api: MockApi;
let site: FixtureSite;
let outputDir: string;
const instances: { mcp: ScreenCommonsMcp; client: Client; bridge: BridgeServer | null }[] = [];

function config(overrides: Partial<McpConfig> = {}): McpConfig {
  return {
    url: api.url,
    apiKey: API_KEY,
    bridge: {
      enabled: true,
      port: 0,
      token: "t".repeat(32),
      tokenSource: "env",
      tokenPath: "/dev/null",
    },
    chromePath: chrome ?? undefined,
    headless: true,
    outputDir,
    ...overrides,
  };
}

async function connect(overrides: Partial<McpConfig> = {}, withBridge = false) {
  const cfg = config(overrides);
  let bridge: BridgeServer | null = null;
  if (withBridge) {
    bridge = new BridgeServer({ token: cfg.bridge.token, port: 0 });
    await bridge.listen();
  }
  const mcp = createScreenCommonsMcpServer({
    config: cfg,
    bridge,
    headless: new HeadlessDriver({ executablePath: cfg.chromePath, scale: { desktop: 1 } }),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([mcp.server.connect(serverTransport), client.connect(clientTransport)]);
  instances.push({ mcp, client, bridge });
  return { mcp, client, bridge };
}

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args }, undefined, {
    timeout: 120_000,
  })) as ToolResponse;

const textOf = (result: ToolResponse) =>
  result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

beforeAll(async () => {
  [api, site] = await Promise.all([startMockApi(), startFixtureSite()]);
  outputDir = await mkdtemp(join(tmpdir(), "screen-commons-mcp-test-"));
});

afterAll(async () => {
  for (const { mcp, client, bridge } of instances) {
    await client.close().catch(() => undefined);
    await mcp.close();
    await bridge?.close();
  }
  await Promise.all([api?.close(), site?.close()]);
  await rm(outputDir, { recursive: true, force: true });
});

describe("tools, prompts and resources", () => {
  it("lists every catalog and browser tool with its contract schema", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual([...Object.keys(catalogTools), ...Object.keys(browserTools)].sort());
    const capture = tools.find((tool) => tool.name === "capture_pages")!;
    expect(capture.description).toBe(browserTools.capture_pages.description);
    expect(Object.keys(capture.inputSchema.properties ?? {})).toEqual(
      Object.keys(browserTools.capture_pages.input.shape),
    );
    expect(tools.find((tool) => tool.name === "get_screen")?.annotations?.readOnlyHint).toBe(true);

    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name).sort()).toEqual([
      "capture_site",
      "find_inspiration",
    ]);
    const prompt = await client.getPrompt({
      name: "capture_site",
      arguments: { url: "https://linear.app" },
    });
    expect(JSON.stringify(prompt.messages)).toContain("site_crawl");

    const { resources } = await client.listResources();
    expect(resources[0]?.uri).toBe("screen-commons://taxonomy");
    const taxonomy = await client.readResource({ uri: "screen-commons://taxonomy" });
    expect(
      JSON.parse((taxonomy.contents[0] as { text: string }).text).patterns.length,
    ).toBeGreaterThan(10);
  });
});

describe("catalog tools", () => {
  it("search_screens summarises results", async () => {
    const { client } = await connect();
    const result = await call(client, "search_screens", { query: "more", pattern: "pricing" });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("scr_1 · Linear · Pricing – Linear · [Pricing]");
    expect(textOf(result)).toContain(`${api.url}/media/scr_1-thumb.webp`);
    expect(textOf(result)).toContain('cursor "c1"');
  });

  it("get_screen returns the thumbnail as image content", async () => {
    const { client } = await connect();
    const result = await call(client, "get_screen", { id: "scr_9" });
    const image = result.content.find((item) => item.type === "image");
    expect(image?.mimeType).toBe("image/webp");
    expect(readImageHeader(Buffer.from(image!.data!, "base64"))).toMatchObject({
      width: 640,
      height: 400,
    });
    expect(textOf(result)).toContain("Screen scr_9 · Linear (linear)");

    const full = await call(client, "get_screen", { id: "scr_9", full: true });
    const fullImage = full.content.find((item) => item.type === "image");
    expect(readImageHeader(Buffer.from(fullImage!.data!, "base64"))).toMatchObject({ width: 2880 });
  });

  it("get_flow returns ordered steps with optional thumbnails", async () => {
    const { client } = await connect();
    const result = await call(client, "get_flow", { id: "flow_x", includeImages: true });
    expect(textOf(result)).toContain("1. Landing — screen scr_1");
    expect(result.content.filter((item) => item.type === "image")).toHaveLength(2);
  });

  it("explains missing and rejected API keys", async () => {
    const missing = await connect({ apiKey: undefined });
    const noKey = await call(missing.client, "search_screens", {});
    expect(noKey.isError).toBe(true);
    expect(textOf(noKey)).toContain("SCREEN_COMMONS_API_KEY is not set");
    // taxonomy still works from the bundled contract
    expect(textOf(await call(missing.client, "get_taxonomy"))).toContain("built-in");

    const wrong = await connect({ apiKey: "sc_wrong" });
    const rejected = await call(wrong.client, "get_app", { slug: "linear" });
    expect(rejected.isError).toBe(true);
    expect(textOf(rejected)).toContain("rejected the API key (401)");

    const offline = await connect({ url: "http://127.0.0.1:9" });
    expect(textOf(await call(offline.client, "list_apps"))).toContain(
      "Could not reach Screen Commons",
    );
  });

  it("upload_screen posts a one-screen capture batch", async () => {
    const { client } = await connect();
    const png = await sharp({
      create: { width: 1440, height: 900, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const before = api.batches.length;
    const result = await call(client, "upload_screen", {
      app: { name: "Acme", websiteUrl: "https://acme.example" },
      image: { type: "image/png", base64: png.toString("base64") },
      title: "Acme pricing",
      sourceUrl: "https://acme.example/pricing",
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain(`${api.url}/screens/new_`);
    const batch = api.batches[before]!;
    expect(batch.source).toBe("mcp");
    expect(batch.screens[0]?.patterns).toEqual(["pricing"]);
    // Display policy: full image and thumbnail are WebP, checked from the bytes themselves.
    const [image, thumbnail] = [batch.screens[0]!.image, batch.screens[0]!.thumbnail];
    expect(image.type).toBe("image/webp");
    expect(readImageHeader(Buffer.from(image.base64, "base64"))).toEqual({
      type: "image/webp",
      width: 1440,
      height: 900,
    });
    expect(thumbnail.type).toBe("image/webp");
    expect(readImageHeader(Buffer.from(thumbnail.base64, "base64"))).toMatchObject({
      type: "image/webp",
      width: 640,
    });
  });

  it("upload_screen rejects images whose declared type doesn't match their bytes", async () => {
    const { client } = await connect();
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#000" } })
      .png()
      .toBuffer();
    const before = api.batches.length;
    const result = await call(client, "upload_screen", {
      app: { name: "Acme" },
      image: { type: "image/webp", base64: png.toString("base64") },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("image.type is image/webp but image.base64 is image/png");
    expect(api.batches.length).toBe(before);
  });
});

describe.skipIf(!chrome)("browser tools (headless)", () => {
  it("navigates, screenshots and extracts", async () => {
    const { client } = await connect();
    expect(textOf(await call(client, "browser_status"))).toContain("Active driver: headless");
    const nav = await call(client, "browser_navigate", { url: site.url });
    expect(textOf(nav)).toContain("Fixture – Home");
    const shot = await call(client, "browser_screenshot", { fullPage: true });
    const image = shot.content.find((item) => item.type === "image");
    expect(image?.mimeType).toBe("image/webp");
    expect(Buffer.from(image!.data!, "base64").byteLength).toBeLessThan(1_000_000);
    const path = /saved to (\S+)\./u.exec(textOf(shot))?.[1];
    expect(path).toBeTruthy();
    const saved = readImageHeader(await readFile(path!));
    expect(saved).toMatchObject({ type: "image/png", width: 1440 });
    expect(saved!.height).toBeGreaterThan(3600);

    const extracted = JSON.parse(textOf(await call(client, "browser_extract"))) as {
      title: string;
      links: { url: string }[];
    };
    expect(extracted.title).toBe("Fixture – Home");
    expect(extracted.links.map((link) => link.url)).toContain(`${site.origin}/pricing`);
  });

  it("site_crawl ranks canonical pages", async () => {
    const { client } = await connect();
    const result = await call(client, "site_crawl", { url: site.url, maxPages: 6 });
    const lines = textOf(result)
      .split("\n")
      .filter((line) => line.startsWith("- "));
    expect(lines[0]).toContain(`${site.origin}/ ·`);
    expect(lines[1]).toContain("/pricing · Pricing – Fixture · [Pricing]");
  });

  it("capture_pages uploads one validated batch with a flow and logo", async () => {
    const { client } = await connect();
    const before = api.batches.length;
    const progress: number[] = [];
    const result = (await client.callTool(
      {
        name: "capture_pages",
        arguments: {
          urls: [site.url, `${site.origin}/pricing`, `${site.origin}/signup`],
          app: { name: "Fixture", category: "productivity" },
          flow: { name: "Signing up", type: "signing-up" },
        },
      },
      undefined,
      { timeout: 120_000, onprogress: (event) => progress.push(event.progress) },
    )) as ToolResponse;
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(api.batches.length).toBe(before + 1);
    const batch = api.batches[before]!;
    expect(batch.source).toBe("mcp");
    expect(batch.app).toMatchObject({
      name: "Fixture",
      websiteUrl: site.origin,
      platform: "web",
      category: "productivity",
    });
    expect(batch.flow).toEqual({ name: "Signing up", type: "signing-up" });
    expect(batch.logo?.type).toBe("image/png");
    expect(batch.screens.map((screen) => screen.sourceUrl)).toEqual([
      site.url,
      `${site.origin}/pricing`,
      `${site.origin}/signup`,
    ]);
    expect(batch.screens.map((screen) => screen.patterns)).toEqual([
      ["landing"],
      ["pricing"],
      ["signup"],
    ]);
    expect(batch.screens.map((screen) => screen.stepLabel)).toEqual([
      "Landing",
      "Pricing",
      "Signup",
    ]);
    expect(batch.screens[0]).toMatchObject({ width: 1440, height: 900 });
    expect(batch.screens[0]?.text).toContain("Above the fold text");
    expect(batch.screens[0]?.thumbnail.type).toBe("image/webp");
    expect(batch.screens.map((screen) => screen.image.type)).toEqual([
      "image/webp",
      "image/webp",
      "image/webp",
    ]);
    const text = textOf(result);
    expect(text).toContain(`${api.url}/apps/fixture`);
    expect(text).toContain(`${api.url}/flows/flow_1`);
    expect(progress.length).toBeGreaterThanOrEqual(3);
  });

  it("capture_pages without upload returns previews and saved files", async () => {
    const { client } = await connect();
    const before = api.batches.length;
    const result = await call(client, "capture_pages", {
      urls: [`${site.origin}/pricing`, `${site.origin}/nope`],
      upload: false,
    });
    expect(api.batches.length).toBe(before);
    expect(result.content.filter((item) => item.type === "image")).toHaveLength(1);
    const text = textOf(result);
    expect(text).toContain("Captured 1/2 pages");
    expect(text).toContain("HTTP 404");
    const path = /saved (\S+\.png)/u.exec(text)?.[1];
    expect(readImageHeader(await readFile(path!))).toMatchObject({ width: 1440, height: 900 });
  });
});

describe("browser tools (extension driver over the bridge)", () => {
  it("prefers a connected extension and proxies requests to it", async () => {
    const { client, bridge } = await connect({}, true);
    const png = await sharp({
      create: { width: 1280, height: 800, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const socket = new WebSocket(`ws://127.0.0.1:${bridge!.port}`, {
      origin: "chrome-extension://test",
    });
    const seen: string[] = [];
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as BridgeMessage;
      if (message.type !== "request") return;
      seen.push(message.method);
      const reply = (result: unknown) =>
        socket.send(JSON.stringify({ type: "response", id: message.id, result }));
      if (message.method === "navigate")
        reply({ tabId: 3, url: message.params.url, title: "Real tab" });
      if (message.method === "screenshot")
        reply({
          base64: png.toString("base64"),
          type: "image/png",
          width: 1280,
          height: 800,
          url: "https://real.example/",
          title: "Real tab",
        });
      if (message.method === "listTabs")
        reply({ tabs: [{ id: 3, url: "https://real.example/", title: "Real tab", active: true }] });
      if (message.method === "extract") {
        reply({
          url: "https://real.example/",
          title: "Real tab",
          description: null,
          siteName: "Real",
          faviconUrl: null,
          ogImageUrl: null,
          themeColor: null,
          lang: "en",
          headings: [],
          links: [],
        });
      }
    });
    await new Promise<void>((resolve) => socket.once("open", () => resolve()));
    const connected = new Promise((resolve) => bridge!.once("connected", resolve));
    socket.send(
      JSON.stringify({
        type: "hello",
        token: "t".repeat(32),
        protocol: 1,
        client: { name: "Screen Commons", version: "0.1.0", browser: "chrome" },
      }),
    );
    await connected;

    const status = textOf(await call(client, "browser_status"));
    expect(status).toContain("Active driver: extension");
    expect(status).toContain("* [3] Real tab");
    expect(
      textOf(await call(client, "browser_navigate", { url: "https://real.example/" })),
    ).toContain("tab 3");
    const shot = await call(client, "browser_screenshot", {});
    expect(shot.content.find((item) => item.type === "image")).toBeTruthy();
    expect(textOf(shot)).toContain("1280×800 viewport screenshot of https://real.example/");
    expect(seen).toEqual(["listTabs", "navigate", "screenshot"]);
    socket.close();
  });
});
