import type * as React from "react";

import { cn } from "../lib/cn";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** A lucide icon element, e.g. `<Bookmark />`. Rendered small and muted — no illustrations. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons. */
  actions?: React.ReactNode;
  /** `tile` puts it on the grey tile (inside grids); `plain` is transparent. */
  tone?: "plain" | "tile";
  size?: "sm" | "md";
}

/** No results / nothing saved yet / no access. Quiet, centred, one clear action. */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  tone = "plain",
  size = "md",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "md" ? "gap-4 px-6 py-20" : "gap-3 px-4 py-10",
        tone === "tile" && "rounded-tile bg-tile",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          aria-hidden
          className={cn(
            "flex items-center justify-center rounded-full text-fg-muted [&_svg]:size-5",
            tone === "tile" ? "bg-bg" : "bg-muted",
            size === "md" ? "size-11" : "size-9",
          )}
        >
          {icon}
        </div>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1">
        <h3 className={cn("font-semibold text-fg", size === "md" ? "text-md" : "text-base")}>
          {title}
        </h3>
        {description ? (
          <p className={cn("text-fg-muted", size === "md" ? "text-base" : "text-sm")}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
