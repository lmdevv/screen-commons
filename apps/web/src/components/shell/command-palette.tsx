import { useHotkey } from "@open-ui/ui";
import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { Platform } from "../../lib/platform";

const loadPalette = () => import("./search-palette");
const SearchPalette = lazy(loadPalette);

interface CommandPaletteContextValue {
  /** Open the palette, optionally pre-filled with a query. */
  openPalette: (query?: string) => void;
  /** Warm the palette chunk (hover/focus on a trigger). */
  prefetchPalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

/**
 * Owns the ⌘K palette: the global shortcut, open state and the lazily loaded dialog. The palette
 * chunk (cmdk + Base UI dialog) only loads on intent — hovering/focusing the search pill or ⌘K.
 */
export function CommandPaletteProvider({
  platform,
  children,
}: {
  platform: Platform;
  children: ReactNode;
}) {
  const [state, setState] = useState<{ open: boolean; query: string; mounted: boolean }>({
    open: false,
    query: "",
    mounted: false,
  });

  const openPalette = useCallback((query = "") => {
    setState({ open: true, query, mounted: true });
  }, []);
  const prefetchPalette = useCallback(() => void loadPalette(), []);

  useHotkey("k", () =>
    setState((current) => ({ ...current, open: !current.open, query: "", mounted: true })),
  );

  const value = useMemo(() => ({ openPalette, prefetchPalette }), [openPalette, prefetchPalette]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {state.mounted ? (
        <Suspense fallback={null}>
          <SearchPalette
            open={state.open}
            initialQuery={state.query}
            platform={platform}
            onOpenChange={(open) => setState((current) => ({ ...current, open }))}
          />
        </Suspense>
      ) : null}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) throw new Error("useCommandPalette must be used inside <CommandPaletteProvider>");
  return context;
}

/** Like `useCommandPalette`, but returns null outside the provider (public pages). */
export function useOptionalCommandPalette(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext);
}
