/**
 * Library E2E (playwright-core + node:test) against a running dev server with seeded content:
 *
 *   pnpm --filter @screen-commons/web dev            # http://localhost:5173, seeded .wrangler state
 *   pnpm --filter @screen-commons/web test:e2e
 *
 * Env: E2E_BASE_URL (default http://localhost:5173), E2E_EMAIL / E2E_PASSWORD (default: the seed
 * admin), CHROME_PATH (default: the system Chromium). Leaves no data behind: the collection it
 * creates is deleted and the screen's saved state restored at the end.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import playwright, { type Browser, type BrowserContext, type Page } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.E2E_EMAIL ?? "admin@screencommons.dev";
const PASSWORD = process.env.E2E_PASSWORD ?? "screencommons-admin-2026";
const CHROME = process.env.CHROME_PATH ?? "/run/current-system/sw/bin/chromium";
const COLLECTION = `E2E ${Date.now().toString(36)}`;
let savedScreen: { id: string; wasSaved: boolean } | null = null;

let browser: Browser;
let context: BrowserContext;
let page: Page;
const problems: string[] = [];

const searchParam = (name: string) => new URL(page.url()).searchParams.get(name);
const viewer = () => page.getByRole("dialog").filter({ has: page.getByRole("complementary") });

before(async () => {
  browser = await playwright.chromium.launch({ executablePath: CHROME });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|Failed to load resource/u.test(message.text())) {
      problems.push(`console: ${message.text()}`);
    }
  });
});

after(async () => {
  await browser?.close();
});

describe("library", () => {
  test("signs in and lands on Discover with the seeded apps", async () => {
    await page.goto(`${BASE}/sign-in?redirect=%2Fbrowse%2Fweb`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/browse\/web/u);

    await page.getByRole("heading", { name: "Discover" }).waitFor();
    const apps = page.locator('main a[href^="/apps/"]');
    await apps.first().waitFor();
    assert.ok((await apps.count()) >= 6, "at least 6 app cards");
    // The newest app leads the default (Latest) sort, whichever it is.
    const newest = await (
      await page.request.get(`${BASE}/api/v1/apps?platform=web&limit=1`)
    ).json();
    await page.locator(`main a[href="/apps/${newest.items[0].slug}"]`).first().waitFor();
  });

  test("filters screens by pattern", async () => {
    await page.getByRole("link", { name: "Screens", exact: true }).click();
    await page.waitForURL(/tab=screens/u);
    await page
      .getByRole("group", { name: "Screen patterns" })
      .getByRole("button", { name: /^Pricing/u })
      .click();
    await page.waitForURL(/pattern=pricing/u);
    // The previous results stay on screen (dimmed, aria-busy) until the filtered page arrives.
    await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
    const tiles = page.locator("main [data-screen-id]");
    await tiles.first().waitFor();
    assert.ok((await tiles.count()) >= 3, "pricing screens are listed");
  });

  test("opens the viewer and walks the result list with ←/→", async () => {
    const tiles = page.locator("main [data-screen-id]");
    const first = await tiles.nth(0).getAttribute("data-screen-id");
    const second = await tiles.nth(1).getAttribute("data-screen-id");
    await tiles.nth(0).getByRole("link").first().click();
    await viewer().waitFor();
    assert.equal(searchParam("screen"), first);

    await page.keyboard.press("ArrowRight");
    await page.waitForURL((url) => url.searchParams.get("screen") === second);
    await page.keyboard.press("ArrowLeft");
    await page.waitForURL((url) => url.searchParams.get("screen") === first);
  });

  test("saves the screen into a new collection", async () => {
    const save = viewer().getByRole("button", { name: /^Save(d)?$/u });
    const wasSaved = (await save.getAttribute("aria-pressed")) === "true";
    savedScreen = { id: searchParam("screen")!, wasSaved };
    if (wasSaved) {
      await save.click(); // already saved by an earlier run: start from unsaved
      await page.waitForFunction(
        (el) => el?.getAttribute("aria-pressed") === "false",
        await save.elementHandle(),
      );
    }
    await save.click();
    await page.getByRole("button", { name: "Add to collection" }).click();
    const picker = page.getByRole("dialog", { name: "Save to collection" });
    await picker.getByLabel("New collection name").fill(COLLECTION);
    await picker.getByRole("button", { name: "Create" }).click();
    await picker.getByRole("button", { name: new RegExp(COLLECTION, "u") }).waitFor();
    assert.equal(
      await picker
        .getByRole("button", { name: new RegExp(COLLECTION, "u") })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.keyboard.press("Escape"); // picker
    await page.keyboard.press("Escape"); // viewer
    await page.waitForURL((url) => !url.searchParams.has("screen"));
  });

  test("shows the collection in /saved", async () => {
    const savedScreen = await page
      .locator("main [data-screen-id]")
      .first()
      .getAttribute("data-screen-id");
    await page.goto(`${BASE}/saved`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: new RegExp(COLLECTION, "u") }).click();
    await page.getByRole("heading", { name: COLLECTION }).waitFor();
    await page.locator(`main [data-screen-id="${savedScreen}"]`).waitFor();
  });

  test("⌘K search returns live results and opens /search", async () => {
    await page.goto(`${BASE}/browse/web`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Discover" }).waitFor();
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search" });
    await palette.getByRole("combobox").fill("pricing");
    await palette.getByRole("option", { name: /Search for “pricing”/u }).waitFor();
    await palette.getByText("Screens", { exact: true }).waitFor();
    await palette.getByRole("option").nth(3).waitFor(); // live results are listed
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/search\?q=pricing/u);
    await page.getByRole("heading", { name: /Results for/u }).waitFor();
    await page.locator("main [data-screen-id]").first().waitFor();
  });

  test("opens a flow and a step in the screen viewer", async () => {
    await page.goto(`${BASE}/browse/web?tab=flows`, { waitUntil: "networkidle" });
    const card = page.locator('main a[href*="flow="]').first();
    await card.click();
    const flow = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("list", { name: /steps$/u }) });
    await flow.waitFor();
    const steps = flow.getByRole("button", { name: /^Open step/u });
    assert.ok((await steps.count()) >= 2, "the flow has steps");
    await steps.nth(1).click();
    await viewer().waitFor();
    assert.ok(searchParam("flow") && searchParam("screen"), "both overlays are in the URL");
    await page.keyboard.press("Escape");
    await page.waitForURL((url) => !url.searchParams.has("screen") && url.searchParams.has("flow"));
    await page.keyboard.press("Escape");
    await page.waitForURL((url) => !url.searchParams.has("flow"));
  });

  test("cleans up the collection", async () => {
    await page.goto(`${BASE}/saved`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: new RegExp(COLLECTION, "u") }).click();
    await page.getByRole("button", { name: "Delete collection" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete collection" }).click();
    await page.waitForURL(/\/saved$/u);
    await page
      .getByRole("link", { name: new RegExp(COLLECTION, "u") })
      .waitFor({ state: "detached" });
    // Restore the screen's original saved state.
    if (savedScreen && !savedScreen.wasSaved) {
      await page.goto(`${BASE}/screens/${savedScreen.id}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Saved", exact: true }).click();
      await page.getByRole("button", { name: "Save", exact: true }).waitFor();
    }
  });

  test("logged no page errors", () => {
    assert.deepEqual(problems, []);
  });
});
