import { LIMITS, VIEWPORTS, type Viewport } from "@open-ui/core";
import type { Browser, Page } from "playwright-core";

import { createCaptureContext, ensureInPageHelpers, launchBrowser } from "./browser";
import {
  MAX_SCREEN_TEXT,
  extractMetadataInPage,
  visibleTextInPage,
  type ExtractedMetadata,
} from "./extract";
import { settlePage, type SettleOptions, type SettleReport } from "./settle";

export interface NavigateOptions {
  /** Navigation timeout, ms. Default 30000. */
  timeoutMs?: number;
  referer?: string;
}

export interface NavigateResult {
  url: string;
  status: number | null;
  title: string;
}

/** Navigate and wait for DOMContentLoaded + (bounded) load. Throws on network failure. */
export async function navigate(
  page: Page,
  url: string,
  options: NavigateOptions = {},
): Promise<NavigateResult> {
  const timeout = options.timeoutMs ?? 30_000;
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout,
    referer: options.referer,
  });
  await page
    .waitForLoadState("load", { timeout: Math.min(timeout, 15_000) })
    .catch(() => undefined);
  return {
    url: page.url(),
    status: response?.status() ?? null,
    title: await page.title().catch(() => ""),
  };
}

export async function extractMetadata(page: Page): Promise<ExtractedMetadata> {
  await ensureInPageHelpers(page);
  return page.evaluate(extractMetadataInPage);
}

export interface CaptureOptions {
  viewport?: Viewport;
  /** Device scale factor when capturing a URL (new context). Default: the viewport preset's. */
  deviceScaleFactor?: number;
  fullPage?: boolean;
  /** Capture one element instead of the viewport/page. */
  selector?: string;
  /** Full-page height cap in CSS px. Default: what fits the API image limit at this DPR. */
  maxHeight?: number;
  /** Navigate here first (when `target` is a page). */
  url?: string;
  navigation?: NavigateOptions;
  /** Settle options, or `false` to capture immediately. */
  settle?: SettleOptions | false;
  /** Collect visible text for search. Default true. */
  text?: boolean;
  /** Browser used when `target` is a URL; a temporary one is launched otherwise. */
  browser?: Browser;
  executablePath?: string;
}

export interface CaptureResult {
  png: Buffer;
  /** Image pixel size. */
  width: number;
  height: number;
  url: string;
  status: number | null;
  title: string;
  metadata: ExtractedMetadata;
  text: string;
  viewport: Viewport;
  deviceScaleFactor: number;
  fullPage: boolean;
  settle: SettleReport | null;
  capturedAt: string;
}

function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Capture a page as PNG. `target` is either an existing Playwright page (optionally navigated to
 * `options.url`) or a URL, in which case a fresh capture context is created (and closed).
 */
export async function capturePage(
  target: Page | string,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  if (typeof target === "string") {
    const ownBrowser = options.browser
      ? null
      : await launchBrowser({ executablePath: options.executablePath });
    const browser = options.browser ?? ownBrowser!;
    const context = await createCaptureContext(browser, {
      viewport: options.viewport,
      deviceScaleFactor: options.deviceScaleFactor,
    });
    try {
      const page = await context.newPage();
      return await capturePage(page, { ...options, url: target });
    } finally {
      await context.close().catch(() => undefined);
      await ownBrowser?.close().catch(() => undefined);
    }
  }

  const page = target;
  await ensureInPageHelpers(page);
  const viewport = options.viewport ?? "desktop";
  const fullPage = Boolean(options.fullPage) && !options.selector;
  let status: number | null = null;
  if (options.url) {
    const navigation = await navigate(page, options.url, options.navigation);
    status = navigation.status;
    await ensureInPageHelpers(page);
  }

  const deviceScaleFactor = await page
    .evaluate(() => window.devicePixelRatio)
    .catch(() => VIEWPORTS[viewport].deviceScaleFactor);
  const maxHeight =
    options.maxHeight ?? Math.floor(LIMITS.maxImageHeight / Math.max(1, deviceScaleFactor));

  const settle =
    options.settle === false
      ? null
      : await settlePage(page, {
          ...options.settle,
          scroll: options.settle?.scroll ?? (fullPage || Boolean(options.selector)),
          maxScrollHeight: options.settle?.maxScrollHeight ?? maxHeight,
        });

  const metadata = await page.evaluate(extractMetadataInPage);
  const text =
    options.text === false
      ? ""
      : await page
          .evaluate(visibleTextInPage, {
            mode: fullPage ? ("full" as const) : ("viewport" as const),
            selector: options.selector ?? null,
            maxChars: MAX_SCREEN_TEXT,
          })
          .catch(() => "");

  let png: Buffer;
  if (options.selector) {
    const locator = page.locator(options.selector).first();
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);
    png = await locator.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide",
      timeout: 15_000,
    });
  } else if (fullPage) {
    const size = await page.evaluate(() => {
      const scroller = document.scrollingElement || document.documentElement;
      return { width: window.innerWidth, height: scroller.scrollHeight };
    });
    const clipHeight = Math.max(1, Math.min(size.height, maxHeight));
    png = await page.screenshot({
      type: "png",
      fullPage: true,
      clip: { x: 0, y: 0, width: size.width, height: clipHeight },
      animations: "disabled",
      caret: "hide",
      timeout: 30_000,
    });
  } else {
    png = await page.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide",
      timeout: 15_000,
    });
  }

  const { width, height } = pngSize(png);
  return {
    png,
    width,
    height,
    url: metadata.url || page.url(),
    status,
    title: metadata.title,
    metadata,
    text,
    viewport,
    deviceScaleFactor,
    fullPage,
    settle,
    capturedAt: new Date().toISOString(),
  };
}
