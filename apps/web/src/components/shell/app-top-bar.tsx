import type { User } from "@screen-commons/core";
import {
  Button,
  Logo,
  SearchPill,
  Tooltip,
  TopBar,
  ariaKeyShortcuts,
  cn,
  useIsMac,
} from "@screen-commons/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bookmark, Plus } from "lucide-react";

import { platformLabel, type Platform } from "../../lib/platform";
import { commandShortcut, SHORTCUTS } from "../../lib/shortcuts";
import { AccountMenu } from "./account-menu";
import { useCommandPalette } from "./command-palette";
import { PlatformSwitch } from "./platform-switch";

export interface AppTopBarProps {
  user: User;
  platform: Platform;
}

/** The signed-in library top bar: logo · platform │ search │ saved · contribute · account. */
export function AppTopBar({ user, platform }: AppTopBarProps) {
  const { openPalette, prefetchPalette } = useCommandPalette();
  const isMac = useIsMac();
  const onSaved = useRouterState({
    select: (state) => state.location.pathname.startsWith("/saved"),
  });
  const placeholder = `Search ${platformLabel(platform)} apps, screens, flows…`;
  return (
    <TopBar
      logo={
        <Link
          to="/browse/$platform"
          params={{ platform }}
          aria-label="Screen Commons home"
          className="ou-focus-ring rounded-sm"
        >
          <Logo />
        </Link>
      }
      nav={<PlatformSwitch value={platform} />}
      onSearchClick={() => openPalette()}
      search={
        <SearchPill
          placeholder={placeholder}
          aria-keyshortcuts={`${ariaKeyShortcuts(SHORTCUTS.palette.keys, isMac)} ${ariaKeyShortcuts(SHORTCUTS.search.keys, isMac)}`}
          onClick={() => openPalette()}
          onPointerEnter={prefetchPalette}
          onFocus={prefetchPalette}
        />
      }
      actions={
        <>
          <Tooltip content="Saved" shortcut={commandShortcut("saved")} align="end">
            <Link
              to="/saved"
              aria-label="Saved"
              aria-current={onSaved ? "page" : undefined}
              className={cn(
                "ou-focus-ring flex size-9 items-center justify-center rounded-full text-fg transition-colors duration-150 hover:bg-muted [&_svg]:size-[18px]",
                onSaved && "bg-muted",
              )}
            >
              <Bookmark className={cn(onSaved && "fill-current")} />
            </Link>
          </Tooltip>
          <Button
            variant="outline"
            size="sm"
            className="ml-1 hidden sm:inline-flex"
            render={<Link to="/contribute" />}
          >
            <Plus />
            Contribute
          </Button>
        </>
      }
      account={<AccountMenu user={user} />}
    />
  );
}
