import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { FlowNotFound, FlowView } from "@/features/library/flow-view";
import { LibraryShell } from "@/features/library/library-shell";
import { catalogQueryOptions } from "@/features/library/queries";

export const Route = createFileRoute("/_auth/flows/$flowId")({
  component: FlowRoute,
});

function FlowRoute() {
  const { flowId } = Route.useParams();
  const catalogQuery = useQuery(catalogQueryOptions());
  const product = catalogQuery.data?.find((item) => item.flows.some((flow) => flow.id === flowId));
  const flow = product?.flows.find((item) => item.id === flowId);

  return (
    <LibraryShell>
      {flow && product ? (
        <FlowView key={flow.id} flow={flow} product={product} />
      ) : catalogQuery.isPending ? (
        <div className="grid min-h-[70svh] place-items-center text-sm text-muted-foreground">
          Loading flow…
        </div>
      ) : (
        <FlowNotFound />
      )}
    </LibraryShell>
  );
}
