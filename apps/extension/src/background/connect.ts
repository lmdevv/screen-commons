import { API_KEY_PREFIX } from "@screen-commons/core/api";
import { createScreenCommonsClient, ScreenCommonsApiError } from "@screen-commons/core/client";
import { browser, type Browser } from "wxt/browser";

import {
  DEFAULT_SERVER_URL,
  normalizeServerUrl,
  originMatchPattern,
  originOf,
  type Settings,
} from "../lib/settings";
import { getSettings, saveSettings, setItem } from "../lib/storage";

const SCRIPT_ID = "screen-commons-connect";
/** Built path of `entrypoints/connect.content.ts`. */
const SCRIPT_FILE = "content-scripts/connect.js";

/**
 * The manifest content script covers the default `http://localhost:5173`. A custom server URL
 * gets a dynamically registered copy so `/extension/connect` works on self-hosted instances.
 */
export async function syncConnectScript(settings: Settings): Promise<void> {
  if (!browser.scripting?.registerContentScripts) return;
  try {
    await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => undefined);
    if (originOf(settings.serverUrl) === originOf(DEFAULT_SERVER_URL)) return;
    const pattern = originMatchPattern(settings.serverUrl);
    if (!pattern) return;
    const granted = await browser.permissions.contains({ origins: [pattern] }).catch(() => false);
    if (!granted) {
      console.warn("[screen-commons] no host permission for", pattern, "— grant it from Options");
      return;
    }
    await browser.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        matches: [pattern],
        js: [SCRIPT_FILE],
        runAt: "document_start",
        persistAcrossSessions: false,
      },
    ]);
  } catch (error) {
    console.warn("[screen-commons] could not register the connect content script", error);
  }
}

const TOKEN_PATTERN = new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{8,200}$`, "u");

/** Accept a key handed over by `/extension/connect` on a configured Screen Commons origin. */
export async function acceptConnectToken(
  message: { token: unknown; baseUrl: unknown },
  sender: Browser.runtime.MessageSender,
): Promise<{ ok: true; userName: string | null }> {
  if (sender.id !== browser.runtime.id || !sender.tab) throw new Error("Unexpected sender");
  const settings = await getSettings();
  const senderOrigin = originOf(sender.url ?? sender.tab.url ?? "");
  const allowed = new Set([originOf(settings.serverUrl), originOf(DEFAULT_SERVER_URL)]);
  if (!senderOrigin || !allowed.has(senderOrigin)) {
    throw new Error(`${senderOrigin ?? "This page"} is not your configured Screen Commons server`);
  }
  if (typeof message.token !== "string" || !TOKEN_PATTERN.test(message.token))
    throw new Error("Invalid API key");
  const baseUrl = typeof message.baseUrl === "string" ? normalizeServerUrl(message.baseUrl) : null;
  if (!baseUrl || originOf(baseUrl) !== senderOrigin)
    throw new Error("baseUrl must match the page origin");

  let userName: string | null = null;
  try {
    const me = await createScreenCommonsClient({ baseUrl, apiKey: message.token }).me();
    userName = me.name || me.email;
  } catch (error) {
    if (error instanceof ScreenCommonsApiError && error.status === 401)
      throw new Error("The server rejected the new key");
    // Network hiccup: keep the key, the popup will show the account state later.
  }
  await saveSettings({ serverUrl: baseUrl, apiKey: message.token });
  await setItem("connectResult", { at: Date.now(), baseUrl, userName });
  return { ok: true, userName };
}
