import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { reviewQueueQuery } from "../../components/review/queries";
import { ReviewPage } from "../../components/review/review-page";

export const Route = createFileRoute("/_app/review")({
  validateSearch: z.object({ tab: z.enum(["screens", "flows"]).optional().catch(undefined) }),
  beforeLoad: ({ context }) => {
    // Members don't learn this page exists.
    if (context.user.role !== "admin") throw notFound();
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(reviewQueueQuery()),
  head: () => ({ meta: [{ title: "Review · Screen Commons" }] }),
  component: Review,
});

function Review() {
  const { tab } = Route.useSearch();
  return <ReviewPage tab={tab ?? "screens"} />;
}
