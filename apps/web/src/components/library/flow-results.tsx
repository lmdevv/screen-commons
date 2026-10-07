import type { FlowSummary } from "@open-ui/core";
import { FlowCard, ScreenGrid, ScreenGridItem, ScreenGridSkeleton } from "@open-ui/ui";

import { InfiniteSentinel } from "./infinite-sentinel";
import { flowLink } from "./overlay-link";

export interface FlowResultsProps {
  flows: readonly FlowSummary[];
  hideApp?: boolean;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  loadMore?: () => Promise<unknown>;
  priority?: boolean;
}

/** FlowCards that open the flow viewer overlay, with infinite scroll. */
export function FlowResults({
  flows,
  hideApp = false,
  hasMore = false,
  isFetchingMore = false,
  loadMore,
  priority = true,
}: FlowResultsProps) {
  return (
    <>
      <ScreenGrid columns="flows">
        {flows.map((flow, index) => (
          <ScreenGridItem key={flow.id}>
            <FlowCard
              flow={flow}
              hideApp={hideApp}
              priority={priority && index < 2}
              linkRender={flowLink(flow.id)}
            />
          </ScreenGridItem>
        ))}
      </ScreenGrid>
      {isFetchingMore ? (
        <ScreenGridSkeleton columns="flows" count={2} withMeta className="mt-6 lg:mt-8" />
      ) : null}
      {hasMore && loadMore ? (
        <InfiniteSentinel onVisible={() => void loadMore()} disabled={isFetchingMore} />
      ) : null}
    </>
  );
}
