/**
 * Keyboard E2E (playwright-core + node:test): every journey below runs on key presses alone —
 * Tab, Enter, Space, arrows, Escape and the app's shortcuts — against a running dev server with
 * seeded content, plus a screen reader smoke pass over the accessibility tree (roles and names):
 *
 *   pnpm --filter @screen-commons/web dev            # http://localhost:5173, seeded .wrangler state
 *   pnpm --filter @screen-commons/web test:e2e
 *
 * Env: E2E_BASE_URL (default http://localhost:5173), E2E_EMAIL / E2E_PASSWORD (default: the seed
 * admin), CHROME_PATH (default: the system Chromium).
 *
 * Data: the member journeys sign up e2e-keyboard@example.com, contribute three screens to a new
 * "E2E Keyboard Test" app, and the admin approves one (which publishes the app). Before and after
 * the run, `purgeE2EData` deletes that account, the app, its screens and their media from the dev
 * server's local D1 and R2 (local-data.ts), so a run leaves nothing published behind. Those
 * journeys need a local dev server and are skipped against any other E2E_BASE_URL; the signed-out
 * journeys only read.
 *
 * Negative checks ("this key did nothing") never sleep: they press a key with a visible effect
 * right after, wait for that, then assert — keys are handled in order, and a handled shortcut
 * updates state or the URL before the next key arrives. Client navigations are logged by an init
 * script (`navigations`), so "didn't navigate" is checked against every URL the page visited.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import playwright, {
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright-core";

import { isLocalBase, purgeE2EData } from "./local-data.ts";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const ADMIN_EMAIL = process.env.E2E_EMAIL ?? "admin@screencommons.dev";
const ADMIN_PASSWORD = process.env.E2E_PASSWORD ?? "screencommons-admin-2026";
const CHROME = process.env.CHROME_PATH ?? "/run/current-system/sw/bin/chromium";
const STAMP = Date.now().toString(36);
const MEMBER = {
  name: "E2E Keyboard",
  email: "e2e-keyboard@example.com",
  password: "e2e-keyboard-password",
};
const APP_NAME = "E2E Keyboard Test";
const COLLECTION = `Keys ${STAMP}`;
const TITLES = ["Alpha", "Beta", "Gamma"].map((title) => `${title} ${STAMP}`);
const DATA = { emails: [MEMBER.email], appNames: [APP_NAME] };
/** Journeys that write data run only where `purgeE2EData` can clean up after them. */
const WRITES = isLocalBase(BASE)
  ? {}
  : { skip: "writes data; cleanup needs a local dev server (see the file comment)" };

let browser: Browser;
const problems: string[] = [];

/** Every client-side navigation (pushState / replaceState), as pathnames, since the last load. */
const NAVIGATION_LOG = `(() => {
  window.__navigations = [];
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      window.__navigations.push(new URL(String(args[2] ?? location.href), location.href).pathname);
      return original.apply(this, args);
    };
  }
})();`;

async function newContext(): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(NAVIGATION_LOG);
  return context;
}

/** Starts a fresh navigation log, before keys that must not navigate. */
async function forgetNavigations(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __navigations: string[] }).__navigations.length = 0;
  });
}

/** Asserts no client navigation since `forgetNavigations` went to `path`. */
async function neverVisited(page: Page, path: string, message: string) {
  const visited = await page.evaluate(
    () => (window as unknown as { __navigations: string[] }).__navigations,
  );
  assert.ok(!visited.includes(path), `${message} (visited ${visited.join(", ") || "nothing"})`);
}

/**
 * The accessible name and description Chromium computes for an element (what a screen reader
 * announces), read through the DevTools accessibility domain.
 */
async function accessible(locator: Locator): Promise<{ name: string; description: string }> {
  const page = locator.page();
  const cdp = await page.context().newCDPSession(page);
  await locator.evaluate((element) => element.setAttribute("data-e2e-probe", ""));
  try {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: "[data-e2e-probe]",
    });
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
      nodeId,
      fetchRelatives: false,
    });
    const node = nodes[0]!;
    return {
      name: String(node.name?.value ?? ""),
      description: String(node.description?.value ?? ""),
    };
  } finally {
    await locator.evaluate((element) => element.removeAttribute("data-e2e-probe"));
    await cdp.detach();
  }
}

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

const isFocused = (locator: Locator) =>
  locator.evaluate((element) => element === document.activeElement);

/** Waits for `target` to take focus (dialogs hand it back a frame after they unmount). */
async function waitForFocus(target: Locator, message: string) {
  const handle = await target.elementHandle();
  await target
    .page()
    .waitForFunction((element) => element === document.activeElement, handle, { timeout: 2000 })
    .catch(() => assert.fail(message));
}

/** Tabs (forwards, or backwards with `back`) until `target` has focus, as a user would. */
async function tabTo(page: Page, target: Locator, { back = false, max = 80 } = {}) {
  await target.waitFor();
  for (let presses = 0; presses < max; presses++) {
    if (await isFocused(target)) return;
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
  }
  throw new Error(`${max} Tab presses never reached ${target}`);
}

/** Presses a shortcut in the app's notation: "g s" is G, then S. */
async function shortcut(page: Page, keys: string) {
  for (const key of keys.split(" ")) await page.keyboard.press(key);
}

/** Opens the ⌘K palette, types a query and runs the highlighted (first) row. */
async function runCommand(page: Page, query: string, row: string | RegExp) {
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  await palette.waitFor();
  await page.keyboard.type(query);
  const option = palette.getByRole("option", { name: row }).first();
  await option.waitFor();
  // Arrow down to the row (cmdk keeps one row selected), then run it.
  for (let presses = 0; presses < 20; presses++) {
    if ((await option.getAttribute("aria-selected")) === "true") break;
    await page.keyboard.press("ArrowDown");
  }
  assert.equal(await option.getAttribute("aria-selected"), "true", `palette row ${row}`);
  await page.keyboard.press("Enter");
  await palette.waitFor({ state: "detached" });
}

/** Signs in on /sign-in with the keyboard only (the email field is autofocused). */
async function signIn(page: Page, email: string, password: string, redirect: string) {
  await page.goto(`${BASE}/sign-in?redirect=${encodeURIComponent(redirect)}`, {
    waitUntil: "networkidle",
  });
  assert.ok(await isFocused(page.getByLabel("Email")), "email field is focused on load");
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(password);
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === redirect);
}

/** Realistic screenshots, rendered by the browser itself, one per title. */
async function makeScreenshots() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const files = [];
  for (const [index, title] of TITLES.entries()) {
    await page.setContent(`<body style="margin:0;font:16px system-ui;background:#fafafa">
      <main style="display:grid;place-items:center;height:900px"><div style="width:420px;padding:40px;background:#fff;border:1px solid #eee;border-radius:16px">
      <h1 style="margin:0 0 24px">${title}</h1>
      <div style="height:46px;border-radius:10px;background:hsl(${index * 110} 70% 45%)"></div></div></main></body>`);
    files.push({
      name: `${title.split(" ")[0]!.toLowerCase()}.png`,
      mimeType: "image/png",
      buffer: await page.screenshot({ type: "png" }),
    });
  }
  await context.close();
  return files;
}

before(async () => {
  browser = await playwright.chromium.launch({ executablePath: CHROME });
  // A crashed earlier run may have left its member and app behind.
  if (!WRITES.skip) await purgeE2EData(BASE, DATA);
});

after(async () => {
  await browser?.close();
  if (!WRITES.skip) await purgeE2EData(BASE, DATA);
});

describe("public pages, signed out", () => {
  let context: BrowserContext;
  let page: Page;

  before(async () => {
    context = await newContext();
    page = await newPage(context);
  });

  after(async () => {
    await context.close();
  });

  test("the skip link is the first stop and lands in the main landmark", async () => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    assert.ok(await isFocused(skip), "skip link takes the first Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(() => !!document.activeElement?.closest("main#main")),
      "the next Tab is inside <main>",
    );
  });

  test("g shortcuts and the palette reach docs, sign in, sign up and home", async () => {
    await shortcut(page, "g d");
    await page.waitForURL(`${BASE}/docs`);
    await page.getByRole("heading", { level: 1 }).waitFor();

    await tabTo(page, page.getByRole("link", { name: "Browsing", exact: true }).first());
    await page.keyboard.press("Enter");
    await page.waitForURL(`${BASE}/docs/browsing`);

    // `/` opens the palette signed out too: pages and docs only.
    await page.keyboard.press("/");
    const palette = page.getByRole("dialog", { name: "Search pages and docs" });
    await palette.waitFor();
    await page.keyboard.type("sign in");
    await palette.getByRole("option", { name: "Sign in" }).waitFor();
    await page.keyboard.press("Enter");
    await page.waitForURL(`${BASE}/sign-in`);
    await palette.waitFor({ state: "detached" });

    // Typing in a field never triggers shortcuts…
    const email = page.getByLabel("Email");
    assert.ok(await isFocused(email));
    await page.keyboard.type("?g");
    assert.equal(await email.inputValue(), "?g");
    assert.equal(await page.getByRole("dialog").count(), 0, "? typed into a field opens nothing");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");

    // …except ⌘K, which opens the palette from anywhere.
    await runCommand(page, "account", "Create an account");
    await page.waitForURL(`${BASE}/sign-up`);

    await tabTo(page, page.getByRole("link", { name: "Screen Commons home" }));
    await shortcut(page, "g h");
    await page.waitForURL(`${BASE}/`);
  });

  test("a stray G never swallows ⌘K, / or ?", async () => {
    // Did the page take ⌘K? Otherwise Chrome and Firefox on Linux/Windows focus their own search.
    await page.evaluate(() =>
      window.addEventListener("keydown", (event) => {
        if (event.key.toLowerCase() === "k")
          document.body.dataset.e2eTookK = `${event.defaultPrevented}`;
      }),
    );
    const hint = page.getByRole("status").filter({ hasText: "Go to" });
    const palette = page.getByRole("dialog", { name: "Search pages and docs" });

    await page.keyboard.press("g");
    await hint.waitFor();
    await page.keyboard.press("ControlOrMeta+k");
    await palette.waitFor();
    assert.equal(await page.evaluate(() => document.body.dataset.e2eTookK), "true");
    await page.keyboard.press("Escape");
    await palette.waitFor({ state: "detached" });

    await page.keyboard.press("g");
    await hint.waitFor();
    await page.keyboard.press("/");
    await palette.waitFor();
    await page.keyboard.press("Escape");
    await palette.waitFor({ state: "detached" });

    await page.keyboard.press("g");
    await hint.waitFor();
    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await help.waitFor();
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached" });
  });

  test("? opens the shortcut help, announced with its sections", async () => {
    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await help.waitFor();
    const tree = await help.ariaSnapshot();
    for (const expected of [
      'heading "Keyboard shortcuts"',
      'region "Anywhere"',
      'region "Go to"',
      "Search and commands",
      "Docs G then D",
    ]) {
      assert.ok(tree.includes(expected), `help announces ${expected}\n${tree}`);
    }
    for (const memberOnly of ["Saved", "Review", "Screen viewer"]) {
      assert.ok(!tree.includes(memberOnly), `signed-out help omits ${memberOnly}`);
    }
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached" });

    // The header button opens the same dialog and gets focus back on close.
    const button = page.getByRole("button", { name: "Keyboard shortcuts" });
    assert.equal(await button.getAttribute("aria-keyshortcuts"), "?");
    await tabTo(page, button);
    await page.keyboard.press("Enter");
    await help.waitFor();
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached" });
    await waitForFocus(button, "focus returns to the header button");
  });

  test("single-key shortcuts turn off from the help dialog; ⌘K and the button still work", async () => {
    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await help.waitFor();
    const toggle = help.getByRole("switch", { name: "Use single-key shortcuts" });
    const { name, description } = await accessible(toggle);
    assert.equal(name, "Use single-key shortcuts", "the description stays out of the name");
    assert.match(description, /speech input/u);
    await tabTo(page, toggle);
    await page.keyboard.press("Space");
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(() => localStorage.getItem("screen-commons-single-key-shortcuts")),
      "false",
    );

    // ? and G D do nothing now; ⌘K, pressed right after, proves the keys were handled.
    await forgetNavigations(page);
    await page.keyboard.press("?");
    await shortcut(page, "g d");
    const palette = page.getByRole("dialog", { name: "Search pages and docs" });
    await page.keyboard.press("ControlOrMeta+k");
    await palette.waitFor();
    assert.equal(await help.count(), 0, "? is off");
    await neverVisited(page, "/docs", "G D is off");
    await page.keyboard.press("Escape");
    await palette.waitFor({ state: "detached" });

    // The header button still opens the help, where the switch turns them back on.
    const button = page.getByRole("button", { name: "Keyboard shortcuts" });
    assert.equal(await button.getAttribute("aria-keyshortcuts"), null, "no ? to announce");
    await tabTo(page, button);
    await page.keyboard.press("Enter");
    await help.waitFor();
    await tabTo(page, toggle);
    await page.keyboard.press("Space");
    assert.equal(await toggle.getAttribute("aria-checked"), "true");
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached" });
    await page.keyboard.press("?");
    await help.waitFor();
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached" });
  });

  test("library commands are absent and library routes stay protected", async () => {
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Search pages and docs" });
    await palette.waitFor();
    const rows = await palette.getByRole("option").allInnerTexts();
    for (const hidden of ["Saved", "Contribute", "Review queue", "Settings"]) {
      assert.ok(!rows.some((row) => row.startsWith(hidden)), `no ${hidden} command signed out`);
    }
    await page.keyboard.press("Escape");
    await palette.waitFor({ state: "detached" });

    await forgetNavigations(page);
    await shortcut(page, "g s");
    await shortcut(page, "g d");
    await page.waitForURL(`${BASE}/docs`);
    await neverVisited(page, "/saved", "g s is not bound signed out");
    await neverVisited(page, "/sign-in", "g s is not bound signed out");

    for (const path of ["/saved", "/review"]) {
      await page.goto(`${BASE}${path}`);
      await page.waitForURL(/\/sign-in\?redirect=/u);
    }
  });
});

describe("member: browse, search, view, save, contribute, settings", WRITES, () => {
  let context: BrowserContext;
  let page: Page;
  let viewedScreen = "";

  before(async () => {
    context = await newContext();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    page = await newPage(context);
  });

  after(async () => {
    await context.close();
  });

  test("signs up with the keyboard", async () => {
    await page.goto(`${BASE}/sign-up?redirect=%2Fbrowse%2Fweb`, { waitUntil: "networkidle" });
    await tabTo(page, page.getByLabel("Name"));
    await page.keyboard.type(MEMBER.name);
    await page.keyboard.press("Tab");
    await page.keyboard.type(MEMBER.email);
    await page.keyboard.press("Tab");
    await page.keyboard.type(MEMBER.password);
    await page.keyboard.press("Enter");
    await page.waitForURL(`${BASE}/browse/web`);
    await page.getByRole("heading", { name: "Discover" }).waitFor();
  });

  test("the shell is announced with landmarks, clean names and shortcut hints", async () => {
    const tree = await page.locator("body").ariaSnapshot();
    for (const expected of [
      'link "Skip to content"',
      "banner",
      "main",
      'link "Saved"',
      'button "Account menu for E2E Keyboard"',
    ]) {
      assert.ok(tree.includes(expected), `shell announces ${expected}`);
    }
    const search = page.getByRole("button", { name: /^Search Web/u });
    assert.match((await search.getAttribute("aria-keyshortcuts")) ?? "", /^(Control|Meta)\+K \/$/u);
    // Hints are visual: the name stays "Saved", the sequence is the description.
    assert.deepEqual(await accessible(page.getByRole("link", { name: "Saved" })), {
      name: "Saved",
      description: "G then S",
    });

    // Account menu items, by keyboard.
    await tabTo(page, page.getByRole("button", { name: "Account menu for E2E Keyboard" }));
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await menu.waitFor();
    for (const [label, description] of [
      ["Saved", "G then S"],
      ["Contribute", "G then C"],
      ["Settings", "G then Comma"],
      ["Docs", "G then D"],
    ] as const) {
      const item = menu.getByRole("menuitem", { name: label, exact: true });
      assert.deepEqual(await accessible(item), { name: label, description }, label);
    }
    const help = menu.getByRole("menuitem", { name: "Keyboard shortcuts", exact: true });
    assert.deepEqual(await accessible(help), { name: "Keyboard shortcuts", description: "" });
    assert.equal(await help.getAttribute("aria-keyshortcuts"), "?");
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });

    // Palette rows.
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Search" });
    await palette.waitFor();
    await page.keyboard.type("saved");
    const saved = palette.getByRole("option", { name: "Saved", exact: true });
    await saved.waitFor();
    assert.deepEqual(await accessible(saved), { name: "Saved", description: "G then S" });
    await page.keyboard.press("Escape");
    await palette.waitFor({ state: "detached" });
  });

  test("palette commands keep the platform; tabs and filters work by keyboard", async () => {
    await runCommand(page, "ios", "Switch to iOS");
    await page.waitForURL(`${BASE}/browse/ios`);
    await runCommand(page, "flows", "Browse flows");
    await page.waitForURL(`${BASE}/browse/ios?tab=flows`);
    await runCommand(page, "web", "Switch to Web");
    await page.waitForURL(`${BASE}/browse/web?tab=flows`);

    await tabTo(page, page.getByRole("link", { name: "Screens", exact: true }), { back: true });
    await page.keyboard.press("Enter");
    await page.waitForURL(/tab=screens/u);
    const pricing = page
      .getByRole("group", { name: "Screen patterns" })
      .getByRole("button", { name: /^Pricing/u });
    await tabTo(page, pricing);
    await page.keyboard.press("Enter");
    await page.waitForURL(/pattern=pricing/u);
    await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
  });

  test("opens a screen, walks it with arrows, saves with S and returns focus", async () => {
    const tiles = page.locator("main [data-screen-id]");
    const first = tiles.first();
    const firstId = await first.getAttribute("data-screen-id");
    const secondId = await tiles.nth(1).getAttribute("data-screen-id");
    const tile = first.getByRole("link").first();
    await tabTo(page, tile);
    await page.keyboard.press("Enter");
    const viewer = page.getByRole("dialog").filter({ has: page.getByRole("complementary") });
    await viewer.waitFor();
    await page.waitForURL((url) => url.searchParams.get("screen") === firstId);

    await page.keyboard.press("ArrowRight");
    await page.waitForURL((url) => url.searchParams.get("screen") === secondId);
    await page.keyboard.press("ArrowLeft");
    await page.waitForURL((url) => url.searchParams.get("screen") === firstId);
    viewedScreen = firstId!;

    const save = viewer.getByRole("button", { name: /^Save(d)?$/u });
    const pressed = async (value: "true" | "false") =>
      page.waitForFunction(
        ([element, expected]) => element?.getAttribute("aria-pressed") === expected,
        [await save.elementHandle(), value] as const,
      );
    assert.equal(
      await save.getAttribute("aria-pressed"),
      "false",
      "a new member has nothing saved",
    );
    await page.keyboard.press("s");
    await pressed("true");

    // The arrows keep working while a toast or a tooltip shows.
    await page.getByText("Screen saved").waitFor();
    await page.keyboard.press("ArrowRight");
    await page.waitForURL((url) => url.searchParams.get("screen") === secondId);
    await tabTo(page, viewer.getByRole("button", { name: "Copy link" }));
    const tooltip = viewer.locator("[role=tooltip][data-open]").filter({ hasText: "Copy link" });
    await tooltip.waitFor();
    await page.keyboard.press("ArrowLeft");
    await page.waitForURL((url) => url.searchParams.get("screen") === firstId);
    // Escape dismisses the tooltip first (WCAG 1.4.13); the viewer stays open.
    await page.keyboard.press("Escape");
    await tooltip.waitFor({ state: "detached" });
    assert.equal(await viewer.count(), 1, "only the tooltip closed");
    await pressed("true");

    await page.keyboard.press("z");
    await viewer.getByRole("button", { name: "Show at full width" }).waitFor();
    await page.keyboard.press("z");
    await viewer.getByRole("button", { name: "Fit to screen" }).waitFor();

    // A held key doesn't toggle the save back and forth. Saving updates the button in the same
    // task, so once the Z after it has taken effect, a repeat that got through would show.
    await page.keyboard.down("s");
    await page.keyboard.down("s"); // auto-repeat
    await page.keyboard.up("s");
    await page.keyboard.press("z");
    await viewer.getByRole("button", { name: "Show at full width" }).waitFor();
    assert.equal(await save.getAttribute("aria-pressed"), "false", "one press, one toggle");
    await page.keyboard.press("s");
    await pressed("true");

    await page.keyboard.press("Escape");
    await viewer.waitFor({ state: "detached" });
    await waitForFocus(tile, "focus returns to the tile that opened the viewer");
  });

  test("shortcuts pause under a dialog and only the top layer reacts", async () => {
    await page.keyboard.press("Enter");
    const viewer = page.getByRole("dialog").filter({ has: page.getByRole("complementary") });
    await viewer.waitFor();
    // ? stacks the help dialog on the viewer: S must not reach the viewer underneath.
    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await help.waitFor();
    // The viewer is inert (outside the accessibility tree) under the help: query it by CSS.
    const save = page
      .locator("[role=dialog]:has(aside) button[aria-pressed]")
      .filter({ hasText: /^Saved?$/u });
    // Neither S nor a page shortcut reaches past the help. Escape closing it is the sync point.
    await forgetNavigations(page);
    await page.keyboard.press("s");
    await shortcut(page, "g c");
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached" });
    assert.equal(await save.getAttribute("aria-pressed"), "true", "S under the help is ignored");
    await neverVisited(page, "/contribute", "g c is paused while a dialog is open");
    // With the help gone the viewer's keys are back.
    await page.keyboard.press("z");
    await viewer.getByRole("button", { name: "Fit to screen" }).waitFor();

    await page.keyboard.press("Escape");
    await viewer.waitFor({ state: "detached" });
  });

  test("searches from the palette and opens a result", async () => {
    await page.keyboard.press("/");
    const palette = page.getByRole("dialog", { name: "Search" });
    await palette.waitFor();
    const tree = await palette.ariaSnapshot();
    assert.ok(tree.includes("combobox"), "the search field is a combobox");
    await page.keyboard.type("pricing");
    await palette.getByRole("option", { name: "Search for “pricing”" }).waitFor();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/search\?q=pricing/u);
    const result = page.locator("main [data-screen-id]").first().getByRole("link").first();
    await tabTo(page, result);
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.searchParams.has("screen"));
    await page.keyboard.press("Escape");
    await page.waitForURL((url) => !url.searchParams.has("screen"));
  });

  test("creates, renames and deletes a collection by keyboard from Saved", async () => {
    await shortcut(page, "g s");
    await page.waitForURL(`${BASE}/saved`);
    await tabTo(page, page.getByRole("button", { name: "New collection" }));
    await page.keyboard.press("Enter");
    const create = page.getByRole("dialog");
    await create.waitFor();
    assert.ok(await isFocused(create.getByLabel("Name")), "the name field takes focus");
    await page.keyboard.type(COLLECTION);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/saved\/[^/]+$/u);
    await page.getByRole("heading", { name: COLLECTION }).waitFor();

    await tabTo(page, page.getByRole("button", { name: "Rename" }));
    await page.keyboard.press("Enter");
    const rename = page.getByRole("dialog");
    await rename.waitFor();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(`${COLLECTION} renamed`);
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: `${COLLECTION} renamed` }).waitFor();

    await tabTo(page, page.getByRole("button", { name: "Delete collection" }));
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("dialog", { name: /^Delete/u });
    await confirm.waitFor();
    await tabTo(page, confirm.getByRole("button", { name: "Delete collection" }));
    await page.keyboard.press("Enter");
    await page.waitForURL(`${BASE}/saved`);
  });

  test("contributes screens, reordering them with the keyboard", async () => {
    await shortcut(page, "g c");
    await page.waitForURL(`${BASE}/contribute`);
    // Listen first: Playwright needs a round trip to start intercepting the native file chooser.
    const chooser = page.waitForEvent("filechooser");
    await tabTo(page, page.getByRole("button", { name: /Drop screenshots here/u }));
    await page.keyboard.press("Enter");
    await (await chooser).setFiles(await makeScreenshots());
    await page.getByText("3 screens ready").waitFor();
    await tabTo(page, page.getByRole("button", { name: "Continue" }));
    await page.keyboard.press("Enter");

    // App step (the wizard focuses each new step for screen readers): type, arrow, Enter.
    const search = page.getByRole("combobox", { name: "Search apps" });
    await tabTo(page, search);
    await page.keyboard.type(APP_NAME);
    // The app was purged before the run: once the (debounced) search for it has answered, the
    // list offers to create it by name.
    const create = page.getByRole("option", { name: `Create “${APP_NAME}”` });
    await create.waitFor();
    // Arrow until it is the combobox's active descendant, then Enter picks it.
    const wanted = await create.getAttribute("id");
    for (let presses = 0; presses < 20; presses++) {
      if ((await search.getAttribute("aria-activedescendant")) === wanted) break;
      await page.keyboard.press("ArrowDown");
    }
    assert.equal(await search.getAttribute("aria-activedescendant"), wanted);
    await page.keyboard.press("Enter");
    await tabTo(page, page.getByLabel("Name"));
    assert.equal(await page.getByLabel("Name").inputValue(), APP_NAME, "the query names the app");
    await tabTo(page, page.getByLabel("Website"));
    await page.keyboard.type("https://keyboard.e2e.example.com");
    await tabTo(page, page.getByRole("button", { name: "Continue" }));
    await page.keyboard.press("Enter");

    for (const [index, title] of TITLES.entries()) {
      await tabTo(page, page.getByLabel(`Title for screen ${index + 1}`));
      await page.keyboard.type(title);
    }

    // dnd-kit's keyboard sensor: Space picks up, arrows move, Space drops.
    const handle = page.getByRole("button", { name: `Reorder ${TITLES[0]}` });
    await tabTo(page, handle, { back: true });
    // Each step waits for its announcement, as a screen reader user would. dnd-kit's live region
    // is visually hidden: wait for it in the DOM, not on screen.
    const announced = (text: string) => page.getByText(text).waitFor({ state: "attached" });
    await page.keyboard.press("Space");
    await announced(`${TITLES[0]} moved to position 1.`);
    await page.keyboard.press("ArrowDown");
    await announced(`${TITLES[0]} moved to position 2.`);
    await page.keyboard.press("Space");
    await announced(`${TITLES[0]} dropped at position 2.`);
    assert.equal(await page.getByLabel("Title for screen 1").inputValue(), TITLES[1]);
    assert.equal(await page.getByLabel("Title for screen 2").inputValue(), TITLES[0]);
    assert.ok(await isFocused(handle), "the handle keeps focus after the move");

    await tabTo(page, page.getByRole("button", { name: "Continue" }));
    await page.keyboard.press("Enter");
    const submit = page.getByRole("button", { name: "Submit 3 screens" });
    await tabTo(page, submit);
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Submitted for review" }).waitFor({ timeout: 30_000 });
  });

  test("settings tabs, the single-key switch and the extension connection by keyboard", async () => {
    await shortcut(page, "g ,");
    await page.waitForURL(`${BASE}/settings`);

    const toggle = page.getByRole("switch", { name: "Use single-key shortcuts" });
    await tabTo(page, toggle);
    await page.keyboard.press("Space");
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
    // Off: G S does nothing and the Saved hint goes; ⌘K right after proves the keys were handled.
    await forgetNavigations(page);
    await shortcut(page, "g s");
    const palette = page.getByRole("dialog", { name: "Search" });
    await page.keyboard.press("ControlOrMeta+k");
    await palette.waitFor();
    await page.keyboard.press("Escape");
    await palette.waitFor({ state: "detached" });
    await neverVisited(page, "/saved", "G S is off");
    assert.deepEqual(await accessible(page.getByRole("link", { name: "Saved" })), {
      name: "Saved",
      description: "",
    });
    await waitForFocus(toggle, "the palette hands focus back to the switch");
    await page.keyboard.press("Space");
    assert.equal(await toggle.getAttribute("aria-checked"), "true");

    await tabTo(page, page.getByRole("link", { name: "API keys" }), { back: true });
    await page.keyboard.press("Enter");
    await page.waitForURL(/tab=keys/u);
    await runCommand(page, "extension mcp", "Extension & MCP");
    await page.waitForURL(/tab=integrations/u);
    await runCommand(page, "connect", "Connect the browser extension");
    await page.waitForURL(`${BASE}/extension/connect`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.goBack();
    await page.waitForURL(/\/settings\?tab=integrations/u);
  });

  test("members get no review command and the queue stays protected", async () => {
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Search" });
    await palette.waitFor();
    await page.keyboard.type("review");
    await palette.getByRole("option").first().waitFor();
    assert.equal(await palette.getByRole("option", { name: /Review queue/u }).count(), 0);
    await page.keyboard.press("Escape");
    await palette.waitFor({ state: "detached" });

    await forgetNavigations(page);
    await shortcut(page, "g r");
    await shortcut(page, "g s");
    await page.waitForURL(`${BASE}/saved`);
    await neverVisited(page, "/review", "g r is not bound for members");
    assert.equal((await context.request.get(`${BASE}/review`)).status(), 404);
  });

  test("cleans up the saved screen", async () => {
    if (!viewedScreen) return;
    const response = await context.request.delete(
      `${BASE}/api/v1/saves?kind=screen&id=${viewedScreen}`,
      { headers: { origin: BASE } },
    );
    assert.equal(response.status(), 204);
  });
});

describe("admin review", WRITES, () => {
  let context: BrowserContext;
  let page: Page;
  const contributed: string[] = [];

  before(async () => {
    context = await newContext();
    page = await newPage(context);
  });

  after(async () => {
    // The approved screen and its app go with the purge after the run.
    await context.close();
  });

  test("reviews with J/K, R and A on the keyboard", async () => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD, "/browse/web");
    const queue = await (await context.request.get(`${BASE}/api/v1/review`)).json();
    for (const screen of queue.screens as { id: string; title: string | null }[]) {
      if (screen.title && TITLES.includes(screen.title)) contributed.push(screen.id);
    }
    assert.equal(contributed.length, 3, "the member's three screens are pending");

    await shortcut(page, "g r");
    await page.waitForURL(`${BASE}/review`);
    const list = page.getByRole("list", { name: "Pending items" });
    const row = (title: string) => list.getByRole("button", { name: new RegExp(title, "u") });
    const reviewing = (title: string) =>
      page.getByRole("article", { name: `Reviewing ${title}` }).waitFor();

    // Review keys only listen on the review page: A typed at the top bar's search does nothing.
    // Selecting a row right after is the sync point; an approval would have dropped a row.
    await row(TITLES[1]!).waitFor();
    const pending = await list.getByRole("button").count();
    await tabTo(page, page.getByRole("button", { name: /^Search Web/u }), { back: true });
    await page.keyboard.press("a");
    await tabTo(page, row(TITLES[1]!));
    await page.keyboard.press("Enter");
    await reviewing(TITLES[1]!);
    assert.equal(await list.getByRole("button").count(), pending, "A was ignored");

    // J/K move the cursor, and focus follows it through the queue.
    await page.keyboard.press("j");
    await page.waitForFunction(
      (element) => element?.getAttribute("aria-current") !== "true",
      await row(TITLES[1]!).elementHandle(),
    );
    await page.keyboard.press("k");
    await reviewing(TITLES[1]!);
    assert.ok(await isFocused(row(TITLES[1]!)), "focus follows J/K");

    const detail = page.getByRole("article", { name: `Reviewing ${TITLES[1]}` });
    const tree = await detail.ariaSnapshot();
    assert.ok(tree.includes('button "Reject"') && tree.includes('button "Approve"'), tree);
    assert.equal(
      await detail.getByRole("button", { name: "Approve" }).getAttribute("aria-keyshortcuts"),
      "A",
    );
    assert.equal(
      await detail.getByRole("button", { name: "Reject" }).getAttribute("aria-keyshortcuts"),
      "R",
    );

    // R opens the reason field (the R itself isn't typed), Escape returns to Reject.
    await page.keyboard.press("r");
    const reason = page.getByLabel(/Reason/u);
    await reason.waitFor();
    assert.ok(await isFocused(reason), "the reason field takes focus");
    assert.equal(await reason.inputValue(), "");
    await page.keyboard.press("Escape");
    await reason.waitFor({ state: "detached" });
    await waitForFocus(detail.getByRole("button", { name: "Reject" }), "focus returns to Reject");

    await page.keyboard.press("r");
    await reason.waitFor();
    await page.keyboard.type("Keyboard E2E");
    await page.keyboard.press("Enter");
    await row(TITLES[1]!).waitFor({ state: "detached" });
    await page.getByText("Screen rejected").waitFor();
    assert.ok(
      await page.evaluate(() => !!document.activeElement?.closest('[aria-label="Pending items"]')),
      "focus lands on the next item in the queue",
    );

    await tabTo(page, row(TITLES[0]!));
    await page.keyboard.press("Enter");
    await reviewing(TITLES[0]!);
    await page.keyboard.press("a");
    await row(TITLES[0]!).waitFor({ state: "detached" });
    await page.getByText("Screen approved").waitFor();
  });
});

describe("console", () => {
  test("logged no page errors", () => {
    assert.deepEqual(problems, []);
  });
});
