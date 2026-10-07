import { VIEWPORTS, type Viewport } from "@open-ui/core/bridge";
import { browser } from "wxt/browser";

import { CaptureError } from "./browser-utils";

/**
 * Chromium-only `chrome.debugger` sessions. Captures attach briefly and always detach; mobile
 * emulation needs a session that stays attached (overrides end on detach).
 */
interface Session {
  refs: number;
  emulation: Viewport | null;
}

const sessions = new Map<number, Session>();
let listening = false;

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

export type Send = <T = Record<string, unknown>>(method: string, params?: Record<string, unknown>) => Promise<T>;

function listen() {
  if (listening) return;
  listening = true;
  browser.debugger.onDetach.addListener((source) => {
    if (source.tabId !== undefined) sessions.delete(source.tabId);
  });
  browser.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));
}

function sender(tabId: number): Send {
  return async <T,>(method: string, params: Record<string, unknown> = {}) =>
    (await browser.debugger.sendCommand({ tabId }, method, params)) as T;
}

async function attach(tabId: number): Promise<void> {
  listen();
  try {
    await browser.debugger.attach({ tabId }, "1.3");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already attached/iu.test(message)) return;
    throw new CaptureError(`Could not attach to the tab: ${message}`, "debugger_failed");
  }
}

async function detach(tabId: number): Promise<void> {
  try {
    await browser.debugger.detach({ tabId });
  } catch {
    // already detached (tab closed or user dismissed the infobar)
  }
}

/** Run `fn` with a debugger session on the tab; detaches afterwards unless something keeps it. */
export async function withDebugger<T>(tabId: number, fn: (send: Send) => Promise<T>): Promise<T> {
  let session = sessions.get(tabId);
  if (!session) {
    session = { refs: 0, emulation: null };
    sessions.set(tabId, session);
    try {
      await attach(tabId);
    } catch (error) {
      sessions.delete(tabId);
      throw error;
    }
  }
  session.refs += 1;
  try {
    return await fn(sender(tabId));
  } finally {
    session.refs -= 1;
    if (session.refs <= 0 && !session.emulation && sessions.get(tabId) === session) {
      sessions.delete(tabId);
      await detach(tabId);
    }
  }
}

export function emulationFor(tabId: number): Viewport | null {
  return sessions.get(tabId)?.emulation ?? null;
}

/** Apply (or clear, with `null`) device emulation. Keeps the session attached while emulating. */
export async function setEmulation(tabId: number, viewport: Viewport | null): Promise<void> {
  let session = sessions.get(tabId);
  if (session?.emulation === viewport) return;
  // Detaching is the only reliable way to drop every override (UA, touch, metrics).
  if (session?.emulation && session.refs <= 0) {
    sessions.delete(tabId);
    await detach(tabId);
    session = undefined;
  } else if (session?.emulation) {
    const send = sender(tabId);
    await send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
    await send("Emulation.setTouchEmulationEnabled", { enabled: false }).catch(() => undefined);
    session.emulation = null;
  }
  if (!viewport) return;
  if (!session) {
    await attach(tabId);
    session = { refs: 0, emulation: null };
    sessions.set(tabId, session);
  }
  const metrics = VIEWPORTS[viewport];
  const send = sender(tabId);
  await send("Emulation.setDeviceMetricsOverride", {
    width: metrics.width,
    height: metrics.height,
    deviceScaleFactor: metrics.deviceScaleFactor,
    mobile: metrics.mobile,
    screenWidth: metrics.width,
    screenHeight: metrics.height,
  });
  if (metrics.mobile) {
    await send("Emulation.setUserAgentOverride", { userAgent: MOBILE_UA, platform: "iPhone" });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  }
  session.emulation = viewport;
}
