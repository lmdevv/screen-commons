/*
 * Keyboard shortcut core: one notation, one event filter, one dispatcher. `useHotkey` (hooks.ts)
 * registers into the shared dispatcher; everything here is DOM-only and unit-tested.
 *
 * Notation: space-separated chords pressed in turn; a chord is `+`-joined modifiers and a key.
 *
 *   "mod+k"      ⌘K on Apple platforms, Ctrl+K elsewhere
 *   "?"  "/"     a character — Shift is implied by the character, never written
 *   "shift+a"    letters and named keys spell Shift out
 *   "g s"        g, then s within SEQUENCE_TIMEOUT_MS
 *   "arrowleft"  named keys use the `KeyboardEvent.key` value, lowercased
 *
 * A key press is ignored when it was already handled (`defaultPrevented`), during IME
 * composition, on auto-repeat (unless `allowRepeat`), while typing in a field or a typeahead
 * widget (unless `allowInInputs`), or with a modifier the binding doesn't name (so ⌘S or Alt+S
 * never trigger "s"). Bindings are scoped: `global`, `page` (only while no dialog or menu is open)
 * or a ref inside a dialog (only while that dialog is the topmost layer).
 */

/** How long the second key of a sequence such as "g s" may follow the first. */
export const SEQUENCE_TIMEOUT_MS = 1500;

const MODIFIERS = ["mod", "alt", "shift"] as const;
const ALIASES: Record<string, string> = { esc: "escape", space: " ", left: "arrowleft" };
const MODIFIER_KEYS = new Set(["shift", "control", "meta", "alt", "altgraph", "capslock", "fn"]);

/** `"g s"` → `["g", "s"]`; `"Shift+Mod+A"` → `["mod+shift+a"]` (canonical modifier order). */
export function parseShortcut(shortcut: string): string[] {
  return shortcut
    .trim()
    .split(/\s+/u)
    .map((chord) => {
      const parts = chord.toLowerCase().split("+");
      // A trailing "+" means the plus key itself ("mod++").
      const key = parts.at(-1) === "" && parts.length > 1 ? "+" : parts.pop()!;
      const mods = new Set(parts.filter(Boolean));
      for (const mod of mods) {
        if (!(MODIFIERS as readonly string[]).includes(mod)) {
          throw new Error(`Unknown modifier "${mod}" in shortcut "${shortcut}"`);
        }
      }
      return [...MODIFIERS.filter((mod) => mods.has(mod)), ALIASES[key] ?? key].join("+");
    });
}

/**
 * The chord a keydown event produces, in `parseShortcut` form, or null for a bare modifier press
 * or a modifier no binding can use (Ctrl on Apple platforms, ⌘/Win elsewhere).
 */
export function eventChord(event: KeyboardEvent, apple = isApplePlatform()): string | null {
  const raw = event.key;
  if (!raw || MODIFIER_KEYS.has(raw.toLowerCase())) return null;
  if (apple ? event.ctrlKey : event.metaKey) return null;
  const key = raw.toLowerCase();
  // Characters that have a case (letters) and named keys carry Shift; symbols already encode it.
  const shiftCounts = raw.length > 1 || raw.toLowerCase() !== raw.toUpperCase();
  const mods = [
    (apple ? event.metaKey : event.ctrlKey) && "mod",
    event.altKey && "alt",
    shiftCounts && event.shiftKey && "shift",
  ].filter(Boolean);
  return [...mods, key].join("+");
}

const TYPING_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable=false])",
  // Widgets with their own typeahead or arrow keys.
  "[role=textbox]",
  "[role=searchbox]",
  "[role=combobox]",
  "[role=spinbutton]",
  "[role=slider]",
  "[role=listbox]",
  "[role=menu]",
].join(", ");
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "reset",
  "submit",
]);

/** True when keys typed at `target` belong to it: text fields, selects, typeahead widgets. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const field = target.closest(TYPING_SELECTOR);
  if (!field) return false;
  return !(field instanceof HTMLInputElement && NON_TEXT_INPUTS.has(field.type));
}

export interface KeyFilterOptions {
  /** Fire while focus is in a text field (e.g. ⌘K). Default false. */
  allowInInputs?: boolean;
  /** Fire on auto-repeat while the key is held (list movement). Default false. */
  allowRepeat?: boolean;
}

/** True when a shortcut must not react to this event (see the file comment). */
export function shouldIgnoreKeyEvent(
  event: KeyboardEvent,
  options: KeyFilterOptions = {},
): boolean {
  if (event.defaultPrevented) return true;
  // keyCode 229: Chrome/Safari report IME keystrokes this way, sometimes without isComposing.
  if (event.isComposing || event.keyCode === 229) return true;
  if (event.repeat && !options.allowRepeat) return true;
  if (!options.allowInInputs && isEditableTarget(event.target)) return true;
  return false;
}

/** Open layers that own the keyboard: dialogs (Base UI popovers are dialogs too) and menus. */
const LAYER_SELECTOR = [
  "[role=dialog]:not([hidden]):not([aria-modal=false])",
  "[role=alertdialog]:not([hidden])",
  "[role=menu]:not([hidden])",
].join(", ");

/** The topmost open dialog or menu (portals stack in document order), or null on the bare page. */
export function topmostLayer(root: ParentNode = document): Element | null {
  const layers = root.querySelectorAll(LAYER_SELECTOR);
  return layers[layers.length - 1] ?? null;
}

/**
 * - `global`: always (⌘K, ?).
 * - `page`: only while no dialog or menu is open.
 * - a ref: only while the element is on the page and, if a layer is open, inside the topmost one
 *   (viewer keys stop while a collection picker is stacked on the viewer).
 */
export type HotkeyScope = "global" | "page" | { readonly current: Element | null };

export function isInScope(scope: HotkeyScope, layer: Element | null): boolean {
  if (scope === "global") return true;
  if (scope === "page") return layer === null;
  const host = scope.current;
  if (!host?.isConnected) return false;
  return layer === null || layer.contains(host);
}

export interface ShortcutBinding extends KeyFilterOptions {
  /** Shortcut in the notation above. */
  shortcut: string;
  handler: (event: KeyboardEvent) => void;
  scope?: HotkeyScope;
  /** Extra condition checked at key time, e.g. "no text is selected" for ⌘C. */
  when?: (event: KeyboardEvent) => boolean;
}

export interface ShortcutDispatcher {
  /** Adds a binding; returns its removal. Later bindings win when several match. */
  register: (binding: ShortcutBinding) => () => void;
  /** Feed a keydown event. */
  handle: (event: KeyboardEvent) => void;
  /** Chords typed so far of an unfinished sequence (e.g. `["g"]`), for hints. */
  pending: () => readonly string[];
}

const NO_CHORDS: readonly string[] = [];

export function createShortcutDispatcher({
  now = () => Date.now(),
  apple = isApplePlatform,
  layer = () => topmostLayer(),
  onPendingChange,
}: {
  now?: () => number;
  apple?: () => boolean;
  layer?: () => Element | null;
  onPendingChange?: (chords: readonly string[]) => void;
} = {}): ShortcutDispatcher {
  const bindings: { sequence: string[]; binding: ShortcutBinding }[] = [];
  let pending: { chords: string[]; at: number } | null = null;
  let expiry: ReturnType<typeof setTimeout> | undefined;

  const setPending = (next: typeof pending) => {
    const changed = (pending?.chords.join(" ") ?? "") !== (next?.chords.join(" ") ?? "");
    pending = next;
    clearTimeout(expiry);
    // Clears the hint on time even if no further key arrives.
    if (next) expiry = setTimeout(() => setPending(null), SEQUENCE_TIMEOUT_MS);
    if (changed) onPendingChange?.(next?.chords ?? NO_CHORDS);
  };

  return {
    register(binding) {
      const entry = { sequence: parseShortcut(binding.shortcut), binding };
      bindings.push(entry);
      return () => {
        const index = bindings.indexOf(entry);
        if (index >= 0) bindings.splice(index, 1);
      };
    },
    pending: () => pending?.chords ?? NO_CHORDS,
    handle(event) {
      const chord = eventChord(event, apple());
      if (chord === null) return; // a bare modifier press doesn't break a sequence
      const time = now();
      const prefix = pending && time - pending.at <= SEQUENCE_TIMEOUT_MS ? pending.chords : null;
      const top = layer();
      const active = bindings.filter(
        ({ binding }) =>
          isInScope(binding.scope ?? "page", top) &&
          !shouldIgnoreKeyEvent(event, binding) &&
          (binding.when?.(event) ?? true),
      );
      const candidate = prefix ? [...prefix, chord] : [chord];
      const key = candidate.join(" ");
      let match: ShortcutBinding | undefined;
      for (const entry of active) if (entry.sequence.join(" ") === key) match = entry.binding;
      if (match) {
        setPending(null);
        event.preventDefault();
        match.handler(event);
        return;
      }
      const startsSequence = active.some(
        ({ sequence }) =>
          sequence.length > candidate.length && sequence.join(" ").startsWith(`${key} `),
      );
      // A key that breaks a sequence only cancels it: "g a" must not approve in review.
      setPending(startsSequence ? { chords: candidate, at: time } : null);
    },
  };
}

let apple: boolean | undefined;
/** ⌘ vs Ctrl. Client only; false on the server. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  apple ??= /mac|iphone|ipad|ipod/iu.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform,
  );
  return apple;
}

const KEY_LABELS: Record<string, string> = {
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  escape: "Esc",
  enter: "Enter",
  " ": "Space",
  tab: "Tab",
};

/**
 * Display keys per chord: `"mod+k"` → `[["⌘", "K"]]` (or `[["Ctrl", "K"]]`), `"g s"` →
 * `[["G"], ["S"]]`. Render chords as Kbd groups joined by "then".
 */
export function formatShortcut(shortcut: string, apple = isApplePlatform()): string[][] {
  return parseShortcut(shortcut).map((chord) =>
    chord.split(/\+(?!$)/u).map((part) => {
      if (part === "mod") return apple ? "⌘" : "Ctrl";
      if (part === "alt") return apple ? "⌥" : "Alt";
      if (part === "shift") return apple ? "⇧" : "Shift";
      return KEY_LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part);
    }),
  );
}

const ARIA_KEYS: Record<string, string> = {
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  escape: "Escape",
  enter: "Enter",
  " ": "Space",
  tab: "Tab",
};

/**
 * `aria-keyshortcuts` value for a single-chord shortcut (`"mod+k"` → `"Control+K"`), or undefined
 * for sequences, which the attribute can't express (a space there means "or").
 */
export function ariaKeyShortcuts(shortcut: string, apple = isApplePlatform()): string | undefined {
  const chords = parseShortcut(shortcut);
  if (chords.length !== 1) return undefined;
  return chords[0]!
    .split(/\+(?!$)/u)
    .map((part) => {
      if (part === "mod") return apple ? "Meta" : "Control";
      if (part === "alt") return "Alt";
      if (part === "shift") return "Shift";
      return ARIA_KEYS[part] ?? part.toUpperCase();
    })
    .join("+");
}
