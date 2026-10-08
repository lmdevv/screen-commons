import { Menu } from "@base-ui/react/menu";
import { ArrowUpRight, Check } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import type { Theme } from "../lib/theme";
import { popupSurfaceClassName } from "./popover";
import { THEME_OPTIONS, useTheme } from "./theme";

/*
 * Dropdown menu (avatar menu, "…" overflow menus, sort menus).
 *
 * <DropdownMenu>
 *   <DropdownMenuTrigger render={<Button icon variant="ghost" aria-label="More" />}>…</DropdownMenuTrigger>
 *   <DropdownMenuContent align="end">
 *     <DropdownMenuItem icon={<Settings />}>Settings</DropdownMenuItem>
 *     <DropdownMenuSeparator />
 *     <DropdownMenuThemeRow />
 *   </DropdownMenuContent>
 * </DropdownMenu>
 */

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export interface DropdownMenuContentProps extends React.ComponentProps<typeof Menu.Popup> {
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export function DropdownMenuContent({
  side = "bottom",
  align = "end",
  sideOffset = 8,
  className,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="z-50 outline-none"
      >
        <Menu.Popup
          className={cn(
            popupSurfaceClassName,
            "min-w-56 max-w-[calc(100vw-24px)] origin-(--transform-origin) p-1.5",
            className,
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

const itemClassName =
  "group/item flex min-h-9 cursor-default items-center gap-2.5 rounded-[8px] px-2.5 text-base text-fg outline-none select-none " +
  "data-[highlighted]:bg-muted data-[disabled]:opacity-40 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-muted";

export interface DropdownMenuItemProps extends React.ComponentProps<typeof Menu.Item> {
  icon?: React.ReactNode;
  /** Right-aligned hint, e.g. a shortcut. */
  hint?: React.ReactNode;
  /** Shows an ↗ to signal an external destination. */
  external?: boolean;
  destructive?: boolean;
}

export function DropdownMenuItem({
  icon,
  hint,
  external,
  destructive,
  className,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <Menu.Item
      className={cn(itemClassName, destructive && "text-danger [&>svg]:text-danger", className)}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="text-sm text-fg-subtle">{hint}</span> : null}
      {external ? <ArrowUpRight aria-hidden className="text-fg-subtle" /> : null}
    </Menu.Item>
  );
}

export interface DropdownMenuLinkItemProps extends React.ComponentProps<typeof Menu.LinkItem> {
  icon?: React.ReactNode;
  /** Right-aligned hint, e.g. a shortcut. */
  hint?: React.ReactNode;
  external?: boolean;
}

/** Menu item that is a link. Use `render={<Link to=… />}` for router links. */
export function DropdownMenuLinkItem({
  icon,
  hint,
  external,
  className,
  children,
  ...props
}: DropdownMenuLinkItemProps) {
  return (
    <Menu.LinkItem className={cn(itemClassName, className)} {...props}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="text-sm text-fg-subtle">{hint}</span> : null}
      {external ? <ArrowUpRight aria-hidden className="text-fg-subtle" /> : null}
    </Menu.LinkItem>
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1.5 my-1.5 h-px bg-border", className)} {...props} />;
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof Menu.GroupLabel>) {
  return (
    <Menu.GroupLabel
      className={cn("px-2.5 pt-1.5 pb-1 text-xs font-medium text-fg-subtle", className)}
      {...props}
    />
  );
}

/** Non-interactive block at the top of an account menu: name + email. */
export function DropdownMenuHeader({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 px-2.5 pt-2 pb-2.5", className)}>
      <div className="truncate text-base font-semibold text-fg">{title}</div>
      {description ? <div className="truncate text-sm text-fg-muted">{description}</div> : null}
      {children ? <div className="mt-2.5">{children}</div> : null}
    </div>
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(itemClassName, "pr-2", className)} {...props}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Menu.CheckboxItemIndicator className="flex text-fg">
        <Check aria-hidden className="size-4" />
      </Menu.CheckboxItemIndicator>
    </Menu.CheckboxItem>
  );
}

export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClassName, "pr-2", className)} {...props}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Menu.RadioItemIndicator className="flex text-fg">
        <Check aria-hidden className="size-4" />
      </Menu.RadioItemIndicator>
    </Menu.RadioItem>
  );
}

/**
 * "Theme  [☀ ☾ ▢]" row for the avatar menu. Each icon is a radio item, so ↑/↓ reach them and
 * Enter selects without closing the menu.
 */
export function DropdownMenuThemeRow({ label = "Theme" }: { label?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 pr-1 pl-2.5">
      <span className="text-base text-fg" id="ou-theme-row-label">
        {label}
      </span>
      <Menu.RadioGroup
        aria-labelledby="ou-theme-row-label"
        value={theme}
        onValueChange={(value) => setTheme(value as Theme)}
        className="flex items-center rounded-pill bg-muted p-[3px]"
      >
        {THEME_OPTIONS.map(({ value, label: optionLabel, icon: Icon }) => (
          <Menu.RadioItem
            key={value}
            value={value}
            closeOnClick={false}
            aria-label={optionLabel}
            className={cn(
              "flex size-7 cursor-default items-center justify-center rounded-pill text-fg-muted outline-none",
              "transition-colors duration-150 data-[highlighted]:text-fg data-[highlighted]:bg-muted-strong data-[highlighted]:data-[checked]:bg-bg",
              "data-[checked]:bg-bg data-[checked]:text-fg data-[checked]:shadow-raised",
            )}
          >
            <Icon aria-hidden className="size-4" />
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </div>
  );
}
