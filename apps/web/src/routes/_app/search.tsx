import type { SearchResult } from "@screen-commons/core";
import {
  Button,
  Chip,
  Container,
  EmptyState,
  Kbd,
  KbdGroup,
  PageHeader,
  ScreenGridSkeleton,
  SectionHeader,
  Skeleton,
  useIsMac,
} from "@screen-commons/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search, SearchX, TextSearch } from "lucide-react";
import { Fragment, useEffect, useMemo } from "react";

import { AppResults } from "../../components/library/app-results";
import { FlowResults } from "../../components/library/flow-results";
import { ScreenResults } from "../../components/library/screen-results";
import { PlatformSwitch } from "../../components/shell/platform-switch";
import { useCommandPalette } from "../../components/shell";
import { platformLabel, type Platform } from "../../lib/platform";
import { queries } from "../../lib/queries";
import { addRecentSearch } from "../../lib/recent-searches";
import { validateSearchPage } from "../../lib/search-params";

const LIMIT = 30;

export const Route = createFileRoute("/_app/search")({
  validateSearch: validateSearchPage,
  loaderDeps: ({ search: { q, platform } }) => ({
    q: q?.trim() ?? "",
    platform: platform ?? "web",
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    if (!deps.q) return;
    const work = queryClient.prefetchQuery(
      queries.search({ q: deps.q, platform: deps.platform, limit: LIMIT }),
    );
    if (typeof window === "undefined") await work;
  },
  head: ({ match }) => ({
    meta: [
      {
        title: match.search.q ? `“${match.search.q}” — Screen Commons` : "Search — Screen Commons",
      },
    ],
  }),
  component: SearchPage,
});

const TERM_SEARCH: Record<SearchResult["terms"][number]["kind"], (slug: string) => object> = {
  category: (slug) => ({ category: slug }),
  pattern: (slug) => ({ tab: "screens", pattern: slug }),
  element: (slug) => ({ tab: "elements", element: slug }),
  flowType: (slug) => ({ tab: "flows", flowType: slug }),
};

function SearchPage() {
  const search = Route.useSearch();
  const q = search.q?.trim() ?? "";
  const platform: Platform = search.platform ?? "web";
  const { openPalette } = useCommandPalette();
  const isMac = useIsMac();

  const results = useQuery({
    ...queries.search({ q, platform, limit: LIMIT }),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
  const data = results.data;
  const screenIds = useMemo(() => data?.screens.map((s) => s.id) ?? [], [data]);
  const textMatches = useQuery({
    ...queries.screenTextMatches(q, screenIds),
    enabled: q.length > 0 && screenIds.length > 0,
  });

  useEffect(() => {
    if (q) addRecentSearch(q);
  }, [q]);

  if (!q) {
    return (
      <Container className="pt-10 pb-24 sm:pt-12">
        <PageHeader title="Search" />
        <EmptyState
          className="mt-10"
          tone="tile"
          icon={<Search />}
          title="Search apps, screens and flows"
          description="Find screens by app, pattern, UI element or any text visible in the screenshot."
          actions={
            <Button onClick={() => openPalette()}>
              Open search
              <KbdGroup className="ml-1">
                <Kbd tone="chrome">{isMac ? "⌘" : "Ctrl"}</Kbd>
                <Kbd tone="chrome">K</Kbd>
              </KbdGroup>
            </Button>
          }
        />
      </Container>
    );
  }

  const total = data ? data.apps.length + data.screens.length + data.flows.length : 0;
  const matches = textMatches.data ?? {};

  return (
    <Container className="pt-10 pb-24 sm:pt-12">
      <PageHeader
        title={
          <>
            Results for <span className="text-fg-muted">“{q}”</span>
          </>
        }
        description={
          data
            ? `${total}${capped(data) ? "+" : ""} ${total === 1 ? "result" : "results"} on ${platformLabel(platform)}`
            : undefined
        }
        actions={<PlatformSwitch value={platform} />}
      />

      {data && data.terms.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-fg-muted">Filters</span>
          {data.terms.map((term) => (
            <Chip
              key={`${term.kind}:${term.slug}`}
              render={
                <Link
                  to="/browse/$platform"
                  params={{ platform }}
                  search={TERM_SEARCH[term.kind](term.slug)}
                />
              }
            >
              {term.label}
            </Chip>
          ))}
        </div>
      ) : null}

      {!data ? (
        <div className="mt-12 flex flex-col gap-6">
          <Skeleton className="h-6 w-32" />
          <ScreenGridSkeleton platform={platform} count={6} />
        </div>
      ) : total === 0 ? (
        <EmptyState
          className="mt-10"
          tone="tile"
          icon={<SearchX />}
          title={`No results for “${q}”`}
          description="Try fewer words, another spelling, or a screen pattern like “pricing” or “login”."
          actions={
            <Button variant="outline" onClick={() => openPalette(q)}>
              Edit search
            </Button>
          }
        />
      ) : (
        <div
          className={
            results.isPlaceholderData ? "opacity-50 transition-opacity" : "transition-opacity"
          }
        >
          {data.apps.length > 0 ? (
            <section className="mt-12">
              <SectionHeader title="Apps" description={countLabel(data.apps.length, "app")} />
              <div className="mt-6">
                <AppResults apps={data.apps.slice(0, 8)} platform={platform} />
              </div>
            </section>
          ) : null}
          {data.screens.length > 0 ? (
            <section className="mt-16">
              <SectionHeader
                title="Screens"
                description={
                  <>
                    {countLabel(data.screens.length, "screen")}
                    {Object.keys(matches).length > 0 ? (
                      <span className="text-fg-subtle">
                        {" "}
                        · {Object.keys(matches).length} with matching text in the screenshot
                      </span>
                    ) : null}
                  </>
                }
              />
              <div className="mt-6">
                <ScreenResults
                  listKey={`search:${platform}:${q}`}
                  screens={data.screens}
                  platform={platform}
                  showApp
                  priority={data.apps.length === 0}
                  downloadName={`Screen Commons ${q}`}
                  renderCaption={(screen) =>
                    matches[screen.id] ? <TextMatch snippet={matches[screen.id]!} /> : null
                  }
                />
              </div>
            </section>
          ) : null}
          {data.flows.length > 0 ? (
            <section className="mt-16">
              <SectionHeader title="Flows" description={countLabel(data.flows.length, "flow")} />
              <div className="mt-6">
                <FlowResults flows={data.flows} priority={false} />
              </div>
            </section>
          ) : null}
        </div>
      )}
    </Container>
  );
}

/** Some group hit the result limit: there may be more than shown. */
function capped(data: SearchResult) {
  return [data.apps, data.screens, data.flows].some((group) => group.length === LIMIT);
}

function countLabel(count: number, noun: string) {
  return `${count === LIMIT ? `${count}+` : count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "Text in screenshot" match: the snippet with the hit highlighted. */
function TextMatch({ snippet }: { snippet: string }) {
  const parts = snippet.split(/(\[[^\]]*\])/u);
  return (
    <p className="mt-2.5 flex min-w-0 items-start gap-1.5 px-1 text-sm text-fg-muted">
      <TextSearch
        aria-label="Text in screenshot"
        className="mt-px size-3.5 shrink-0 text-fg-subtle"
      />
      <span className="line-clamp-1">
        {parts.map((part, index) =>
          part.startsWith("[") && part.endsWith("]") ? (
            <mark key={index} className="rounded-[3px] bg-accent-soft px-0.5 text-fg">
              {part.slice(1, -1)}
            </mark>
          ) : (
            <Fragment key={index}>{part}</Fragment>
          ),
        )}
      </span>
    </p>
  );
}
