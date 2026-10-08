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
 * Data: signs up a fresh member each run. Their collection is deleted, their contributed screens
 * are rejected at the end; the "E2E Keyboard Test" app row is reused across runs.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import playwright, {
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const ADMIN_EMAIL = process.env.E2E_EMAIL ?? "admin@screencommons.dev";
const ADMIN_PASSWORD = process.env.E2E_PASSWORD ?? "screencommons-admin-2026";
const CHROME = process.env.CHROME_PATH ?? "/run/current-system/sw/bin/chromium";
const STAMP = Date.now().toString(36);
const MEMBER = {
  name: "E2E Keyboard",
  email: `e2e-kb-${STAMP}@example.com`,
  password: `pw-${STAMP}-e2e`,
};
const APP_NAME = "E2E Keyboard Test";
const COLLECTION = `Keys ${STAMP}`;
const TITLES = ["Alpha", "Beta", "Gamma"].map((title) => `${title} ${STAMP}`);

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
});

after(async () => {
  await browser?.close();
});

describe("public pages, signed out", () => {
  let context: BrowserContext;
  let page: Page;

  before(async () => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

  test("? opens the shortcut help, announced with its sections", async () => {
    await page.locator("body").press("?");
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

    await shortcut(page, "g s");
    await page.waitForTimeout(300);
    assert.equal(page.url(), `${BASE}/`, "g s is not bound signed out");

    for (const path of ["/saved", "/review"]) {
      await page.goto(`${BASE}${path}`);
      await page.waitForURL(/\/sign-in\?redirect=/u);
    }
  });
});

describe("member: browse, search, view, save, contribute, settings", () => {
  let context: BrowserContext;
  let page: Page;
  let viewedScreen = "";

  before(async () => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

  test("the shell is announced with landmarks, names and shortcut hints", async () => {
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
    assert.equal(
      await save.getAttribute("aria-pressed"),
      "false",
      "a new member has nothing saved",
    );
    await page.keyboard.press("s");
    await page.waitForFunction(
      (element) => element?.getAttribute("aria-pressed") === "true",
      await save.elementHandle(),
    );
    await page.keyboard.press("z");
    await viewer.getByRole("button", { name: "Show at full width" }).waitFor();
    await page.keyboard.press("z");
    await viewer.getByRole("button", { name: "Fit to screen" }).waitFor();

    // A held key doesn't toggle the save back and forth.
    await page.keyboard.down("s");
    await page.keyboard.down("s"); // auto-repeat
    await page.keyboard.up("s");
    await page.waitForTimeout(300);
    assert.equal(await save.getAttribute("aria-pressed"), "false", "one press, one toggle");
    await page.keyboard.press("s");
    await page.waitForFunction(
      (element) => element?.getAttribute("aria-pressed") === "true",
      await save.elementHandle(),
    );

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
    await page.keyboard.press("s");
    await page.waitForTimeout(300);
    assert.equal(await save.getAttribute("aria-pressed"), "true", "S under the help is ignored");
    // Nor do page shortcuts run while dialogs are open.
    await shortcut(page, "g c");
    await page.waitForTimeout(300);
    assert.ok(!page.url().includes("/contribute"), "g c is paused while a dialog is open");

    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached" });
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
    await page.waitForTimeout(400); // debounced search
    const existing = page.getByRole("option", { name: new RegExp(`^${APP_NAME}`, "u") });
    const create = page.getByRole("option", { name: /Create/u });
    await create.waitFor();
    const reuse = (await existing.count()) > 0;
    // Arrow until the wanted row is the combobox's active descendant, then Enter picks it.
    const wanted = await (reuse ? existing.first() : create).getAttribute("id");
    for (let presses = 0; presses < 20; presses++) {
      if ((await search.getAttribute("aria-activedescendant")) === wanted) break;
      await page.keyboard.press("ArrowDown");
    }
    assert.equal(await search.getAttribute("aria-activedescendant"), wanted);
    await page.keyboard.press("Enter");
    if (!reuse) {
      await tabTo(page, page.getByLabel("Name"));
      await page.keyboard.type(APP_NAME);
      await tabTo(page, page.getByLabel("Website"));
      await page.keyboard.type("https://keyboard.e2e.example.com");
    }
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

  test("settings tabs and the extension connection by keyboard", async () => {
    await shortcut(page, "g ,");
    await page.waitForURL(`${BASE}/settings`);
    await tabTo(page, page.getByRole("link", { name: "API keys" }));
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

    const before = page.url();
    await shortcut(page, "g r");
    await page.waitForTimeout(300);
    assert.equal(page.url(), before, "g r is not bound for members");
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

describe("admin review", () => {
  let context: BrowserContext;
  let page: Page;
  const contributed: string[] = [];

  before(async () => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await newPage(context);
  });

  after(async () => {
    // Leave the library as we found it: reject whatever this run contributed.
    for (const id of contributed)
      await context.request.post(`${BASE}/api/v1/review/screen/${id}`, {
        data: { decision: "reject", reason: "E2E cleanup" },
        headers: { origin: BASE },
      });
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

    await tabTo(page, row(TITLES[1]!));
    await page.keyboard.press("Enter");
    await reviewing(TITLES[1]!);

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
