import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type * as React from "react";

import { cn } from "../lib/cn";
import { Kbd } from "./kbd";

/** Wrap the app once so adjacent tooltips open instantly after the first one. */
export function TooltipProvider({
  delay = 450,
  closeDelay = 0,
  ...props
}: React.ComponentProps<typeof BaseTooltip.Provider>) {
  return <BaseTooltip.Provider delay={delay} closeDelay={closeDelay} {...props} />;
}

export interface TooltipProps {
  /** Tooltip text. Keep it to a few words. */
  content: React.ReactNode;
  /** Optional shortcut hint shown after the text, e.g. `"S"` or `"⌘K"`. */
  shortcut?: string;
  /** A single focusable element (usually an icon Button). */
  children: React.ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  disabled?: boolean;
}

/**
 * Small dark label for icon-only controls. The trigger must still have its own `aria-label`;
 * the tooltip is a visual aid.
 *
 * `<Tooltip content="Saved"><Button icon variant="ghost" aria-label="Saved">…</Button></Tooltip>`
 */
export function Tooltip({
  content,
  shortcut,
  children,
  side = "bottom",
  align = "center",
  disabled = false,
}: TooltipProps) {
  return (
    <BaseTooltip.Root disabled={disabled}>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} align={align} sideOffset={8} className="z-[60]">
          <BaseTooltip.Popup
            className={cn(
              "flex origin-(--transform-origin) items-center gap-2 rounded-sm bg-chrome px-2 py-1 text-sm font-medium text-chrome-fg",
              "transition-[opacity,scale] duration-120 ease-out",
              "data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[instant]:transition-none",
            )}
          >
            {content}
            {shortcut ? <Kbd tone="chrome">{shortcut}</Kbd> : null}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
