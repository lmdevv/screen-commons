import {
  mediaPath,
  type AppRef,
  type AppSummary,
  type ElementSlug,
  type FlowSummary,
  type PatternSlug,
  type Screen,
} from "@open-ui/core";
import {
  app,
  collection,
  collectionItem,
  flow,
  flowStep,
  inJsonArray,
  screen,
  type AppRow,
  type CollectionItemKind,
  type FlowRow,
  type ScreenRow,
} from "@open-ui/db";
import { and, asc, count, desc, eq, lte, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import { getDb } from "../env";
import { badRequest } from "../errors";
import { base64UrlDecode, base64UrlEncode } from "../ids";
import { isAdmin, type Principal } from "../principal";

export type Viewer = Principal | null;

/** Popularity: a save is worth several views. */
export const SAVE_WEIGHT = 4;

// ---------------------------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------------------------

interface Moderated {
  status: AnySQLiteColumn;
  contributorId: AnySQLiteColumn;
}

/**
 * Who sees what:
 * - `detail` (fetching one item by id/slug): published, or the viewer contributed it, or admin.
 * - `list` (browse grids, search, counts): published, plus the viewer's own pending items.
 *   Admins see other people's pending items through the review queue, not in browse.
 */
export function visibleSql(table: Moderated, viewer: Viewer, mode: "list" | "detail"): SQL {
  if (mode === "detail" && isAdmin(viewer)) return sql`1 = 1`;
  if (!viewer) return sql`${table.status} = 'published'`;
  if (mode === "detail") {
    return sql`(${table.status} = 'published' OR ${table.contributorId} = ${viewer.user.id})`;
  }
  return sql`(${table.status} = 'published' OR (${table.status} = 'pending' AND ${table.contributorId} = ${viewer.user.id}))`;
}

// ---------------------------------------------------------------------------------------------
// Cursor pagination (opaque base64url of [sort, key, id])
// ---------------------------------------------------------------------------------------------

export interface Keyset {
  sort: string;
  key: SQL | AnySQLiteColumn;
  id: AnySQLiteColumn;
}

export function encodeCursor(sort: string, key: number, id: string): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify([sort, key, id])));
}

export function decodeCursor(cursor: string, sort: string): { key: number; id: string } {
  try {
    const binary = base64UrlDecode(cursor);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      Array.isArray(value) &&
      value[0] === sort &&
      typeof value[1] === "number" &&
      typeof value[2] === "string"
    ) {
      return { key: value[1], id: value[2] };
    }
  } catch {
    // fall through
  }
  throw badRequest("Invalid cursor");
}

/** WHERE fragment for "rows after the cursor" in (key DESC, id DESC) order. */
export function afterCursor(keyset: Keyset, cursor: string | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const { key, id } = decodeCursor(cursor, keyset.sort);
  return sql`(${keyset.key} < ${key} OR (${keyset.key} = ${key} AND ${keyset.id} < ${id}))`;
}

export function orderByKeyset(keyset: Keyset): SQL[] {
  return [sql`${keyset.key} DESC`, desc(keyset.id)];
}

/** Rows were fetched with `limit + 1`; trim and compute the next cursor. */
export function toPage<R>(
  rows: R[],
  limit: number,
  cursorOf: (row: R) => string,
): { rows: R[]; nextCursor: string | null } {
  if (rows.length <= limit) return { rows, nextCursor: null };
  const trimmed = rows.slice(0, limit);
  return { rows: trimmed, nextCursor: cursorOf(trimmed[trimmed.length - 1]!) };
}

// ---------------------------------------------------------------------------------------------
// Row → API mapping
// ---------------------------------------------------------------------------------------------

export const mediaUrl = (key: string | null): string | null => (key ? mediaPath(key) : null);

export function toAppRef(row: AppRow): AppRef {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    platform: row.platform as AppRef["platform"],
    logoUrl: mediaUrl(row.logoKey),
    accentColor: row.accentColor,
  };
}

export async function appsById(ids: string[]): Promise<Map<string, AppRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await getDb().select().from(app).where(inJsonArray(app.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Ids (of one kind) that are in any of the viewer's collections. */
export async function savedSet(
  viewer: Viewer,
  kind: CollectionItemKind,
  ids: string[],
): Promise<Set<string>> {
  if (!viewer || ids.length === 0) return new Set();
  const rows = await getDb()
    .selectDistinct({ itemId: collectionItem.itemId })
    .from(collectionItem)
    .innerJoin(collection, eq(collection.id, collectionItem.collectionId))
    .where(
      and(
        eq(collection.userId, viewer.user.id),
        eq(collectionItem.kind, kind),
        inJsonArray(collectionItem.itemId, ids),
      ),
    );
  return new Set(rows.map((row) => row.itemId));
}

export function toScreen(row: ScreenRow, appRow: AppRow, saved: boolean): Screen {
  return {
    id: row.id,
    app: toAppRef(appRow),
    title: row.title,
    imageUrl: mediaPath(row.imageKey),
    thumbUrl: mediaPath(row.thumbKey),
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    sourceUrl: row.sourceUrl,
    patterns: row.patterns as PatternSlug[],
    elements: row.elements as ElementSlug[],
    tags: row.tags,
    version: row.version,
    dominantColor: row.dominantColor,
    status: row.status,
    source: row.source,
    saved,
    capturedAt: row.capturedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function screensToApi(viewer: Viewer, rows: ScreenRow[]): Promise<Screen[]> {
  const ids = rows.map((row) => row.id);
  const [apps, saved] = await Promise.all([
    appsById(rows.map((row) => row.appId)),
    savedSet(viewer, "screen", ids),
  ]);
  return rows.flatMap((row) => {
    const appRow = apps.get(row.appId);
    return appRow ? [toScreen(row, appRow, saved.has(row.id))] : [];
  });
}

export async function appSummaries(viewer: Viewer, rows: AppRow[]): Promise<AppSummary[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((row) => row.id);
  const ranked = db
    .select({
      id: screen.id,
      appId: screen.appId,
      thumbKey: screen.thumbKey,
      width: screen.thumbWidth,
      height: screen.thumbHeight,
      rank: sql<number>`row_number() OVER (PARTITION BY ${screen.appId} ORDER BY ${screen.createdAt} DESC, ${screen.id} DESC)`.as(
        "rank",
      ),
    })
    .from(screen)
    .where(and(inJsonArray(screen.appId, ids), visibleSql(screen, viewer, "list")))
    .as("ranked");

  const [screenCounts, flowCounts, previews] = await Promise.all([
    db
      .select({ appId: screen.appId, total: count() })
      .from(screen)
      .where(and(inJsonArray(screen.appId, ids), visibleSql(screen, viewer, "list")))
      .groupBy(screen.appId),
    db
      .select({ appId: flow.appId, total: count() })
      .from(flow)
      .where(and(inJsonArray(flow.appId, ids), visibleSql(flow, viewer, "list")))
      .groupBy(flow.appId),
    db.select().from(ranked).where(lte(ranked.rank, 3)).orderBy(asc(ranked.rank)),
  ]);
  const screensBy = new Map(screenCounts.map((row) => [row.appId, row.total]));
  const flowsBy = new Map(flowCounts.map((row) => [row.appId, row.total]));

  return rows.map((row) => ({
    ...toAppRef(row),
    tagline: row.tagline,
    category: row.category as AppSummary["category"],
    websiteUrl: row.websiteUrl,
    screenCount: screensBy.get(row.id) ?? 0,
    flowCount: flowsBy.get(row.id) ?? 0,
    previews: previews
      .filter((preview) => preview.appId === row.id)
      .map((preview) => ({
        id: preview.id,
        thumbUrl: mediaPath(preview.thumbKey),
        width: preview.width,
        height: preview.height,
      })),
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function flowSummaries(viewer: Viewer, rows: FlowRow[]): Promise<FlowSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  // Only steps whose screen the viewer may see (same rule as getScreen / getFlow); stepCount and
  // previews are computed from those, so hidden screens never leak through a flow.
  const visibleSteps = getDb()
    .select({
      flowId: flowStep.flowId,
      id: screen.id,
      thumbKey: screen.thumbKey,
      width: screen.thumbWidth,
      height: screen.thumbHeight,
      rank: sql<number>`row_number() OVER (PARTITION BY ${flowStep.flowId} ORDER BY ${flowStep.position})`.as(
        "rank",
      ),
      total: sql<number>`count(*) OVER (PARTITION BY ${flowStep.flowId})`.as("total"),
    })
    .from(flowStep)
    .innerJoin(screen, eq(screen.id, flowStep.screenId))
    .where(and(inJsonArray(flowStep.flowId, ids), visibleSql(screen, viewer, "detail")))
    .as("visible_steps");
  const [apps, saved, previews] = await Promise.all([
    appsById(rows.map((row) => row.appId)),
    savedSet(viewer, "flow", ids),
    getDb()
      .select()
      .from(visibleSteps)
      .where(lte(visibleSteps.rank, 3))
      .orderBy(asc(visibleSteps.rank)),
  ]);
  return rows.flatMap((row) => {
    const appRow = apps.get(row.appId);
    if (!appRow) return [];
    return [
      {
        id: row.id,
        app: toAppRef(appRow),
        name: row.name,
        type: row.type as FlowSummary["type"],
        description: row.description,
        stepCount: Number(previews.find((preview) => preview.flowId === row.id)?.total ?? 0),
        previews: previews
          .filter((preview) => preview.flowId === row.id)
          .map((preview) => ({
            id: preview.id,
            thumbUrl: mediaPath(preview.thumbKey),
            width: preview.width,
            height: preview.height,
          })),
        status: row.status,
        saved: saved.has(row.id),
        createdAt: row.createdAt.toISOString(),
      },
    ];
  });
}

/** Keep `rows` in the order of `ids` (used after relevance-ranked id lookups). */
export function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
