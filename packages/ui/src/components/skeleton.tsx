import type * as React from "react";

import { cn } from "../lib/cn";

/** Loading placeholder block. Give it a size and radius: `<Skeleton className="h-4 w-24" />`. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden className={cn("animate-ou-pulse rounded-sm bg-muted", className)} {...props} />
  );
}
