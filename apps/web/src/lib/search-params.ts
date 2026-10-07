/**
 * URL search-param schemas for the library routes. `zod/mini` keeps validation out of the
 * critical bundle (full zod is ~15 KB gzip). Invalid values are dropped instead of erroring, so a
 * stale or hand-edited URL still renders the closest valid page.
 */
import {
  CATEGORY_SLUGS,
  ELEMENT_SLUGS,
  FLOW_TYPE_SLUGS,
  PATTERN_SLUGS,
  PLATFORM_SLUGS,
} from "@open-ui/core/taxonomy";
import * as z from "zod/mini";

const optional = <T extends z.core.SomeType>(schema: T) => z.catch(z.optional(schema), undefined);
const id = z.string().check(z.minLength(1), z.maxLength(80));

export const SORTS = ["latest", "popular"] as const;
export type Sort = (typeof SORTS)[number];

/** Overlays that can open on top of any library page: `?screen=…`, `?flow=…`. */
export const overlaySearchSchema = z.object({
  screen: optional(id),
  flow: optional(id),
});
export type OverlaySearch = z.infer<typeof overlaySearchSchema>;

export const BROWSE_TABS = ["apps", "screens", "elements", "flows"] as const;
export type BrowseTab = (typeof BROWSE_TABS)[number];

export const browseSearchSchema = z.object({
  tab: optional(z.enum(BROWSE_TABS)),
  category: optional(z.enum(CATEGORY_SLUGS)),
  pattern: optional(z.enum(PATTERN_SLUGS)),
  element: optional(z.enum(ELEMENT_SLUGS)),
  flowType: optional(z.enum(FLOW_TYPE_SLUGS)),
  sort: optional(z.enum(SORTS)),
});
export type BrowseSearch = z.infer<typeof browseSearchSchema>;

export const APP_TABS = ["screens", "elements", "flows"] as const;
export type AppTab = (typeof APP_TABS)[number];

export const appSearchSchema = z.object({
  tab: optional(z.enum(APP_TABS)),
  version: optional(z.string().check(z.maxLength(40))),
  pattern: optional(z.enum(PATTERN_SLUGS)),
  element: optional(z.enum(ELEMENT_SLUGS)),
  sort: optional(z.enum(SORTS)),
});
export type AppSearch = z.infer<typeof appSearchSchema>;

export const searchPageSchema = z.object({
  q: optional(z.string().check(z.maxLength(200))),
  platform: optional(z.enum(PLATFORM_SLUGS)),
});
export type SearchPageSearch = z.infer<typeof searchPageSchema>;
