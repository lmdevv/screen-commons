import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ariaKeyShortcuts,
  createShortcutDispatcher,
  eventChord,
  formatShortcut,
  isEditableTarget,
  isInScope,
  parseShortcut,
  SEQUENCE_TIMEOUT_MS,
  shouldIgnoreKeyEvent,
  topmostLayer,
  type ShortcutDispatcher,
} from "./keyboard";

function key(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("parseShortcut", () => {
  it("splits sequences and normalises modifiers, case and aliases", () => {
    expect(parseShortcut("g s")).toEqual(["g", "s"]);
    expect(parseShortcut("Shift+Mod+A")).toEqual(["mod+shift+a"]);
    expect(parseShortcut("esc")).toEqual(["escape"]);
    expect(parseShortcut("mod++")).toEqual(["mod++"]);
    expect(() => parseShortcut("ctrl+k")).toThrow(/Unknown modifier/u);
  });
});

describe("eventChord", () => {
  it("maps mod to ⌘ on Apple platforms and Ctrl elsewhere", () => {
    expect(eventChord(key({ key: "k", metaKey: true }), true)).toBe("mod+k");
    expect(eventChord(key({ key: "k", ctrlKey: true }), false)).toBe("mod+k");
    // The other platform's modifier is never usable (Ctrl+K on a Mac, Win+K elsewhere).
    expect(eventChord(key({ key: "k", ctrlKey: true }), true)).toBeNull();
    expect(eventChord(key({ key: "k", metaKey: true }), false)).toBeNull();
  });

  it("keeps Shift for letters and named keys, not for symbols that already encode it", () => {
    expect(eventChord(key({ key: "S", shiftKey: true }), false)).toBe("shift+s");
    expect(eventChord(key({ key: "?", shiftKey: true }), false)).toBe("?");
    expect(eventChord(key({ key: "ArrowLeft", shiftKey: true }), false)).toBe("shift+arrowleft");
    expect(eventChord(key({ key: "S" }), false)).toBe("s"); // Caps Lock
    expect(eventChord(key({ key: "s", altKey: true }), false)).toBe("alt+s");
  });

  it("returns null for a bare modifier press", () => {
    expect(eventChord(key({ key: "Shift", shiftKey: true }), false)).toBeNull();
    expect(eventChord(key({ key: "Meta", metaKey: true }), true)).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("treats text fields, selects, contenteditable and typeahead widgets as editable", () => {
    document.body.innerHTML = `
      <input id="text" /><input id="search" type="search" /><input id="check" type="checkbox" />
      <textarea id="area"></textarea><select id="select"></select>
      <div contenteditable="true"><span id="rich">x</span></div>
      <div role="menu"><div id="item" role="menuitem">x</div></div>
      <button id="button">x</button>`;
    const byId = (id: string) => document.getElementById(id);
    for (const id of ["text", "search", "area", "select", "rich", "item"]) {
      expect(isEditableTarget(byId(id)), id).toBe(true);
    }
    for (const id of ["check", "button"]) expect(isEditableTarget(byId(id)), id).toBe(false);
    expect(isEditableTarget(document.body)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("shouldIgnoreKeyEvent", () => {
  it("ignores handled events, IME composition and auto-repeat", () => {
    const handled = key({ key: "s" });
    handled.preventDefault();
    expect(shouldIgnoreKeyEvent(handled)).toBe(true);
    expect(shouldIgnoreKeyEvent(key({ key: "s", isComposing: true }))).toBe(true);
    expect(shouldIgnoreKeyEvent(key({ key: "Process", keyCode: 229 }))).toBe(true);
    expect(shouldIgnoreKeyEvent(key({ key: "j", repeat: true }))).toBe(true);
    expect(shouldIgnoreKeyEvent(key({ key: "j", repeat: true }), { allowRepeat: true })).toBe(
      false,
    );
    expect(shouldIgnoreKeyEvent(key({ key: "s" }))).toBe(false);
  });

  it("ignores keys typed into fields unless allowed", () => {
    document.body.innerHTML = `<input id="field" />`;
    const field = document.getElementById("field")!;
    let event!: KeyboardEvent;
    field.addEventListener("keydown", (e) => (event = e));
    field.dispatchEvent(key({ key: "k", ctrlKey: true }));
    expect(shouldIgnoreKeyEvent(event)).toBe(true);
    expect(shouldIgnoreKeyEvent(event, { allowInInputs: true })).toBe(false);
  });
});

describe("layers and scope", () => {
  it("finds the topmost open dialog or menu, skipping hidden, non-modal and closing ones", () => {
    document.body.innerHTML = `
      <main id="page"></main>
      <div role="dialog" id="viewer"><span id="inside"></span></div>
      <div role="dialog" id="picker"></div>
      <div role="dialog" hidden></div>
      <div role="dialog" aria-modal="false"></div>
      <div role="dialog" data-closed></div>`;
    const viewer = document.getElementById("viewer")!;
    const picker = document.getElementById("picker")!;
    expect(topmostLayer()).toBe(picker);
    picker.remove();
    expect(topmostLayer()).toBe(viewer);

    const inside = { current: document.getElementById("inside") };
    const page = { current: document.getElementById("page") };
    expect(isInScope("global", viewer)).toBe(true);
    expect(isInScope("page", viewer)).toBe(false);
    expect(isInScope("page", null)).toBe(true);
    expect(isInScope(inside, viewer)).toBe(true);
    expect(isInScope(page, viewer)).toBe(false);
    expect(isInScope({ current: null }, null)).toBe(false);
  });
});

describe("createShortcutDispatcher", () => {
  let time = 0;
  let layer: Element | null = null;
  let dispatcher: ShortcutDispatcher;
  const press = (
    init: KeyboardEventInit & { key: string },
    target: HTMLElement = document.body,
  ) => {
    const event = key(init);
    target.addEventListener("keydown", (e) => dispatcher.handle(e), { once: true });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    time = 0;
    layer = null;
    document.body.innerHTML = "";
    dispatcher = createShortcutDispatcher({
      now: () => time,
      apple: () => false,
      layer: () => layer,
    });
  });
  afterEach(() => vi.useRealTimers());

  it("fires single keys and prevents the default action", () => {
    const save = vi.fn();
    dispatcher.register({ shortcut: "s", handler: save });
    const event = press({ key: "s" });
    expect(save).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("rejects modifiers the binding doesn't name", () => {
    const save = vi.fn();
    dispatcher.register({ shortcut: "s", handler: save });
    press({ key: "s", ctrlKey: true });
    press({ key: "s", altKey: true });
    press({ key: "S", shiftKey: true });
    expect(save).not.toHaveBeenCalled();
  });

  it("runs a sequence instead of the single key it ends with", () => {
    const save = vi.fn();
    const saved = vi.fn();
    dispatcher.register({ shortcut: "s", handler: save });
    dispatcher.register({ shortcut: "g s", handler: saved });
    press({ key: "g" });
    expect(dispatcher.pending()).toEqual(["g"]);
    press({ key: "s" });
    expect(saved).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    expect(dispatcher.pending()).toEqual([]);
  });

  it("expires a pending sequence after the timeout", () => {
    const save = vi.fn();
    const saved = vi.fn();
    const onPendingChange = vi.fn();
    dispatcher = createShortcutDispatcher({
      now: () => time,
      apple: () => false,
      layer: () => null,
      onPendingChange,
    });
    dispatcher.register({ shortcut: "s", handler: save });
    dispatcher.register({ shortcut: "g s", handler: saved });
    press({ key: "g" });
    expect(onPendingChange).toHaveBeenLastCalledWith(["g"]);
    time += SEQUENCE_TIMEOUT_MS + 1;
    vi.advanceTimersByTime(SEQUENCE_TIMEOUT_MS + 1);
    expect(onPendingChange).toHaveBeenLastCalledWith([]);
    press({ key: "s" });
    expect(saved).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });

  it("cancels the sequence on a key that doesn't continue it, without running that key", () => {
    const saved = vi.fn();
    const approve = vi.fn();
    dispatcher.register({ shortcut: "g s", handler: saved });
    dispatcher.register({ shortcut: "a", handler: approve });
    press({ key: "g" });
    const breaking = press({ key: "a" });
    expect(approve).not.toHaveBeenCalled();
    expect(breaking.defaultPrevented).toBe(false);
    expect(dispatcher.pending()).toEqual([]);
    press({ key: "s" });
    expect(saved).not.toHaveBeenCalled();
    press({ key: "a" });
    expect(approve).toHaveBeenCalledOnce();
  });

  it("keeps a sequence alive across a bare modifier press", () => {
    const settings = vi.fn();
    dispatcher.register({ shortcut: "g ?", handler: settings });
    press({ key: "g" });
    press({ key: "Shift", shiftKey: true });
    press({ key: "?", shiftKey: true });
    expect(settings).toHaveBeenCalledOnce();
  });

  it("ignores typing, composition, repeat and handled events", () => {
    const docs = vi.fn();
    dispatcher.register({ shortcut: "g d", handler: docs });
    document.body.innerHTML = `<input id="field" />`;
    const field = document.getElementById("field")!;
    press({ key: "g" }, field);
    press({ key: "d" }, field);
    expect(docs).not.toHaveBeenCalled();
    expect(dispatcher.pending()).toEqual([]);

    press({ key: "g", isComposing: true });
    expect(dispatcher.pending()).toEqual([]);
    press({ key: "g", repeat: true });
    expect(dispatcher.pending()).toEqual([]);

    const handled = key({ key: "g" });
    document.body.addEventListener("keydown", (e) => e.preventDefault(), { once: true });
    document.body.addEventListener("keydown", (e) => dispatcher.handle(e), { once: true });
    document.body.dispatchEvent(handled);
    expect(dispatcher.pending()).toEqual([]);
  });

  it("lets allowInInputs and allowRepeat bindings through", () => {
    const palette = vi.fn();
    const next = vi.fn();
    dispatcher.register({ shortcut: "mod+k", handler: palette, allowInInputs: true });
    dispatcher.register({ shortcut: "j", handler: next, allowRepeat: true });
    document.body.innerHTML = `<input id="field" />`;
    press({ key: "k", ctrlKey: true }, document.getElementById("field")!);
    press({ key: "j", repeat: true });
    expect(palette).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it("scopes bindings to the page or the topmost dialog", () => {
    document.body.innerHTML = `<div role="dialog" id="viewer"><span id="in"></span></div>`;
    const viewer = document.getElementById("viewer")!;
    const go = vi.fn();
    const save = vi.fn();
    const help = vi.fn();
    dispatcher.register({ shortcut: "g s", handler: go });
    dispatcher.register({
      shortcut: "s",
      handler: save,
      scope: { current: viewer.firstElementChild },
    });
    dispatcher.register({ shortcut: "?", handler: help, scope: "global" });

    layer = viewer; // the viewer is open: page shortcuts pause, its own keys work
    press({ key: "g" });
    press({ key: "s" });
    expect(go).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();

    layer = document.createElement("div"); // a picker stacked on top: viewer keys pause too
    press({ key: "s" });
    expect(save).toHaveBeenCalledOnce();
    press({ key: "?", shiftKey: true });
    expect(help).toHaveBeenCalledOnce();

    layer = null;
    press({ key: "g" });
    press({ key: "s" });
    expect(go).toHaveBeenCalledOnce();
  });

  it("honours `when` and lets the latest registration win", () => {
    const first = vi.fn();
    const second = vi.fn();
    let allowed = false;
    dispatcher.register({ shortcut: "c", handler: first });
    const remove = dispatcher.register({ shortcut: "c", handler: second, when: () => allowed });
    press({ key: "c" });
    expect(first).toHaveBeenCalledOnce();
    allowed = true;
    press({ key: "c" });
    expect(second).toHaveBeenCalledOnce();
    remove();
    press({ key: "c" });
    expect(first).toHaveBeenCalledTimes(2);
  });
});

describe("formatting", () => {
  it("formats display keys per platform", () => {
    expect(formatShortcut("mod+k", true)).toEqual([["⌘", "K"]]);
    expect(formatShortcut("mod+k", false)).toEqual([["Ctrl", "K"]]);
    expect(formatShortcut("g s", false)).toEqual([["G"], ["S"]]);
    expect(formatShortcut("arrowleft", false)).toEqual([["←"]]);
    expect(formatShortcut("?", false)).toEqual([["?"]]);
  });

  it("builds aria-keyshortcuts for single chords only", () => {
    expect(ariaKeyShortcuts("mod+k", false)).toBe("Control+K");
    expect(ariaKeyShortcuts("mod+k", true)).toBe("Meta+K");
    expect(ariaKeyShortcuts("/", false)).toBe("/");
    expect(ariaKeyShortcuts("escape", false)).toBe("Escape");
    expect(ariaKeyShortcuts("g s", false)).toBeUndefined();
  });
});
