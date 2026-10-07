/**
 * Product E2E (playwright-core + node:test) for the public pages, contribute → review, settings
 * and MCP, against a running dev server with seeded content:
 *
 *   pnpm --filter @open-ui/web dev            # http://localhost:5173, seeded .wrangler state
 *   pnpm --filter @open-ui/web test:e2e
 *
 * Env: E2E_BASE_URL (default http://localhost:5173), E2E_EMAIL / E2E_PASSWORD (default: the seed
 * admin), CHROME_PATH (default: the system Chromium).
 *
 * Data: signs up a fresh member each run. The contributed flow and screens are rejected at the
 * end, the API key is revoked; the "E2E Product Test" app row is reused across runs.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import playwright, { type Browser, type BrowserContext, type Page } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const ADMIN_EMAIL = process.env.E2E_EMAIL ?? "admin@openui.dev";
const ADMIN_PASSWORD = process.env.E2E_PASSWORD ?? "openui-admin-2026";
const CHROME = process.env.CHROME_PATH ?? "/run/current-system/sw/bin/chromium";
const STAMP = Date.now().toString(36);
const MEMBER = { name: "E2E Member", email: `e2e-${STAMP}@example.com`, password: `pw-${STAMP}-e2e` };
const APP_NAME = "E2E Product Test";
const FLOW_NAME = `Signing up ${STAMP}`;
const STEPS = ["Sign up", "Verify email", "Welcome"];

let browser: Browser;
const problems: string[] = [];

async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !/favicon|Failed to load resource/u.test(text)) {
      problems.push(`console: ${text}`);
    }
  });
  return page;
}

async function signIn(page: Page, email: string, password: string, redirect = "/browse/web") {
  await page.goto(`${BASE}/sign-in?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === redirect.split("?")[0]);
}

/** Realistic 1440×900 PNG screenshots, rendered by the browser itself. */
async function makeScreenshots(): Promise<{ name: string; mimeType: string; buffer: Buffer }[]> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const files = [];
  for (const [index, label] of STEPS.entries()) {
    await page.setContent(`<body style="margin:0;font:16px system-ui;background:#fafafa">
      <header style="height:64px;display:flex;align-items:center;padding:0 48px;background:#fff;border-bottom:1px solid #eee"><b>E2E Product</b></header>
      <main style="display:grid;place-items:center;height:836px"><div style="width:420px;padding:40px;background:#fff;border:1px solid #eee;border-radius:16px">
      <h1 style="margin:0 0 24px">${label}</h1><div style="height:44px;border:1px solid #ddd;border-radius:10px;margin-bottom:16px"></div>
      <div style="height:46px;border-radius:10px;background:hsl(${index * 110} 70% 45%)"></div></div></main></body>`);
    files.push({
      name: `e2e-${label.toLowerCase().replace(/\s+/gu, "-")}.png`,
      mimeType: "image/png",
      buffer: await page.screenshot({ type: "png" }),
    });
  }
  await context.close();
  return files;
}

before(async () => {
  browser = await playwright.chromium.launch({ executablePath: CHROME });
});

after(async () => {
  await browser?.close();
  assert.deepEqual(problems, [], "no console errors or page errors");
});

describe("public pages", () => {
  test("landing renders real catalog thumbnails when logged out", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await newPage(context);
    await page.goto(BASE);
    await page.getByRole("heading", { level: 1, name: /Real product screens/u }).waitFor();
    const thumbs = page.getByRole("region", { name: "From the library" }).locator("img");
    await thumbs.first().waitFor();
    assert.ok((await thumbs.count()) >= 3, "at least 3 thumbnails");
    await page.waitForFunction(() =>
      [...document.querySelectorAll('section[aria-label="From the library"] img')]
        .slice(0, 3)
        .every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
    );
    await page.getByRole("link", { name: "Get started" }).first().waitFor();
    await context.close();
  });

  test("docs render with the sidebar, table of contents and code blocks", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await newPage(context);
    await page.goto(`${BASE}/docs`);
    await page.getByRole("heading", { level: 1, name: "Introduction" }).waitFor();
    const sidebar = page.getByRole("navigation", { name: "Documentation" });
    assert.ok((await sidebar.getByRole("link").count()) >= 6, "sidebar lists the docs");
    await sidebar.getByRole("link", { name: "MCP", exact: true }).click();
    await page.waitForURL(`${BASE}/docs/mcp`);
    await page.getByRole("heading", { level: 1, name: "MCP" }).waitFor();
    await page.getByRole("navigation", { name: "On this page" }).waitFor();
    assert.ok((await page.locator(".docs-code .shiki").count()) > 0, "highlighted code");
    assert.ok((await page.getByRole("button", { name: "Copy code" }).count()) > 0, "copy buttons");
    // Server-rendered: the page works without client navigation too.
    const html = await (await context.request.get(`${BASE}/docs/quickstart`)).text();
    assert.match(html, /<h1[^>]*>Quickstart<\/h1>/u);
    await context.close();
  });
});

describe("contribute → review", () => {
  let member: BrowserContext;
  let admin: BrowserContext;
  let flowId = "";
  let appSlug = "";
  let screenIds: string[] = [];

  before(async () => {
    member = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  });

  after(async () => {
    // Leave the library as we found it.
    for (const id of flowId ? [flowId] : [])
      await admin.request.post(`${BASE}/api/v1/review/flow/${id}`, {
        data: { decision: "reject", reason: "E2E cleanup" },
        headers: { origin: BASE },
      });
    for (const id of screenIds)
      await admin.request.post(`${BASE}/api/v1/review/screen/${id}`, {
        data: { decision: "reject", reason: "E2E cleanup" },
        headers: { origin: BASE },
      });
    await member.close();
    await admin.close();
  });

  test("a new member signs up", async () => {
    const page = await newPage(member);
    await page.goto(`${BASE}/sign-up?redirect=%2Fcontribute`);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Enter your name.").waitFor(); // inline validation
    await page.getByLabel("Name").fill(MEMBER.name);
    await page.getByLabel("Email").fill(MEMBER.email);
    await page.getByLabel("Password", { exact: true }).fill(MEMBER.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(`${BASE}/contribute`);
    await page.getByRole("heading", { level: 1, name: "Contribute" }).waitFor();
  });

  test("contributes a 3-screen flow, which lands as pending", async () => {
    const page = member.pages()[0]!;
    await page.locator('input[type="file"]').setInputFiles(await makeScreenshots());
    await page.getByText("3 screens ready").waitFor();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Search apps").fill(APP_NAME);
    const existing = page.getByRole("option", { name: new RegExp(`^${APP_NAME}`, "u") });
    const create = page.getByRole("option", { name: /Create/u });
    await create.waitFor();
    await page.waitForTimeout(400); // debounced search
    if ((await existing.count()) > 0) await existing.first().click();
    else {
      await create.click();
      await page.getByLabel("Website").fill("https://e2e.example.com");
    }
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("switch", { name: "Save as a flow" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Name the flow.").waitFor(); // validation
    await page.getByLabel("Flow name").fill(FLOW_NAME);
    await page.getByLabel("Flow type").selectOption("signing-up");
    for (const [index, label] of STEPS.entries()) {
      await page.getByLabel(`Step label for screen ${index + 1}`).fill(label);
    }
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByText("Members’ uploads are reviewed by an admin").waitFor();
    await page.getByRole("button", { name: "Submit 3 screens" }).click();
    await page.getByRole("heading", { name: "Submitted for review" }).waitFor({ timeout: 30_000 });

    const href = await page.getByRole("link", { name: "View flow" }).getAttribute("href");
    const url = new URL(href!, BASE);
    flowId = url.searchParams.get("flow") ?? "";
    appSlug = url.pathname.split("/").pop() ?? "";
    assert.ok(flowId && appSlug, "success links to the flow");

    const flow = await (await member.request.get(`${BASE}/api/v1/flows/${flowId}`)).json();
    assert.equal(flow.status, "pending");
    assert.equal(flow.steps.length, 3);
    assert.deepEqual(
      flow.steps.map((step: { label: string }) => step.label),
      STEPS,
    );
    screenIds = flow.steps.map((step: { screen: { id: string } }) => step.screen.id);
    for (const step of flow.steps) assert.equal(step.screen.status, "pending");
  });

  test("members can't open the review queue", async () => {
    const response = await member.request.get(`${BASE}/review`);
    assert.equal(response.status(), 404);
  });

  test("an admin approves the flow in /review and it shows on the app page", async () => {
    const page = await newPage(admin);
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD, "/review");
    await page.getByRole("link", { name: /^Flows/u }).click();
    await page.waitForURL(/tab=flows/u);
    const row = page.getByRole("list", { name: "Pending items" }).getByRole("button", {
      name: new RegExp(FLOW_NAME, "u"),
    });
    await row.click();
    await page.getByRole("article", { name: `Reviewing ${FLOW_NAME}` }).waitFor();
    await page.getByText(MEMBER.name).first().waitFor(); // contributor shown
    await page.keyboard.press("a"); // keyboard shortcut: approve
    await row.waitFor({ state: "detached" });

    const flow = await (await admin.request.get(`${BASE}/api/v1/flows/${flowId}`)).json();
    assert.equal(flow.status, "published");
    for (const step of flow.steps) assert.equal(step.screen.status, "published");

    await page.goto(`${BASE}/apps/${appSlug}`);
    await page.getByRole("heading", { name: APP_NAME }).first().waitFor();
    await page.getByText(FLOW_NAME).first().waitFor();
  });
});

describe("settings", () => {
  test("creates an API key, calls /mcp with it, then revokes it", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await newPage(context);
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD, "/settings");
    await page.getByRole("link", { name: "API keys" }).click();
    await page.waitForURL(/tab=keys/u);

    const name = `E2E key ${STAMP}`;
    await page.getByRole("button", { name: "Create key" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Create key" }).click();
    const token = (await page.getByTestId("new-token").locator("code").textContent())?.trim() ?? "";
    assert.match(token, /^oui_[A-Za-z0-9_-]+$/u);
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("row", { name: new RegExp(name, "u") }).waitFor();

    const call = () =>
      context.request.post(`${BASE}/mcp`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
    const listed = await call();
    assert.equal(listed.status(), 200);
    const tools = (await listed.json()).result.tools.map((tool: { name: string }) => tool.name);
    assert.ok(tools.includes("search_screens") && tools.includes("upload_screen"), "catalog tools");

    await page.getByRole("button", { name: `Revoke ${name}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Revoke key" }).click();
    await page.getByRole("row", { name: new RegExp(name, "u") }).waitFor({ state: "detached" });
    assert.equal((await call()).status(), 401);
    await context.close();
  });
});
