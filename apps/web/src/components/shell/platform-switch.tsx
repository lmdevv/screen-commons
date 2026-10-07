import { SegmentedControl } from "@open-ui/ui";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { PLATFORM_OPTIONS, rememberPlatform, type Platform } from "../../lib/platform";

/**
 * Web / iOS / Android. On Discover it keeps the current tab, filters and sort; on /search it
 * re-runs the query for the new platform; anywhere else it goes to that platform's Discover.
 */
export function PlatformSwitch({
  value,
  className,
  size = "sm",
}: {
  value: Platform;
  className?: string;
  size?: "sm" | "md";
}) {
  const navigate = useNavigate();
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId });

  const change = (platform: Platform) => {
    rememberPlatform(platform);
    if (routeId === "/_app/browse/$platform") {
      void navigate({
        to: "/browse/$platform",
        params: { platform },
        search: (previous) => ({ ...previous, screen: undefined, flow: undefined }),
        resetScroll: false,
      });
    } else if (routeId === "/_app/search") {
      void navigate({ to: "/search", search: (previous) => ({ ...previous, platform }) });
    } else {
      void navigate({ to: "/browse/$platform", params: { platform } });
    }
  };

  return (
    <SegmentedControl<Platform>
      aria-label="Platform"
      size={size}
      value={value}
      onValueChange={change}
      options={PLATFORM_OPTIONS}
      className={className}
    />
  );
}
