import { browser } from "wxt/browser";

import { configureBridge, bridgeStatus, ensureBridge, reconnectBridge } from "../background/bridge";
import { initBridgeHandlers } from "../background/bridge-handlers";
import { actionApi, activeTab } from "../background/browser-utils";
import { acceptConnectToken, syncConnectScript } from "../background/connect";
import { captureToTray, summarize } from "../background/shots";
import { handleUploadPort } from "../background/upload";
import { handleMessages, UPLOAD_PORT } from "../lib/messages";
import { getItem, getSettings, notifyTrayChanged, setItem, watchItem } from "../lib/storage";
import type { CaptureMode } from "../lib/tray";

const KEEPALIVE_ALARM = "bridge-keepalive";

async function updateBadge() {
  const action = actionApi();
  if (!action) return;
  const [{ count }, recording] = await Promise.all([getItem("trayState"), getItem("recording")]);
  await action.setBadgeBackgroundColor({ color: recording ? "#dc2626" : "#0a0a0a" });
  await action.setBadgeText({
    text: recording ? "REC" : count > 0 ? String(Math.min(count, 999)) : "",
  });
  action.setBadgeTextColor?.({ color: "#ffffff" })?.catch?.(() => undefined);
}

async function captureActive(mode: CaptureMode, tabId?: number) {
  const id = tabId ?? (await activeTab()).id!;
  const shot = await captureToTray(id, mode);
  return { shot: shot ? summarize(shot) : null, cancelled: shot === null };
}

export default defineBackground(() => {
  initBridgeHandlers();

  void getSettings().then((settings) => {
    configureBridge(settings);
    void syncConnectScript(settings);
  });
  watchItem("settings", (settings) => {
    configureBridge(settings);
    void syncConnectScript(settings);
  });
  watchItem("trayState", () => void updateBadge());
  watchItem("recording", () => void updateBadge());
  void notifyTrayChanged().catch(() => undefined);

  browser.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM) ensureBridge();
  });
  browser.runtime.onStartup.addListener(() => ensureBridge());

  browser.commands.onCommand.addListener((command) => {
    const mode: CaptureMode | null =
      command === "capture-visible"
        ? "visible"
        : command === "capture-full"
          ? "full"
          : command === "capture-element"
            ? "element"
            : null;
    if (!mode) return;
    void captureActive(mode).catch((error: unknown) =>
      console.warn("[open-ui] capture failed", error),
    );
  });

  browser.runtime.onConnect.addListener((port) => {
    const fromExtension =
      port.sender?.id === browser.runtime.id &&
      Boolean(port.sender.url?.startsWith(browser.runtime.getURL("/")));
    if (port.name === UPLOAD_PORT && fromExtension) handleUploadPort(port);
  });

  handleMessages((message, sender) => {
    // Only the connect handoff may come from a content script; everything else is extension pages.
    const fromExtensionPage =
      sender.id === browser.runtime.id &&
      Boolean(sender.url?.startsWith(browser.runtime.getURL("/")));
    switch (message.type) {
      case "connect:token":
        return acceptConnectToken(message, sender);
      case "capture":
        if (!fromExtensionPage) return Promise.reject(new Error("Forbidden"));
        return captureActive(message.mode, message.tabId);
      case "bridge:status":
        return Promise.resolve(bridgeStatus());
      case "bridge:reconnect":
        if (!fromExtensionPage) return Promise.reject(new Error("Forbidden"));
        return Promise.resolve(reconnectBridge());
      case "recording:set":
        if (!fromExtensionPage) return Promise.reject(new Error("Forbidden"));
        return (async () => {
          await setItem("recording", message.active);
          if (message.active) {
            const draft = await getItem("draft");
            await setItem("draft", { ...draft, flow: { ...draft.flow, enabled: true } });
          }
          return { active: message.active };
        })();
      case "connect:refresh":
        return getSettings().then(async (settings) => {
          await syncConnectScript(settings);
          return { ok: true as const };
        });
      default:
        return undefined;
    }
  });
});
