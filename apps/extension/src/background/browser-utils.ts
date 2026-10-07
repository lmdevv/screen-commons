import { browser, type Browser } from "wxt/browser";

export const IS_FIREFOX = import.meta.env.FIREFOX;

export class CaptureError extends Error {
  readonly code: string;
  constructor(message: string, code = "capture_failed") {
    super(message);
    this.name = "CaptureError";
    this.code = code;
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Run a self-contained function in the page and return its result. */
export async function runInPage<Args extends unknown[], Result>(
  tabId: number,
  func: (...args: Args) => Result | Promise<Result>,
  ...args: Args
): Promise<Result> {
  let results: Browser.scripting.InjectionResult[];
  try {
    results = (await browser.scripting.executeScript({
      target: { tabId },
      func: func as never,
      args: args as never,
    })) as Browser.scripting.InjectionResult[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /cannot (access|be scripted)|chrome:\/\/|extensions gallery|webstore|Missing host permission|about:/iu.test(
        message,
      )
    ) {
      throw new CaptureError(
        "This page can’t be captured (browser pages and extension stores are protected).",
        "restricted_page",
      );
    }
    throw new CaptureError(message);
  }
  const first = results[0] as (Browser.scripting.InjectionResult & { error?: unknown }) | undefined;
  if (!first) throw new CaptureError("The page did not respond.");
  if (first.error) {
    const error = first.error as { message?: string } | string;
    throw new CaptureError(
      typeof error === "string" ? error : (error.message ?? "Script failed in page"),
      "page_error",
    );
  }
  return first.result as Result;
}

export async function getTab(tabId: number): Promise<Browser.tabs.Tab> {
  try {
    return await browser.tabs.get(tabId);
  } catch {
    throw new CaptureError(`Tab ${tabId} does not exist`, "tab_not_found");
  }
}

export async function activeTab(): Promise<Browser.tabs.Tab> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new CaptureError("No active tab", "tab_not_found");
  return tab;
}

export function isCapturableUrl(url: string | undefined): boolean {
  return Boolean(url && /^(https?|file):/iu.test(url));
}

/** Bring a tab to the front of its window (captureVisibleTab only sees the active tab). */
export async function ensureActive(tab: Browser.tabs.Tab): Promise<void> {
  if (tab.active || tab.id === undefined) return;
  await browser.tabs.update(tab.id, { active: true });
  await sleep(250);
}

/** Wait until a tab finishes loading (status "complete"), with a timeout. */
export function waitForTabLoad(tabId: number, timeoutMs = 30_000): Promise<Browser.tabs.Tab> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      if (error) reject(error);
      else void browser.tabs.get(tabId).then(resolve, reject);
    };
    const onUpdated = (id: number, info: Browser.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === "complete") finish();
    };
    const onRemoved = (id: number) => {
      if (id === tabId) finish(new CaptureError("The tab was closed", "tab_closed"));
    };
    const timer = setTimeout(
      () => finish(new CaptureError("Timed out waiting for the page to load", "timeout")),
      timeoutMs,
    );
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
    void browser.tabs.get(tabId).then(
      (tab) => {
        if (tab.status === "complete" && tab.url && tab.url !== "about:blank") finish();
      },
      () => finish(new CaptureError("The tab was closed", "tab_closed")),
    );
  });
}

/** `action` (MV3) or `browserAction` (Firefox MV2). */
export function actionApi(): typeof browser.action | undefined {
  return (browser.action ??
    (browser as unknown as { browserAction?: typeof browser.action }).browserAction) as
    | typeof browser.action
    | undefined;
}
