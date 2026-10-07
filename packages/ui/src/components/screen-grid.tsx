import type { Platform } from "@open-ui/core/taxonomy";
import type * as React from "react";

import { cn } from "../lib/cn";
import { frameKind, type FrameKind } from "../lib/screen";
import { Skeleton } from "./skeleton";

/** Column recipes. Desktop screenshots: 1→2→3→4; phone screenshots: 2→3→4→5→6. */
export const gridColumns: Record<FrameKind | "apps-web" | "apps-mobile" | "flows", string> = {
  web: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  mobile: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6",
  "apps-web": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  "apps-mobile": "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  flows: "grid-cols-1 md:grid-cols-2 2xl:grid-cols-3",
};

export interface ScreenGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Picks the column recipe for screens of this platform. */
  platform?: Platform;
  /** Explicit recipe (overrides `platform`): `apps-web`, `apps-mobile`, `flows`, `web`, `mobile`. */
  columns?: keyof typeof gridColumns;
  /** Skip rendering work for off-screen items (`content-visibility: auto`). Default false — it clips focus rings; enable for very long, non-interactive lists. */
  lazyRender?: boolean;
}

/**
 * Responsive CSS grid for tiles and cards. Gaps: 16px mobile → 24px desktop (row gap a bit larger
 * when cards have captions below). Render tiles as direct children.
 */
export function ScreenGrid({
  platform = "web",
  columns,
  lazyRender = false,
  className,
  ...props
}: ScreenGridProps) {
  const recipe = columns ?? frameKind(platform);
  return (
    <div
      role="list"
      className={cn(
        "grid gap-x-4 gap-y-6 sm:gap-x-5 lg:gap-x-6 lg:gap-y-8",
        gridColumns[recipe],
        lazyRender && "[&>*]:ou-cv-auto",
        "[&>*]:min-w-0",
        className,
      )}
      {...props}
    />
  );
}

/** List item wrapper so the grid keeps list semantics: `<ScreenGridItem><ScreenTile/></ScreenGridItem>`. */
export function ScreenGridItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="listitem" className={cn("min-w-0", className)} {...props} />;
}

export interface ScreenGridSkeletonProps {
  platform?: Platform;
  columns?: keyof typeof gridColumns;
  count?: number;
  /** Include the caption/meta row of AppCard/FlowCard. */
  withMeta?: boolean;
  className?: string;
}

/** Placeholder grid while the first page loads. Same geometry as the real tiles: no layout shift. */
export function ScreenGridSkeleton({
  platform = "web",
  columns,
  count = 12,
  withMeta = false,
  className,
}: ScreenGridSkeletonProps) {
  const recipe = columns ?? frameKind(platform);
  const mobile = recipe === "mobile" || recipe === "apps-mobile";
  return (
    <div
      aria-busy
      aria-label="Loading"
      className={cn(
        "grid gap-x-4 gap-y-6 sm:gap-x-5 lg:gap-x-6 lg:gap-y-8",
        gridColumns[recipe],
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-w-0 flex-col gap-3">
          <Skeleton
            className={cn(
              "w-full",
              recipe === "web" && "aspect-[1.476] rounded-tile",
              recipe === "mobile" && "aspect-[9/19.5] rounded-[28px]",
              recipe === "apps-web" && "aspect-[8/7] rounded-tile",
              recipe === "apps-mobile" && "aspect-[10/19] rounded-tile",
              recipe === "flows" && "aspect-[2/1] rounded-tile",
              !mobile && recipe === "web" && "bg-tile",
            )}
          />
          {withMeta ? (
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-[9px]" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
