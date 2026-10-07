import type { User } from "@open-ui/core/schemas";
import { Search } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";
import { useScrolled } from "../lib/hooks";
import { Avatar } from "./avatar";
import { SearchPill } from "./search-pill";

export interface TopBarProps extends React.HTMLAttributes<HTMLElement> {
  /** Logo link, e.g. `<Link to="/" aria-label="Open UI home"><Logo /></Link>`. */
  logo: React.ReactNode;
  /** Next to the logo: the platform SegmentedControl (library) or nav links (marketing/docs). */
  nav?: React.ReactNode;
  /** Opens the command palette. When set, the centred SearchPill (and a mobile icon) render. */
  onSearchClick?: () => void;
  searchPlaceholder?: string;
  /** Replace the default SearchPill entirely. */
  search?: React.ReactNode;
  /** Right side, before the account slot: Saved, Contribute… */
  actions?: React.ReactNode;
  /** Far right: `<AccountMenu />` or a "Sign in" button. */
  account?: React.ReactNode;
  /** Remove the max-width container (full-bleed pages). */
  fluid?: boolean;
}

/**
 * Sticky 56px top bar: logo · nav │ centred search pill │ actions · account. Translucent with a
 * backdrop blur; a hairline appears once the page scrolls.
 */
export function TopBar({
  logo,
  nav,
  onSearchClick,
  searchPlaceholder,
  search,
  actions,
  account,
  fluid = true,
  className,
  ...props
}: TopBarProps) {
  const scrolled = useScrolled();
  const hasSearch = search !== undefined || onSearchClick !== undefined;
  return (
    <header
      data-scrolled={scrolled ? "" : undefined}
      className={cn(
        "sticky top-0 z-40 h-topbar border-b border-transparent bg-bg/85 backdrop-blur-xl backdrop-saturate-150",
        "transition-[border-color] duration-150 data-[scrolled]:border-border",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "mx-auto grid h-full grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 lg:px-8",
          hasSearch && "md:grid-cols-[1fr_minmax(0,560px)_1fr]",
          !fluid && "max-w-page",
        )}
      >
        <div className="flex min-w-0 items-center gap-5">
          <div className="flex shrink-0 items-center">{logo}</div>
          {nav ? <div className="hidden min-w-0 items-center sm:flex">{nav}</div> : null}
        </div>
        {hasSearch ? (
          <div className="hidden min-w-0 md:block">
            {search ?? <SearchPill placeholder={searchPlaceholder} onClick={onSearchClick} />}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-1.5">
          {onSearchClick ? (
            <button
              type="button"
              aria-label="Search"
              onClick={onSearchClick}
              className="ou-focus-ring flex size-9 items-center justify-center rounded-full text-fg transition-colors hover:bg-muted md:hidden"
            >
              <Search aria-hidden className="size-[18px]" />
            </button>
          ) : null}
          {actions}
          {account ? <div className="ml-1.5 flex items-center">{account}</div> : null}
        </div>
      </div>
    </header>
  );
}

/** Icon button sized for the top bar (36px, round, ghost). */
export function TopBarIconButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { "aria-label": string }) {
  return (
    <button
      type="button"
      className={cn(
        "ou-focus-ring flex size-9 items-center justify-center rounded-full text-fg transition-colors duration-150 hover:bg-muted [&_svg]:size-[18px]",
        className,
      )}
      {...props}
    />
  );
}

export interface AccountMenuProps {
  user: Pick<User, "name" | "email" | "image"> & Partial<Pick<User, "role">>;
  /** Menu items between the header and the theme row (DropdownMenuItem / DropdownMenuLinkItem). */
  children?: React.ReactNode;
  /** Items after the theme row (Docs, source code…). */
  footer?: React.ReactNode;
  onSignOut?: () => void;
  /** Extra content inside the header block (e.g. a "View profile" button). */
  headerAction?: React.ReactNode;
}

const AccountMenuPopup = React.lazy(() => import("./account-menu-popup"));
const loadPopup = () => import("./account-menu-popup");

/**
 * Avatar button + account dropdown (header, your items, theme switcher row, sign out).
 *
 * Renders a plain avatar button first and loads the menu (Base UI Menu + positioning) on first
 * hover/focus/press, keeping it out of the initial route bundle. Works the same either way.
 */
export function AccountMenu(props: AccountMenuProps) {
  const [armed, setArmed] = React.useState<false | { open: boolean; focus: boolean }>(false);
  const placeholder = (
    <button
      type="button"
      aria-label={`Account menu for ${props.user.name}`}
      aria-haspopup="menu"
      aria-expanded={false}
      onPointerEnter={() => void loadPopup()}
      onFocus={(event) => {
        void loadPopup();
        if (event.currentTarget.matches?.(":focus-visible")) setArmed({ open: false, focus: true });
      }}
      onClick={(event) =>
        setArmed({ open: true, focus: event.currentTarget === document.activeElement })
      }
      onPointerDown={() => setArmed({ open: true, focus: false })}
      className="ou-focus-ring flex rounded-full transition-opacity hover:opacity-85"
    >
      <Avatar name={props.user.name} src={props.user.image} size="md" />
    </button>
  );
  if (!armed) return placeholder;
  return (
    <React.Suspense fallback={placeholder}>
      <AccountMenuPopup {...props} defaultOpen={armed.open} focusTrigger={armed.focus} />
    </React.Suspense>
  );
}
