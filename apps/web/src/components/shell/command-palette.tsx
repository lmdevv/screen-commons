import { useHotkey, useReturnFocus } from "@screen-commons/ui";
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import type { Platform } from "../../lib/platform";
import { SHORTCUTS, type Audience } from "../../lib/shortcuts";

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
 * Owns the ⌘K palette on every page: the ⌘K and `/` shortcuts, open state and the lazily loaded
 * dialog. Signed in, it searches the library and lists commands; signed out, commands and docs
 * only. The palette chunk (cmdk + Base UI dialog) only loads on intent — hovering/focusing the
 * search pill, ⌘K or `/`.
 */
export function CommandPaletteProvider({
  platform,
  audience,
  onShowShortcuts,
  children,
}: {
  platform: Platform;
  audience: Audience;
  onShowShortcuts: () => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<{ open: boolean; query: string; mounted: boolean }>({
    open: false,
    query: "",
    mounted: false,
  });

  // Opened over the viewer, the palette hands focus back to the viewer itself on close.
  const { remember, finalFocus } = useReturnFocus();
  const open = useRef(false);
  open.current = state.open;

  const openPalette = useCallback(
    (query = "") => {
      if (!open.current) remember();
      setState({ open: true, query, mounted: true });
    },
    [remember],
  );
  const prefetchPalette = useCallback(() => void loadPalette(), []);

  useHotkey(
    SHORTCUTS.palette.keys,
    () => {
      if (!open.current) remember();
      setState((current) => ({ ...current, open: !current.open, query: "", mounted: true }));
    },
    { scope: "global", allowInInputs: true },
  );
  useHotkey(SHORTCUTS.search.keys, () => openPalette(), { scope: "global" });

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
            audience={audience}
            onShowShortcuts={onShowShortcuts}
            finalFocus={finalFocus}
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
