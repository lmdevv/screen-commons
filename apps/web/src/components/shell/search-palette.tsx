/*
 * ⌘K search palette (lazy chunk). Empty query → Trending (popular apps, patterns with thumbs,
 * categories, UI elements, flow types) scoped by the left rail; typing → live grouped results from
 * the `search` server function (debounced). Enter on the first row opens /search?q=….
 */
import { CATEGORIES, ELEMENTS, FLOW_TYPES, PATTERNS, labelFor } from "@open-ui/core/taxonomy";
import {
  AppLogo,
  CommandGroup,
  CommandItem,
  CommandPalette,
  CommandRailItem,
} from "@open-ui/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Clock,
  Flame,
  LayoutGrid,
  Search,
  Shapes,
  SquareStack,
  Tag,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { platformLabel, type Platform } from "../../lib/platform";
import { queries } from "../../lib/queries";
import { addRecentSearch, clearRecentSearches, readRecentSearches } from "../../lib/recent-searches";
import { useDebouncedValue } from "../../lib/use-debounced-value";

type Scope = "trending" | "apps" | "screens" | "elements" | "flows";

const SCOPES: { value: Scope; label: string; icon: React.ReactNode }[] = [
  { value: "trending", label: "Trending", icon: <Flame /> },
  { value: "apps", label: "Apps", icon: <LayoutGrid /> },
  { value: "screens", label: "Screens", icon: <SquareStack /> },
  { value: "elements", label: "UI Elements", icon: <Shapes /> },
  { value: "flows", label: "Flows", icon: <Workflow /> },
];

export interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  platform: Platform;
}

export default function SearchPalette({
  open,
  onOpenChange,
  initialQuery,
  platform,
}: SearchPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<Scope>("trending");
  const [recent, setRecent] = useState<string[]>([]);

  // Reset each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setScope("trending");
    setRecent(readRecentSearches());
  }, [open, initialQuery]);

  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, 150);
  const searching = trimmed.length > 0;

  const popularApps = useQuery({
    ...queries.apps({ platform, sort: "popular", limit: 6 }),
    enabled: open,
  });
  const facets = useQuery({ ...queries.facets(platform), enabled: open });
  const results = useQuery({
    ...queries.search({ q: debounced, platform, limit: 6 }),
    enabled: open && debounced.length > 0,
    placeholderData: keepPreviousData,
  });

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    const data = facets.data;
    if (!data) return map;
    for (const list of [data.categories, data.patterns, data.elements, data.flowTypes]) {
      for (const item of list) map.set(item.slug, item.count);
    }
    return map;
  }, [facets.data]);
  const patternThumbs = useMemo(
    () => new Map(facets.data?.patterns.map((p) => [p.slug, p.thumbUrl]) ?? []),
    [facets.data],
  );

  const close = () => onOpenChange(false);
  const browse = (search: Record<string, string>) => {
    close();
    void navigate({ to: "/browse/$platform", params: { platform }, search });
  };
  const runSearch = (text: string) => {
    const q = text.trim();
    if (!q) return;
    addRecentSearch(q);
    close();
    void navigate({ to: "/search", search: { q, platform } });
  };
  const openApp = (slug: string) => {
    if (trimmed) addRecentSearch(trimmed);
    close();
    void navigate({ to: "/apps/$slug", params: { slug } });
  };
  const openOverlay = (key: "screen" | "flow", id: string) => {
    if (trimmed) addRecentSearch(trimmed);
    close();
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        screen: key === "screen" ? id : undefined,
        flow: key === "flow" ? id : undefined,
      }),
      resetScroll: false,
    });
  };

  const show = (target: Scope) => scope === "trending" || scope === target;
  const withCounts = <T extends { slug: string }>(terms: readonly T[]) => {
    if (counts.size === 0) return terms;
    return [...terms]
      .filter((term) => (counts.get(term.slug) ?? 0) > 0)
      .sort((a, b) => (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0));
  };
  const limit = (n: number) => (scope === "trending" ? n : undefined);
  const hint = (slug: string) => {
    const count = counts.get(slug);
    return count ? String(count) : undefined;
  };

  const data = results.data;
  const hasResults =
    !!data &&
    data.apps.length + data.screens.length + data.flows.length + data.terms.length > 0;

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      search={query}
      onSearchChange={setQuery}
      shouldFilter={false}
      placeholder={`Search ${platformLabel(platform)} apps, screens, UI elements, flows…`}
      loading={searching && results.isFetching && !results.data}
      emptyText={searching ? `No results for “${trimmed}”` : "Nothing here yet."}
      rail={SCOPES.map((item) => (
        <CommandRailItem
          key={item.value}
          icon={item.icon}
          active={scope === item.value}
          onClick={() => setScope(item.value)}
        >
          {item.label}
        </CommandRailItem>
      ))}
    >
      {searching ? (
        <>
          <CommandGroup>
            <CommandItem
              value={`search:${trimmed}`}
              icon={<Search />}
              onSelect={() => runSearch(trimmed)}
            >
              Search for “{trimmed}”
            </CommandItem>
          </CommandGroup>
          {data && show("apps") && data.apps.length > 0 ? (
            <CommandGroup heading="Apps">
              {data.apps.map((app) => (
                <CommandItem
                  key={app.id}
                  value={`app:${app.id}`}
                  icon={<AppLogo app={app} size="sm" className="-m-0.5" />}
                  hint={app.tagline}
                  onSelect={() => openApp(app.slug)}
                >
                  {app.name}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data && data.terms.length > 0 ? (
            <CommandGroup heading="Filters">
              {data.terms
                .filter((term) =>
                  scope === "trending"
                    ? true
                    : scope === "apps"
                      ? term.kind === "category"
                      : scope === "screens"
                        ? term.kind === "pattern"
                        : scope === "elements"
                          ? term.kind === "element"
                          : term.kind === "flowType",
                )
                .map((term) => (
                  <CommandItem
                    key={`${term.kind}:${term.slug}`}
                    value={`term:${term.kind}:${term.slug}`}
                    icon={<Tag />}
                    hint={TERM_HINT[term.kind]}
                    onSelect={() => browse(termSearch(term.kind, term.slug))}
                  >
                    {term.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          ) : null}
          {data && (show("screens") || show("elements")) && data.screens.length > 0 ? (
            <CommandGroup heading="Screens">
              {data.screens.map((screen) => (
                <CommandItem
                  key={screen.id}
                  value={`screen:${screen.id}`}
                  icon={<Thumb src={screen.thumbUrl} />}
                  hint={screen.app.name}
                  onSelect={() => openOverlay("screen", screen.id)}
                >
                  {screen.title ?? labelFor(screen.patterns[0] ?? "screen")}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data && show("flows") && data.flows.length > 0 ? (
            <CommandGroup heading="Flows">
              {data.flows.map((flow) => (
                <CommandItem
                  key={flow.id}
                  value={`flow:${flow.id}`}
                  icon={<Workflow />}
                  hint={`${flow.app.name} · ${flow.stepCount} screens`}
                  onSelect={() => openOverlay("flow", flow.id)}
                >
                  {flow.name}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data && !hasResults && !results.isFetching ? (
            <p className="px-4 py-10 text-center text-base text-fg-muted">
              No matches for “{trimmed}”. Press Enter to search screenshot text.
            </p>
          ) : null}
        </>
      ) : (
        <>
          {scope === "trending" && recent.length > 0 ? (
            <CommandGroup heading="Recent searches">
              {recent.map((text) => (
                <CommandItem
                  key={text}
                  value={`recent:${text}`}
                  icon={<Clock />}
                  onSelect={() => runSearch(text)}
                >
                  {text}
                </CommandItem>
              ))}
              <CommandItem
                value="recent:clear"
                icon={<X />}
                className="text-fg-muted"
                onSelect={() => {
                  clearRecentSearches();
                  setRecent([]);
                }}
              >
                Clear recent searches
              </CommandItem>
            </CommandGroup>
          ) : null}
          {show("apps") && popularApps.data && popularApps.data.items.length > 0 ? (
            <CommandGroup heading={scope === "trending" ? "Trending apps" : "Popular apps"}>
              {popularApps.data.items.map((app) => (
                <CommandItem
                  key={app.id}
                  value={`app:${app.id}`}
                  icon={<AppLogo app={app} size="sm" className="-m-0.5" />}
                  hint={app.tagline}
                  onSelect={() => openApp(app.slug)}
                >
                  {app.name}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {show("apps") ? (
            <CommandGroup heading="App categories">
              {withCounts(CATEGORIES)
                .slice(0, limit(4))
                .map((term) => (
                  <CommandItem
                    key={term.slug}
                    value={`category:${term.slug}`}
                    icon={<LayoutGrid />}
                    hint={hint(term.slug)}
                    onSelect={() => browse({ tab: "apps", category: term.slug })}
                  >
                    {term.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          ) : null}
          {show("screens") ? (
            <CommandGroup heading="Screens">
              {withCounts(PATTERNS)
                .slice(0, limit(5))
                .map((term) => (
                  <CommandItem
                    key={term.slug}
                    value={`pattern:${term.slug}`}
                    icon={
                      patternThumbs.get(term.slug) ? (
                        <Thumb src={patternThumbs.get(term.slug)!} />
                      ) : (
                        <SquareStack />
                      )
                    }
                    hint={hint(term.slug)}
                    onSelect={() => browse({ tab: "screens", pattern: term.slug })}
                  >
                    {term.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          ) : null}
          {show("elements") ? (
            <CommandGroup heading="UI elements">
              {scope === "trending" ? (
                <div className="flex flex-wrap gap-1.5 px-3 pt-0.5 pb-2">
                  {withCounts(ELEMENTS)
                    .slice(0, 8)
                    .map((term) => (
                      <CommandItem
                        key={term.slug}
                        value={`element:${term.slug}`}
                        className="min-h-8 rounded-pill border border-border px-3 text-sm font-medium data-[selected=true]:border-transparent [&>span:last-child]:hidden"
                        onSelect={() => browse({ tab: "elements", element: term.slug })}
                      >
                        {term.label}
                      </CommandItem>
                    ))}
                </div>
              ) : (
                withCounts(ELEMENTS).map((term) => (
                  <CommandItem
                    key={term.slug}
                    value={`element:${term.slug}`}
                    icon={<Shapes />}
                    hint={hint(term.slug)}
                    onSelect={() => browse({ tab: "elements", element: term.slug })}
                  >
                    {term.label}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          ) : null}
          {show("flows") ? (
            <CommandGroup heading="Flows">
              {withCounts(FLOW_TYPES)
                .slice(0, limit(4))
                .map((term) => (
                  <CommandItem
                    key={term.slug}
                    value={`flowType:${term.slug}`}
                    icon={<Workflow />}
                    hint={hint(term.slug)}
                    onSelect={() => browse({ tab: "flows", flowType: term.slug })}
                  >
                    {term.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          ) : null}
        </>
      )}
    </CommandPalette>
  );
}

const TERM_HINT = {
  pattern: "Screen pattern",
  element: "UI element",
  flowType: "Flow",
  category: "Category",
} as const;

function termSearch(kind: keyof typeof TERM_HINT, slug: string): Record<string, string> {
  switch (kind) {
    case "pattern":
      return { tab: "screens", pattern: slug };
    case "element":
      return { tab: "elements", element: slug };
    case "flowType":
      return { tab: "flows", flowType: slug };
    case "category":
      return { tab: "apps", category: slug };
  }
}

/** Tiny top-anchored screenshot used as a row icon. */
function Thumb({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      className="-m-0.5 size-7 rounded-[7px] object-cover object-top ring-1 ring-border"
    />
  );
}
