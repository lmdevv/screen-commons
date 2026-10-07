import { VIEWPORTS, type BridgeMethods, type TabInfo } from "@open-ui/core/bridge";
import { browser, type Browser } from "wxt/browser";

import type { BridgeRequest } from "../lib/bridge-protocol";
import { getSettings } from "../lib/storage";
import {
  CaptureError,
  IS_FIREFOX,
  activeTab,
  getTab,
  isCapturableUrl,
  runInPage,
  sleep,
  waitForTabLoad,
} from "./browser-utils";
import { captureElement, captureFullPage, captureVisible } from "./capture";
import { setEmulation } from "./debugger";
import { blobToBase64 } from "./image";
import { extractMetadata } from "./page-scripts";

/** Tab the agent is driving (last `navigate` target). Requests without `tabId` use it. */
let bridgeTabId: number | null = null;

export function initBridgeHandlers() {
  browser.tabs.onRemoved.addListener((tabId) => {
    if (tabId === bridgeTabId) bridgeTabId = null;
  });
}

async function targetTab(tabId?: number): Promise<Browser.tabs.Tab> {
  if (tabId !== undefined) return getTab(tabId);
  if (bridgeTabId !== null) {
    try {
      return await browser.tabs.get(bridgeTabId);
    } catch {
      bridgeTabId = null;
    }
  }
  return activeTab();
}

async function navigate(
  params: BridgeMethods["navigate"]["params"],
): Promise<BridgeMethods["navigate"]["result"]> {
  let tab: Browser.tabs.Tab | undefined;
  if (!params.newTab && bridgeTabId !== null)
    tab = await browser.tabs.get(bridgeTabId).catch(() => undefined);

  if (IS_FIREFOX && params.viewport === "mobile") {
    // No device emulation on Firefox: best effort with a phone-sized popup window.
    const size = VIEWPORTS.mobile;
    const win = await browser.windows.create({
      url: params.url,
      type: "popup",
      width: size.width + 16,
      height: size.height + 88,
    });
    tab = win?.tabs?.[0];
    if (!tab?.id) throw new CaptureError("Could not open a window", "navigate_failed");
  } else if (!tab) {
    tab = await browser.tabs.create({ url: "about:blank", active: true });
  }
  const tabId = tab.id!;
  bridgeTabId = tabId;

  if (!IS_FIREFOX) {
    // Explicit viewport → emulate it (1440x900 desktop / 390x844@3x mobile); none → real window.
    await setEmulation(tabId, params.viewport ?? null);
  }
  if (!(IS_FIREFOX && params.viewport === "mobile")) {
    await browser.tabs.update(tabId, { url: params.url, active: true });
  }
  // Give the navigation a moment to start so we don't resolve on the previous document.
  await sleep(100);
  const loaded = await waitForTabLoad(tabId);
  await sleep(400);
  return { tabId, url: loaded.url ?? params.url, title: loaded.title ?? "" };
}

async function screenshot(
  params: BridgeMethods["screenshot"]["params"],
): Promise<BridgeMethods["screenshot"]["result"]> {
  const tab = await targetTab(params.tabId);
  if (!isCapturableUrl(tab.url))
    throw new CaptureError("This tab can’t be captured", "restricted_page");
  const settings = await getSettings();
  const options = { method: settings.fullPageMethod, lazyLoad: settings.lazyLoad };
  const raw = params.selector
    ? await captureElement(tab.id!, params.selector, options)
    : params.fullPage
      ? await captureFullPage(tab.id!, options)
      : await captureVisible(tab.id!);
  const fresh = await getTab(tab.id!);
  return {
    base64: await blobToBase64(raw.image.blob),
    type: raw.image.type,
    width: raw.image.width,
    height: raw.image.height,
    url: fresh.url ?? "",
    title: fresh.title ?? "",
    text: raw.text || undefined,
  };
}

async function extract(
  params: BridgeMethods["extract"]["params"],
): Promise<BridgeMethods["extract"]["result"]> {
  const tab = await targetTab(params.tabId);
  if (!isCapturableUrl(tab.url))
    throw new CaptureError("This tab can’t be read", "restricted_page");
  return runInPage(tab.id!, extractMetadata);
}

async function listTabs(): Promise<BridgeMethods["listTabs"]["result"]> {
  const tabs = await browser.tabs.query({});
  const result: TabInfo[] = tabs
    .filter((tab) => tab.id !== undefined && isCapturableUrl(tab.url))
    .map((tab) => ({
      id: tab.id!,
      url: tab.url ?? "",
      title: tab.title ?? "",
      active: Boolean(tab.active),
    }));
  return { tabs: result };
}

export async function handleBridgeRequest(request: BridgeRequest): Promise<unknown> {
  switch (request.method) {
    case "navigate":
      return navigate(request.params);
    case "screenshot":
      return screenshot(request.params);
    case "extract":
      return extract(request.params);
    case "listTabs":
      return listTabs();
  }
}
