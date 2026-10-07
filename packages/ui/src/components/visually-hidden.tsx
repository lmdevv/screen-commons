import type * as React from "react";

import { cn } from "../lib/cn";

/** Content for screen readers only. */
export function VisuallyHidden({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("sr-only", className)} {...props} />;
}
