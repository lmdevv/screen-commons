import type * as React from "react";

import { cn } from "../lib/cn";

/** Styled anchor for inline links. Use `render`-less: wrap your router link with `textLinkClassName`. */
export const textLinkClassName =
  "ou-focus-ring rounded-xs text-fg underline decoration-border-strong underline-offset-[3px] transition-[text-decoration-color] duration-150 hover:decoration-current";

export function TextLink({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn(textLinkClassName, className)} {...props} />;
}
