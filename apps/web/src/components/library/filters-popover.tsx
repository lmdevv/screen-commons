/* Discover filters panel (lazy chunk; see filters-button.tsx). */
import {
  CATEGORIES,
  ELEMENTS,
  FLOW_TYPES,
  PATTERNS,
  type TaxonomyTerm,
} from "@screen-commons/core/taxonomy";
import {
  Button,
  FilterChip,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@screen-commons/ui";
import { SlidersHorizontal } from "lucide-react";

import type { BrowseSearch, BrowseTab } from "../../lib/search-params";
import { FilterCount } from "./filters-button";

export interface FiltersPanelProps {
  tab: BrowseTab;
  search: BrowseSearch;
  /** Counts per taxonomy slug for the current platform. */
  counts: ReadonlyMap<string, number>;
  activeCount: number;
  onChange: (patch: Partial<BrowseSearch>) => void;
  onClear: () => void;
}

type Field = "category" | "pattern" | "element" | "flowType";

const SECTIONS: Record<
  BrowseTab,
  { field: Field; title: string; terms: readonly TaxonomyTerm[] }[]
> = {
  apps: [{ field: "category", title: "Category", terms: CATEGORIES }],
  screens: [
    { field: "pattern", title: "Screen pattern", terms: PATTERNS },
    { field: "element", title: "UI element", terms: ELEMENTS },
  ],
  elements: [
    { field: "element", title: "UI element", terms: ELEMENTS },
    { field: "pattern", title: "Screen pattern", terms: PATTERNS },
  ],
  flows: [{ field: "flowType", title: "Flow type", terms: FLOW_TYPES }],
};

export default function FiltersPopover({
  tab,
  search,
  counts,
  activeCount,
  onChange,
  onClear,
}: FiltersPanelProps) {
  return (
    <Popover defaultOpen>
      <PopoverTrigger render={<Button variant="secondary" className="h-9" />}>
        <SlidersHorizontal />
        Filters
        <FilterCount count={activeCount} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-[min(560px,70vh)] w-[min(440px,calc(100vw-24px))] flex-col gap-0 p-0"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <PopoverTitle>Filters</PopoverTitle>
          <Button variant="ghost" size="sm" disabled={activeCount === 0} onClick={onClear}>
            Clear all
          </Button>
        </div>
        <div className="ou-scrollbar-thin flex min-h-0 flex-col gap-5 overflow-y-auto px-5 pb-5">
          {tab !== "flows" ? (
            <section className="flex flex-col gap-2.5">
              <h3 className="text-sm font-medium text-fg-muted">Sort</h3>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  size="sm"
                  selected={(search.sort ?? "latest") === "latest"}
                  onSelectedChange={() => onChange({ sort: undefined })}
                >
                  Latest
                </FilterChip>
                <FilterChip
                  size="sm"
                  selected={search.sort === "popular"}
                  onSelectedChange={() => onChange({ sort: "popular" })}
                >
                  Most popular
                </FilterChip>
              </div>
            </section>
          ) : null}
          {SECTIONS[tab].map(({ field, title, terms }) => {
            const current = search[field];
            const available = terms.filter(
              (term) => (counts.get(term.slug) ?? 0) > 0 || term.slug === current,
            );
            return (
              <section key={field} className="flex flex-col gap-2.5">
                <h3 className="text-sm font-medium text-fg-muted">{title}</h3>
                {available.length === 0 ? (
                  <p className="text-sm text-fg-subtle">Nothing to filter by yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {available.map((term) => (
                      <FilterChip
                        key={term.slug}
                        size="sm"
                        count={counts.get(term.slug)}
                        selected={current === term.slug}
                        onSelectedChange={(selected) =>
                          onChange({ [field]: selected ? term.slug : undefined })
                        }
                      >
                        {term.label}
                      </FilterChip>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
