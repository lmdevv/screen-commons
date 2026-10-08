import * as React from "react";

import {
  createShortcutDispatcher,
  isApplePlatform,
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
  /** Extra condition checked at key time. */
  when?: (event: KeyboardEvent) => boolean;
  enabled?: boolean;
}

const pendingListeners = new Set<() => void>();
let shortcuts: ShortcutDispatcher | null = null;
let registered = 0;
const onKeyDown = (event: KeyboardEvent) => shortcuts?.handle(event);

/** The app-wide dispatcher behind `useHotkey`: one bubbling keydown listener on the document. */
function getShortcuts(): ShortcutDispatcher {
  shortcuts ??= createShortcutDispatcher({
    onPendingChange: () => {
      for (const listener of pendingListeners) listener();
    },
  });
  return shortcuts;
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
  const { scope = "page", allowInInputs = false, allowRepeat = false, enabled = true } = options;
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;
  const whenRef = React.useRef(options.when);
  whenRef.current = options.when;

  React.useEffect(() => {
    if (!enabled) return;
    const dispatcher = getShortcuts();
    if (registered++ === 0) document.addEventListener("keydown", onKeyDown);
    const unregister = dispatcher.register({
      shortcut,
      scope,
      allowInInputs,
      allowRepeat,
      when: (event) => whenRef.current?.(event) ?? true,
      handler: (event) => handlerRef.current(event),
    });
    return () => {
      unregister();
      if (--registered === 0) document.removeEventListener("keydown", onKeyDown);
    };
  }, [shortcut, scope, allowInInputs, allowRepeat, enabled]);
}

/** Chords typed so far of an unfinished sequence (`["g"]` after pressing G), for a hint. */
export function usePendingShortcut(): readonly string[] {
  return React.useSyncExternalStore(
    (listener) => {
      pendingListeners.add(listener);
      return () => pendingListeners.delete(listener);
    },
    () => shortcuts?.pending() ?? NO_CHORDS,
    () => NO_CHORDS,
  );
}
const NO_CHORDS: readonly string[] = [];

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
