import type * as React from "react";

import { cn } from "../lib/cn";

export interface SelectionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of selected items; the bar is shown when > 0. */
  count: number;
  /** "1 selected" by default. */
  label?: (count: number) => React.ReactNode;
  onClear?: () => void;
  /** Action buttons: `<SelectionBarButton>`s, with the main one `primary`. */
  children?: React.ReactNode;
}

/**
 * Floating dark bar at the bottom centre for bulk actions on selected screens:
 * "3 selected · Clear · ⤓ · Copy · Save". Animates in/out; inert while hidden.
 */
export function SelectionBar({
  count,
  label = (n) => `${n} selected`,
  onClear,
  children,
  className,
  ...props
}: SelectionBarProps) {
  const open = count > 0;
  return (
    <div
      role="region"
      aria-label="Selection"
      aria-hidden={!open}
      inert={!open}
      data-open={open ? "" : undefined}
      className={cn(
        "fixed inset-x-0 bottom-5 z-40 mx-auto flex w-max max-w-[calc(100vw-24px)] items-center gap-1 rounded-[18px] bg-chrome/95 p-1.5 pl-5 text-chrome-fg shadow-overlay backdrop-blur-xl",
        "translate-y-4 opacity-0 transition-[opacity,transform] duration-180 ease-out data-[open]:translate-y-0 data-[open]:opacity-100",
        className,
      )}
      {...props}
    >
      <span className="mr-3 text-md font-medium whitespace-nowrap tabular-nums" aria-live="polite">
        {label(count)}
      </span>
      {onClear ? <SelectionBarButton onClick={onClear}>Clear</SelectionBarButton> : null}
      {children}
    </div>
  );
}

export interface SelectionBarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** White pill (the main action). */
  primary?: boolean;
  /** Square icon-only button; pass `aria-label`. */
  icon?: boolean;
}

export function SelectionBarButton({
  primary = false,
  icon = false,
  className,
  ...props
}: SelectionBarButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "ou-focus-ring flex h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] text-base font-medium whitespace-nowrap",
        "transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] [&_svg]:size-[18px]",
        icon ? "w-10" : "px-4",
        primary
          ? "bg-white text-[#0a0a0a] hover:bg-white/90"
          : "bg-chrome-hover text-chrome-fg hover:bg-white/15",
        className,
      )}
      {...props}
    />
  );
}
