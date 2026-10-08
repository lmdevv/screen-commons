import type { User } from "@screen-commons/core";
import { Shortcut, useHotkey, usePendingShortcut, useReturnFocus } from "@screen-commons/ui";
import { useNavigate } from "@tanstack/react-router";
import { createContext, lazy, Suspense, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

import type { Platform } from "../../lib/platform";
import { audienceOf, commandsFor, SHORTCUTS, type NavCommand } from "../../lib/shortcuts";
import { useCurrentPlatform } from "../../lib/use-current-platform";
import { CommandPaletteProvider } from "./command-palette";

const ShortcutsDialog = lazy(() => import("./shortcuts-dialog"));

const ShortcutsContext = createContext<(() => void) | null>(null);

/**
 * Keyboard layer of every page (mounted by the root route, public and signed in): the ⌘K / `/`
 * palette, the `?` shortcuts dialog and the "g …" navigation shortcuts from the registry,
 * filtered by the signed-in user's role.
 */
export function KeyboardShortcuts({ user, children }: { user: User | null; children: ReactNode }) {
  const audience = audienceOf(user);
  const platform = useCurrentPlatform();
  const [help, setHelp] = useState({ open: false, mounted: false });
  const { remember, finalFocus } = useReturnFocus();
  const showShortcuts = useCallback(() => {
    remember();
    setHelp({ open: true, mounted: true });
  }, [remember]);
  useHotkey(SHORTCUTS.help.keys, showShortcuts, { scope: "global" });
  const commands = commandsFor(audience).filter((command) => command.shortcut);

  return (
    <ShortcutsContext.Provider value={showShortcuts}>
      <CommandPaletteProvider
        platform={platform}
        audience={audience}
        onShowShortcuts={showShortcuts}
      >
        {children}
        {commands.map((command) => (
          <CommandShortcut key={command.id} command={command} platform={platform} />
        ))}
        <SequenceHint commands={commands} />
        {help.mounted ? (
          <Suspense fallback={null}>
            <ShortcutsDialog
              audience={audience}
              finalFocus={finalFocus}
              open={help.open}
              onOpenChange={(open) => setHelp({ open, mounted: true })}
            />
          </Suspense>
        ) : null}
      </CommandPaletteProvider>
    </ShortcutsContext.Provider>
  );
}

/** Opens the `?` shortcuts dialog (menus, footers). */
export function useShowShortcuts(): () => void {
  const show = useContext(ShortcutsContext);
  if (!show) throw new Error("useShowShortcuts must be used inside <KeyboardShortcuts>");
  return show;
}

function CommandShortcut({ command, platform }: { command: NavCommand; platform: Platform }) {
  const navigate = useNavigate();
  useHotkey(command.shortcut!, () => void navigate(command.to({ platform })));
  return null;
}

/** After "g": which keys can follow, until the sequence completes or times out. */
function SequenceHint({ commands }: { commands: NavCommand[] }) {
  const pending = usePendingShortcut();
  const prefix = pending.join(" ");
  const next = prefix
    ? commands.filter((command) => command.shortcut!.startsWith(`${prefix} `))
    : [];
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4"
    >
      {next.length > 0 ? (
        <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-card bg-surface px-4 py-2.5 text-sm text-fg-muted shadow-overlay ring-1 ring-border">
          <span className="font-medium text-fg">Go to</span>
          {next.map((command) => (
            <span key={command.id} className="flex items-center gap-1.5">
              <Shortcut keys={command.shortcut!.slice(prefix.length + 1)} />
              {command.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
