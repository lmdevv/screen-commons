import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import { CornerDownLeft, Search } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { backdropClassName } from "./dialog";
import { Kbd, KbdGroup } from "./kbd";
import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";

/*
 * ⌘K command palette: search apps, screens, flows, taxonomy and actions from anywhere.
 *
 * const [open, setOpen] = useState(false);
 * useHotkey("k", () => setOpen((o) => !o));
 *
 * <CommandPalette open={open} onOpenChange={setOpen} search={q} onSearchChange={setQ}
 *   loading={isFetching} shouldFilter={false}>   // false: results already filtered by the API
 *   <CommandGroup heading="Apps">
 *     <CommandItem value="app:linear" icon={<AppLogo app={app} size="xs" />} hint="Productivity"
 *       onSelect={() => navigate(…)}>Linear</CommandItem>
 *   </CommandGroup>
 * </CommandPalette>
 */

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** Controlled search text. */
  search?: string;
  onSearchChange?: (search: string) => void;
  placeholder?: string;
  /** Shows a spinner in the input and skeleton rows when there are no items yet. */
  loading?: boolean;
  /** Client-side fuzzy filtering (default true). Set false when results come from the API. */
  shouldFilter?: boolean;
  /** Text when nothing matches. */
  emptyText?: React.ReactNode;
  /** Accessible label of the dialog. */
  label?: string;
  /** Left rail (scopes such as Trending · Apps · Screens · UI Elements · Flows). Hidden on mobile. */
  rail?: React.ReactNode;
  /** Replaces the default keyboard-hint footer. Pass `null` to hide it. */
  footer?: React.ReactNode;
  className?: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  children,
  search,
  onSearchChange,
  placeholder = "Search apps, screens, UI elements, flows…",
  loading = false,
  shouldFilter = true,
  emptyText = "No results found.",
  label = "Search",
  rail,
  footer,
  className,
}: CommandPaletteProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={backdropClassName} />
        <BaseDialog.Viewport className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-3 sm:pt-[12vh]">
          <BaseDialog.Popup
            aria-label={label}
            className={cn(
              "flex max-h-[min(640px,calc(100dvh-24px))] w-[720px] max-w-full flex-col overflow-hidden rounded-overlay bg-surface text-fg shadow-overlay outline-none sm:max-h-[min(640px,76vh)]",
              "transition-[opacity,scale] duration-150 ease-out data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0",
              className,
            )}
          >
            <BaseDialog.Title className="sr-only">{label}</BaseDialog.Title>
            <Command
              label={label}
              shouldFilter={shouldFilter}
              loop
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
                <Search aria-hidden className="size-[18px] shrink-0 text-fg-muted" />
                <Command.Input
                  autoFocus
                  value={search}
                  onValueChange={onSearchChange}
                  placeholder={placeholder}
                  className="h-full min-w-0 flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-subtle"
                />
                {loading ? <Spinner className="text-fg-muted" label="Loading results" /> : null}
                <BaseDialog.Close className="ou-focus-ring rounded-[5px]" aria-label="Close search">
                  <Kbd>Esc</Kbd>
                </BaseDialog.Close>
              </div>
              <div className="flex min-h-0 flex-1">
                {rail ? (
                  <div className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-border p-2 sm:flex">
                    {rail}
                  </div>
                ) : null}
                <Command.List className="ou-scrollbar-thin min-h-0 flex-1 scroll-py-2 overflow-y-auto p-2 [&_[cmdk-list-sizer]]:flex [&_[cmdk-list-sizer]]:flex-col [&_[cmdk-list-sizer]]:gap-1">
                  {loading ? (
                    <Command.Loading>
                      <CommandSkeleton />
                    </Command.Loading>
                  ) : null}
                  {loading ? null : (
                    <Command.Empty className="px-4 py-14 text-center text-base text-fg-muted">
                      {emptyText}
                    </Command.Empty>
                  )}
                  {children}
                </Command.List>
              </div>
              {footer === undefined ? <CommandFooter /> : footer}
            </Command>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

function CommandSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-1" aria-hidden>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex h-11 items-center gap-3 px-2">
          <Skeleton className="size-7 rounded-[7px]" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      ))}
    </div>
  );
}

function CommandFooter() {
  return (
    <div className="hidden h-10 shrink-0 items-center gap-4 border-t border-border px-5 text-sm text-fg-muted sm:flex">
      <span className="flex items-center gap-1.5">
        <KbdGroup>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
        </KbdGroup>
        Navigate
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>
          <CornerDownLeft aria-hidden className="size-3" />
        </Kbd>
        Open
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>Esc</Kbd>
        Close
      </span>
    </div>
  );
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof Command.Group>) {
  return (
    <Command.Group
      className={cn(
        "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}

export interface CommandItemProps extends React.ComponentProps<typeof Command.Item> {
  /** Leading visual: lucide icon, AppLogo, or a tiny screenshot thumb. */
  icon?: React.ReactNode;
  /** Secondary text after the label (category, app name, count). */
  hint?: React.ReactNode;
  /** Right-aligned shortcut, e.g. `["⌘", "U"]`. */
  shortcut?: string[];
}

export function CommandItem({
  icon,
  hint,
  shortcut,
  className,
  children,
  ...props
}: CommandItemProps) {
  return (
    <Command.Item
      className={cn(
        "group flex min-h-11 cursor-default items-center gap-3 rounded-[10px] px-3 text-base text-fg outline-none select-none",
        "data-[selected=true]:bg-muted data-[disabled=true]:opacity-40",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-muted text-fg-muted group-data-[selected=true]:bg-bg [&>svg]:size-4">
          {icon}
        </span>
      ) : null}
      {/* The label keeps its width (up to 70%); the hint truncates first. */}
      <span className="max-w-[70%] min-w-0 shrink-0 truncate">{children}</span>
      {hint ? <span className="min-w-0 flex-1 truncate text-sm text-fg-subtle">{hint}</span> : null}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {shortcut ? (
          <KbdGroup>
            {shortcut.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        ) : null}
        <CornerDownLeft
          aria-hidden
          className="size-3.5 text-fg-subtle opacity-0 group-data-[selected=true]:opacity-100"
        />
      </span>
    </Command.Item>
  );
}

export function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Command.Separator>) {
  return <Command.Separator className={cn("mx-3 my-1 h-px bg-border", className)} {...props} />;
}

export interface CommandRailItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  active?: boolean;
}

/** Scope button for the palette's left rail. */
export function CommandRailItem({
  icon,
  active,
  className,
  children,
  ...props
}: CommandRailItemProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "ou-focus-ring flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-base font-medium",
        "transition-colors duration-150 [&_svg]:size-4 [&_svg]:shrink-0",
        active ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted hover:text-fg",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
