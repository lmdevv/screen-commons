import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Folders, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { capture, sanitizeSearchMetrics } from "../../lib/analytics";
import { catalogQueryOptions } from "./queries";
import type { CatalogFilters, LibraryFlow, LibraryProduct, Platform } from "./types";
import { UiPreview } from "./ui-preview";

const platforms: Array<Platform | "All"> = ["All", "Web"];
const catalogCategories = [
  "All",
  "Onboarding",
  "Authentication",
  "Checkout",
  "Search",
  "Forms",
  "Navigation",
  "Community",
];

export function CatalogView() {
  const [filters, setFilters] = useState<CatalogFilters>({
    query: "",
    platform: "All",
    category: "All",
  });
  const catalogQuery = useQuery(catalogQueryOptions());
  const products = catalogQuery.data ?? [];
  const flows = useMemo(() => products.flatMap((product) => product.flows), [products]);

  const visibleProducts = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !query ||
        [
          product.name,
          product.description,
          product.industry,
          ...product.tags,
          ...product.flows.map((flow) => flow.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesPlatform =
        filters.platform === "All" || product.platforms.includes(filters.platform);
      const matchesCategory =
        filters.category === "All" ||
        product.flows.some((flow) => flow.category === filters.category);
      return matchesQuery && matchesPlatform && matchesCategory;
    });
  }, [filters, products]);

  const visibleFlows = useMemo(() => {
    const productSlugs = new Set(visibleProducts.map((product) => product.slug));
    return flows.filter(
      (flow) =>
        productSlugs.has(flow.productSlug) &&
        (filters.category === "All" || flow.category === filters.category),
    );
  }, [filters.category, flows, visibleProducts]);

  const hasFilters = filters.query || filters.platform !== "All" || filters.category !== "All";

  return (
    <div>
      <section className="relative overflow-hidden border-b border-black/8 px-5 pb-9 pt-10 dark:border-white/8 sm:px-8 lg:px-10 lg:pb-11 lg:pt-12">
        <div className="pointer-events-none absolute -right-24 -top-48 size-[28rem] rounded-full bg-[#ff5d42]/[0.07] blur-3xl dark:bg-[#ff5d42]/[0.08]" />
        <div className="relative max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[#da4a32] dark:text-[#ff806b]">
            <Sparkles className="size-3.5" /> Curated by the community
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl lg:text-[2.85rem] lg:leading-[1.08]">
            Find the flow before
            <br className="hidden sm:block" /> you design the screen.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-black/48 dark:text-white/45 sm:text-[15px]">
            Explore complete, ordered interface flows from real products. Free for designers,
            developers, and curious builders.
          </p>
        </div>

        <div className="relative mt-7 flex max-w-4xl flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search products, flows, or patterns</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-black/35 dark:text-white/35" />
            <input
              data-library-search
              type="search"
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && filters.query.trim()) {
                  capture("catalog_searched", sanitizeSearchMetrics(filters.query));
                }
              }}
              placeholder="Search products, flows, or patterns…"
              className="h-11 w-full rounded-xl border border-black/10 bg-white pl-10 pr-16 text-sm shadow-sm outline-none transition focus:border-[#ff5d42]/60 focus:ring-3 focus:ring-[#ff5d42]/10 dark:border-white/10 dark:bg-white/[0.055] dark:focus:border-[#ff765f]/60"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-black/10 bg-black/[0.025] px-1.5 py-0.5 font-sans text-[10px] text-black/40 dark:border-white/10 dark:bg-white/5 dark:text-white/35 sm:block">
              ⌘ K
            </kbd>
          </label>
          <label className="relative min-w-44">
            <span className="sr-only">Filter by category</span>
            <SlidersHorizontal className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-black/35 dark:text-white/35" />
            <select
              value={filters.category}
              onChange={(event) =>
                setFilters((current) => ({ ...current, category: event.target.value }))
              }
              className="h-11 w-full appearance-none rounded-xl border border-black/10 bg-white pl-9 pr-8 text-sm shadow-sm outline-none focus:border-[#ff5d42]/60 dark:border-white/10 dark:bg-[#1d1d1b]"
            >
              {catalogCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>

        <div
          className="relative mt-4 flex flex-wrap items-center gap-2"
          aria-label="Platform filters"
        >
          {platforms.map((platform) => (
            <button
              key={platform}
              type="button"
              onClick={() => setFilters((current) => ({ ...current, platform }))}
              aria-pressed={filters.platform === platform}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${filters.platform === platform ? "border-[#ff5d42]/25 bg-[#ff5d42]/10 font-medium text-[#d84831] dark:text-[#ff806b]" : "border-black/8 bg-white/45 text-black/48 hover:bg-white dark:border-white/8 dark:bg-white/[0.025] dark:text-white/45 dark:hover:bg-white/6"}`}
            >
              {platform}
            </button>
          ))}
        </div>
      </section>

      <div className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        {catalogQuery.isPending ? (
          <div className="grid min-h-64 place-items-center text-sm text-black/45 dark:text-white/42">
            Loading catalog…
          </div>
        ) : catalogQuery.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-400"
          >
            {catalogQuery.error.message}
          </div>
        ) : visibleProducts.length === 0 ? (
          <CatalogEmpty
            onReset={() => setFilters({ query: "", platform: "All", category: "All" })}
          />
        ) : (
          <>
            <section aria-labelledby="products-heading">
              <SectionHeading
                id="products-heading"
                title={
                  hasFilters ? `${visibleProducts.length} matching products` : "Browse products"
                }
                meta={`${visibleProducts.reduce((sum, product) => sum + product.flows.length, 0)} flows`}
              />
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleProducts.map((product) => (
                  <ProductCard key={product.slug} product={product} />
                ))}
              </div>
            </section>

            <section className="mt-12" aria-labelledby="flows-heading">
              <SectionHeading
                id="flows-heading"
                title={hasFilters ? "Matching flows" : "Featured flows"}
                meta={`${visibleFlows.length} available`}
              />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {(hasFilters ? visibleFlows : visibleFlows.filter((flow) => flow.featured)).map(
                  (flow) => (
                    <FlowCard
                      key={flow.id}
                      flow={flow}
                      product={products.find((product) => product.slug === flow.productSlug)!}
                    />
                  ),
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product }: { product: LibraryProduct }) {
  const leadScreen = product.flows[0]?.screens[0];
  return (
    <Link
      to="/products/$productSlug"
      params={{ productSlug: product.slug }}
      className="group overflow-hidden rounded-2xl border border-black/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition duration-200 hover:-translate-y-0.5 hover:border-black/15 hover:shadow-[0_14px_32px_rgba(28,25,20,0.08)] dark:border-white/8 dark:bg-white/[0.035] dark:hover:border-white/15 dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.22)]"
    >
      {leadScreen ? (
        <UiPreview
          screen={leadScreen}
          compact
          className="aspect-[1.75] border-b border-black/6 transition-transform duration-500 group-hover:scale-[1.015] dark:border-white/6"
        />
      ) : null}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <ProductMark product={product} />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold tracking-[-0.015em]">{product.name}</h3>
            <p className="mt-0.5 truncate text-xs text-black/43 dark:text-white/40">
              {product.description}
            </p>
          </div>
          <ArrowRight className="mt-1 size-4 -translate-x-1 text-black/25 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 dark:text-white/30" />
        </div>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-black/40 dark:text-white/38">
          <span>
            {product.flows.length} {product.flows.length === 1 ? "flow" : "flows"}
          </span>
          <span>·</span>
          <span>{product.flows.reduce((sum, flow) => sum + flow.screens.length, 0)} screens</span>
          <span className="ml-auto rounded-full bg-black/[0.035] px-2 py-1 dark:bg-white/6">
            {product.platforms.join(" + ")}
          </span>
        </div>
      </div>
    </Link>
  );
}

function FlowCard({ flow, product }: { flow: LibraryFlow; product: LibraryProduct }) {
  return (
    <Link
      to="/flows/$flowId"
      params={{ flowId: flow.id }}
      className="group flex gap-4 rounded-2xl border border-black/8 bg-white p-3 transition hover:border-black/15 hover:shadow-[0_10px_25px_rgba(28,25,20,0.06)] dark:border-white/8 dark:bg-white/[0.035] dark:hover:border-white/15"
    >
      <UiPreview
        screen={flow.screens[0]!}
        compact
        className="aspect-[1.25] w-28 shrink-0 rounded-xl sm:w-36"
      />
      <div className="min-w-0 flex-1 py-1 pr-1">
        <div className="flex items-center gap-2">
          <ProductMark product={product} small />
          <span className="text-[11px] text-black/42 dark:text-white/40">{product.name}</span>
        </div>
        <h3 className="mt-3 text-sm font-semibold tracking-[-0.015em] group-hover:text-[#d84831] dark:group-hover:text-[#ff806b]">
          {flow.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/44 dark:text-white/40">
          {flow.description}
        </p>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-black/38 dark:text-white/35">
          <span>{flow.screens.length} screens</span>
          <span>·</span>
          <span>{flow.category}</span>
        </div>
      </div>
    </Link>
  );
}

export function ProductMark({
  product,
  small = false,
}: {
  product: Pick<LibraryProduct, "initials" | "accent" | "name">;
  small?: boolean;
}) {
  return (
    <span
      aria-label={`${product.name} logo`}
      className={`${small ? "size-5 text-[7px]" : "size-9 text-[10px]"} grid shrink-0 place-items-center rounded-lg font-bold tracking-tight text-white shadow-sm`}
      style={{ backgroundColor: product.accent }}
    >
      {product.initials}
    </span>
  );
}

function SectionHeading({ id, title, meta }: { id: string; title: string; meta: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 id={id} className="text-base font-semibold tracking-[-0.02em]">
        {title}
      </h2>
      <span className="text-xs text-black/38 dark:text-white/35">{meta}</span>
    </div>
  );
}

function CatalogEmpty({ onReset }: { onReset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-black/[0.035] dark:bg-white/5">
        <Folders className="size-5 text-black/35 dark:text-white/35" />
      </span>
      <h2 className="mt-4 text-base font-semibold">No references found</h2>
      <p className="mt-1.5 text-sm leading-6 text-black/45 dark:text-white/42">
        Try a broader term or clear a filter. The library is small and carefully curated while we
        validate the idea.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 rounded-lg bg-[#ff5d42] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#eb5038]"
      >
        Clear all filters
      </button>
    </div>
  );
}

export function CatalogLoading() {
  return (
    <div
      className="grid animate-pulse gap-4 p-8 md:grid-cols-2 xl:grid-cols-3"
      aria-label="Loading library"
    >
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          className="overflow-hidden rounded-2xl border border-black/6 dark:border-white/6"
        >
          <div className="aspect-[1.75] bg-black/5 dark:bg-white/5" />
          <div className="p-4">
            <div className="h-4 w-1/3 rounded bg-black/6 dark:bg-white/6" />
            <div className="mt-3 h-3 w-4/5 rounded bg-black/5 dark:bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CatalogError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h2 className="text-base font-semibold">The library couldn’t be loaded</h2>
      <p className="mt-2 text-sm text-black/45 dark:text-white/42">
        Your account is fine. Check the connection and try again.
      </p>
      <button
        type="button"
        onClick={retry}
        className="mt-5 rounded-lg border border-black/10 px-3.5 py-2 text-xs font-medium dark:border-white/10"
      >
        Try again
      </button>
    </div>
  );
}
