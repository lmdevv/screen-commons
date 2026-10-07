/**
 * URL search-param validation for the library routes. Hand-rolled on purpose: even `zod/mini`
 * costs ~25 KB gzip in the client bundle, more than the whole Discover route. Invalid values are
 * dropped rather than erroring, so a stale or hand-edited URL still renders the closest valid page.
 * (Server inputs are still validated with the core zod schemas.)
 */
import {
  CATEGORY_SLUGS,
  ELEMENT_SLUGS,
  FLOW_TYPE_SLUGS,
  PATTERN_SLUGS,
  PLATFORM_SLUGS,
  type CategorySlug,
  type ElementSlug,
  type FlowTypeSlug,
  type PatternSlug,
  type Platform,
} from "@open-ui/core/taxonomy";

type Raw = Record<string, unknown>;

/** Value if it's one of `values`, else undefined. Reusable for any route's `validateSearch`. */
export const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): T | undefined =>
    typeof value === "string" && (values as readonly string[]).includes(value)
      ? (value as T)
      : undefined;

/** Non-empty string up to `max` chars (numbers are accepted: `?q=2026` parses as a number). */
export const text =
  (max: number) =>
  (value: unknown): string | undefined => {
    const string = typeof value === "number" ? String(value) : value;
    return typeof string === "string" && string.length > 0 && string.length <= max
      ? string
      : undefined;
  };

/** Drop undefined keys so links don't serialise empty params. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

const id = text(80);

export const SORTS = ["latest", "popular"] as const;
export type Sort = (typeof SORTS)[number];
const sort = oneOf(SORTS);
const category = oneOf<CategorySlug>(CATEGORY_SLUGS);
const pattern = oneOf<PatternSlug>(PATTERN_SLUGS);
const element = oneOf<ElementSlug>(ELEMENT_SLUGS);
const flowType = oneOf<FlowTypeSlug>(FLOW_TYPE_SLUGS);
const platform = oneOf<Platform>(PLATFORM_SLUGS);

/** Overlays that can open on top of any library page: `?screen=…`, `?flow=…`. */
export interface OverlaySearch {
  screen?: string;
  flow?: string;
}
export const validateOverlaySearch = (raw: Raw): OverlaySearch =>
  compact({ screen: id(raw.screen), flow: id(raw.flow) });

export const BROWSE_TABS = ["apps", "screens", "elements", "flows"] as const;
export type BrowseTab = (typeof BROWSE_TABS)[number];

export interface BrowseSearch {
  tab?: BrowseTab;
  category?: CategorySlug;
  pattern?: PatternSlug;
  element?: ElementSlug;
  flowType?: FlowTypeSlug;
  sort?: Sort;
}
export const validateBrowseSearch = (raw: Raw): BrowseSearch =>
  compact({
    tab: oneOf(BROWSE_TABS)(raw.tab),
    category: category(raw.category),
    pattern: pattern(raw.pattern),
    element: element(raw.element),
    flowType: flowType(raw.flowType),
    sort: sort(raw.sort),
  });

export const APP_TABS = ["screens", "elements", "flows"] as const;
export type AppTab = (typeof APP_TABS)[number];

export interface AppSearch {
  tab?: AppTab;
  version?: string;
  pattern?: PatternSlug;
  element?: ElementSlug;
  sort?: Sort;
}
export const validateAppSearch = (raw: Raw): AppSearch =>
  compact({
    tab: oneOf(APP_TABS)(raw.tab),
    version: text(40)(raw.version),
    pattern: pattern(raw.pattern),
    element: element(raw.element),
    sort: sort(raw.sort),
  });

export interface SearchPageSearch {
  q?: string;
  platform?: Platform;
}
export const validateSearchPage = (raw: Raw): SearchPageSearch =>
  compact({ q: text(200)(raw.q), platform: platform(raw.platform) });
