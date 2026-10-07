import * as React from "react";

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

export interface HotkeyOptions {
  /** Require ⌘ on macOS / Ctrl elsewhere. Default true. */
  mod?: boolean;
  shift?: boolean;
  /** Fire even when focus is in an input/textarea/contenteditable. Default true when `mod`. */
  allowInInputs?: boolean;
  enabled?: boolean;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * Global keyboard shortcut. `useHotkey("k", open)` → ⌘K / Ctrl+K.
 * `useHotkey("/", open, { mod: false })` → plain "/" (ignored while typing).
 */
export function useHotkey(
  key: string,
  handler: (event: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const { mod = true, shift = false, enabled = true } = options;
  const allowInInputs = options.allowInInputs ?? mod;
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (mod !== (event.metaKey || event.ctrlKey)) return;
      if (shift !== event.shiftKey) return;
      if (!allowInInputs && isEditable(event.target)) return;
      event.preventDefault();
      handlerRef.current(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, mod, shift, allowInInputs, enabled]);
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
  React.useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.platform;
    setIsMac(/mac|iphone|ipad|ipod/iu.test(platform));
  }, []);
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
