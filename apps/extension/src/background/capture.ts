import { base64ToBytes, readImageHeader } from "@open-ui/core/utils";
import { browser, type Browser } from "wxt/browser";

import { planCapture, planStitchTiles, tilePlacement, type Rect } from "../lib/geometry";
import type { FullPageMethod } from "../lib/settings";
import {
  CaptureError,
  IS_FIREFOX,
  ensureActive,
  getTab,
  isCapturableUrl,
  runInPage,
  sleep,
} from "./browser-utils";
import { emulationFor, withDebugger } from "./debugger";
import { composeTiles, cropToPng, dataUrlToBlob, decode, type EncodedImage } from "./image";
import {
  collectText,
  findElement,
  hideFixedElements,
  pageMetrics,
  prepareFullPage,
  restoreFixedElements,
  scrollToPosition,
  type ElementTarget,
  type PageMetrics,
} from "./page-scripts";

export interface CaptureOptions {
  method: FullPageMethod;
  lazyLoad: boolean;
}

export interface RawCapture {
  image: EncodedImage;
  /** CSS viewport width the page was rendered at (decides desktop vs mobile thumbnails). */
  viewportWidth: number;
  truncated: boolean;
  text: string;
  tab: Browser.tabs.Tab;
}

const LAZY_BUDGET_MS = 8000;

// --- captureVisibleTab throttle (Chrome allows 2 calls/s) -------------------------------------
let lastVisibleCapture = 0;
let visibleQueue: Promise<unknown> = Promise.resolve();

function captureVisibleTab(windowId: number): Promise<string> {
  const run = async () => {
    const wait = lastVisibleCapture + 550 - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await browser.tabs.captureVisibleTab(windowId, { format: "png" });
    } finally {
      lastVisibleCapture = Date.now();
    }
  };
  const next = visibleQueue.then(run, run);
  visibleQueue = next.catch(() => undefined);
  return next;
}

type FirefoxTabs = {
  captureTab(
    tabId: number,
    options: { format: "png"; rect?: Rect; scale?: number },
  ): Promise<string>;
};

function firefoxCaptureTab(tabId: number, rect?: Rect, scale?: number): Promise<string> {
  return (browser.tabs as unknown as FirefoxTabs).captureTab(tabId, {
    format: "png",
    ...(rect ? { rect } : {}),
    ...(scale ? { scale } : {}),
  });
}

async function resolveTab(tabId: number): Promise<Browser.tabs.Tab> {
  const tab = await getTab(tabId);
  if (!isCapturableUrl(tab.url)) {
    throw new CaptureError(
      "This page can’t be captured (browser pages and extension stores are protected).",
      "restricted_page",
    );
  }
  return tab;
}

function checkDimensions(image: EncodedImage, expected: { width: number; height: number }) {
  if (Math.abs(image.width - expected.width) > 2 || Math.abs(image.height - expected.height) > 2) {
    console.warn("[open-ui] capture size differs from plan", {
      got: [image.width, image.height],
      expected,
    });
  }
}

// --- Visible ------------------------------------------------------------------------------------

export async function captureVisible(tabId: number): Promise<RawCapture> {
  const tab = await resolveTab(tabId);
  const metrics = await runInPage(tabId, pageMetrics);
  const text = await runInPage(tabId, collectText, "visible");
  let image: EncodedImage;
  if (!IS_FIREFOX && emulationFor(tabId)) {
    image = await withDebugger(tabId, async (send) => {
      const { data } = await send<{ data: string }>("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      return decodeBase64Png(data);
    });
  } else {
    await ensureActive(tab);
    const dataUrl = IS_FIREFOX
      ? await firefoxCaptureTab(tabId)
      : await captureVisibleTab(tab.windowId);
    image = await dataUrlPng(dataUrl);
  }
  return { image, viewportWidth: metrics.viewportWidth, truncated: false, text, tab };
}

async function dataUrlPng(dataUrl: string): Promise<EncodedImage> {
  const blob = dataUrlToBlob(dataUrl);
  const header = readImageHeader(new Uint8Array(await blob.slice(0, 64).arrayBuffer()));
  if (!header) throw new CaptureError("The browser returned an unreadable image");
  return { blob, type: header.type, width: header.width, height: header.height };
}

function decodeBase64Png(base64: string): EncodedImage {
  const bytes = base64ToBytes(base64);
  const header = readImageHeader(bytes);
  if (!header) throw new CaptureError("The browser returned an unreadable image");
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: header.type });
  return { blob, type: header.type, width: header.width, height: header.height };
}

// --- Full page ----------------------------------------------------------------------------------

export async function captureFullPage(tabId: number, options: CaptureOptions): Promise<RawCapture> {
  const tab = await resolveTab(tabId);
  const metrics = await runInPage(tabId, prepareFullPage, {
    lazyLoad: options.lazyLoad,
    budgetMs: LAZY_BUDGET_MS,
  });
  const text = await runInPage(tabId, collectText, "full");
  let result: { image: EncodedImage; truncated: boolean } | undefined;
  if (options.method === "auto") {
    try {
      result = IS_FIREFOX
        ? await fullPageFirefox(tabId, metrics)
        : await fullPageCdp(tabId, metrics);
    } catch (error) {
      if (error instanceof CaptureError && error.code === "restricted_page") throw error;
      console.warn("[open-ui] full-page capture failed, falling back to stitching", error);
    }
  }
  result ??= await fullPageStitched(tab, metrics);
  return { ...result, viewportWidth: metrics.viewportWidth, text, tab };
}

async function fullPageCdp(tabId: number, metrics: PageMetrics) {
  return withDebugger(tabId, async (send) => {
    const layout = await send<{
      cssContentSize?: { width: number; height: number };
      contentSize: { width: number; height: number };
    }>("Page.getLayoutMetrics");
    const size = layout.cssContentSize ?? layout.contentSize;
    const plan = planCapture(
      { x: 0, y: 0, width: size.width, height: Math.max(size.height, metrics.height) },
      metrics.dpr,
    );
    const { data } = await send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { ...plan.clip, scale: plan.scale },
    });
    const image = decodeBase64Png(data);
    checkDimensions(image, { width: plan.outputWidth, height: plan.outputHeight });
    return { image, truncated: plan.truncated };
  });
}

async function fullPageFirefox(tabId: number, metrics: PageMetrics) {
  const plan = planCapture(
    { x: 0, y: 0, width: metrics.width, height: metrics.height },
    metrics.dpr,
  );
  const image = await dataUrlPng(await firefoxCaptureTab(tabId, plan.clip, plan.scale));
  checkDimensions(image, { width: plan.outputWidth, height: plan.outputHeight });
  return { image, truncated: plan.truncated };
}

/** Scroll-and-stitch with captureVisibleTab: ≤2 captures/s, fixed elements hidden after tile 1. */
async function fullPageStitched(tab: Browser.tabs.Tab, metrics: PageMetrics) {
  const tabId = tab.id!;
  await ensureActive(tab);
  const original = { x: metrics.scrollX, y: metrics.scrollY };
  const positions = planStitchTiles(metrics.height, metrics.viewportHeight);
  const tiles: { bitmap: ImageBitmap; destY: number; srcHeight: number }[] = [];
  try {
    let ratio = 0;
    let canvasWidth = 0;
    let canvasHeight = 0;
    let truncated = false;
    for (const [index, position] of positions.entries()) {
      const { scrollY } = await runInPage(tabId, scrollToPosition, 0, position);
      if (index === 1) await runInPage(tabId, hideFixedElements);
      await sleep(index === 0 ? 50 : 150);
      const dataUrl = await captureVisibleTab(tab.windowId);
      const bitmap = await decode(dataUrlToBlob(dataUrl));
      if (index === 0) {
        ratio = bitmap.width / metrics.viewportWidth;
        // Same output limits as the native paths.
        const plan = planCapture(
          { x: 0, y: 0, width: metrics.viewportWidth, height: metrics.height },
          ratio,
          {
            maxHeight: 16_384,
          },
        );
        canvasWidth = bitmap.width;
        canvasHeight = Math.min(
          Math.round(metrics.height * ratio),
          Math.round(plan.clip.height * ratio),
        );
        truncated = plan.truncated;
      }
      const placement = tilePlacement(scrollY, bitmap.height, ratio, canvasHeight);
      if (!placement) {
        bitmap.close();
        break;
      }
      tiles.push({ bitmap, ...placement });
    }
    const image = await composeTiles(canvasWidth, canvasHeight, tiles);
    return { image, truncated };
  } finally {
    for (const tile of tiles) tile.bitmap.close();
    await runInPage(tabId, restoreFixedElements).catch(() => undefined);
    await runInPage(tabId, scrollToPosition, original.x, original.y).catch(() => undefined);
  }
}

// --- Element ------------------------------------------------------------------------------------

async function locate(
  tabId: number,
  selector: string,
  scrollIntoView: boolean,
): Promise<ElementTarget> {
  const target = await runInPage(tabId, findElement, selector, scrollIntoView);
  if (!target) throw new CaptureError("The page did not respond.");
  if ("error" in target) throw new CaptureError(target.error, "element_not_found");
  return target;
}

export async function captureElement(
  tabId: number,
  selector: string,
  options: CaptureOptions,
): Promise<RawCapture> {
  const tab = await resolveTab(tabId);
  const target = await locate(tabId, selector, false);
  const { rect, metrics, text } = target;

  if (options.method === "auto") {
    try {
      if (IS_FIREFOX) {
        const plan = planCapture(rect, metrics.dpr);
        const image = await dataUrlPng(await firefoxCaptureTab(tabId, plan.clip, plan.scale));
        return {
          image,
          viewportWidth: metrics.viewportWidth,
          truncated: plan.truncated,
          text,
          tab,
        };
      }
      return await withDebugger(tabId, async (send) => {
        const plan = planCapture(rect, metrics.dpr);
        const { data } = await send<{ data: string }>("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: true,
          clip: { ...plan.clip, scale: plan.scale },
        });
        const image = decodeBase64Png(data);
        checkDimensions(image, { width: plan.outputWidth, height: plan.outputHeight });
        return {
          image,
          viewportWidth: metrics.viewportWidth,
          truncated: plan.truncated,
          text,
          tab,
        };
      });
    } catch (error) {
      console.warn("[open-ui] element capture failed, falling back to viewport crop", error);
    }
  }

  // Fallback: element fits the viewport → scroll to it and crop one visible capture;
  // otherwise crop out of a stitched full page.
  if (rect.height <= metrics.viewportHeight && rect.width <= metrics.viewportWidth) {
    await ensureActive(tab);
    const original = { x: metrics.scrollX, y: metrics.scrollY };
    try {
      const scrolled = await locate(tabId, selector, true);
      const dataUrl = await captureVisibleTab(tab.windowId);
      const bitmap = await decode(dataUrlToBlob(dataUrl));
      const ratio = bitmap.width / scrolled.metrics.viewportWidth;
      const v = scrolled.viewportRect;
      const image = await cropToPng(bitmap, {
        x: v.x * ratio,
        y: v.y * ratio,
        width: v.width * ratio,
        height: v.height * ratio,
      });
      bitmap.close();
      return { image, viewportWidth: metrics.viewportWidth, truncated: false, text, tab };
    } finally {
      await runInPage(tabId, scrollToPosition, original.x, original.y).catch(() => undefined);
    }
  }
  const full = await fullPageStitched(tab, metrics);
  const bitmap = await decode(full.image.blob);
  const ratio = bitmap.width / metrics.viewportWidth;
  const image = await cropToPng(bitmap, {
    x: rect.x * ratio,
    y: rect.y * ratio,
    width: rect.width * ratio,
    height: rect.height * ratio,
  });
  bitmap.close();
  return { image, viewportWidth: metrics.viewportWidth, truncated: full.truncated, text, tab };
}
