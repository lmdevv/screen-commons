import { queryOptions } from "@tanstack/react-query";

import { getReviewQueueDetailed } from "./review.functions";

/** Under the `["review"]` prefix so `queries.reviewQueue()` invalidations refresh it too. */
export const reviewQueueQuery = () =>
  queryOptions({ queryKey: ["review", "detailed"], queryFn: () => getReviewQueueDetailed() });
