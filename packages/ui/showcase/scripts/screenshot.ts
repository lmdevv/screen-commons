/**
 * Screenshots of the showcase for visual review: pages × light/dark × desktop/mobile.
 * Starts its own Vite dev server, so nothing needs to be running.
 *
 *   pnpm --filter @open-ui/ui showcase:shoot              # everything
 *   pnpm --filter @open-ui/ui showcase:shoot discover app # only shots whose name matches
 *
 * Output: showcase/.screenshots/<name>.png (gitignored). Exits non-zero on console errors.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright-core";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", ".screenshots");
mkdirSync(outDir, { recursive: true });

interface Shot {
  name: string;
  hash: string;
  fullPage?: boolean;
  /** Run after load (open a menu, press a key…). */
  act?: (page: Page) => Promise<void>;
  viewports?: ("desktop" | "mobile")[];
  themes?: ("light" | "dark")[];
  /** Also save each `section[id]` as its own image. */
  sections?: boolean;
}

/** Scroll to the bottom and back so lazy images load before a full-page capture. */
async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(200);
}

const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

const shots: Shot[] = [
  { name: "discover", hash: "/discover" },
  { name: "discover-screens", hash: "/discover?tab=screens", themes: ["light"] },
  { name: "discover-mobile-apps", hash: "/discover?platform=ios", viewports: ["desktop"], themes: ["light"] },
  { name: "discover-flows", hash: "/discover?tab=flows", viewports: ["desktop"], themes: ["light"] },
  {
    name: "discover-selection",
    hash: "/discover?tab=screens",
    viewports: ["desktop"],
    themes: ["light"],
    act: async (page) => {
      const boxes = page.getByRole("checkbox", { name: /^Select / });
      await boxes.nth(0).click({ force: true });
      await boxes.nth(2).click({ force: true });
      await page.mouse.move(700, 500);
      await page.waitForTimeout(300);
    },
  },
  { name: "app", hash: "/app?app=northwind", fullPage: true, viewports: ["desktop"] },
  { name: "app-mobile-platform", hash: "/app?app=tally", viewports: ["desktop"], themes: ["light"] },
  { name: "viewer", hash: "/app?app=northwind&screen=scr_northwind-landing" },
  { name: "viewer-mobile-app", hash: "/app?app=tally&screen=scr_tally-home", viewports: ["desktop"], themes: ["light"] },
  { name: "flow", hash: "/flow" },
  { name: "flow-web", hash: "/flow?flow=flow_northwind_login&platform=web", viewports: ["desktop"], themes: ["dark"] },
  {
    name: "palette",
    hash: "/discover",
    act: async (page) => {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(350);
    },
  },
  {
    name: "account-menu",
    hash: "/discover",
    viewports: ["desktop"],
    act: async (page) => {
      await page.getByRole("button", { name: /Account menu/ }).click();
      await page.waitForTimeout(300);
    },
  },
  { name: "components", hash: "/components", fullPage: true, sections: true, viewports: ["desktop"] },
  { name: "components-mobile", hash: "/components", fullPage: true, viewports: ["mobile"], themes: ["light"] },
  {
    name: "focus",
    hash: "/discover",
    viewports: ["desktop"],
    themes: ["light", "dark"],
    act: async (page) => {
      for (let i = 0; i < 4; i += 1) await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
    },
  },
];

const filters = process.argv.slice(2);
const selected = filters.length ? shots.filter((s) => filters.some((f) => s.name.includes(f))) : shots;

const server = await createServer({
  configFile: join(here, "..", "vite.config.ts"),
  server: { port: 5199, strictPort: false },
  logLevel: "error",
});
await server.listen();
const base = server.resolvedUrls?.local[0] ?? "http://localhost:5199/";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/run/current-system/sw/bin/chromium",
});
const errors: string[] = [];

try {
  for (const shot of selected) {
    for (const viewport of shot.viewports ?? ["desktop", "mobile"]) {
      for (const theme of shot.themes ?? ["light", "dark"]) {
        const context = await browser.newContext({
          viewport: viewports[viewport],
          deviceScaleFactor: viewport === "mobile" ? 2 : 1,
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        page.on("console", (message) => {
          if (message.type() === "error" || message.type() === "warning") {
            errors.push(`[${shot.name}/${viewport}/${theme}] ${message.type()}: ${message.text()}`);
          }
        });
        page.on("pageerror", (error) => errors.push(`[${shot.name}] pageerror: ${error.message}`));
        await page.goto(`${base}?theme=${theme}#${shot.hash}`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);
        if (shot.fullPage) await scrollThrough(page);
        await shot.act?.(page);
        if (shot.sections) {
          for (const id of await page.$$eval("section[id]", (els) => els.map((el) => el.id))) {
            const sectionFile = join(outDir, `${shot.name}-${id}-${viewport}-${theme}.png`);
            await page.locator(`#${id}`).screenshot({ path: sectionFile });
          }
        }
        const file = join(outDir, `${shot.name}-${viewport}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });
        console.log(file);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (errors.length) {
  console.error(`\n${errors.length} console message(s):\n${[...new Set(errors)].join("\n")}`);
  process.exitCode = 1;
}
