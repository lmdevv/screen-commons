import type { AppDetail } from "@screen-commons/core";
import { labelFor } from "@screen-commons/core/taxonomy";
import {
  AppHeader,
  AppLogo,
  Button,
  CategoryChips,
  Container,
  EmptyState,
  NativeSelect,
  ResultCount,
  ScreenGridSkeleton,
  TabNav,
  TabNavItem,
  Tooltip,
  cn,
  textLinkClassName,
} from "@screen-commons/ui";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  Link2,
  Shapes,
  SquareStack,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FlowResults } from "../../components/library/flow-results";
import { copyText } from "../../components/library/image-actions";
import { ScreenResults } from "../../components/library/screen-results";
import { useSaveToggle } from "../../components/library/saving";
import { queries } from "../../lib/queries";
import { usePagePlatform } from "../../lib/use-current-platform";
import { validateAppSearch, type AppSearch, type AppTab } from "../../lib/search-params";
import { errorMessage, notify } from "../../lib/toast";

const screensQuery = (app: AppDetail, search: AppSearch, tab: AppTab) =>
  queries.screensInfinite({
    app: app.id,
    version: search.version,
    pattern: tab === "screens" ? search.pattern : undefined,
    element:
      tab === "elements"
        ? (search.element ?? (app.elements[0]?.slug as AppSearch["element"]))
        : undefined,
    sort: search.sort ?? "latest",
    limit: app.platform === "web" ? 24 : 30,
  }) as ReturnType<typeof queries.screensInfinite>;

const flowsQuery = (app: AppDetail) => queries.flowsInfinite({ app: app.id, limit: 12 });

async function prefetchTab(queryClient: QueryClient, app: AppDetail, search: AppSearch) {
  const tab = search.tab ?? "screens";
  if (tab === "flows") return queryClient.prefetchInfiniteQuery(flowsQuery(app));
  if (tab === "elements" && app.elements.length === 0) return;
  return queryClient.prefetchInfiniteQuery(screensQuery(app, search, tab));
}

export const Route = createFileRoute("/_app/apps/$slug")({
  validateSearch: validateAppSearch,
  loaderDeps: ({ search: { tab, version, pattern, element, sort } }) => ({
    tab,
    version,
    pattern,
    element,
    sort,
  }),
  loader: async ({ context: { queryClient }, params, deps }) => {
    const app = await queryClient.ensureQueryData(queries.app(params.slug));
    const work = prefetchTab(queryClient, app, deps);
    if (typeof window === "undefined") await work;
    return { title: app.name };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.title} — Screen Commons` : "Screen Commons" }],
  }),
  component: AppPage,
});

const TABS: { value: AppTab; label: string }[] = [
  { value: "screens", label: "Screens" },
  { value: "elements", label: "UI Elements" },
  { value: "flows", label: "Flows" },
];

function AppPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: app } = useSuspenseQuery(queries.app(slug));
  const tab = search.tab ?? "screens";
  usePagePlatform(app.platform);
  const toggleSave = useSaveToggle();
  const savedIn = useQuery(queries.savedIn("app", app.id));
  const saved = (savedIn.data?.length ?? 0) > 0;

  const update = useCallback(
    (patch: Partial<AppSearch>) =>
      void navigate({ search: (current) => ({ ...current, ...patch }), resetScroll: false }),
    [navigate],
  );

  // The big header scrolls away; the sticky bar then shows the app's logo + name.
  const headerRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry!.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const versionOptions = useMemo(
    () => [
      { value: "", label: "All versions" },
      ...app.versions.map((version) => ({ value: version, label: version })),
    ],
    [app.versions],
  );
  const patternOptions = useMemo(
    () => [
      { value: "", label: "All screens" },
      ...app.patterns.map(({ slug: value, count }) => ({
        value,
        label: `${labelFor(value)} (${count})`,
      })),
    ],
    [app.patterns],
  );

  const resultCount =
    tab === "flows"
      ? { count: app.flowCount, noun: app.flowCount === 1 ? "flow" : "flows" }
      : tab === "screens" && !search.version
        ? search.pattern
          ? {
              count: app.patterns.find((p) => p.slug === search.pattern)?.count ?? 0,
              noun: "screens",
            }
          : { count: app.screenCount, noun: app.screenCount === 1 ? "screen" : "screens" }
        : null;

  return (
    <>
      <Container className="pt-8 sm:pt-10">
        <div ref={headerRef}>
          <AppHeader
            app={app}
            back={
              <Link
                to="/browse/$platform"
                params={{ platform: app.platform }}
                className={cn(textLinkClassName, "inline-flex items-center gap-1.5 no-underline")}
              >
                <ArrowLeft className="size-4" />
                Discover
              </Link>
            }
            renderCategory={(category, label) => (
              <Link
                to="/browse/$platform"
                params={{ platform: app.platform }}
                search={{ category: category as never }}
                className={textLinkClassName}
              >
                {label}
              </Link>
            )}
            actions={
              <>
                <Button
                  variant={saved ? "secondary" : "primary"}
                  aria-pressed={saved}
                  onClick={() => void toggleSave({ kind: "app", id: app.id }, !saved)}
                >
                  <Bookmark className={cn(saved && "fill-current")} />
                  {saved ? "Saved" : "Save"}
                </Button>
                {app.websiteUrl ? (
                  <Button
                    variant="outline"
                    render={<a href={app.websiteUrl} target="_blank" rel="noreferrer noopener" />}
                  >
                    Visit site
                    <ExternalLink />
                  </Button>
                ) : null}
                <Tooltip content="Copy link">
                  <Button
                    variant="outline"
                    icon
                    aria-label="Copy link"
                    onClick={async () => {
                      try {
                        await copyText(`${location.origin}/apps/${app.slug}`);
                        notify.message("Link copied");
                      } catch (error) {
                        notify.error(errorMessage(error));
                      }
                    }}
                  >
                    <Link2 />
                  </Button>
                </Tooltip>
              </>
            }
          />
        </div>
      </Container>

      {/* Sticky context bar: tabs · version · pattern │ count. */}
      <div
        data-stuck={stuck ? "" : undefined}
        className="sticky top-topbar z-30 mt-10 border-b border-transparent bg-bg/85 backdrop-blur-xl backdrop-saturate-150 transition-[border-color] duration-150 data-[stuck]:border-border"
      >
        <Container className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
            {stuck ? (
              <span className="flex items-center gap-2.5">
                <AppLogo app={app} size="sm" />
                <span className="hidden text-base font-semibold text-fg md:inline">{app.name}</span>
                <span aria-hidden className="ml-2.5 hidden h-6 w-px bg-border-strong md:block" />
              </span>
            ) : null}
            <TabNav aria-label="App sections">
              {TABS.map((item) => (
                <TabNavItem
                  key={item.value}
                  active={tab === item.value}
                  badge={
                    item.value === "flows" && app.flowCount > 0 ? (
                      <span className="text-sm font-normal text-fg-subtle tabular-nums">
                        {app.flowCount}
                      </span>
                    ) : undefined
                  }
                  render={
                    <Link
                      to="/apps/$slug"
                      params={{ slug }}
                      search={(current) => ({
                        ...current,
                        tab: item.value === "screens" ? undefined : item.value,
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
            {tab !== "flows" ? (
              <div className="flex items-center gap-1">
                <span aria-hidden className="mr-3 hidden h-6 w-px bg-border-strong sm:block" />
                {app.versions.length > 0 ? (
                  <NativeSelect
                    variant="ghost"
                    aria-label="Version"
                    value={search.version ?? ""}
                    onValueChange={(version) => update({ version: version || undefined })}
                    options={versionOptions}
                  />
                ) : null}
                {tab === "screens" && app.patterns.length > 0 ? (
                  <NativeSelect
                    variant="ghost"
                    aria-label="Screen pattern"
                    value={search.pattern ?? ""}
                    onValueChange={(pattern) =>
                      update({ pattern: (pattern || undefined) as AppSearch["pattern"] })
                    }
                    options={patternOptions}
                  />
                ) : null}
                <NativeSelect
                  variant="ghost"
                  aria-label="Sort"
                  value={search.sort ?? "latest"}
                  onValueChange={(sort) =>
                    update({ sort: sort === "latest" ? undefined : (sort as "popular") })
                  }
                  options={[
                    { value: "latest", label: "Latest" },
                    { value: "popular", label: "Most popular" },
                  ]}
                />
              </div>
            ) : null}
          </div>
          {resultCount ? <ResultCount count={resultCount.count} noun={resultCount.noun} /> : null}
        </Container>
      </div>

      <Container className="pt-6 pb-24">
        {tab === "flows" ? (
          <AppFlows app={app} />
        ) : tab === "elements" ? (
          <AppElements app={app} search={search} onElement={(element) => update({ element })} />
        ) : (
          <AppScreens app={app} search={search} tab="screens" />
        )}
      </Container>
    </>
  );
}

function AppScreens({ app, search, tab }: { app: AppDetail; search: AppSearch; tab: AppTab }) {
  const options = screensQuery(app, search, tab);
  const query = useInfiniteQuery({ ...options, placeholderData: keepPreviousData });
  const screens = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  if (query.isPending) return <ScreenGridSkeleton platform={app.platform} count={12} />;
  if (screens.length === 0) {
    return (
      <EmptyState
        tone="tile"
        icon={<SquareStack />}
        title="No screens here"
        description="Nothing matches this version and pattern. Try another filter."
      />
    );
  }
  return (
    <div
      className={cn(
        "transition-opacity duration-150",
        query.isPlaceholderData && "pointer-events-none opacity-50",
      )}
    >
      <ScreenResults
        listKey={JSON.stringify(options.queryKey)}
        screens={screens}
        platform={app.platform}
        hasMore={query.hasNextPage}
        isFetchingMore={query.isFetchingNextPage}
        loadMore={query.fetchNextPage}
        downloadName={`${app.name} screens`}
      />
    </div>
  );
}

function AppElements({
  app,
  search,
  onElement,
}: {
  app: AppDetail;
  search: AppSearch;
  onElement: (element: AppSearch["element"]) => void;
}) {
  if (app.elements.length === 0) {
    return (
      <EmptyState
        tone="tile"
        icon={<Shapes />}
        title="No UI elements tagged yet"
        description={`Screens of ${app.name} haven’t been tagged with UI elements.`}
      />
    );
  }
  const current = search.element ?? app.elements[0]!.slug;
  return (
    <>
      <CategoryChips
        className="mb-6"
        aria-label="UI elements"
        allLabel={null}
        items={app.elements.map(({ slug, count }) => ({
          value: slug,
          label: labelFor(slug),
          count,
        }))}
        value={current}
        onValueChange={(value) => value && onElement(value as AppSearch["element"])}
      />
      <AppScreens
        app={app}
        search={{ ...search, element: current as AppSearch["element"] }}
        tab="elements"
      />
    </>
  );
}

function AppFlows({ app }: { app: AppDetail }) {
  const query = useInfiniteQuery(flowsQuery(app));
  const flows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  if (query.isPending) return <ScreenGridSkeleton columns="flows" count={4} withMeta />;
  if (flows.length === 0) {
    return (
      <EmptyState
        tone="tile"
        icon={<Workflow />}
        title="No flows yet"
        description={`Nobody has recorded a flow for ${app.name} yet.`}
        actions={
          <Button variant="outline" render={<Link to="/contribute" />}>
            Contribute a flow
          </Button>
        }
      />
    );
  }
  return (
    <FlowResults
      flows={flows}
      hideApp
      hasMore={query.hasNextPage}
      isFetchingMore={query.isFetchingNextPage}
      loadMore={query.fetchNextPage}
    />
  );
}
