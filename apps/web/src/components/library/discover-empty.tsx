import { labelFor } from "@screen-commons/core/taxonomy";
import { Button, Chip, EmptyState } from "@screen-commons/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, SearchX, Shapes, Smartphone } from "lucide-react";

import { platformLabel, type Platform } from "../../lib/platform";
import { queries } from "../../lib/queries";
import type { BrowseTab } from "../../lib/search-params";

const FIELD = {
  apps: "category",
  screens: "pattern",
  elements: "element",
  flows: "flowType",
} as const;
const FACET = {
  apps: "categories",
  screens: "patterns",
  elements: "elements",
  flows: "flowTypes",
} as const;

/** No results for the current filters: clear them, or jump to a popular one. */
export function DiscoverEmpty({
  noun,
  platform,
  tab,
  onClear,
}: {
  noun: string;
  platform: Platform;
  tab: BrowseTab;
  onClear: () => void;
}) {
  const facets = useQuery(queries.facets(platform));
  const popular = facets.data?.[FACET[tab]].slice(0, 4) ?? [];
  return (
    <EmptyState
      tone="tile"
      icon={<SearchX />}
      title={`No ${noun} match these filters`}
      description="Try a different filter, or clear them to see everything."
      actions={
        <div className="flex flex-col items-center gap-5">
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
          {popular.length > 0 ? (
            <div className="flex flex-col items-center gap-2.5">
              <span className="text-sm text-fg-subtle">Popular right now</span>
              <ul className="flex flex-wrap justify-center gap-1.5">
                {popular.map((item) => (
                  <li key={item.slug}>
                    <Chip
                      render={
                        <Link
                          to="/browse/$platform"
                          params={{ platform }}
                          search={{
                            tab: tab === "apps" ? undefined : tab,
                            [FIELD[tab]]: item.slug,
                          }}
                          resetScroll={false}
                        />
                      }
                    >
                      {labelFor(item.slug)}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      }
    />
  );
}

/** A platform with no content at all yet (iOS / Android on a fresh instance). */
export function PlatformEmpty({ platform, className }: { platform: Platform; className?: string }) {
  const label = platformLabel(platform);
  return (
    <EmptyState
      tone="tile"
      className={className}
      icon={<Smartphone />}
      title={`No ${label} screens yet`}
      description={`Screen Commons is built by its community. Upload ${label} screenshots or capture an app with the browser extension, and it shows up here once reviewed.`}
      actions={
        <>
          <Button render={<Link to="/contribute" />}>
            <Plus />
            Contribute
          </Button>
          <Button
            variant="outline"
            render={<Link to="/docs/$slug" params={{ slug: "extension" }} />}
          >
            Browser extension guide
          </Button>
        </>
      }
    />
  );
}

/** No screen on this platform carries UI element tags yet. */
export function ElementsEmpty({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <EmptyState
      tone="tile"
      className={className}
      icon={<Shapes />}
      title="No UI elements tagged yet"
      description="Screens get UI element tags — Modal, Table, Tabs… — when contributors or reviewers add them. Browse by screen pattern in the meantime."
      actions={
        <>
          <Button
            variant="outline"
            render={
              <Link to="/browse/$platform" params={{ platform }} search={{ tab: "screens" }} />
            }
          >
            Browse screens
          </Button>
          <Button variant="ghost" render={<Link to="/contribute" />}>
            Contribute
          </Button>
        </>
      }
    />
  );
}
