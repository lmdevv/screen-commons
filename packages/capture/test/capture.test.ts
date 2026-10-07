import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  capturePage,
  crawl,
  createCaptureContext,
  createPageVisitor,
  extractMetadata,
  fetchLogo,
  findChrome,
  launchBrowser,
  type Browser,
} from "../src/index";
import { startFixtureSite, type FixtureSite } from "./fixture-server";

const chrome = findChrome();
let site: FixtureSite;
let browser: Browser | undefined;

beforeAll(async () => {
  site = await startFixtureSite();
  if (chrome) browser = await launchBrowser({ executablePath: chrome });
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, info.channels)].slice(0, 3);
}

describe.skipIf(!chrome)("capturePage (headless Chromium)", () => {
  it("captures a full page after loading lazy images and hiding overlays", async () => {
    const context = await createCaptureContext(browser!, { viewport: "desktop" });
    const page = await context.newPage();
    try {
      const result = await capturePage(page, { url: site.url, fullPage: true });
      expect(result.width).toBe(1440);
      // header (64) + h1 + 4 sections of 900px
      expect(result.height).toBeGreaterThan(3600);
      expect(result.fullPage).toBe(true);
      expect(result.status).toBe(200);
      expect(site.requests).toContain("/img/native.png");
      expect(site.requests).toContain("/img/observer.png");
      const images = await page.evaluate(() =>
        ["native-lazy", "io-lazy"].map((id) => {
          const image = document.getElementById(id) as HTMLImageElement;
          return { complete: image.complete, width: image.naturalWidth };
        }),
      );
      expect(images).toEqual([
        { complete: true, width: 400 },
        { complete: true, width: 400 },
      ]);
      const hidden = await page.evaluate(() =>
        ["#cookie-banner", ".custom-consent", ".dim", "#intercom-container"].map(
          (selector) => getComputedStyle(document.querySelector(selector)!).display,
        ),
      );
      expect(hidden).toEqual(["none", "none", "none", "none"]);
      // Sticky header is still there at the top of the capture.
      expect(await pixel(result.png, 5, 5)).toEqual([17, 17, 17]);
      expect(result.text).toContain("Bottom text far below the fold");
      expect(result.title).toBe("Fixture – Home");
    } finally {
      await context.close();
    }
  });

  it("captures the viewport at a custom device scale factor with viewport-only text", async () => {
    const result = await capturePage(site.url, { browser, deviceScaleFactor: 2 });
    expect([result.width, result.height]).toEqual([2880, 1800]);
    expect(result.deviceScaleFactor).toBe(2);
    expect(result.text).toContain("Above the fold text");
    expect(result.text).not.toContain("Bottom text far below the fold");
    expect(result.text).not.toContain("We use cookies");
    // bottom-centre would be the red cookie banner if it were visible
    const [r, g, b] = await pixel(result.png, 1440, 1750);
    expect(r === 255 && g === 0 && b === 0).toBe(false);
  });

  it("caps full-page height", async () => {
    const result = await capturePage(`${site.origin}/tall`, {
      browser,
      fullPage: true,
      maxHeight: 5000,
      settle: { scroll: false },
    });
    expect([result.width, result.height]).toEqual([1440, 5000]);
  });

  it("captures a single element", async () => {
    const result = await capturePage(site.url, { browser, selector: "#hero" });
    expect(result.width).toBe(1440);
    expect(Math.abs(result.height - 900)).toBeLessThanOrEqual(1);
    expect(result.text).toContain("Hero section");
  });

  it("captures mobile viewports with the preset DPR", async () => {
    const result = await capturePage(`${site.origin}/pricing`, { browser, viewport: "mobile" });
    expect(result.width).toBe(390 * 3);
    expect(Math.abs(result.height - 844 * 3)).toBeLessThanOrEqual(3);
  });

  it("extracts metadata with resolved, deduplicated same-origin links", async () => {
    const context = await createCaptureContext(browser!);
    const page = await context.newPage();
    try {
      await page.goto(site.url);
      const metadata = await extractMetadata(page);
      expect(metadata.url).toBe(site.url);
      expect(metadata.title).toBe("Fixture – Home");
      expect(metadata.description).toBe("Fixture page Fixture – Home");
      expect(metadata.siteName).toBe("Fixture");
      expect(metadata.themeColor).toBe("#112233");
      expect(metadata.lang).toBe("en");
      expect(metadata.ogImageUrl).toBe(`${site.origin}/og.png`);
      expect(metadata.faviconUrl).toBe(`${site.origin}/favicon-32.png`);
      expect(metadata.icons[0]?.url).toBe(`${site.origin}/apple-touch-icon.png`);
      expect(metadata.headings).toContain("Fixture landing");
      const urls = metadata.links.map((link) => link.url);
      expect(new Set(urls).size).toBe(urls.length);
      expect(urls).toContain(`${site.origin}/about`);
      expect(urls).toContain(`${site.origin}/signup`);
      expect(urls.every((url) => url.startsWith(site.origin))).toBe(true);
      expect(urls.some((url) => url.includes("#"))).toBe(false);
      expect(metadata.links.find((link) => link.url === `${site.origin}/pricing`)?.text).toBe(
        "Pricing",
      );

      const logo = await fetchLogo(metadata);
      expect(logo?.type).toBe("image/png");
      expect(logo?.width).toBe(180);
    } finally {
      await context.close();
    }
  });

  it("crawls client-side with a page visitor", async () => {
    const context = await createCaptureContext(browser!);
    const page = await context.newPage();
    try {
      const pages = await crawl(site.url, {
        visit: createPageVisitor(page),
        maxPages: 4,
        delayMs: 0,
      });
      expect(pages.map((entry) => new URL(entry.url).pathname)).toEqual([
        "/",
        "/pricing",
        "/login",
        "/signup",
      ]);
    } finally {
      await context.close();
    }
  });
});
