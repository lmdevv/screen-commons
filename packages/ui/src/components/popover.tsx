import { Popover as BasePopover } from "@base-ui/react/popover";
import type * as React from "react";

import { cn } from "../lib/cn";

/** Shared look for floating surfaces (popover, menu, select): elevated, hairline, soft shadow. */
export const popupSurfaceClassName =
  "rounded-card bg-elevated text-fg shadow-overlay outline-none " +
  "transition-[opacity,scale] duration-150 ease-out " +
  "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 " +
  "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[instant]:transition-none";

export const Popover = BasePopover.Root;

/** Trigger; pass `render={<Button … />}` to use a styled button. */
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;

export interface PopoverContentProps extends React.ComponentProps<typeof BasePopover.Popup> {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

/** Floating panel anchored to the trigger (filters panel, share menu, info). */
export function PopoverContent({
  side = "bottom",
  align = "center",
  sideOffset = 8,
  className,
  ...props
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
        <BasePopover.Popup
          className={cn(
            popupSurfaceClassName,
            "max-w-[calc(100vw-24px)] origin-(--transform-origin) p-4",
            className,
          )}
          {...props}
        />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export function PopoverTitle({
  className,
  ...props
}: React.ComponentProps<typeof BasePopover.Title>) {
  return <BasePopover.Title className={cn("text-base font-semibold", className)} {...props} />;
}

export function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<typeof BasePopover.Description>) {
  return <BasePopover.Description className={cn("text-sm text-fg-muted", className)} {...props} />;
}
