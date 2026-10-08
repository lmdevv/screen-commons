import * as React from "react";

import { cn } from "../lib/cn";
import { useIsMac } from "../lib/hooks";
import { formatShortcut } from "../lib/keyboard";

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

const SPOKEN: Record<string, string> = {
  "⌘": "Command",
  "⌥": "Option",
  "⇧": "Shift",
  "←": "Left arrow",
  "→": "Right arrow",
  "↑": "Up arrow",
  "↓": "Down arrow",
  Esc: "Escape",
  "?": "Question mark",
  "/": "Slash",
  ",": "Comma",
};

export interface ShortcutProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Shortcut in `useHotkey` notation: `"mod+k"`, `"g s"`, `"?"`. */
  keys: string;
  /** Alternatives with the same effect (`["arrowdown"]`), shown side by side. */
  also?: readonly string[];
  tone?: KbdProps["tone"];
}

/**
 * Renders a shortcut for the current platform — `"g s"` → `G then S`, `"mod+k"` → `⌘ K` /
 * `Ctrl K` — with a spoken text version for screen readers.
 */
export function Shortcut({ keys, also = [], tone, className, ...props }: ShortcutProps) {
  const isMac = useIsMac();
  const variants = [keys, ...also].map((shortcut) => formatShortcut(shortcut, isMac));
  const spoken = variants
    .map((chords) =>
      chords.map((chord) => chord.map((k) => SPOKEN[k] ?? k).join(" ")).join(" then "),
    )
    .join(" or ");
  return (
    <span className={cn("inline-flex items-center", className)} {...props}>
      <span className="sr-only">{spoken}</span>
      <span aria-hidden className="inline-flex items-center gap-1">
        {variants.map((chords, v) =>
          chords.map((chord, c) => (
            <React.Fragment key={`${v}:${c}`}>
              {c > 0 ? <span className="px-0.5 text-xs text-fg-subtle">then</span> : null}
              <KbdGroup>
                {chord.map((key) => (
                  <Kbd key={key} tone={tone}>
                    {key}
                  </Kbd>
                ))}
              </KbdGroup>
            </React.Fragment>
          )),
        )}
      </span>
    </span>
  );
}
