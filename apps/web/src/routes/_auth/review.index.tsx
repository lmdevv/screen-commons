import { createFileRoute } from "@tanstack/react-router";

import { ReviewQueue } from "@/features/review/review-queue";

export const Route = createFileRoute("/_auth/review/")({
  component: ReviewQueue,
});
