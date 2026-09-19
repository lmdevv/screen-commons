import { createFileRoute } from "@tanstack/react-router";

import { ReviewDetailPage } from "@/features/review/review-detail";

export const Route = createFileRoute("/_auth/review/$submissionId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { submissionId } = Route.useParams();
  return <ReviewDetailPage submissionId={submissionId} />;
}
