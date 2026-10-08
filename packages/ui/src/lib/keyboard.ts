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
 *
 * Character-key shortcuts — a letter, digit or symbol without ⌘/Ctrl/Alt, including sequences that
 * start with one ("g s") — can be turned off per device (WCAG 2.1.4); modifier chords and named
 * keys (⌘K, Escape, arrows) always work.
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

/**
 * True for a keystroke that belongs to an IME composition. Safari fires the Enter that commits a
 * composition after `compositionend`, with `isComposing` false but keyCode 229 — check both before
 * treating Enter as "submit". React: pass `event.nativeEvent`.
 */
export function isImeKeyEvent(event: Pick<KeyboardEvent, "isComposing" | "keyCode">): boolean {
  return event.isComposing || event.keyCode === 229;
}

/** True when a shortcut must not react to this event (see the file comment). */
export function shouldIgnoreKeyEvent(
  event: KeyboardEvent,
  options: KeyFilterOptions = {},
): boolean {
  if (event.defaultPrevented) return true;
  if (isImeKeyEvent(event)) return true;
  if (event.repeat && !options.allowRepeat) return true;
  if (!options.allowInInputs && isEditableTarget(event.target)) return true;
  return false;
}

/**
 * Open layers that own the keyboard: dialogs (Base UI popovers are dialogs too) and menus. A Base
 * UI layer playing its exit animation is `data-closed` and already gives the keyboard back.
 */
const LAYER_SELECTOR = [
  "[role=dialog]:not([hidden]):not([aria-modal=false])",
  "[role=alertdialog]:not([hidden])",
  "[role=menu]:not([hidden])",
]
  .map((selector) => `${selector}:not([data-closed])`)
  .join(", ");

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

/**
 * True when focus is on the page itself (nothing focused, or the `<main>` a skip link moved to) or
 * inside `region`: keys meant for one part of a page don't fire from unrelated controls.
 */
export function isFocusWithin(region: Element | null, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target === target.ownerDocument.body || target.matches("main")) return true;
  return !!region?.contains(target);
}

/**
 * A character-key chord (`"s"`, `"?"`, `"shift+a"`): one printable character without ⌘/Ctrl/Alt.
 * Speech input and screen reader browse mode type these, so they can be turned off (WCAG 2.1.4).
 */
export function isCharacterChord(chord: string): boolean {
  const parts = chord.split(/\+(?!$)/u);
  const key = parts.pop()!;
  return key.length === 1 && key !== " " && parts.every((mod) => mod === "shift");
}

export interface ShortcutBinding extends KeyFilterOptions {
  /** Shortcut in the notation above. */
  shortcut: string;
  handler: (event: KeyboardEvent) => void;
  scope?: HotkeyScope;
  /** Only while focus is on the page itself or inside this element (see `isFocusWithin`). */
  focusWithin?: { readonly current: Element | null };
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
  singleKeys = () => true,
  onPendingChange,
}: {
  now?: () => number;
  apple?: () => boolean;
  layer?: () => Element | null;
  /** Whether character-key shortcuts are on (see the file comment). */
  singleKeys?: () => boolean;
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
      const characters = singleKeys();
      const active = bindings.filter(
        ({ sequence, binding }) =>
          (characters || !isCharacterChord(sequence[0]!)) &&
          isInScope(binding.scope ?? "page", top) &&
          !shouldIgnoreKeyEvent(event, binding) &&
          (!binding.focusWithin || isFocusWithin(binding.focusWithin.current, event.target)) &&
          (binding.when?.(event) ?? true),
      );
      const run = (match: ShortcutBinding) => {
        setPending(null);
        event.preventDefault();
        match.handler(event);
      };
      const find = (candidate: string[], among = active) => {
        const key = candidate.join(" ");
        let match: ShortcutBinding | undefined;
        for (const entry of among) if (entry.sequence.join(" ") === key) match = entry.binding;
        const continues = among.some(
          ({ sequence }) =>
            sequence.length > candidate.length && sequence.join(" ").startsWith(`${key} `),
        );
        return { match, continues };
      };

      const candidate = prefix ? [...prefix, chord] : [chord];
      const { match, continues } = find(candidate);
      if (match) return run(match);
      if (continues) return setPending({ chords: candidate, at: time });
      setPending(null);
      if (!prefix) return;
      // The key broke a sequence. A character key only cancels it ("g a" must not approve in
      // review); a global binding (?, /) or a non-character chord (⌘K, Escape) still runs on its
      // own, so a stray G never swallows ⌘K and leaves it to the browser.
      const fallback = find(
        [chord],
        active.filter(({ binding }) => binding.scope === "global" || !isCharacterChord(chord)),
      );
      if (fallback.match) run(fallback.match);
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

type KeyForm = "label" | "aria" | "spoken";

/** Named keys and symbols: display label, `aria-keyshortcuts` name, spoken name. */
const KEY_NAMES: Record<string, Record<KeyForm, string>> = {
  arrowleft: { label: "←", aria: "ArrowLeft", spoken: "Left arrow" },
  arrowright: { label: "→", aria: "ArrowRight", spoken: "Right arrow" },
  arrowup: { label: "↑", aria: "ArrowUp", spoken: "Up arrow" },
  arrowdown: { label: "↓", aria: "ArrowDown", spoken: "Down arrow" },
  escape: { label: "Esc", aria: "Escape", spoken: "Escape" },
  enter: { label: "Enter", aria: "Enter", spoken: "Enter" },
  " ": { label: "Space", aria: "Space", spoken: "Space" },
  tab: { label: "Tab", aria: "Tab", spoken: "Tab" },
  "?": { label: "?", aria: "?", spoken: "Question mark" },
  "/": { label: "/", aria: "/", spoken: "Slash" },
  ",": { label: ",", aria: ",", spoken: "Comma" },
};

function modifierName(mod: string, apple: boolean): Record<KeyForm, string> {
  if (mod === "mod") {
    return apple
      ? { label: "⌘", aria: "Meta", spoken: "Command" }
      : { label: "Ctrl", aria: "Control", spoken: "Control" };
  }
  if (mod === "alt")
    return { label: apple ? "⌥" : "Alt", aria: "Alt", spoken: apple ? "Option" : "Alt" };
  return { label: apple ? "⇧" : "Shift", aria: "Shift", spoken: "Shift" };
}

/** Each chord of a shortcut as key names in one form: `"g s"` → `[["G"], ["S"]]`. */
function nameKeys(shortcut: string, apple: boolean, form: KeyForm): string[][] {
  return parseShortcut(shortcut).map((chord) => {
    const parts = chord.split(/\+(?!$)/u);
    const key = parts.pop()!;
    return [
      ...parts.map((mod) => modifierName(mod, apple)[form]),
      KEY_NAMES[key]?.[form] ?? (key.length === 1 ? key.toUpperCase() : key),
    ];
  });
}

/**
 * Display keys per chord: `"mod+k"` → `[["⌘", "K"]]` (or `[["Ctrl", "K"]]`), `"g s"` →
 * `[["G"], ["S"]]`. Render chords as Kbd groups joined by "then".
 */
export function formatShortcut(shortcut: string, apple = isApplePlatform()): string[][] {
  return nameKeys(shortcut, apple, "label");
}

/** The shortcut as read out: `"g s"` → "G then S", `"mod+k"` → "Control K", `"?"` → "Question mark". */
export function spokenShortcut(shortcut: string, apple = isApplePlatform()): string {
  return nameKeys(shortcut, apple, "spoken")
    .map((chord) => chord.join(" "))
    .join(" then ");
}

/**
 * `aria-keyshortcuts` value for a single-chord shortcut (`"mod+k"` → `"Control+K"`), or undefined
 * for sequences, which the attribute can't express (a space there means "or").
 */
export function ariaKeyShortcuts(shortcut: string, apple = isApplePlatform()): string | undefined {
  const chords = nameKeys(shortcut, apple, "aria");
  return chords.length === 1 ? chords[0]!.join("+") : undefined;
}

/** True when a shortcut starts with a character key, so it is off while those are turned off. */
export function isCharacterShortcut(shortcut: string): boolean {
  return isCharacterChord(parseShortcut(shortcut)[0]!);
}

/** localStorage key of the per-device "Use single-key shortcuts" preference (on unless "false"). */
export const SINGLE_KEY_SHORTCUTS_STORAGE_KEY = "screen-commons-single-key-shortcuts";
