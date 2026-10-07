import { Search } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { useIsMac } from "../lib/hooks";
import { Kbd, KbdGroup } from "./kbd";

export interface SearchPillProps extends Omit<React.ComponentProps<"button">, "children"> {
  /** Placeholder copy, e.g. "Search Web apps, screens, flows…". */
  placeholder?: string;
  /** Show the ⌘K / Ctrl K hint. Default true. */
  shortcut?: boolean;
  size?: "md" | "lg";
}

/**
 * Top-bar search trigger. It is a button that opens the CommandPalette — not an input — so the
 * palette owns typing, results and keyboard navigation.
 */
export function SearchPill({
  placeholder = "Search apps, screens, flows…",
  shortcut = true,
  size = "md",
  className,
  ...props
}: SearchPillProps) {
  const isMac = useIsMac();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-keyshortcuts={shortcut ? (isMac ? "Meta+K" : "Control+K") : undefined}
      className={cn(
        "ou-focus-ring group flex w-full min-w-0 items-center gap-2.5 rounded-pill bg-muted text-left text-fg-subtle",
        "transition-colors duration-150 ease-out hover:bg-muted-strong",
        size === "md" ? "h-10 pr-2 pl-4 text-base" : "h-12 pr-3 pl-5 text-md",
        className,
      )}
      {...props}
    >
      <Search aria-hidden className="size-4 shrink-0 text-fg-muted" strokeWidth={2} />
      <span className="min-w-0 flex-1 truncate">{placeholder}</span>
      {shortcut ? (
        <KbdGroup aria-hidden className="hidden sm:inline-flex">
          <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      ) : null}
    </button>
  );
}
