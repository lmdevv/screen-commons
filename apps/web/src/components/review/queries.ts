import type { ReviewKind } from "@screen-commons/core";
import { infiniteQueryOptions } from "@tanstack/react-query";

import { getReviewQueueDetailed } from "./review.functions";

export const reviewQueueQuery = (kind: ReviewKind) =>
  infiniteQueryOptions({
    queryKey: ["review", kind],
    queryFn: ({ pageParam }) => getReviewQueueDetailed({ data: { kind, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
