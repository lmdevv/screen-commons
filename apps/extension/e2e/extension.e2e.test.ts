/**
 * End-to-end: loads the built Chromium extension (.output/chrome-mv3) into the system Chromium
 * with playwright-core, then drives it through a mock MCP bridge and a mock Screen Commons API.
 *
 *   pnpm --filter @screen-commons/extension test:e2e
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page, type Worker } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { browser as BrowserApi } from "wxt/browser";

import { FIXTURE, pngSize, startFixtureSite, startMockApi, startMockBridge } from "./fixtures";

/** Extension APIs inside `worker.evaluate` / extension-page `evaluate` callbacks. */
declare const chrome: typeof BrowserApi;

const root = join(import.meta.dirname, "..");
const extensionPath = join(root, ".output/chrome-mv3");
const shotsDir = join(root, "test-results/screenshots");
const executablePath = process.env.CHROME_PATH ?? "/run/current-system/sw/bin/chromium";
const BRIDGE_TOKEN = "pairing-token-for-tests";
const API_KEY = "oui_test_key_1234567890";

let context: BrowserContext;
let worker: Worker;
let extensionId: string;
let userDataDir: string;
let site: Awaited<ReturnType<typeof startFixtureSite>>;
let bridge: Awaited<ReturnType<typeof startMockBridge>>;
let api: Awaited<ReturnType<typeof startMockApi>>;
let helper: Page;
let fixtureTabId: number;

async function setSettings(patch: Record<string, unknown>) {
  await worker.evaluate(async (patch) => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...(settings as object), ...patch } });
  }, patch);
}

/** Read RGB at (x, y) of a PNG by decoding it in a helper page. */
async function pixel(base64: string, x: number, y: number): Promise<[number, number, number]> {
  return helper.evaluate(
    async ({ base64, x, y }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${base64}`)).blob(),
      );
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!] as [number, number, number];
    },
    { base64, x, y },
  );
}

function near(actual: readonly number[], expected: readonly number[], tolerance = 12) {
  expect(
    actual.every((value, i) => Math.abs(value - expected[i]!) <= tolerance),
    `${actual} ≈ ${expected}`,
  ).toBe(true);
}

async function fixturePage(): Promise<Page> {
  const page = context.pages().find((p) => p.url().startsWith(site.origin));
  if (!page) throw new Error("fixture tab not found");
  return page;
}

beforeAll(async () => {
  if (!existsSync(join(extensionPath, "manifest.json")))
    throw new Error("Build first: pnpm --filter @screen-commons/extension build:chrome");
  await mkdir(shotsDir, { recursive: true });
  site = await startFixtureSite();
  bridge = await startMockBridge(BRIDGE_TOKEN);
  api = await startMockApi([API_KEY]);
  userDataDir = await mkdtemp(join(tmpdir(), "screen-commons-ext-e2e-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: true,
    viewport: null,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--window-size=1280,900",
      "--force-device-scale-factor=1",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 20_000 }));
  extensionId = new URL(worker.url()).host;
  helper = context.pages()[0] ?? (await context.newPage());
  await setSettings({
    serverUrl: api.origin,
    apiKey: API_KEY,
    bridgeEnabled: true,
    bridgePort: bridge.port,
    bridgeToken: BRIDGE_TOKEN,
  });
}, 60_000);

afterAll(async () => {
  await context?.close().catch(() => undefined);
  await Promise.all([site?.close(), bridge?.close(), api?.close()]);
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
});

describe("bridge", () => {
  it("connects and authenticates with the pairing token", async () => {
    await bridge.waitForAuth();
    expect(bridge.hello).toMatchObject({
      type: "hello",
      token: BRIDGE_TOKEN,
      protocol: 1,
      client: { name: "screen-commons-extension", browser: "chromium" },
    });
    const status = await worker.evaluate(
      async () => (await chrome.storage.local.get("bridgeStatus")).bridgeStatus,
    );
    expect(status).toMatchObject({ state: "connected", server: { name: "mock-bridge" } });
  });

  it("navigates and extracts page metadata", async () => {
    const nav = await bridge.request("navigate", { url: site.url });
    expect(nav).toMatchObject({ url: site.url, title: "Pricing – Fixture App" });
    fixtureTabId = nav.tabId;

    const meta = await bridge.request("extract", {});
    expect(meta).toMatchObject({
      url: site.url,
      title: "Pricing – Fixture App",
      description: "Plans for teams of every size.",
      siteName: "Fixture App",
      ogImageUrl: `${site.origin}/og.png`,
      themeColor: "#111111",
      lang: "en",
      faviconUrl: `${site.origin}/apple-touch-icon.png`,
    });
    expect(meta.headings).toEqual([
      "Simple pricing",
      "Compare plans",
      "Frequently asked",
      "Loaded late",
    ]);
    const urls = meta.links.map((l) => l.url);
    expect(urls).toEqual([`${site.origin}/`, `${site.origin}/pricing`, `${site.origin}/docs`]);
  });

  it("lists tabs", async () => {
    const { tabs } = await bridge.request("listTabs", {});
    expect(tabs.some((t) => t.id === fixtureTabId && t.url === site.url)).toBe(true);
  });

  it("takes a full-page screenshot matching the document height, after a lazy-load pass", async () => {
    const page = await fixturePage();
    const shot = await bridge.request("screenshot", { fullPage: true });
    const buffer = Buffer.from(shot.base64, "base64");
    const size = pngSize(buffer);
    const { width, dpr, lazy } = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      dpr: devicePixelRatio,
      lazy: (window as unknown as { lazyTriggered: boolean }).lazyTriggered,
    }));
    expect(shot.type).toBe("image/png");
    expect(size).toEqual({
      width: Math.round(width * dpr),
      height: Math.round(FIXTURE.height * dpr),
    });
    expect({ width: shot.width, height: shot.height }).toEqual(size);
    expect(lazy).toBe(true);
    // The lazily revealed section is painted at the bottom; the sticky header only at the top.
    near(await pixel(shot.base64, 10, size.height - 10), FIXTURE.lazyColor);
    near(await pixel(shot.base64, 10, 10), FIXTURE.headerColor);
    near(await pixel(shot.base64, 600, 1820), [240, 253, 244]);
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(join(shotsDir, "bridge-fullpage.png"), buffer),
    );
  });

  it("captures an element by selector", async () => {
    const shot = await bridge.request("screenshot", { selector: "#card" });
    const size = pngSize(Buffer.from(shot.base64, "base64"));
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(join(shotsDir, "bridge-element.png"), Buffer.from(shot.base64, "base64")),
    );
    expect(size).toEqual({ width: FIXTURE.card.width, height: FIXTURE.card.height });
    near(await pixel(shot.base64, 5, FIXTURE.card.height - 5), FIXTURE.card.color);
    near(
      await pixel(shot.base64, FIXTURE.card.width - 5, FIXTURE.card.height - 5),
      FIXTURE.card.color,
    );
  });

  it("falls back to scroll-and-stitch when configured", async () => {
    await setSettings({ fullPageMethod: "stitch" });
    try {
      const shot = await bridge.request("screenshot", { fullPage: true });
      const size = pngSize(Buffer.from(shot.base64, "base64"));
      expect(size.height).toBe(FIXTURE.height);
      near(await pixel(shot.base64, 10, 10), FIXTURE.headerColor);
      // Header hidden on later tiles: the top of the second tile shows section 1 colour.
      const page = await fixturePage();
      const viewport = await page.evaluate(() => innerHeight);
      near(await pixel(shot.base64, 600, viewport + 10), [236, 254, 255]);
      near(await pixel(shot.base64, 10, size.height - 10), FIXTURE.lazyColor);
      const restored = await page.evaluate(
        () => document.querySelectorAll("[data-screen-commons-hidden]").length,
      );
      expect(restored).toBe(0);
      await import("node:fs/promises").then((fs) =>
        fs.writeFile(join(shotsDir, "bridge-stitched.png"), Buffer.from(shot.base64, "base64")),
      );
    } finally {
      await setSettings({ fullPageMethod: "auto" });
    }
  });

  it("emulates the mobile viewport", async () => {
    const nav = await bridge.request("navigate", { url: site.url, viewport: "mobile" });
    expect(nav.tabId).toBe(fixtureTabId);
    const shot = await bridge.request("screenshot", {});
    expect(pngSize(Buffer.from(shot.base64, "base64"))).toEqual({
      width: 390 * 3,
      height: 844 * 3,
    });
    const page = await fixturePage();
    expect(await page.evaluate(() => navigator.userAgent)).toMatch(/iPhone/u);
    // Back to the real window.
    await bridge.request("navigate", { url: site.url });
    expect(await page.evaluate(() => navigator.userAgent)).not.toMatch(/iPhone/u);
  });

  it("rejects invalid requests without executing anything", async () => {
    await expect(bridge.raw({ method: "evaluate", params: { code: "1" } })).rejects.toMatchObject({
      code: "unknown_method",
    });
    await expect(
      bridge.raw({ method: "navigate", params: { url: "javascript:alert(1)" } }),
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(
      bridge.raw({ method: "screenshot", params: { selector: "#nope" } }),
    ).rejects.toThrow(/No element matches/u);
    await expect(bridge.raw({ method: "screenshot", params: { selector: "[[" } })).rejects.toThrow(
      /Invalid CSS selector/u,
    );
  });
});

describe("tray and upload", () => {
  let tray: Page;

  it("captures into the tray from an extension page", async () => {
    tray = await context.newPage();
    await tray.setViewportSize({ width: 1280, height: 860 });
    await tray.goto(`chrome-extension://${extensionId}/tray.html`);
    for (const mode of ["full", "visible"] as const) {
      const response = await tray.evaluate(
        ({ mode, tabId }) => chrome.runtime.sendMessage({ type: "capture", mode, tabId }),
        { mode, tabId: fixtureTabId },
      );
      expect(response).toMatchObject({ ok: true, data: { shot: { mode, patterns: ["pricing"] } } });
    }
    // Interactive element picker: hover the card in the page and click it.
    const page = await fixturePage();
    await page.evaluate(() => document.getElementById("card")!.scrollIntoView({ block: "center" }));
    const picked = tray.evaluate(
      ({ tabId }) => chrome.runtime.sendMessage({ type: "capture", mode: "element", tabId }),
      { tabId: fixtureTabId },
    );
    await page.bringToFront();
    await page.waitForSelector("#__screen-commons-picker", { state: "attached" });
    const box = (await page.locator("#card").boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 120);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await picked).toMatchObject({
      ok: true,
      data: { shot: { mode: "element", width: FIXTURE.card.width, height: FIXTURE.card.height } },
    });
    expect(await page.locator("#__screen-commons-picker").count()).toBe(0);

    await tray.bringToFront();
    await expect.poll(() => tray.locator("article").count(), { timeout: 10_000 }).toBe(3);
    await expect.poll(() => tray.locator("#root input").first().inputValue()).toBe("Fixture App");
    await tray.screenshot({ path: join(shotsDir, "tray.png") });
    await tray.emulateMedia({ colorScheme: "dark" });
    await tray.waitForTimeout(400);
    await tray.screenshot({ path: join(shotsDir, "tray-dark.png") });
    await tray.emulateMedia({ colorScheme: "light" });
  });

  it("reorders by drag and deletes shots", async () => {
    const cards = tray.locator("article");
    const meta = () => cards.locator("p[title]").allTextContents();
    expect((await meta())[2]).toContain("element");
    await tray.locator("li").nth(2).dragTo(tray.locator("li").nth(0));
    await expect.poll(async () => (await meta())[0]).toContain("element");
    const order = await worker.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("open-ui-capture");
        request.onsuccess = () => resolve(request.result);
      });
      const all = await new Promise<{ mode: string; order: number }[]>((resolve) => {
        const request = db.transaction("shots").objectStore("shots").getAll();
        request.onsuccess = () => resolve(request.result);
      });
      return all.sort((a, b) => a.order - b.order).map((shot) => shot.mode);
    });
    expect(order).toEqual(["element", "full", "visible"]);
    await cards.first().hover();
    await cards.first().getByRole("button", { name: "Delete shot" }).click();
    await expect.poll(() => cards.count()).toBe(2);
    expect((await meta())[0]).not.toContain("element");
  });

  it("uploads a flow through the API with a valid CaptureBatchInput", async () => {
    await tray.getByRole("switch", { name: "Save as flow" }).click();
    await tray.getByLabel("Flow name").fill("Pricing tour");
    await tray.getByLabel("Type").selectOption("upgrading");
    await tray.getByLabel("Category").selectOption("productivity");
    await tray.locator("article").first().getByLabel("Screen title").fill("Pricing page");
    await tray.getByRole("button", { name: /^Upload/u }).click();
    await tray.getByText(/Uploaded 2 screens/u).waitFor({ timeout: 30_000 });
    expect(await tray.getByTestId("app-link").textContent()).toBe(`${api.origin}/apps/fixture-app`);
    await tray.screenshot({ path: join(shotsDir, "tray-success.png") });

    expect(api.errors).toEqual([]);
    expect(api.batches).toHaveLength(1);
    const batch = api.batches[0]!;
    expect(batch).toMatchObject({
      source: "extension",
      app: {
        name: "Fixture App",
        websiteUrl: site.origin,
        platform: "web",
        category: "productivity",
      },
      flow: { name: "Pricing tour", type: "upgrading" },
    });
    expect(batch.screens).toHaveLength(2);
    const [first, second] = batch.screens;
    expect(first).toMatchObject({
      title: "Pricing page",
      stepLabel: "Pricing page",
      sourceUrl: site.url,
      patterns: ["pricing"],
    });
    expect(first!.image.type).toBe("image/png");
    expect(first!.thumbnail.type).toBe("image/webp");
    expect(first!.height).toBe(FIXTURE.height);
    expect(first!.text).toContain("Loaded late");
    expect(second!.text).toContain("Simple pricing");
    expect(second!.text).not.toContain("Loaded late");
    const thumb = Buffer.from(first!.thumbnail.base64, "base64");
    expect(thumb.toString("ascii", 8, 12)).toBe("WEBP");
    expect(first!.dominantColor).toMatch(/^#[0-9a-f]{6}$/u);
    const count = await worker.evaluate(
      async () =>
        ((await chrome.storage.local.get("trayState")).trayState as { count: number }).count,
    );
    expect(count).toBe(0);
  });
});

describe("connect handoff", () => {
  it("receives the key from /extension/connect on the configured origin", async () => {
    api.addKey("oui_connected_key_123456");
    // The custom-origin content script is registered dynamically from settings.
    await expect
      .poll(
        () =>
          worker.evaluate(async () =>
            (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.matches),
          ),
        { timeout: 10_000 },
      )
      .toEqual([["http://localhost/*"]]);
    const page = await context.newPage();
    await page.goto(`${api.origin}/extension/connect`);
    await expect
      .poll(() => page.locator("#status").textContent(), { timeout: 10_000 })
      .toBe("connected:Ada Lovelace");
    const settings = await worker.evaluate(
      async () => (await chrome.storage.local.get("settings")).settings,
    );
    expect(settings).toMatchObject({ apiKey: "oui_connected_key_123456", serverUrl: api.origin });
    await page.close();
  });
});

describe("pages", () => {
  it("renders the popup and options pages", async () => {
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 340, height: 420 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${fixtureTabId}`);
    await popup.getByText("Ada Lovelace").waitFor({ timeout: 10_000 });
    await popup.getByText("Connected", { exact: true }).waitFor();
    // Real popups size to their content.
    await popup.setViewportSize({
      width: 340,
      height: await popup.evaluate(() => document.body.scrollHeight),
    });
    await popup.screenshot({ path: join(shotsDir, "popup.png") });
    await popup.emulateMedia({ colorScheme: "dark" });
    await popup.waitForTimeout(400);
    await popup.screenshot({ path: join(shotsDir, "popup-dark.png") });

    const options = await context.newPage();
    await options.setViewportSize({ width: 900, height: 1240 });
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByText("mock-bridge", { exact: false }).waitFor({ timeout: 10_000 });
    await options.getByRole("button", { name: "Test connection" }).click();
    await options.getByText("Signed in as").waitFor();
    await options.screenshot({ path: join(shotsDir, "options.png") });
    await options.emulateMedia({ colorScheme: "dark" });
    await options.waitForTimeout(400);
    await options.screenshot({ path: join(shotsDir, "options-dark.png") });
  });

  it("keeps the bridge alive with app-level pings", async () => {
    // 20s interval: just check the timer is armed by waiting for the first ping when time allows.
    if (process.env.E2E_SLOW) {
      await new Promise((r) => setTimeout(r, 21_000));
      expect(bridge.pings).toBeGreaterThan(0);
    }
    expect(bridge.rejected).toEqual([]);
  });
});
