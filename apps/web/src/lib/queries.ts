/**
 * TanStack Query option factories over the server functions. Use with `useQuery` /
 * `useSuspenseQuery` / `useInfiniteQuery` in components and `queryClient.ensureQueryData` in
 * route loaders (SSR-dehydrated automatically by the router integration).
 */
import type { ListAppsQuery, ListFlowsQuery, ListScreensQuery, SearchQuery } from "@open-ui/core";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import * as fn from "../server/functions";

type WithoutCursor<T> = Omit<T, "cursor">;

export const queries = {
  session: () =>
    queryOptions({ queryKey: ["session"], queryFn: () => fn.getCurrentUser(), staleTime: 60_000 }),
  authOptions: () =>
    queryOptions({
      queryKey: ["auth-options"],
      queryFn: () => fn.getAuthOptions(),
      staleTime: Infinity,
    }),
  taxonomy: () =>
    queryOptions({ queryKey: ["taxonomy"], queryFn: () => fn.getTaxonomy(), staleTime: Infinity }),

  apps: (query: ListAppsQuery = {}) =>
    queryOptions({ queryKey: ["apps", query], queryFn: () => fn.listApps({ data: query }) }),
  appsInfinite: (query: WithoutCursor<ListAppsQuery> = {}) =>
    infiniteQueryOptions({
      queryKey: ["apps", "infinite", query],
      queryFn: ({ pageParam }) => fn.listApps({ data: { ...query, cursor: pageParam } }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  app: (slug: string, platform?: string) =>
    queryOptions({
      queryKey: ["app", slug, platform ?? null],
      queryFn: () => fn.getApp({ data: { slug, platform } }),
    }),

  screens: (query: ListScreensQuery = {}) =>
    queryOptions({ queryKey: ["screens", query], queryFn: () => fn.listScreens({ data: query }) }),
  screensInfinite: (query: WithoutCursor<ListScreensQuery> = {}) =>
    infiniteQueryOptions({
      queryKey: ["screens", "infinite", query],
      queryFn: ({ pageParam }) => fn.listScreens({ data: { ...query, cursor: pageParam } }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  screen: (id: string) =>
    queryOptions({ queryKey: ["screen", id], queryFn: () => fn.getScreen({ data: { id } }) }),

  flows: (query: ListFlowsQuery = {}) =>
    queryOptions({ queryKey: ["flows", query], queryFn: () => fn.listFlows({ data: query }) }),
  flowsInfinite: (query: WithoutCursor<ListFlowsQuery> = {}) =>
    infiniteQueryOptions({
      queryKey: ["flows", "infinite", query],
      queryFn: ({ pageParam }) => fn.listFlows({ data: { ...query, cursor: pageParam } }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  flow: (id: string) =>
    queryOptions({ queryKey: ["flow", id], queryFn: () => fn.getFlow({ data: { id } }) }),

  search: (query: SearchQuery) =>
    queryOptions({ queryKey: ["search", query], queryFn: () => fn.search({ data: query }) }),

  collections: () =>
    queryOptions({ queryKey: ["collections"], queryFn: () => fn.listCollections() }),
  collection: (id: string) =>
    queryOptions({
      queryKey: ["collection", id],
      queryFn: () => fn.getCollection({ data: { id } }),
    }),

  keys: () => queryOptions({ queryKey: ["keys"], queryFn: () => fn.listKeys() }),
  reviewQueue: () => queryOptions({ queryKey: ["review"], queryFn: () => fn.getReviewQueue() }),
};
