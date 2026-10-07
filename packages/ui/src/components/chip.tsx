import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";

export type ChipSize = "sm" | "md";

const chipBase =
  "ou-focus-ring inline-flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-pill font-medium " +
  "transition-[background-color,color,border-color,transform] duration-150 ease-out [&_svg]:size-3.5 [&_svg]:shrink-0";

const chipSizes: Record<ChipSize, string> = {
  sm: "h-7 px-3 text-sm",
  md: "h-9 px-4 text-base",
};

export interface ChipProps extends useRender.ComponentProps<"span"> {
  size?: ChipSize;
  /** `outline` (hairline, default), `soft` (grey fill) or `solid` (black). */
  tone?: "outline" | "soft" | "solid";
  /** Renders an × button that calls `onRemove`. */
  onRemove?: () => void;
  removeLabel?: string;
}

/**
 * Static or link chip — tags such as patterns/elements in the screen viewer.
 * Use `render={<Link to=… />}` to make it navigable.
 */
export function Chip({
  size = "sm",
  tone = "outline",
  onRemove,
  removeLabel = "Remove",
  className,
  render,
  children,
  ...props
}: ChipProps) {
  const interactive = render !== undefined;
  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">(
      {
        className: cn(
          chipBase,
          chipSizes[size],
          tone === "outline" && "border border-border text-fg",
          tone === "soft" && "bg-muted text-fg",
          tone === "solid" && "bg-inverse text-inverse-fg",
          interactive && tone === "outline" && "hover:bg-muted",
          interactive && tone === "soft" && "hover:bg-muted-strong",
          onRemove && "pr-1.5",
          className,
        ),
        children: (
          <>
            {children}
            {onRemove ? (
              <button
                type="button"
                aria-label={removeLabel}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove();
                }}
                className="ou-focus-ring -my-1 flex size-5 items-center justify-center rounded-pill text-fg-muted hover:bg-muted-strong hover:text-fg"
              >
                <X aria-hidden className="size-3" />
              </button>
            ) : null}
          </>
        ),
      },
      props,
    ),
  });
}

export interface FilterChipProps extends Omit<React.ComponentProps<"button">, "onChange"> {
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  size?: ChipSize;
  /** Optional trailing count, rendered in tabular numerals. */
  count?: number;
}

/**
 * Selectable pill (toggle button). Selected = solid black pill; idle = hairline outline.
 * Used in category rows, pattern pickers and filter panels.
 */
export function FilterChip({
  selected = false,
  onSelectedChange,
  size = "md",
  count,
  className,
  children,
  onClick,
  ...props
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-selected={selected ? "" : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelectedChange?.(!selected);
      }}
      className={cn(
        chipBase,
        chipSizes[size],
        "active:scale-[0.97]",
        selected
          ? "border border-inverse bg-inverse text-inverse-fg"
          : "border border-border bg-bg text-fg hover:border-border-strong hover:bg-muted",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            "tabular-nums text-sm",
            selected ? "text-inverse-fg/60" : "text-fg-subtle",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
