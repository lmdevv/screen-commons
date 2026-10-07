import { Separator as BaseSeparator } from "@base-ui/react/separator";
import type * as React from "react";

import { cn } from "../lib/cn";

/** Hairline separator. `orientation="vertical"` for inline groups (needs a height from the parent). */
export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof BaseSeparator>) {
  return (
    <BaseSeparator
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
        className,
      )}
      {...props}
    />
  );
}
