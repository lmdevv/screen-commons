import { queryOptions } from "@tanstack/react-query";

import { loadPublishedCatalog, loadSignedMediaUrl } from "./server-library";

export const catalogQueryOptions = () =>
  queryOptions({
    queryKey: ["catalog"] as const,
    queryFn: loadPublishedCatalog,
    staleTime: 30_000,
  });

export const mediaUrlQueryOptions = (imageKey: string | undefined) =>
  queryOptions({
    enabled: Boolean(imageKey),
    queryKey: ["media-url", imageKey] as const,
    queryFn: () => loadSignedMediaUrl(imageKey!),
    staleTime: 4 * 60_000,
  });
