import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Tooltip, TooltipProvider } from "./tooltip";

function setup() {
  render(
    <TooltipProvider delay={300}>
      <Tooltip content="Saved">
        <button type="button" aria-label="Saved">
          s
        </button>
      </Tooltip>
    </TooltipProvider>,
  );
  return {
    trigger: screen.getByRole("button", { name: "Saved" }),
    bubble: document.querySelector("[role=tooltip]") as HTMLElement,
  };
}

describe("Tooltip", () => {
  it("opens after the hover delay and closes on leave", () => {
    vi.useFakeTimers();
    const { trigger, bubble } = setup();
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    expect(bubble.hasAttribute("data-open")).toBe(false);
    act(() => vi.advanceTimersByTime(300));
    expect(bubble.hasAttribute("data-open")).toBe(true);
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
    expect(bubble.hasAttribute("data-open")).toBe(false);
    vi.useRealTimers();
  });

  it("is dismissible with Escape without closing parent overlays", () => {
    vi.useFakeTimers();
    const { trigger, bubble } = setup();
    const parentKeyDown = vi.fn();
    document.addEventListener("keydown", parentKeyDown);
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(bubble.hasAttribute("data-open")).toBe(false);
    expect(parentKeyDown).not.toHaveBeenCalled();
    document.removeEventListener("keydown", parentKeyDown);
    vi.useRealTimers();
  });
});
