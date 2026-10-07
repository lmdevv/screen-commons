import { createOpenUiClient, OpenUiApiError } from "@open-ui/core/client";
import type { User } from "@open-ui/core/schemas";
import { useCallback, useEffect, useState } from "react";

import type { Settings } from "../lib/settings";
import { getItem, watchItem, type StorageShape } from "../lib/storage";

/** Live value of a `storage.local` key (undefined until loaded). */
export function useStorage<K extends keyof StorageShape>(key: K): StorageShape[K] | undefined {
  const [value, setValue] = useState<StorageShape[K]>();
  useEffect(() => {
    let alive = true;
    void getItem(key).then((initial) => alive && setValue(initial));
    const stop = watchItem(key, (next) => alive && setValue(next));
    return () => {
      alive = false;
      stop();
    };
  }, [key]);
  return value;
}

export type AccountState =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "ok"; user: User }
  | { state: "error"; message: string };

export async function checkAccount(serverUrl: string, apiKey: string): Promise<AccountState> {
  if (!apiKey) return { state: "signed-out" };
  try {
    const user = await createOpenUiClient({ baseUrl: serverUrl, apiKey }).me();
    return { state: "ok", user };
  } catch (error) {
    if (error instanceof OpenUiApiError && error.status === 401)
      return { state: "error", message: "API key rejected" };
    if (error instanceof TypeError) return { state: "error", message: "Server unreachable" };
    return { state: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/** Current account for the stored settings; re-checks when server URL or key change. */
export function useAccount(settings: Settings | undefined): [AccountState, () => void] {
  const [account, setAccount] = useState<AccountState>({ state: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!settings) return;
    let alive = true;
    setAccount({ state: "loading" });
    void checkAccount(settings.serverUrl, settings.apiKey).then(
      (next) => alive && setAccount(next),
    );
    return () => {
      alive = false;
    };
  }, [settings?.serverUrl, settings?.apiKey, nonce]);
  return [account, useCallback(() => setNonce((n) => n + 1), [])];
}

export function hostLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return url;
  }
}
