import { ChevronLeft, ChevronRight } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { useScrollEdges } from "../lib/hooks";
import { FilterChip } from "./chip";

export interface CategoryChipItem {
  value: string;
  label: string;
  count?: number;
}

export interface CategoryChipsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: readonly CategoryChipItem[];
  /** Selected value; `null` = "All". */
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Label of the leading "all" chip; pass `null` to omit it. */
  allLabel?: string | null;
  /** Before the chips, separated by a hairline — e.g. a "Filters" button. */
  leading?: React.ReactNode;
  /** Accessible name of the group, e.g. "Categories". */
  "aria-label": string;
  size?: "sm" | "md";
}

/**
 * Horizontally scrolling row of filter chips with fading edges and arrow buttons, like the
 * category row on Discover. Chips are toggle buttons (`aria-pressed`).
 */
export function CategoryChips({
  items,
  value,
  onValueChange,
  allLabel = "All",
  leading,
  size = "md",
  className,
  ...props
}: CategoryChipsProps) {
  const { ref, canScrollStart, canScrollEnd, scrollByPage } = useScrollEdges<HTMLDivElement>();
  const mask = cn(
    canScrollStart && canScrollEnd && "[mask-image:linear-gradient(to_right,transparent,black_56px,black_calc(100%-72px),transparent)]",
    canScrollStart && !canScrollEnd && "[mask-image:linear-gradient(to_right,transparent,black_56px)]",
    !canScrollStart && canScrollEnd && "[mask-image:linear-gradient(to_right,black_calc(100%-72px),transparent)]",
  );
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {leading ? (
        <>
          <div className="flex shrink-0 items-center">{leading}</div>
          <span aria-hidden className="h-6 w-px shrink-0 bg-border-strong" />
        </>
      ) : null}
      <div className="relative min-w-0 flex-1">
        <div
          ref={ref}
          role="group"
          className={cn("ou-scrollbar-none -my-1 flex items-center gap-2 overflow-x-auto py-1", mask)}
          {...props}
        >
          {allLabel !== null ? (
            <FilterChip size={size} selected={value === null} onSelectedChange={() => onValueChange(null)}>
              {allLabel}
            </FilterChip>
          ) : null}
          {items.map((item) => (
            <FilterChip
              key={item.value}
              size={size}
              count={item.count}
              selected={value === item.value}
              onSelectedChange={(selected) => onValueChange(selected ? item.value : null)}
            >
              {item.label}
            </FilterChip>
          ))}
        </div>
        <EdgeButton side="start" visible={canScrollStart} onClick={() => scrollByPage(-1)} />
        <EdgeButton side="end" visible={canScrollEnd} onClick={() => scrollByPage(1)} />
      </div>
    </div>
  );
}

function EdgeButton({
  side,
  visible,
  onClick,
}: {
  side: "start" | "end";
  visible: boolean;
  onClick: () => void;
}) {
  const Icon = side === "start" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      className={cn(
        "absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-fg transition-[opacity,background-color] duration-150 hover:bg-muted",
        side === "start" ? "left-0" : "right-0",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
