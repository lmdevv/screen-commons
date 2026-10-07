import { mergeProps } from "@base-ui/react/merge-props";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";

import { cn } from "../lib/cn";

/*
 * Underline tabs (Mobbin style): inactive labels in muted grey, the active one in full ink with a
 * 2px underline that slides between tabs.
 *
 * Two flavours:
 * - `Tabs` / `TabsList` / `Tab` / `TabsPanel` — client-side panels (base-ui Tabs, roving focus).
 * - `TabNav` / `TabNavItem` — navigation links (route tabs such as Apps · Screens · Flows), with
 *   `aria-current="page"` on the active item. Use `render={<Link … />}` for router links.
 */

export type TabsSize = "md" | "lg";

const tabText: Record<TabsSize, string> = {
  md: "h-10 text-base",
  lg: "h-12 text-md",
};

export function Tabs({ className, ...props }: React.ComponentProps<typeof BaseTabs.Root>) {
  return <BaseTabs.Root className={cn("flex flex-col", className)} {...props} />;
}

export interface TabsListProps extends React.ComponentProps<typeof BaseTabs.List> {
  /** Draw a full-width hairline under the tabs. Default false (Mobbin has none). */
  bordered?: boolean;
}

export function TabsList({ className, bordered = false, children, ...props }: TabsListProps) {
  return (
    <BaseTabs.List
      className={cn(
        "relative z-0 flex items-center gap-6",
        bordered && "border-b border-border",
        className,
      )}
      {...props}
    >
      {children}
      <BaseTabs.Indicator
        className={cn(
          "absolute bottom-0 left-0 -z-10 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-pill bg-fg",
          "transition-[translate,width] duration-180 ease-out",
          bordered && "-bottom-px",
        )}
      />
    </BaseTabs.List>
  );
}

export interface TabProps extends React.ComponentProps<typeof BaseTabs.Tab> {
  size?: TabsSize;
}

export function Tab({ className, size = "md", ...props }: TabProps) {
  return (
    <BaseTabs.Tab
      className={cn(
        "ou-focus-ring relative flex shrink-0 items-center gap-1.5 rounded-xs whitespace-nowrap font-medium text-fg-muted outline-offset-0",
        "transition-colors duration-150 ease-out hover:text-fg data-[active]:text-fg data-[disabled]:opacity-40",
        tabText[size],
        className,
      )}
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: React.ComponentProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel className={cn("ou-focus-ring rounded-xs pt-6", className)} {...props} />;
}

export interface TabNavProps extends React.HTMLAttributes<HTMLElement> {
  bordered?: boolean;
}

/** `<nav>` of route tabs. Children are `TabNavItem`s. */
export function TabNav({ className, bordered = false, ...props }: TabNavProps) {
  return (
    <nav
      className={cn(
        "ou-scrollbar-none -mx-1 flex items-center gap-6 overflow-x-auto px-1",
        bordered && "border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

export interface TabNavItemProps extends useRender.ComponentProps<"a"> {
  active?: boolean;
  size?: TabsSize;
  /** Small trailing badge (e.g. a count or "New"). */
  badge?: React.ReactNode;
}

export function TabNavItem({
  active = false,
  size = "md",
  badge,
  className,
  render,
  children,
  ...props
}: TabNavItemProps) {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        "aria-current": active ? "page" : undefined,
        className: cn(
          "ou-focus-ring relative flex shrink-0 items-center gap-1.5 rounded-xs whitespace-nowrap font-medium",
          "transition-colors duration-150 ease-out",
          "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-pill after:bg-fg after:opacity-0 after:transition-opacity after:duration-150",
          active ? "text-fg after:opacity-100" : "text-fg-muted hover:text-fg",
          tabText[size],
          className,
        ),
        children: (
          <>
            {children}
            {badge}
          </>
        ),
      },
      props,
    ),
  });
}
