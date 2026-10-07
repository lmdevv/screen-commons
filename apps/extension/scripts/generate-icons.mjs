#!/usr/bin/env node
// Renders the extension icons (public/icon/{16,32,48,128}.png) from one SVG mark with the
// system Chromium. Run with `pnpm --filter @open-ui/extension icons` after changing the mark.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.CHROME_PATH ?? "/run/current-system/sw/bin/chromium";

/** Black squircle with a white rounded-square frame: a screen, abstracted. */
function mark(size) {
  // Thicker strokes at small sizes keep the frame legible in the toolbar.
  const stroke = size <= 16 ? 3.6 : size <= 32 ? 3.2 : 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="8" fill="#0a0a0a"/>
    <rect x="8" y="8" width="16" height="16" rx="4.5" fill="none" stroke="#ffffff" stroke-width="${stroke}"/>
  </svg>`;
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await mkdir(join(root, "public/icon"), { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${mark(size)}</body></html>`,
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
