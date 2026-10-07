import { queryOptions } from "@tanstack/react-query";

import { getDocPage, getDocsNav } from "./docs.functions";

export const docsNavQuery = () =>
  queryOptions({ queryKey: ["docs", "nav"], queryFn: () => getDocsNav(), staleTime: Infinity });

export const docPageQuery = (slug: string) =>
  queryOptions({
    queryKey: ["docs", "page", slug],
    queryFn: () => getDocPage({ data: { slug } }),
    staleTime: Infinity,
  });
