import type { AppSummary } from "@open-ui/core";
import { AppCard, ScreenGrid, ScreenGridItem, ScreenGridSkeleton } from "@open-ui/ui";
import { Link } from "@tanstack/react-router";

import type { Platform } from "../../lib/platform";
import { InfiniteSentinel } from "./infinite-sentinel";

export interface AppResultsProps {
  apps: readonly AppSummary[];
  platform: Platform;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  loadMore?: () => Promise<unknown>;
  priority?: boolean;
}

/** AppCards in the platform's app recipe, with infinite scroll. */
export function AppResults({
  apps,
  platform,
  hasMore = false,
  isFetchingMore = false,
  loadMore,
  priority = true,
}: AppResultsProps) {
  const columns = platform === "web" ? "apps-web" : "apps-mobile";
  return (
    <>
      <ScreenGrid columns={columns}>
        {apps.map((app, index) => (
          <ScreenGridItem key={app.id}>
            <AppCard
              app={app}
              priority={priority && index < 4}
              linkRender={<Link to="/apps/$slug" params={{ slug: app.slug }} />}
            />
          </ScreenGridItem>
        ))}
      </ScreenGrid>
      {isFetchingMore ? (
        <ScreenGridSkeleton columns={columns} count={4} withMeta className="mt-6 lg:mt-8" />
      ) : null}
      {hasMore && loadMore ? (
        <InfiniteSentinel onVisible={() => void loadMore()} disabled={isFetchingMore} />
      ) : null}
    </>
  );
}
