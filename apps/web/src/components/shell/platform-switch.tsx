import { SegmentedControl } from "@screen-commons/ui";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";

import { PLATFORM_OPTIONS, rememberPlatform, type Platform } from "../../lib/platform";
import type { BrowseSearch } from "../../lib/search-params";

/**
 * Switches the library platform: on Discover it keeps the current tab, filters and sort; on
 * /search it re-runs the query for the new platform; anywhere else it goes to that platform's
 * Discover. Shared by the top-bar switch and the ⌘K palette.
 */
export function usePlatformChange(): (platform: Platform) => void {
  const navigate = useNavigate();
  const router = useRouter();
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId });

  return (platform: Platform) => {
    rememberPlatform(platform);
    if (routeId === "/_app/browse/$platform") {
      const { tab, category, pattern, element, flowType, sort } = router.state.location
        .search as BrowseSearch;
      void navigate({
        to: "/browse/$platform",
        params: { platform },
        search: { tab, category, pattern, element, flowType, sort },
        resetScroll: false,
      });
    } else if (routeId === "/_app/search") {
      void navigate({ to: "/search", search: (previous) => ({ ...previous, platform }) });
    } else {
      void navigate({ to: "/browse/$platform", params: { platform } });
    }
  };
}

/** Web / iOS / Android segmented control (see `usePlatformChange`). */
export function PlatformSwitch({
  value,
  className,
  size = "sm",
}: {
  value: Platform;
  className?: string;
  size?: "sm" | "md";
}) {
  const change = usePlatformChange();
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
