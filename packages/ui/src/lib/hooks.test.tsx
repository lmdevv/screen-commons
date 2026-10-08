import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useShortcutHint } from "../components/kbd";
import { useHotkey, useReturnFocus, useSingleKeyShortcuts } from "./hooks";
import { SINGLE_KEY_SHORTCUTS_STORAGE_KEY } from "./keyboard";

function Hotkey({ keys, onKey }: { keys: string; onKey: () => void }) {
  useHotkey(keys, onKey);
  return null;
}

/** Live document keydown listeners added by `useHotkey` (adds minus removes). */
function trackKeydownListeners() {
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === "keydown").length;
  return () => count(add) - count(remove);
}

afterEach(() => {
  vi.restoreAllMocks();
  // The preference is module state: reset it between tests.
  renderHook(() => useSingleKeyShortcuts()).result.current[1](true);
});

describe("useHotkey", () => {
  it("shares one document listener, removed with the last binding", () => {
    const live = trackKeydownListeners();
    const save = vi.fn();
    const zoom = vi.fn();
    const first = render(<Hotkey keys="s" onKey={save} />);
    const second = render(<Hotkey keys="z" onKey={zoom} />);
    expect(live()).toBe(1);

    fireEvent.keyDown(document.body, { key: "s" });
    fireEvent.keyDown(document.body, { key: "z" });
    expect(save).toHaveBeenCalledOnce();
    expect(zoom).toHaveBeenCalledOnce();

    first.unmount();
    expect(live()).toBe(1);
    fireEvent.keyDown(document.body, { key: "z" });
    expect(zoom).toHaveBeenCalledTimes(2);
    second.unmount();
    expect(live()).toBe(0);
  });

  it("stays balanced under StrictMode's double effects", () => {
    const live = trackKeydownListeners();
    const save = vi.fn();
    const view = render(
      <React.StrictMode>
        <Hotkey keys="s" onKey={save} />
      </React.StrictMode>,
    );
    expect(live()).toBe(1);
    fireEvent.keyDown(document.body, { key: "s" });
    expect(save).toHaveBeenCalledOnce(); // registered once, not twice
    view.unmount();
    expect(live()).toBe(0);
  });

  it("reaches keys a dialog stops from bubbling with capture, on its own listener", () => {
    const live = trackKeydownListeners();
    const bubbled = vi.fn();
    const captured = vi.fn();
    function Bindings() {
      useHotkey("arrowright", bubbled, { scope: "global" });
      useHotkey("arrowleft", captured, { scope: "global", capture: true });
      return null;
    }
    // Like Base UI's Dialog.Popup, which keeps composite keys (arrows) to itself.
    render(
      <div role="dialog" onKeyDown={(event) => event.stopPropagation()}>
        <Bindings />
        <button type="button">inside</button>
      </div>,
    );
    expect(live()).toBe(2);
    const inside = screen.getByRole("button", { name: "inside" });
    fireEvent.keyDown(inside, { key: "ArrowRight" });
    fireEvent.keyDown(inside, { key: "ArrowLeft" });
    expect(bubbled).not.toHaveBeenCalled();
    expect(captured).toHaveBeenCalledOnce();
    cleanup();
    expect(live()).toBe(0);
  });

  it("follows the single-key preference, which persists per device", () => {
    const save = vi.fn();
    const palette = vi.fn();
    function Bindings() {
      useHotkey("s", save);
      useHotkey("mod+k", palette, { scope: "global" });
      return null;
    }
    render(<Bindings />);
    const { result } = renderHook(() => useSingleKeyShortcuts());
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY)).toBe("false");
    fireEvent.keyDown(document.body, { key: "s" });
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true }); // jsdom: not an Apple platform
    expect(save).not.toHaveBeenCalled();
    expect(palette).toHaveBeenCalledOnce();

    act(() => result.current[1](true));
    fireEvent.keyDown(document.body, { key: "s" });
    expect(save).toHaveBeenCalledOnce();
  });
});

describe("useReturnFocus", () => {
  function Harness({ onReady }: { onReady: (value: ReturnType<typeof useReturnFocus>) => void }) {
    onReady(useReturnFocus());
    return (
      <>
        <div data-testid="viewer" tabIndex={-1} />
        <button type="button">Copy link</button>
      </>
    );
  }

  function setup() {
    let api!: ReturnType<typeof useReturnFocus>;
    render(<Harness onReady={(value) => (api = value)} />);
    return { api, viewer: screen.getByTestId("viewer"), button: screen.getByRole("button") };
  }

  it("restores the exact element, a frame after the overlay is gone", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    const { api, viewer, button } = setup();
    viewer.focus();
    api.remember();
    button.focus(); // inside the overlay…
    button.blur(); // …which then unmounts
    expect(api.finalFocus()).toBe(false); // handled here, not by the dialog
    vi.advanceTimersToNextFrame();
    expect(document.activeElement).toBe(viewer);
    vi.useRealTimers();
  });

  it("doesn't pull focus out of an overlay reopened before the hand-back", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const { api, viewer, button } = setup();
    viewer.focus();
    api.remember();
    (document.activeElement as HTMLElement).blur(); // the palette unmounted
    expect(api.finalFocus()).toBe(false);
    api.remember(); // ⌘K again, within the same frame
    button.focus(); // the new palette's field
    vi.advanceTimersToNextFrame();
    expect(document.activeElement).toBe(button);
    // Closing the new one still returns to the viewer.
    button.blur();
    expect(api.finalFocus()).toBe(false);
    vi.advanceTimersToNextFrame();
    expect(document.activeElement).toBe(viewer);
    vi.useRealTimers();
  });

  it("leaves focus to the dialog when there is nothing to return to", () => {
    const { api } = setup();
    (document.activeElement as HTMLElement | null)?.blur();
    api.remember(); // body: nothing remembered
    expect(api.finalFocus()).toBe(true);
    const tile = document.body.appendChild(document.createElement("button"));
    tile.focus();
    api.remember();
    tile.remove(); // gone before the overlay closed
    expect(api.finalFocus()).toBe(true);
  });
});

describe("useShortcutHint", () => {
  function Item({ keys, children }: { keys: string; children: string }) {
    const hint = useShortcutHint(keys);
    return (
      <button type="button" {...hint.props}>
        {children}
        {hint.hint}
        {hint.description}
      </button>
    );
  }

  it("keeps the keys out of the name: a chord in aria-keyshortcuts, a sequence as description", () => {
    render(
      <>
        <Item keys="g s">Saved</Item>
        <Item keys="?">Keyboard shortcuts</Item>
      </>,
    );
    // Names are computed by dom-accessibility-api, the same rules browsers follow.
    const saved = screen.getByRole("button", { name: "Saved" });
    const description = document.getElementById(saved.getAttribute("aria-describedby")!);
    expect(description?.textContent).toBe("G then S");
    expect(description?.hidden).toBe(true);
    expect(saved.hasAttribute("aria-keyshortcuts")).toBe(false);
    const help = screen.getByRole("button", { name: "Keyboard shortcuts" });
    expect(help.getAttribute("aria-keyshortcuts")).toBe("?");
    expect(help.hasAttribute("aria-describedby")).toBe(false);
  });

  it("drops character-key hints while single-key shortcuts are off", () => {
    const { result } = renderHook(() => useSingleKeyShortcuts());
    act(() => result.current[1](false));
    render(
      <>
        <Item keys="g s">Saved</Item>
        <Item keys="mod+k">Search</Item>
      </>,
    );
    const saved = screen.getByRole("button", { name: "Saved" });
    expect(saved.hasAttribute("aria-describedby")).toBe(false);
    expect(saved.textContent).toBe("Saved");
    expect(screen.getByRole("button", { name: "Search" }).hasAttribute("aria-keyshortcuts")).toBe(
      true,
    );
  });
});
