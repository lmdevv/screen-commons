import type { User } from "@screen-commons/core";
import { useHotkey } from "@screen-commons/ui";
import { lazy, Suspense, useState, type ReactNode } from "react";

import { useCurrentPlatform } from "../../lib/use-current-platform";
import { AppTopBar } from "./app-top-bar";
import { CommandPaletteProvider } from "./command-palette";

const ShortcutsDialog = lazy(() => import("./shortcuts-dialog"));

/**
 * Signed-in layout: sticky TopBar (platform switch, ⌘K search, saved, contribute, account),
 * the page, and the global `?` shortcuts dialog. No sidebar, no footer — content first.
 */
export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const platform = useCurrentPlatform();
  const [shortcuts, setShortcuts] = useState({ open: false, mounted: false });
  const showShortcuts = () => setShortcuts({ open: true, mounted: true });
  useHotkey("?", showShortcuts, { mod: false, shift: true });

  return (
    <CommandPaletteProvider platform={platform}>
      <a
        href="#main"
        className="ou-focus-ring sr-only z-50 rounded-pill bg-inverse px-4 py-2 text-base font-medium text-inverse-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col">
        <AppTopBar user={user} platform={platform} onShowShortcuts={showShortcuts} />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
      {shortcuts.mounted ? (
        <Suspense fallback={null}>
          <ShortcutsDialog
            open={shortcuts.open}
            onOpenChange={(open) => setShortcuts({ open, mounted: true })}
          />
        </Suspense>
      ) : null}
    </CommandPaletteProvider>
  );
}
