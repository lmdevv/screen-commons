/*
 * Full account menu (Base UI Menu). Loaded lazily by `AccountMenu` in top-bar.tsx on first
 * intent, so routes without other popups don't pay for the positioning engine up front.
 * Not re-exported from the package index on purpose (that would defeat the code split).
 */
import { LogOut } from "lucide-react";
import * as React from "react";

import { Avatar } from "./avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHeader,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuThemeRow,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import type { AccountMenuProps } from "./top-bar";

export interface AccountMenuPopupProps extends AccountMenuProps {
  /** Open immediately (the user clicked before the chunk arrived). */
  defaultOpen?: boolean;
  /** Move focus to the trigger after mounting (the placeholder had keyboard focus). */
  focusTrigger?: boolean;
}

export default function AccountMenuPopup({
  user,
  children,
  footer,
  onSignOut,
  headerAction,
  defaultOpen = false,
  focusTrigger = false,
}: AccountMenuPopupProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (focusTrigger) triggerRef.current?.focus();
  }, [focusTrigger]);

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        ref={triggerRef}
        aria-label={`Account menu for ${user.name}`}
        className="ou-focus-ring flex rounded-full transition-opacity hover:opacity-85"
      >
        <Avatar name={user.name} src={user.image} size="md" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuHeader title={user.name} description={user.email}>
          {headerAction}
        </DropdownMenuHeader>
        {children ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuThemeRow />
        {footer ? (
          <>
            <DropdownMenuSeparator />
            {footer}
          </>
        ) : null}
        {onSignOut ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<LogOut />} onClick={onSignOut}>
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
