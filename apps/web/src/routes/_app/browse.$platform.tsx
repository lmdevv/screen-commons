import { CATEGORIES, ELEMENTS, FLOW_TYPES, PATTERNS, type TaxonomyTerm } from "@open-ui/core/taxonomy";
import {
  CategoryChips,
  Container,
  NativeSelect,
  PageHeader,
  ResultCount,
  ScreenGridSkeleton,
  TabNav,
  TabNavItem,
  Toolbar,
  cn,
} from "@open-ui/ui";
import { keepPreviousData, useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { AppResults } from "../../components/library/app-results";
import { DiscoverEmpty, PlatformEmpty } from "../../components/library/discover-empty";
import { FiltersButton } from "../../components/library/filters-button";
import { FlowResults } from "../../components/library/flow-results";
import { ScreenResults } from "../../components/library/screen-results";
import { PlatformSwitch } from "../../components/shell/platform-switch";
import { isPlatform, platformLabel, type Platform } from "../../lib/platform";
import { queries } from "../../lib/queries";
import {
  validateBrowseSearch,
  type BrowseSearch,
  type BrowseTab,
} from "../../lib/search-params";

// --- queries (shared by the loader and the tabs, so SSR data is reused as-is) -----------------

const appsQuery = (platform: Platform, search: BrowseSearch) =>
  queries.appsInfinite({
    platform,
    category: search.category,
    sort: search.sort ?? "latest",
    limit: 24,
  });

const screensQuery = (platform: Platform, search: BrowseSearch) =>
  queries.screensInfinite({
    platform,
    pattern: search.pattern,
    element: search.element,
    sort: search.sort ?? "latest",
    limit: platform === "web" ? 24 : 30,
  });

const flowsQuery = (platform: Platform, search: BrowseSearch) =>
  queries.flowsInfinite({ platform, type: search.flowType, limit: 12 });

function prefetchTab(queryClient: QueryClient, platform: Platform, search: BrowseSearch) {
  const tab = search.tab ?? "apps";
  if (tab === "apps") return queryClient.prefetchInfiniteQuery(appsQuery(platform, search));
  if (tab === "flows") return queryClient.prefetchInfiniteQuery(flowsQuery(platform, search));
  return queryClient.prefetchInfiniteQuery(screensQuery(platform, search));
}

export const Route = createFileRoute("/_app/browse/$platform")({
  validateSearch: validateBrowseSearch,
  loaderDeps: ({ search: { tab, category, pattern, element, flowType, sort } }) => ({
    tab,
    category,
    pattern,
    element,
    flowType,
    sort,
  }),
  loader: async ({ context: { queryClient }, params, deps }) => {
    if (!isPlatform(params.platform)) throw notFound();
    const work = Promise.all([
      queryClient.ensureQueryData(queries.facets(params.platform)),
      prefetchTab(queryClient, params.platform, deps),
    ]);
    // SSR waits for data; client navigations render at once (previous results stay dimmed).
    if (typeof window === "undefined") await work;
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `Discover ${isPlatform(params.platform) ? platformLabel(params.platform) : ""} — Open UI`,
      },
    ],
  }),
  component: Discover,
});

// --- page -------------------------------------------------------------------------------------

const TABS: { value: BrowseTab; label: string }[] = [
  { value: "apps", label: "Apps" },
  { value: "screens", label: "Screens" },
  { value: "elements", label: "UI Elements" },
  { value: "flows", label: "Flows" },
];

type Field = "category" | "pattern" | "element" | "flowType";

const CHIPS: Record<BrowseTab, { field: Field; terms: readonly TaxonomyTerm[]; label: string }> = {
  apps: { field: "category", terms: CATEGORIES, label: "Categories" },
  screens: { field: "pattern", terms: PATTERNS, label: "Screen patterns" },
  elements: { field: "element", terms: ELEMENTS, label: "UI elements" },
  flows: { field: "flowType", terms: FLOW_TYPES, label: "Flow types" },
};

const SORT_OPTIONS = [
  { value: "latest", label: "Latest" },
  { value: "popular", label: "Most popular" },
] as const;

function Discover() {
  const { platform: platformParam } = Route.useParams();
  const platform = platformParam as Platform;
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = search.tab ?? "apps";
  const facets = useQuery(queries.facets(platform));

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    const data = facets.data;
    if (data) {
      for (const list of [data.categories, data.patterns, data.elements, data.flowTypes]) {
        for (const item of list) map.set(item.slug, item.count);
      }
    }
    return map;
  }, [facets.data]);

  const update = useCallback(
    (patch: Partial<BrowseSearch>) =>
      void navigate({ search: (current) => ({ ...current, ...patch }), resetScroll: false }),
    [navigate],
  );

  const chips = CHIPS[tab];
  const chipValue = search[chips.field] ?? null;
  const chipItems = useMemo(
    () =>
      [...chips.terms]
        .filter((term) => (counts.get(term.slug) ?? 0) > 0 || term.slug === chipValue)
        .sort((a, b) => (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0))
        .map((term) => ({ value: term.slug, label: term.label, count: counts.get(term.slug) })),
    [chips.terms, counts, chipValue],
  );

  const filterFields: Field[] =
    tab === "apps" ? ["category"] : tab === "flows" ? ["flowType"] : ["pattern", "element"];
  const activeCount =
    filterFields.filter((field) => search[field]).length + (search.sort === "popular" ? 1 : 0);
  const clearFilters = () =>
    update({
      category: undefined,
      pattern: undefined,
      element: undefined,
      flowType: undefined,
      sort: undefined,
    });

  const totals = facets.data?.totals;
  const empty = totals && totals.apps === 0 && totals.screens === 0;
  const resultCount = useResultCount(tab, search, counts, totals);

  return (
    <Container className="pt-10 pb-24 sm:pt-12">
      <PageHeader
        title="Discover"
        actions={<PlatformSwitch value={platform} className="sm:hidden" />}
      />
      <TabNav aria-label="Browse" className="mt-5">
        {TABS.map((item) => (
          <TabNavItem
            key={item.value}
            active={tab === item.value}
            render={
              <Link
                to="/browse/$platform"
                params={{ platform }}
                search={(current) => ({
                  ...current,
                  tab: item.value === "apps" ? undefined : item.value,
                  screen: undefined,
                  flow: undefined,
                })}
                resetScroll={false}
                activeOptions={{ includeSearch: false }}
                activeProps={{}}
              />
            }
          >
            {item.label}
          </TabNavItem>
        ))}
      </TabNav>

      {empty ? (
        <PlatformEmpty platform={platform} className="mt-10" />
      ) : (
        <>
          <CategoryChips
            className="mt-6"
            aria-label={chips.label}
            items={chipItems}
            value={chipValue}
            onValueChange={(value) => update({ [chips.field]: value ?? undefined })}
            leading={
              <FiltersButton
                tab={tab}
                search={search}
                counts={counts}
                activeCount={activeCount}
                onChange={update}
                onClear={clearFilters}
              />
            }
          />
          <Toolbar className="mt-8 mb-6">
            {tab === "flows" ? (
              <span />
            ) : (
              <NativeSelect
                variant="ghost"
                aria-label="Sort"
                value={search.sort ?? "latest"}
                onValueChange={(sort) => update({ sort: sort === "latest" ? undefined : sort })}
                options={SORT_OPTIONS}
              />
            )}
            {resultCount ? <ResultCount count={resultCount.count} noun={resultCount.noun} /> : null}
          </Toolbar>
          {tab === "apps" ? (
            <AppsTab platform={platform} search={search} onClear={clearFilters} />
          ) : tab === "flows" ? (
            <FlowsTab platform={platform} search={search} onClear={clearFilters} />
          ) : (
            <ScreensTab platform={platform} search={search} tab={tab} onClear={clearFilters} />
          )}
        </>
      )}
    </Container>
  );
}

function useResultCount(
  tab: BrowseTab,
  search: BrowseSearch,
  counts: ReadonlyMap<string, number>,
  totals: { apps: number; screens: number; flows: number } | undefined,
): { count: number; noun: string } | null {
  if (!totals) return null;
  const pick = (slug: string | undefined, total: number) =>
    slug ? (counts.get(slug) ?? 0) : total;
  if (tab === "apps") {
    const count = pick(search.category, totals.apps);
    return { count, noun: count === 1 ? "app" : "apps" };
  }
  if (tab === "flows") {
    const count = pick(search.flowType, totals.flows);
    return { count, noun: count === 1 ? "flow" : "flows" };
  }
  // Two filters at once: the exact intersection isn't counted.
  if (search.pattern && search.element) return null;
  const count = pick(search.pattern ?? search.element, totals.screens);
  return { count, noun: count === 1 ? "screen" : "screens" };
}

// --- tabs -------------------------------------------------------------------------------------

interface TabProps {
  platform: Platform;
  search: BrowseSearch;
  onClear: () => void;
}

function Dimmed({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-busy={active || undefined}
      className={cn("transition-opacity duration-150", active && "pointer-events-none opacity-50")}
    >
      {children}
    </div>
  );
}

function AppsTab({ platform, search, onClear }: TabProps) {
  const query = useInfiniteQuery({ ...appsQuery(platform, search), placeholderData: keepPreviousData });
  const apps = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  if (query.isPending) {
    return (
      <ScreenGridSkeleton columns={platform === "web" ? "apps-web" : "apps-mobile"} count={8} withMeta />
    );
  }
  if (apps.length === 0) {
    return <DiscoverEmpty noun="apps" platform={platform} tab="apps" onClear={onClear} />;
  }
  return (
    <Dimmed active={query.isPlaceholderData}>
      <AppResults
        apps={apps}
        platform={platform}
        hasMore={query.hasNextPage}
        isFetchingMore={query.isFetchingNextPage}
        loadMore={query.fetchNextPage}
      />
    </Dimmed>
  );
}

function ScreensTab({ platform, search, tab, onClear }: TabProps & { tab: BrowseTab }) {
  const options = screensQuery(platform, search);
  const query = useInfiniteQuery({ ...options, placeholderData: keepPreviousData });
  const screens = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  if (query.isPending) return <ScreenGridSkeleton platform={platform} count={12} />;
  if (screens.length === 0) {
    return (
      <DiscoverEmpty
        noun={tab === "elements" ? "UI elements" : "screens"}
        platform={platform}
        tab={tab}
        onClear={onClear}
      />
    );
  }
  return (
    <Dimmed active={query.isPlaceholderData}>
      <ScreenResults
        listKey={JSON.stringify(options.queryKey)}
        screens={screens}
        platform={platform}
        showApp
        hasMore={query.hasNextPage}
        isFetchingMore={query.isFetchingNextPage}
        loadMore={query.fetchNextPage}
        downloadName={`Open UI ${platformLabel(platform)} screens`}
      />
    </Dimmed>
  );
}

function FlowsTab({ platform, search, onClear }: TabProps) {
  const query = useInfiniteQuery({ ...flowsQuery(platform, search), placeholderData: keepPreviousData });
  const flows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  if (query.isPending) return <ScreenGridSkeleton columns="flows" count={4} withMeta />;
  if (flows.length === 0) {
    return <DiscoverEmpty noun="flows" platform={platform} tab="flows" onClear={onClear} />;
  }
  return (
    <Dimmed active={query.isPlaceholderData}>
      <FlowResults
        flows={flows}
        hasMore={query.hasNextPage}
        isFetchingMore={query.isFetchingNextPage}
        loadMore={query.fetchNextPage}
      />
    </Dimmed>
  );
}
