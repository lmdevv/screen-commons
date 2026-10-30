#!/usr/bin/env node
// Renders the extension icons (public/icon/{16,32,48,128}.png) from the website favicon with
// system Chromium. Run with `pnpm --filter @screen-commons/extension icons` after changing the mark.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.CHROME_PATH ?? "/run/current-system/sw/bin/chromium";
const favicon = await readFile(join(root, "../../packages/ui/src/assets/logo.svg"), "utf8");

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  // PNG extension icons use the favicon's light-theme color with a transparent background.
  await page.emulateMedia({ colorScheme: "light" });
  await mkdir(join(root, "public/icon"), { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    const mark = favicon.replace("<svg ", `<svg width="${size}" height="${size}" `);
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${mark}</body></html>`,
    );
    const png = await page.locator("svg").screenshot({ omitBackground: true });
    const file = join(root, `public/icon/${size}.png`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, png);
    console.log("wrote", file, png.length, "bytes");
  }
} finally {
  await browser.close();
}
