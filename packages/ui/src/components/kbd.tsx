import type * as React from "react";

import { cn } from "../lib/cn";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /** `default` for light surfaces, `chrome` on dark floating bars. */
  tone?: "default" | "chrome";
}

/** Keyboard key hint: `<Kbd>⌘</Kbd><Kbd>K</Kbd>` or `<Kbd>Esc</Kbd>`. */
export function Kbd({ tone = "default", className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] px-1 font-sans text-2xs font-medium tabular-nums",
        tone === "default" && "border border-border-strong bg-bg text-fg-muted",
        tone === "chrome" && "bg-white/12 text-chrome-muted",
        className,
      )}
      {...props}
    />
  );
}

/** Groups several keys with a small gap: `<KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>`. */
export function KbdGroup({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center gap-0.5", className)} {...props} />;
}
