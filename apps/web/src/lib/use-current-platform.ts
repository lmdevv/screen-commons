import { useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";

import { isPlatform, recallPlatform, rememberPlatform, type Platform } from "./platform";

// Platform of the content a page shows (an app, a screen, a flow), set by that page.
let pagePlatform: Platform | null = null;
const listeners = new Set<() => void>();
const setPagePlatform = (platform: Platform | null) => {
  pagePlatform = platform;
  for (const listener of listeners) listener();
};

/** For content pages: make the top bar's platform switch reflect what's on screen. */
export function usePagePlatform(platform: Platform | undefined): void {
  useEffect(() => {
    if (!platform) return;
    setPagePlatform(platform);
    rememberPlatform(platform);
    return () => setPagePlatform(null);
  }, [platform]);
}

/**
 * The platform the library is showing: `/browse/$platform`, `/search?platform=`, the content of
 * the current page, else the last one browsed (client only, so SSR renders "web" and the switch
 * corrects itself after mount).
 */
export function useCurrentPlatform(): Platform {
  const params = useParams({ strict: false }) as { platform?: string };
  const search = useSearch({ strict: false }) as { platform?: string };
  const fromPage = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pagePlatform,
    () => null,
  );
  const explicit = isPlatform(params.platform)
    ? params.platform
    : isPlatform(search.platform)
      ? search.platform
      : fromPage;
  const [remembered, setRemembered] = useState<Platform>("web");
  useEffect(() => {
    if (explicit) rememberPlatform(explicit);
    else setRemembered(recallPlatform() ?? "web");
  }, [explicit]);
  return explicit ?? remembered;
}
