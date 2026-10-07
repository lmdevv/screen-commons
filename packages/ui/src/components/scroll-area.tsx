import type * as React from "react";

import { cn } from "../lib/cn";

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Scroll axis. Default `y`. */
  orientation?: "x" | "y" | "both";
  /** Hide the scrollbar entirely (still scrollable). For chip rows and strips. */
  hideScrollbar?: boolean;
  /** Fade the edges with a mask (8% each side) — hints at more content. */
  fade?: boolean;
}

/**
 * Lightweight native scroll container with a thin, themed scrollbar. No JS, no custom thumb —
 * native momentum and accessibility. Make it keyboard-scrollable by keeping `tabIndex={0}` when
 * the content has no focusable children.
 */
export function ScrollArea({
  orientation = "y",
  hideScrollbar = false,
  fade = false,
  className,
  ...props
}: ScrollAreaProps) {
  return (
    <div
      className={cn(
        "outline-none focus-visible:ring-2 focus-visible:ring-accent",
        orientation === "y" && "overflow-x-hidden overflow-y-auto overscroll-contain",
        orientation === "x" && "overflow-x-auto overflow-y-hidden overscroll-x-contain",
        orientation === "both" && "overflow-auto",
        hideScrollbar ? "ou-scrollbar-none" : "ou-scrollbar-thin",
        fade &&
          orientation === "x" &&
          "[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]",
        fade &&
          orientation === "y" &&
          "[mask-image:linear-gradient(to_bottom,transparent,black_16px,black_calc(100%-16px),transparent)]",
        className,
      )}
      {...props}
    />
  );
}
