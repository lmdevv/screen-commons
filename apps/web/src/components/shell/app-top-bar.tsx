import type { User } from "@open-ui/core";
import { Button, Logo, SearchPill, Tooltip, TopBar, cn } from "@open-ui/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bookmark, Plus } from "lucide-react";

import { platformLabel, type Platform } from "../../lib/platform";
import { AccountMenu } from "./account-menu";
import { useCommandPalette } from "./command-palette";
import { PlatformSwitch } from "./platform-switch";

export interface AppTopBarProps {
  user: User;
  platform: Platform;
  onShowShortcuts?: () => void;
}

/** The signed-in library top bar: logo · platform │ search │ saved · contribute · account. */
export function AppTopBar({ user, platform, onShowShortcuts }: AppTopBarProps) {
  const { openPalette, prefetchPalette } = useCommandPalette();
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
          aria-label="Open UI home"
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
          onClick={() => openPalette()}
          onPointerEnter={prefetchPalette}
          onFocus={prefetchPalette}
        />
      }
      actions={
        <>
          <Tooltip content="Saved" align="end">
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
      account={<AccountMenu user={user} onShowShortcuts={onShowShortcuts} />}
    />
  );
}
