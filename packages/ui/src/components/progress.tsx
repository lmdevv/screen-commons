import type * as React from "react";

import { cn } from "../lib/cn";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100. Omit for indeterminate. */
  value?: number;
  label?: string;
}

/** Thin progress bar (uploads). */
export function Progress({ value, label = "Progress", className, ...props }: ProgressProps) {
  const clamped = value === undefined ? undefined : Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("h-1 w-full overflow-hidden rounded-pill bg-muted-strong", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-pill bg-inverse transition-[width] duration-200 ease-out",
          clamped === undefined && "w-1/3 animate-ou-pulse",
        )}
        style={clamped === undefined ? undefined : { width: `${clamped}%` }}
      />
    </div>
  );
}
