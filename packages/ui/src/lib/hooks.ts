import * as React from "react";

import {
  createShortcutDispatcher,
  isApplePlatform,
  SINGLE_KEY_SHORTCUTS_STORAGE_KEY,
  type HotkeyScope,
  type KeyFilterOptions,
  type ShortcutDispatcher,
} from "./keyboard";

/**
 * Controlled/uncontrolled state helper: uses `value` when defined, otherwise internal state.
 * `onChange` fires in both modes.
 */
export function useControllableState<T>(options: {
  value?: T;
  defaultValue: T;
  onChange?: (value: T) => void;
}): [T, (next: T) => void] {
  const { value, defaultValue, onChange } = options;
  const [internal, setInternal] = React.useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const set = React.useCallback(
    (next: T) => {
      if (!controlled) setInternal(next);
      onChangeRef.current?.(next);
    },
    [controlled],
  );
  return [current, set];
}

export interface HotkeyOptions extends KeyFilterOptions {
  /** Where the shortcut applies (see `HotkeyScope`). Default `page`. */
  scope?: HotkeyScope;
  /** Only while focus is on the page itself or inside this element (see `isFocusWithin`). */
  focusWithin?: { readonly current: Element | null };
  /** Extra condition checked at key time. */
  when?: (event: KeyboardEvent) => boolean;
  /**
   * Listen in the capture phase, for keys a dialog keeps to itself: Base UI's Dialog.Popup stops
   * arrow, Home and End keydowns from bubbling (they belong to composite widgets inside it), so a
   * viewer's ←/→ never reach the bubbling listener. Default false.
   */
  capture?: boolean;
  enabled?: boolean;
}

const pendingListeners = new Set<() => void>();

/**
 * The app-wide dispatchers behind `useHotkey`: one keydown listener on the document per phase,
 * added with the first binding and removed with the last. Sequences ("g s") live in the bubbling
 * one, which also sees whether a field or widget already handled the key.
 */
function createPhase(capture: boolean) {
  const phase = {
    dispatcher: null as ShortcutDispatcher | null,
    registered: 0,
    onKeyDown: (event: KeyboardEvent) => phase.dispatcher?.handle(event),
    add(): ShortcutDispatcher {
      phase.dispatcher ??= createShortcutDispatcher({
        singleKeys: readSingleKeys,
        onPendingChange: capture
          ? undefined
          : () => {
              for (const listener of pendingListeners) listener();
            },
      });
      if (phase.registered++ === 0) {
        document.addEventListener("keydown", phase.onKeyDown, { capture });
      }
      return phase.dispatcher;
    },
    remove() {
      if (--phase.registered === 0) {
        document.removeEventListener("keydown", phase.onKeyDown, { capture });
      }
    },
  };
  return phase;
}
const bubbling = createPhase(false);
const capturing = createPhase(true);

// "Use single-key shortcuts", per device (localStorage), shared by every tab.
const singleKeyListeners = new Set<() => void>();
let singleKeys: boolean | undefined;

function readSingleKeys(): boolean {
  if (singleKeys === undefined) {
    try {
      singleKeys = localStorage.getItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY) !== "false";
    } catch {
      singleKeys = true; // storage blocked
    }
  }
  return singleKeys;
}

function setSingleKeys(enabled: boolean): void {
  singleKeys = enabled;
  try {
    localStorage.setItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY, String(enabled));
  } catch {
    // storage blocked: the choice lasts for this page
  }
  for (const listener of singleKeyListeners) listener();
}

function subscribeSingleKeys(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SINGLE_KEY_SHORTCUTS_STORAGE_KEY) return;
    singleKeys = undefined;
    listener();
  };
  singleKeyListeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    singleKeyListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The "Use single-key shortcuts" preference (WCAG 2.1.4): when off, `useHotkey` ignores letters,
 * symbols and sequences that start with one ("g s"); ⌘K, Escape and arrows keep working. Hints
 * for those keys should hide too (`useShortcutHint` does). On by default; on during SSR.
 */
export function useSingleKeyShortcuts(): [
  enabled: boolean,
  setEnabled: (enabled: boolean) => void,
] {
  const enabled = React.useSyncExternalStore(subscribeSingleKeys, readSingleKeys, () => true);
  return [enabled, setSingleKeys];
}

/**
 * Keyboard shortcut in `keyboard.ts` notation, through the shared dispatcher (so sequences such as
 * "g s" and single keys such as "s" never both fire).
 *
 * useHotkey("mod+k", toggle, { scope: "global", allowInInputs: true });
 * useHotkey("g s", goToSaved);                  // page scope: not while a dialog is open
 * useHotkey("s", save, { scope: viewerRef });   // only while that dialog is on top
 */
export function useHotkey(
  shortcut: string,
  handler: (event: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const {
    scope = "page",
    focusWithin,
    allowInInputs = false,
    allowRepeat = false,
    capture = false,
    enabled = true,
  } = options;
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;
  const whenRef = React.useRef(options.when);
  whenRef.current = options.when;

  React.useEffect(() => {
    if (!enabled) return;
    const phase = capture ? capturing : bubbling;
    const unregister = phase.add().register({
      shortcut,
      scope,
      focusWithin,
      allowInInputs,
      allowRepeat,
      when: (event) => whenRef.current?.(event) ?? true,
      handler: (event) => handlerRef.current(event),
    });
    return () => {
      unregister();
      phase.remove();
    };
  }, [shortcut, scope, focusWithin, allowInInputs, allowRepeat, capture, enabled]);
}

/** Chords typed so far of an unfinished sequence (`["g"]` after pressing G), for a hint. */
export function usePendingShortcut(): readonly string[] {
  return React.useSyncExternalStore(
    (listener) => {
      pendingListeners.add(listener);
      return () => pendingListeners.delete(listener);
    },
    () => bubbling.dispatcher?.pending() ?? NO_CHORDS,
    () => NO_CHORDS,
  );
}
const NO_CHORDS: readonly string[] = [];

/**
 * Focus to restore when an overlay opened from the keyboard closes: call `remember()` just before
 * opening it and pass `finalFocus` to the dialog. Base UI's own return swaps an element that isn't
 * tabbable — such as a viewer's `tabIndex=-1` popup — for its first button (which then flashes a
 * tooltip and eats the next Escape), so the element is focused here once the overlay is gone.
 */
export function useReturnFocus(): {
  remember: () => void;
  finalFocus: () => boolean;
} {
  const element = React.useRef<HTMLElement | null>(null);
  const pending = React.useRef<number | undefined>(undefined);
  return React.useMemo(
    () => ({
      remember: () => {
        // Reopened before the last close handed focus back: that element is still the one to
        // return to, and the stale hand-back must not pull focus out of the new overlay.
        if (pending.current !== undefined) {
          cancelAnimationFrame(pending.current);
          pending.current = undefined;
          return;
        }
        const active = document.activeElement;
        element.current = active instanceof HTMLElement && active !== document.body ? active : null;
      },
      finalFocus: () => {
        const target = element.current;
        // `true`: Base UI's default when there is nothing (left) to return to.
        if (!target?.isConnected) return true;
        // Next frame: the closing overlay has unmounted and the page is no longer inert. Only if
        // nothing else took focus meanwhile.
        pending.current = requestAnimationFrame(() => {
          pending.current = undefined;
          const active = document.activeElement;
          if (!active || active === document.body) target.focus({ preventScroll: true });
        });
        return false;
      },
    }),
    [],
  );
}

/** True once the window has scrolled past `threshold` px. */
export function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/** `true` on Apple platforms, for ⌘ vs Ctrl hints. SSR-safe (assumes ⌘ until mounted). */
export function useIsMac(): boolean {
  const [isMac, setIsMac] = React.useState(true);
  React.useEffect(() => setIsMac(isApplePlatform()), []);
  return isMac;
}

/** Tracks whether a horizontally scrollable element can scroll further left/right. */
export function useScrollEdges<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  canScrollStart: boolean;
  canScrollEnd: boolean;
  scrollByPage: (direction: 1 | -1) => void;
} {
  const ref = React.useRef<T | null>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const max = element.scrollWidth - element.clientWidth;
      setEdges({ start: element.scrollLeft > 1, end: element.scrollLeft < max - 1 });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  const scrollByPage = React.useCallback((direction: 1 | -1) => {
    const element = ref.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: "smooth" });
  }, []);

  return { ref, canScrollStart: edges.start, canScrollEnd: edges.end, scrollByPage };
}
