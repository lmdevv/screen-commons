/**
 * Read helpers for the library UI that have no REST counterpart: facet counts for Discover chips,
 * "which of my collections hold this item" for the collection picker, and screenshot-text
 * snippets for search results. Same visibility rules as the catalog (`list` mode).
 */
import { platformSchema } from "@screen-commons/core";
import { collection, collectionItem, ftsQuery, inJsonArray, screen } from "@screen-commons/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../env";
import { parseInput } from "../errors";
import type { Principal } from "../principal";
import { saveKindSchema } from "./collections";
import { mediaUrl, visibleSql, type Viewer } from "./shared";

export interface FacetCount {
  slug: string;
  count: number;
}

export interface Facets {
  totals: { apps: number; screens: number; flows: number };
  categories: FacetCount[];
  /** Patterns carry the thumbnail of their most popular screen (palette / empty states). */
  patterns: (FacetCount & { thumbUrl: string | null })[];
  elements: FacetCount[];
  flowTypes: FacetCount[];
}

const facetsInputSchema = z.object({ platform: platformSchema.optional() });

/** Counts per taxonomy term (and totals) for one platform, as the viewer can see them. */
export async function getFacets(viewer: Viewer, input: unknown = {}): Promise<Facets> {
  const { platform } = parseInput(facetsInputSchema, input);
  const db = getDb();
  const visibleScreen = visibleSql(screen, viewer, "list");
  const onPlatform = (column: string) =>
    platform
      ? sql`AND ${sql.raw(column)} IN (SELECT id FROM app WHERE platform = ${platform})`
      : sql``;
  const appVisible = viewer
    ? sql`(a.status = 'published' OR (a.status = 'pending' AND a.contributor_id = ${viewer.user.id}))`
    : sql`a.status = 'published'`;
  const flowVisible = viewer
    ? sql`(f.status = 'published' OR (f.status = 'pending' AND f.contributor_id = ${viewer.user.id}))`
    : sql`f.status = 'published'`;

  const [totals, categories, patterns, elements, flowTypes] = await Promise.all([
    db.all<{ apps: number; screens: number; flows: number }>(sql`SELECT
      (SELECT count(*) FROM app a WHERE ${appVisible} ${platform ? sql`AND a.platform = ${platform}` : sql``}) AS apps,
      (SELECT count(*) FROM screen WHERE ${visibleScreen} ${onPlatform("screen.app_id")}) AS screens,
      (SELECT count(*) FROM flow f WHERE ${flowVisible} ${onPlatform("f.app_id")}) AS flows`),
    db.all<FacetCount>(
      sql`SELECT a.category AS slug, count(*) AS count FROM app a WHERE ${appVisible} AND a.category IS NOT NULL ${platform ? sql`AND a.platform = ${platform}` : sql``} GROUP BY a.category ORDER BY count DESC, slug`,
    ),
    db.all<
      FacetCount & { thumbKey: string | null }
    >(sql`SELECT slug, count, thumb_key AS thumbKey FROM (
        SELECT j.value AS slug, screen.thumb_key,
          count(*) OVER (PARTITION BY j.value) AS count,
          row_number() OVER (PARTITION BY j.value ORDER BY screen.save_count * 4 + screen.view_count DESC, screen.created_at DESC) AS rank
        FROM screen, json_each(screen.patterns) j
        WHERE ${visibleScreen} ${onPlatform("screen.app_id")}
      ) WHERE rank = 1 ORDER BY count DESC, slug`),
    db.all<FacetCount>(
      sql`SELECT j.value AS slug, count(*) AS count FROM screen, json_each(screen.elements) j WHERE ${visibleScreen} ${onPlatform("screen.app_id")} GROUP BY j.value ORDER BY count DESC, slug`,
    ),
    db.all<FacetCount>(
      sql`SELECT f.type AS slug, count(*) AS count FROM flow f WHERE ${flowVisible} AND f.type IS NOT NULL ${onPlatform("f.app_id")} GROUP BY f.type ORDER BY count DESC, slug`,
    ),
  ]);
  const num = (rows: FacetCount[]) =>
    rows.map(({ slug, count }) => ({ slug, count: Number(count) }));
  const total = totals[0] ?? { apps: 0, screens: 0, flows: 0 };
  return {
    totals: {
      apps: Number(total.apps),
      screens: Number(total.screens),
      flows: Number(total.flows),
    },
    categories: num(categories),
    patterns: patterns.map(({ slug, count, thumbKey }) => ({
      slug,
      count: Number(count),
      thumbUrl: mediaUrl(thumbKey),
    })),
    elements: num(elements),
    flowTypes: num(flowTypes),
  };
}

const savedInInputSchema = z.object({ kind: saveKindSchema, id: z.string().min(1).max(64) });

/** Ids of the signed-in user's collections that contain the item. */
export async function getSavedIn(principal: Principal, input: unknown): Promise<string[]> {
  const { kind, id } = parseInput(savedInInputSchema, input);
  const rows = await getDb()
    .select({ id: collectionItem.collectionId })
    .from(collectionItem)
    .innerJoin(collection, eq(collection.id, collectionItem.collectionId))
    .where(
      and(
        eq(collection.userId, principal.user.id),
        eq(collectionItem.kind, kind),
        eq(collectionItem.itemId, id),
      ),
    );
  return rows.map((row) => row.id);
}

const textMatchesInputSchema = z.object({
  q: z.string().trim().min(1).max(200),
  ids: z.array(z.string().min(1).max(64)).max(60),
});

/**
 * For the given screens, a short snippet of the visible screenshot text that matches `q`
 * (`[term]` marks the hit). Screens whose text doesn't match are omitted.
 */
export async function getScreenTextMatches(
  viewer: Viewer,
  input: unknown,
): Promise<Record<string, string>> {
  const { q, ids } = parseInput(textMatchesInputSchema, input);
  const match = ftsQuery(q);
  if (!match || ids.length === 0) return {};
  const rows = await getDb().all<{ id: string; snippet: string }>(
    sql`SELECT screen_fts.screen_id AS id, snippet(screen_fts, 7, '[', ']', '…', 10) AS snippet
      FROM screen_fts JOIN screen ON screen.id = screen_fts.screen_id
      WHERE screen_fts MATCH ${`text : (${match})`}
        AND ${inJsonArray(sql`screen_fts.screen_id`, ids)}
        AND ${visibleSql(screen, viewer, "list")}`,
  );
  return Object.fromEntries(
    rows.filter((row) => row.snippet.includes("[")).map((row) => [row.id, row.snippet]),
  );
}
