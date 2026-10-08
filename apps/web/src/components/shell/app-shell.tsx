import type { User } from "@screen-commons/core";
import type { ReactNode } from "react";

import { useCurrentPlatform } from "../../lib/use-current-platform";
import { AppTopBar } from "./app-top-bar";

/**
 * Signed-in layout: sticky TopBar (platform switch, ⌘K search, saved, contribute, account) and
 * the page. No sidebar, no footer — content first. The palette and shortcuts live a level up,
 * in `KeyboardShortcuts` (every page).
 */
export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const platform = useCurrentPlatform();
  return (
    <>
      <a
        href="#main"
        className="ou-focus-ring sr-only z-50 rounded-pill bg-inverse px-4 py-2 text-base font-medium text-inverse-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col">
        <AppTopBar user={user} platform={platform} />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </>
  );
}
