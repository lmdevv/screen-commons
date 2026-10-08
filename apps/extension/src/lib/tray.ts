import type {
  FlowTypeSlug,
  PatternSlug,
  Platform,
  CategorySlug,
} from "@screen-commons/core/taxonomy";

import type { ShotKind } from "./geometry";

export type CaptureMode = "visible" | "full" | "element";

/** One captured shot as stored in IndexedDB. */
export interface Shot {
  id: string;
  /** Sort key; lower first. */
  order: number;
  mode: CaptureMode;
  kind: ShotKind;
  url: string;
  pageTitle: string;
  /** Editable screen title. */
  title: string;
  patterns: PatternSlug[];
  width: number;
  height: number;
  bytes: number;
  imageType: "image/png" | "image/jpeg" | "image/webp";
  image: Blob;
  thumbnail: Blob;
  thumbnailWidth: number;
  thumbnailHeight: number;
  dominantColor: string | null;
  /** Visible text, whitespace-collapsed, ≤ 20k chars. */
  text: string;
  faviconUrl: string | null;
  siteName: string | null;
  truncated: boolean;
  capturedAt: string;
}

/** Shot without its blobs, safe to put in chrome.storage / runtime messages. */
export type ShotSummary = Omit<Shot, "image" | "thumbnail">;

export interface TrayDraft {
  app: {
    name: string;
    websiteUrl: string;
    platform: Platform;
    category: CategorySlug | "";
  };
  flow: {
    enabled: boolean;
    name: string;
    type: FlowTypeSlug | "";
  };
  /** True once the user edited app details; stops auto-prefill from later captures. */
  touched: boolean;
}

export const EMPTY_DRAFT: TrayDraft = {
  app: { name: "", websiteUrl: "", platform: "web", category: "" },
  flow: { enabled: false, name: "", type: "" },
  touched: false,
};

/** Move the item at `from` to `to`, returning a new array. Out-of-range indexes are clamped. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

/** Reassign contiguous `order` values matching array position. Returns only changed items. */
export function reindex<T extends { id: string; order: number }>(items: readonly T[]): T[] {
  const changed: T[] = [];
  items.forEach((item, index) => {
    if (item.order !== index) changed.push({ ...item, order: index });
  });
  return changed;
}

export function sortShots<T extends { order: number; capturedAt: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => a.order - b.order || a.capturedAt.localeCompare(b.capturedAt));
}

/** `order` for a new shot appended after `items`. */
export function nextOrder(items: readonly { order: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.order + 1), 0);
}

/** Collapse whitespace and cap length for the `text` field. */
export function normalizeText(text: string | null | undefined, max = 20_000): string {
  if (!text) return "";
  const collapsed = text.replace(/\s+/gu, " ").trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return space > max - 200 ? cut.slice(0, space) : cut;
}
