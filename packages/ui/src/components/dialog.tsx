import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";

/*
 * Centered modal dialog + side Sheet, both on base-ui Dialog (focus trap, scroll lock, Esc,
 * return focus to the trigger).
 *
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <DialogContent size="sm">
 *     <DialogHeader>
 *       <DialogTitle>Create API key</DialogTitle>
 *       <DialogDescription>Keys authenticate the extension and MCP.</DialogDescription>
 *     </DialogHeader>
 *     <DialogBody>…</DialogBody>
 *     <DialogFooter><Button>Create key</Button></DialogFooter>
 *   </DialogContent>
 * </Dialog>
 */

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export const backdropClassName =
  "fixed inset-0 z-50 bg-scrim transition-opacity duration-180 ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 supports-[-webkit-touch-callout:none]:absolute";

/** Round × button used in dialog, sheet and lightbox headers. */
export function CloseButton({
  className,
  label = "Close",
  ...props
}: React.ComponentProps<typeof BaseDialog.Close> & { label?: string }) {
  return (
    <BaseDialog.Close
      aria-label={label}
      className={cn(
        "ou-focus-ring flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-fg-muted",
        "transition-colors duration-150 hover:bg-muted-strong hover:text-fg",
        className,
      )}
      {...props}
    >
      <X aria-hidden className="size-4" strokeWidth={2.25} />
    </BaseDialog.Close>
  );
}

const dialogSizes = {
  sm: "w-[440px]",
  md: "w-[560px]",
  lg: "w-[720px]",
  xl: "w-[960px]",
} as const;

export interface DialogContentProps extends React.ComponentProps<typeof BaseDialog.Popup> {
  size?: keyof typeof dialogSizes;
  /** Render the round × in the top-right corner. Default true. */
  showClose?: boolean;
}

export function DialogContent({
  size = "md",
  showClose = true,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={backdropClassName} />
      <BaseDialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-3 sm:items-center sm:p-6">
        <BaseDialog.Popup
          className={cn(
            "relative flex max-h-[calc(100dvh-24px)] max-w-full flex-col overflow-hidden rounded-overlay bg-surface text-fg shadow-overlay outline-none sm:max-h-[calc(100dvh-48px)]",
            "transition-[opacity,scale,translate] duration-180 ease-out",
            "data-[starting-style]:translate-y-2 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0",
            "data-[ending-style]:translate-y-1 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0",
            dialogSizes[size],
            className,
          )}
          {...props}
        >
          {children}
          {showClose ? <CloseButton className="absolute top-4 right-4" /> : null}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 px-6 pt-6 pr-14", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn("text-lg font-semibold tracking-[-0.014em] text-fg", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return <BaseDialog.Description className={cn("text-base text-fg-muted", className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 px-6 pb-6 sm:flex-row sm:items-center sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Sheet                                                                                          */
/* -------------------------------------------------------------------------------------------- */

export const Sheet = BaseDialog.Root;
export const SheetTrigger = BaseDialog.Trigger;
export const SheetClose = BaseDialog.Close;

const sheetSides = {
  right:
    "inset-y-0 right-0 h-dvh w-[400px] max-w-[calc(100vw-40px)] border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
  left: "inset-y-0 left-0 h-dvh w-[400px] max-w-[calc(100vw-40px)] border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
  bottom:
    "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-overlay border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
} as const;

export interface SheetContentProps extends React.ComponentProps<typeof BaseDialog.Popup> {
  side?: keyof typeof sheetSides;
  showClose?: boolean;
}

/** Panel sliding in from an edge: filters on mobile, mobile navigation, details. */
export function SheetContent({
  side = "right",
  showClose = true,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={backdropClassName} />
      <BaseDialog.Popup
        className={cn(
          "fixed z-50 flex flex-col border-border bg-surface text-fg shadow-overlay outline-none",
          "transition-transform duration-180 ease-out",
          sheetSides[side],
          className,
        )}
        {...props}
      >
        {side === "bottom" ? (
          <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-pill bg-border-strong" />
        ) : null}
        {children}
        {showClose ? <CloseButton className="absolute top-4 right-4" /> : null}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export const SheetHeader = DialogHeader;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;
export const SheetBody = DialogBody;
export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-auto flex items-center justify-end gap-2 border-t border-border px-6 py-4", className)}
      {...props}
    />
  );
}
