import { browser } from "wxt/browser";

import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from "./settings";
import { EMPTY_DRAFT, type TrayDraft } from "./tray";
import { countShots } from "./tray-db";

export type BridgeState =
  | "disabled"
  | "unpaired"
  | "connecting"
  | "connected"
  | "offline"
  | "unauthorized"
  | "replaced";

export interface BridgeStatus {
  state: BridgeState;
  port: number;
  server?: { name: string; version: string } | null;
  error?: string | null;
  since: number;
}

export interface TrayState {
  count: number;
  version: number;
}

export interface StorageShape {
  settings: Settings;
  draft: TrayDraft;
  trayState: TrayState;
  bridgeStatus: BridgeStatus;
  recording: boolean;
  /** Last successful connect handoff from `/extension/connect`. */
  connectResult: { at: number; baseUrl: string; userName: string | null } | null;
}

const DEFAULTS: StorageShape = {
  settings: DEFAULT_SETTINGS,
  draft: EMPTY_DRAFT,
  trayState: { count: 0, version: 0 },
  bridgeStatus: { state: "disabled", port: DEFAULT_SETTINGS.bridgePort, since: 0 },
  recording: false,
  connectResult: null,
};

export async function getItem<K extends keyof StorageShape>(key: K): Promise<StorageShape[K]> {
  const stored = (await browser.storage.local.get(key)) as Partial<StorageShape>;
  const value = stored[key];
  if (key === "settings") return sanitizeSettings(value as Partial<Settings>) as StorageShape[K];
  if (key === "draft" && value) {
    const draft = value as TrayDraft;
    return {
      ...EMPTY_DRAFT,
      ...draft,
      app: { ...EMPTY_DRAFT.app, ...draft.app },
      flow: { ...EMPTY_DRAFT.flow, ...draft.flow },
    } as StorageShape[K];
  }
  return (value ?? DEFAULTS[key]) as StorageShape[K];
}

export async function setItem<K extends keyof StorageShape>(
  key: K,
  value: StorageShape[K],
): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

export const getSettings = () => getItem("settings");

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitizeSettings({ ...(await getSettings()), ...patch });
  await setItem("settings", next);
  return next;
}

/** Recount the tray and bump its version so open pages and the badge refresh. */
export async function notifyTrayChanged(): Promise<TrayState> {
  const previous = await getItem("trayState");
  const next = { count: await countShots(), version: previous.version + 1 };
  await setItem("trayState", next);
  return next;
}

/** Subscribe to one storage key; returns an unsubscribe function. */
export function watchItem<K extends keyof StorageShape>(
  key: K,
  callback: (value: StorageShape[K]) => void,
): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== "local" || !(key in changes)) return;
    void getItem(key).then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
