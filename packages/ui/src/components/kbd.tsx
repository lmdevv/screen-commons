import * as React from "react";

import { cn } from "../lib/cn";
import { useIsMac, useSingleKeyShortcuts } from "../lib/hooks";
import {
  ariaKeyShortcuts,
  formatShortcut,
  isCharacterShortcut,
  spokenShortcut,
} from "../lib/keyboard";

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

export interface ShortcutProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Shortcut in `useHotkey` notation: `"mod+k"`, `"g s"`, `"?"`. */
  keys: string;
  /** Alternatives with the same effect (`["arrowdown"]`), shown side by side. */
  also?: readonly string[];
  tone?: KbdProps["tone"];
}

/**
 * A shortcut as content (help tables, legends), for the current platform — `"g s"` → `G then S`,
 * `"mod+k"` → `⌘ K` / `Ctrl K` — read out as "G then S". For a hint on a control (menu item,
 * palette row, tooltip) use `useShortcutHint`, which keeps the keys out of the control's name.
 */
export function Shortcut({ keys, also = [], tone, className, ...props }: ShortcutProps) {
  const isMac = useIsMac();
  const spoken = [keys, ...also].map((shortcut) => spokenShortcut(shortcut, isMac)).join(" or ");
  return (
    <span className={cn("inline-flex items-center", className)} {...props}>
      <span className="sr-only">{spoken}</span>
      <ShortcutKeys keys={keys} also={also} tone={tone} />
    </span>
  );
}

/** The keys alone, hidden from assistive tech. */
function ShortcutKeys({ keys, also = [], tone }: Pick<ShortcutProps, "keys" | "also" | "tone">) {
  const isMac = useIsMac();
  const variants = [keys, ...also].map((shortcut) => formatShortcut(shortcut, isMac));
  return (
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
  );
}

export interface ShortcutHint {
  /** Spread on the control: `aria-keyshortcuts`, or `aria-describedby` for a sequence. */
  props: { "aria-keyshortcuts"?: string; "aria-describedby"?: string };
  /** The visual keys (hidden from assistive tech). */
  hint: React.ReactNode;
  /** A sequence's hidden description ("G then S"); render it anywhere in the document. */
  description: React.ReactNode;
}

const NO_HINT: ShortcutHint = { props: {}, hint: null, description: null };

/**
 * A control's shortcut, kept out of its accessible name ("Saved", not "Saved G then S"). A single
 * chord is exposed as `aria-keyshortcuts`; a sequence, which that attribute can't express, as the
 * control's description. Empty while single-key shortcuts are off and `keys` is one of them.
 */
export function useShortcutHint(
  keys: string | undefined,
  { tone }: { tone?: KbdProps["tone"] } = {},
): ShortcutHint {
  const isMac = useIsMac();
  const [singleKeys] = useSingleKeyShortcuts();
  const id = React.useId();
  if (!keys || (!singleKeys && isCharacterShortcut(keys))) return NO_HINT;
  const hint = <ShortcutKeys keys={keys} tone={tone} />;
  const aria = ariaKeyShortcuts(keys, isMac);
  if (aria) return { props: { "aria-keyshortcuts": aria }, hint, description: null };
  return {
    props: { "aria-describedby": id },
    hint,
    description: (
      <span id={id} hidden>
        {spokenShortcut(keys, isMac)}
      </span>
    ),
  };
}
