/**
 * Renders the synthetic mock pages (see mock-pages.ts) with playwright-core + system Chromium and
 * writes small WebP "screenshots" + SVG app icons to showcase/public/mock/.
 *
 *   pnpm --filter @open-ui/ui showcase:mocks
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

import { appIconSvg, brands, mockPages } from "./mock-pages.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "mock");
const fontUrl = pathToFileURL(
  join(
    here,
    "..",
    "..",
    "node_modules",
    "@fontsource-variable",
    "inter",
    "files",
    "inter-latin-wght-normal.woff2",
  ),
).href;
const executablePath = process.env.CHROME_PATH ?? "/run/current-system/sw/bin/chromium";
const MAX_BYTES = 150 * 1024;

mkdirSync(join(outDir, "logos"), { recursive: true });
for (const brand of Object.values(brands)) {
  writeFileSync(join(outDir, "logos", `${brand.slug}.svg`), appIconSvg(brand));
}

const tmp = mkdtempSync(join(tmpdir(), "ou-mocks-"));
const browser = await chromium.launch({ executablePath, args: ["--font-render-hinting=none"] });
const encoder = await (await browser.newContext()).newPage();

async function toWebp(png: Buffer): Promise<Buffer> {
  for (const quality of [0.84, 0.76, 0.66, 0.56]) {
    const dataUrl = await encoder.evaluate(
      async ({ b64, quality: q }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${b64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d")!.drawImage(image, 0, 0);
        return canvas.toDataURL("image/webp", q);
      },
      { b64: png.toString("base64"), quality },
    );
    const buffer = Buffer.from(dataUrl.split(",")[1]!, "base64");
    if (buffer.length <= MAX_BYTES) return buffer;
  }
  throw new Error("could not encode under the size budget");
}

const manifest: Record<string, { width: number; height: number; bytes: number }> = {};
for (const page of mockPages()) {
  const context = await browser.newContext({
    viewport: { width: page.width, height: page.height },
    deviceScaleFactor: page.scale,
  });
  const tab = await context.newPage();
  const file = join(tmp, page.file.replace(".webp", ".html"));
  writeFileSync(file, page.html.replace("INTER_URL", fontUrl));
  await tab.goto(pathToFileURL(file).href);
  await tab.evaluate(() => document.fonts.ready);
  const png = await tab.screenshot({ fullPage: page.fullPage ?? false, type: "png" });
  const webp = await toWebp(png);
  writeFileSync(join(outDir, page.file), webp);
  const size = await tab.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  manifest[page.file] = {
    width: page.width,
    height: page.fullPage ? size.height : page.height,
    bytes: webp.length,
  };
  console.log(`${page.file.padEnd(28)} ${(webp.length / 1024).toFixed(0).padStart(4)} KB`);
  await context.close();
}

writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
rmSync(tmp, { recursive: true, force: true });
