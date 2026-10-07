import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";
import { backdropClassName, CloseButton } from "./dialog";

/*
 * Lightbox: near-full-viewport overlay for the screen viewer and flow viewer.
 *
 * ┌ header: title · · · actions  × ┐
 * │ main (scrolls)       │ aside   │
 * │  ‹                 › │ (panel) │
 * └ footer (optional) ─────────────┘
 *
 * ←/→ call onPrev/onNext (ignored while typing), Esc closes, focus is trapped and returned.
 * Deep-linking (`?screen=id`) is the router's job: derive `open` from the URL and update it in
 * `onOpenChange` / `onPrev` / `onNext`.
 */

export interface LightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function Lightbox({ open, onOpenChange, children, className }: LightboxProps) {
  // Focus the overlay itself on open (not the first button), so no tooltip/focus ring flashes;
  // Tab then reaches the header actions, ←/→ work immediately.
  const popupRef = React.useRef<HTMLDivElement>(null);
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={backdropClassName} />
        <BaseDialog.Popup
          ref={popupRef}
          tabIndex={-1}
          initialFocus={popupRef}
          className={cn(
            "fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg text-fg outline-none md:inset-4 md:rounded-overlay md:shadow-overlay lg:inset-6",
            "transition-[opacity,scale] duration-180 ease-out",
            "data-[starting-style]:scale-[0.985] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.985] data-[ending-style]:opacity-0",
            className,
          )}
        >
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export interface LightboxHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Right-aligned actions rendered before the close button. */
  actions?: React.ReactNode;
  /** Centered element (e.g. a SegmentedControl). Hidden below `md`. */
  center?: React.ReactNode;
  closeLabel?: string;
}

export function LightboxHeader({
  actions,
  center,
  closeLabel = "Close",
  className,
  children,
  ...props
}: LightboxHeaderProps) {
  return (
    <div
      className={cn("relative flex h-16 shrink-0 items-center gap-3 px-4 md:px-6", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {center ? (
        <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">{center}</div>
      ) : null}
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {actions ? <span aria-hidden className="mx-1 h-5 w-px bg-border" /> : null}
        <CloseButton label={closeLabel} />
      </div>
    </div>
  );
}

/** Accessible title of the overlay (required once per Lightbox). */
export function LightboxTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn(
        "flex min-w-0 items-center gap-2 truncate text-md font-semibold text-fg",
        className,
      )}
      {...props}
    />
  );
}

export interface LightboxBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Side panel (details). Shown at the right on `lg+`, below the main area on smaller screens. */
  aside?: React.ReactNode;
  asideLabel?: string;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
  prevLabel?: string;
  nextLabel?: string;
  /** Class for the scrolling main area. */
  mainClassName?: string;
  /** When this changes (e.g. the screen id), the main area scrolls back to the top. */
  resetKey?: string | number;
}

export function LightboxBody({
  aside,
  asideLabel = "Details",
  onPrev,
  onNext,
  prevLabel = "Previous",
  nextLabel = "Next",
  className,
  mainClassName,
  resetKey,
  children,
  ...props
}: LightboxBodyProps) {
  const mainRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=slider]")) return;
      // Only when focus is in this overlay (not in a dialog stacked on top of it).
      const dialog = mainRef.current?.closest("[role=dialog]");
      if (dialog && target && target !== document.body && !dialog.contains(target)) return;
      if (event.key === "ArrowLeft" && onPrev) {
        event.preventDefault();
        onPrev();
      } else if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    // Capture phase: the dialog's focus management stops keydown propagation before it bubbles.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onPrev, onNext]);

  // New item → scroll the image back to the top.
  React.useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [resetKey]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden",
        className,
      )}
      {...props}
    >
      <div className="relative flex min-h-[60vh] min-w-0 flex-1 lg:min-h-0">
        <div
          ref={mainRef}
          tabIndex={-1}
          className={cn(
            "ou-scrollbar-thin min-w-0 flex-1 overflow-y-auto outline-none",
            mainClassName,
          )}
        >
          {children}
        </div>
        {onPrev !== undefined ? (
          <LightboxNavButton direction="prev" label={prevLabel} onClick={onPrev ?? undefined} />
        ) : null}
        {onNext !== undefined ? (
          <LightboxNavButton direction="next" label={nextLabel} onClick={onNext ?? undefined} />
        ) : null}
      </div>
      {aside ? (
        <aside
          aria-label={asideLabel}
          className="ou-scrollbar-thin shrink-0 border-t border-border lg:w-[360px] lg:overflow-y-auto lg:border-t-0 lg:border-l"
        >
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

function LightboxNavButton({
  direction,
  label,
  onClick,
}: {
  direction: "prev" | "next";
  label: string;
  onClick?: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={direction === "prev" ? "ArrowLeft" : "ArrowRight"}
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        "ou-focus-ring absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-elevated text-fg shadow-overlay",
        "transition-[opacity,transform] duration-150 ease-out hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-0",
        direction === "prev" ? "left-3 md:left-5" : "right-3 md:right-5",
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}

export function LightboxFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex min-h-18 shrink-0 items-center gap-3 border-t border-border px-4 py-3 md:px-6",
        className,
      )}
      {...props}
    />
  );
}
