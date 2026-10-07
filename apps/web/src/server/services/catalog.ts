import {
  CATEGORIES,
  ELEMENTS,
  FLOW_TYPES,
  PATTERNS,
  TAXONOMY,
  listAppsQuerySchema,
  listFlowsQuerySchema,
  listScreensQuerySchema,
  searchQuerySchema,
  type AppDetail,
  type AppSummary,
  type FlowDetail,
  type FlowSummary,
  type Page,
  type Screen,
  type ScreenDetail,
  type SearchResult,
  type Taxonomy,
} from "@open-ui/core";
import {
  app,
  flow,
  flowStep,
  ftsQuery,
  inJsonArray,
  jsonArrayContains,
  screen,
  type ScreenRow,
} from "@open-ui/db";
import { and, asc, desc, eq, gt, lt, or, sql, type SQL } from "drizzle-orm";
import { alias, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import { getDb } from "../env";
import { notFound, parseInput } from "../errors";
import {
  SAVE_WEIGHT,
  afterCursor,
  appSummaries,
  encodeCursor,
  flowSummaries,
  orderByIds,
  orderByKeyset,
  screensToApi,
  toPage,
  visibleSql,
  type Keyset,
  type Viewer,
} from "./shared";

type FtsTable = "screen_fts" | "app_fts" | "flow_fts";

// ---------------------------------------------------------------------------------------------
// Full-text helpers
// ---------------------------------------------------------------------------------------------

interface FtsModes {
  /** Every term prefix-matched and AND-ed. */
  strict: string;
  /** Same terms OR-ed (null for single-term queries). */
  loose: string | null;
}

function ftsModes(text: string | undefined): FtsModes | null {
  const strict = text ? ftsQuery(text) : null;
  if (!strict) return null;
  return { strict, loose: strict.includes(" ") ? strict.split(" ").join(" OR ") : null };
}

/**
 * Run a query with the strict (AND) expression; if the viewer gets nothing under the very same
 * filters and visibility, rerun with the loose (OR) expression so long, descriptive queries still
 * return something. For later pages (`paged`), `probe` re-checks strict hits without the cursor
 * so every page keeps the mode chosen for page one.
 */
async function withFtsFallback<R>(
  modes: FtsModes | null,
  run: (match: string | null) => Promise<R[]>,
  probe: (match: string) => Promise<boolean>,
  paged: boolean,
): Promise<R[]> {
  if (!modes) return run(null);
  const rows = await run(modes.strict);
  if (rows.length > 0 || !modes.loose) return rows;
  if (paged && (await probe(modes.strict))) return rows;
  return run(modes.loose);
}

function ftsFilter(idColumn: SQL | AnySQLiteColumn, table: FtsTable, match: string): SQL {
  const idName = { screen_fts: "screen_id", app_fts: "app_id", flow_fts: "flow_id" }[table];
  return sql`${idColumn} IN (SELECT ${sql.raw(idName)} FROM ${sql.raw(table)} WHERE ${sql.raw(table)} MATCH ${match})`;
}

function appFilter(
  column: typeof screen.appId | typeof flow.appId,
  slugOrId?: string,
  platform?: string,
) {
  const parts: SQL[] = [];
  if (slugOrId) {
    parts.push(
      platform
        ? sql`${column} IN (SELECT id FROM app WHERE (slug = ${slugOrId} OR id = ${slugOrId}) AND platform = ${platform})`
        : sql`${column} IN (SELECT id FROM app WHERE slug = ${slugOrId} OR id = ${slugOrId})`,
    );
  } else if (platform) {
    parts.push(sql`${column} IN (SELECT id FROM app WHERE platform = ${platform})`);
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------------------------

export function getTaxonomy(): Taxonomy {
  return TAXONOMY;
}

/** Taxonomy terms whose label (or slug) matches the query. */
export function matchTerms(q: string): SearchResult["terms"] {
  const needle = q.toLowerCase().trim().replace(/\s+/gu, " ");
  if (!needle) return [];
  const groups = [
    ["pattern", PATTERNS],
    ["element", ELEMENTS],
    ["flowType", FLOW_TYPES],
    ["category", CATEGORIES],
  ] as const;
  const terms: SearchResult["terms"] = [];
  for (const [kind, list] of groups) {
    for (const term of list) {
      const label = term.label.toLowerCase();
      const slug = term.slug.replace(/-/gu, " ");
      const matches =
        label === needle ||
        slug === needle ||
        new RegExp(`\\b${escapeRegExp(label)}\\b`, "u").test(needle) ||
        new RegExp(`\\b${escapeRegExp(slug)}\\b`, "u").test(needle) ||
        (needle.length >= 3 && (label.startsWith(needle) || slug.startsWith(needle)));
      if (matches) terms.push({ kind, slug: term.slug, label: term.label });
    }
  }
  return terms.slice(0, 10);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// ---------------------------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------------------------

const appScore = sql<number>`(${app.saveCount} * ${sql.raw(String(SAVE_WEIGHT))} + ${app.viewCount} + coalesce((SELECT sum(s.save_count * ${sql.raw(String(SAVE_WEIGHT))} + s.view_count) FROM screen s WHERE s.app_id = ${app.id} AND s.status = 'published'), 0))`;

export async function listApps(viewer: Viewer, input: unknown = {}): Promise<Page<AppSummary>> {
  const query = parseInput(listAppsQuerySchema, input);
  const keyset: Keyset =
    query.sort === "popular"
      ? { sort: "popular", key: appScore, id: app.id }
      : { sort: "latest", key: app.updatedAt, id: app.id };
  const conditions: (SQL | undefined)[] = [
    visibleSql(app, viewer, "list"),
    query.platform ? eq(app.platform, query.platform) : undefined,
    query.category ? eq(app.category, query.category) : undefined,
  ];
  const cursor = afterCursor(keyset, query.cursor);
  const select = async (match: string | null, paged: boolean, limit: number) =>
    getDb()
      .select({ row: app, score: appScore })
      .from(app)
      .where(
        and(
          ...conditions,
          paged ? cursor : undefined,
          match ? ftsFilter(app.id, "app_fts", match) : undefined,
        ),
      )
      .orderBy(...orderByKeyset(keyset))
      .limit(limit);
  const rows = await withFtsFallback(
    ftsModes(query.q),
    (match) => select(match, true, query.limit + 1),
    async (match) => (await select(match, false, 1)).length > 0,
    Boolean(query.cursor),
  );
  const page = toPage(rows, query.limit, ({ row, score }) =>
    encodeCursor(keyset.sort, keyset.sort === "popular" ? score : row.updatedAt.getTime(), row.id),
  );
  return {
    items: await appSummaries(
      viewer,
      page.rows.map(({ row }) => row),
    ),
    nextCursor: page.nextCursor,
  };
}

/** One app by slug (or id). Slugs are unique per platform; `web` wins when ambiguous. */
export async function getApp(
  viewer: Viewer,
  slugOrId: string,
  platform?: string,
): Promise<AppDetail> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(app)
    .where(
      and(
        or(eq(app.slug, slugOrId), eq(app.id, slugOrId)),
        platform ? eq(app.platform, platform) : undefined,
        visibleSql(app, viewer, "detail"),
      ),
    )
    .orderBy(sql`${app.platform} = 'web' DESC`)
    .limit(1);
  if (!row) throw notFound("App");

  const visible = visibleSql(screen, viewer, "list");
  const [[summary], versions, patterns, elements] = await Promise.all([
    appSummaries(viewer, [row]),
    db
      .select({ version: screen.version })
      .from(screen)
      .where(and(eq(screen.appId, row.id), visible, sql`${screen.version} IS NOT NULL`))
      .groupBy(screen.version)
      .orderBy(sql`max(${screen.capturedAt}) DESC`),
    db.all<{ slug: string; count: number }>(
      sql`SELECT j.value AS slug, count(*) AS count FROM screen, json_each(screen.patterns) j WHERE ${screen.appId} = ${row.id} AND ${visible} GROUP BY j.value ORDER BY count DESC, slug`,
    ),
    db.all<{ slug: string; count: number }>(
      sql`SELECT j.value AS slug, count(*) AS count FROM screen, json_each(screen.elements) j WHERE ${screen.appId} = ${row.id} AND ${visible} GROUP BY j.value ORDER BY count DESC, slug`,
    ),
  ]);
  await db
    .update(app)
    .set({ viewCount: sql`${app.viewCount} + 1`, updatedAt: row.updatedAt })
    .where(eq(app.id, row.id));

  return {
    ...summary!,
    description: row.description,
    versions: versions.flatMap(({ version }) => (version ? [version] : [])),
    patterns: patterns.map(({ slug, count }) => ({ slug, count: Number(count) })),
    elements: elements.map(({ slug, count }) => ({ slug, count: Number(count) })),
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------------------------

const screenScore = sql<number>`(${screen.saveCount} * ${sql.raw(String(SAVE_WEIGHT))} + ${screen.viewCount})`;

export async function listScreens(viewer: Viewer, input: unknown = {}): Promise<Page<Screen>> {
  const query = parseInput(listScreensQuerySchema, input);
  const keyset: Keyset =
    query.sort === "popular"
      ? { sort: "popular", key: screenScore, id: screen.id }
      : { sort: "latest", key: screen.createdAt, id: screen.id };
  const conditions: (SQL | undefined)[] = [
    visibleSql(screen, viewer, "list"),
    ...appFilter(screen.appId, query.app, query.platform),
    query.pattern ? jsonArrayContains(screen.patterns, query.pattern) : undefined,
    query.element ? jsonArrayContains(screen.elements, query.element) : undefined,
    query.version ? eq(screen.version, query.version) : undefined,
  ];
  const cursor = afterCursor(keyset, query.cursor);
  const select = async (match: string | null, paged: boolean, limit: number) =>
    getDb()
      .select({ row: screen, score: screenScore })
      .from(screen)
      .where(
        and(
          ...conditions,
          paged ? cursor : undefined,
          match ? ftsFilter(screen.id, "screen_fts", match) : undefined,
        ),
      )
      .orderBy(...orderByKeyset(keyset))
      .limit(limit);
  const rows = await withFtsFallback(
    ftsModes(query.q),
    (match) => select(match, true, query.limit + 1),
    async (match) => (await select(match, false, 1)).length > 0,
    Boolean(query.cursor),
  );
  const page = toPage(rows, query.limit, ({ row, score }) =>
    encodeCursor(keyset.sort, keyset.sort === "popular" ? score : row.createdAt.getTime(), row.id),
  );
  return {
    items: await screensToApi(
      viewer,
      page.rows.map(({ row }) => row),
    ),
    nextCursor: page.nextCursor,
  };
}

/** Fetch a visible screen row or throw not_found. */
export async function getScreenRow(viewer: Viewer, id: string): Promise<ScreenRow> {
  const [row] = await getDb()
    .select()
    .from(screen)
    .where(and(eq(screen.id, id), visibleSql(screen, viewer, "detail")))
    .limit(1);
  if (!row) throw notFound("Screen");
  return row;
}

export async function getScreen(viewer: Viewer, id: string): Promise<ScreenDetail> {
  const db = getDb();
  const row = await getScreenRow(viewer, id);
  const sameApp = and(eq(screen.appId, row.appId), visibleSql(screen, viewer, "list"));
  const created = row.createdAt;
  const [[apiScreen], [previous], [next], flows] = await Promise.all([
    screensToApi(viewer, [row]),
    // Neighbours in the app grid order (newest first): previous is newer, next is older.
    db
      .select({ id: screen.id })
      .from(screen)
      .where(
        and(
          sameApp,
          or(
            gt(screen.createdAt, created),
            and(eq(screen.createdAt, created), gt(screen.id, row.id)),
          ),
        ),
      )
      .orderBy(asc(screen.createdAt), asc(screen.id))
      .limit(1),
    db
      .select({ id: screen.id })
      .from(screen)
      .where(
        and(
          sameApp,
          or(
            lt(screen.createdAt, created),
            and(eq(screen.createdAt, created), lt(screen.id, row.id)),
          ),
        ),
      )
      .orderBy(desc(screen.createdAt), desc(screen.id))
      .limit(1),
    db
      .select({ id: flow.id, name: flow.name, position: flowStep.position })
      .from(flowStep)
      .innerJoin(flow, eq(flow.id, flowStep.flowId))
      .where(and(eq(flowStep.screenId, row.id), visibleSql(flow, viewer, "list")))
      .orderBy(desc(flow.createdAt)),
  ]);
  await db
    .update(screen)
    .set({ viewCount: sql`${screen.viewCount} + 1`, updatedAt: row.updatedAt })
    .where(eq(screen.id, row.id));
  if (!apiScreen) throw notFound("Screen");
  return {
    ...apiScreen,
    previousId: previous?.id ?? null,
    nextId: next?.id ?? null,
    flows,
  };
}

// ---------------------------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------------------------

export async function listFlows(viewer: Viewer, input: unknown = {}): Promise<Page<FlowSummary>> {
  const query = parseInput(listFlowsQuerySchema, input);
  const keyset: Keyset = { sort: "latest", key: flow.createdAt, id: flow.id };
  const conditions: (SQL | undefined)[] = [
    visibleSql(flow, viewer, "list"),
    ...appFilter(flow.appId, query.app, query.platform),
    query.type ? eq(flow.type, query.type) : undefined,
  ];
  const cursor = afterCursor(keyset, query.cursor);
  const select = async (match: string | null, paged: boolean, limit: number) =>
    getDb()
      .select()
      .from(flow)
      .where(
        and(
          ...conditions,
          paged ? cursor : undefined,
          match ? ftsFilter(flow.id, "flow_fts", match) : undefined,
        ),
      )
      .orderBy(...orderByKeyset(keyset))
      .limit(limit);
  const rows = await withFtsFallback(
    ftsModes(query.q),
    (match) => select(match, true, query.limit + 1),
    async (match) => (await select(match, false, 1)).length > 0,
    Boolean(query.cursor),
  );
  const page = toPage(rows, query.limit, (row) =>
    encodeCursor("latest", row.createdAt.getTime(), row.id),
  );
  return { items: await flowSummaries(viewer, page.rows), nextCursor: page.nextCursor };
}

export async function getFlow(
  viewer: Viewer,
  id: string,
  options: { countView?: boolean } = {},
): Promise<FlowDetail> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(flow)
    .where(and(eq(flow.id, id), visibleSql(flow, viewer, "detail")))
    .limit(1);
  if (!row) throw notFound("Flow");
  const [[summary], steps] = await Promise.all([
    flowSummaries(viewer, [row]),
    db
      .select({ position: flowStep.position, label: flowStep.label, screen })
      .from(flowStep)
      .innerJoin(screen, eq(screen.id, flowStep.screenId))
      .where(and(eq(flowStep.flowId, row.id), visibleSql(screen, viewer, "detail")))
      .orderBy(asc(flowStep.position)),
  ]);
  if (options.countView !== false) {
    await db
      .update(flow)
      .set({ viewCount: sql`${flow.viewCount} + 1`, updatedAt: row.updatedAt })
      .where(eq(flow.id, row.id));
  }
  if (!summary) throw notFound("Flow");
  const screens = await screensToApi(
    viewer,
    steps.map((step) => step.screen),
  );
  const byId = new Map(screens.map((item) => [item.id, item]));
  return {
    ...summary,
    steps: steps.flatMap((step) => {
      const item = byId.get(step.screen.id);
      return item ? [{ position: step.position, label: step.label, screen: item }] : [];
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Search (relevance ranked, grouped)
// ---------------------------------------------------------------------------------------------

export async function search(viewer: Viewer, input: unknown): Promise<SearchResult> {
  const { q, platform, limit } = parseInput(searchQuerySchema, input);
  const db = getDb();
  const terms = matchTerms(q);
  const modes = ftsModes(q);

  const a = alias(app, "a");
  const s = alias(screen, "s");
  const f = alias(flow, "f");
  const onPlatform = (column: SQL) =>
    platform ? sql`AND ${column} IN (SELECT id FROM app WHERE platform = ${platform})` : sql``;

  // Each group falls back to OR on its own, judged by what this viewer can actually see.
  const rankedIds = (statement: (match: string) => SQL) =>
    withFtsFallback(
      modes,
      async (match) =>
        match ? (await db.all<{ id: string }>(statement(match))).map((row) => row.id) : [],
      async () => false,
      false,
    );

  const [appIds, screenIdsRanked, flowIdsRanked] = await Promise.all([
    rankedIds(
      (match) =>
        sql`SELECT a.id AS id FROM app_fts JOIN app a ON a.id = app_fts.app_id WHERE app_fts MATCH ${match} AND ${visibleSql(a, viewer, "list")} ${platform ? sql`AND a.platform = ${platform}` : sql``} ORDER BY app_fts.rank LIMIT ${limit}`,
    ),
    rankedIds(
      (match) =>
        sql`SELECT s.id AS id FROM screen_fts JOIN screen s ON s.id = screen_fts.screen_id WHERE screen_fts MATCH ${match} AND ${visibleSql(s, viewer, "list")} ${onPlatform(sql`s.app_id`)} ORDER BY screen_fts.rank LIMIT ${limit}`,
    ),
    rankedIds(
      (match) =>
        sql`SELECT f.id AS id FROM flow_fts JOIN flow f ON f.id = flow_fts.flow_id WHERE flow_fts MATCH ${match} AND ${visibleSql(f, viewer, "list")} ${onPlatform(sql`f.app_id`)} ORDER BY flow_fts.rank LIMIT ${limit}`,
    ),
  ]);

  // Top up with taxonomy matches (e.g. "call to action" → element `cta`).
  const patternSlugs = terms.filter((term) => term.kind === "pattern").map((term) => term.slug);
  const elementSlugs = terms.filter((term) => term.kind === "element").map((term) => term.slug);
  const flowTypes = terms.filter((term) => term.kind === "flowType").map((term) => term.slug);
  const screenIds = [...screenIdsRanked];
  if (screenIds.length < limit && patternSlugs.length + elementSlugs.length > 0) {
    const termConditions = [
      ...patternSlugs.map((slug) => jsonArrayContains(screen.patterns, slug)),
      ...elementSlugs.map((slug) => jsonArrayContains(screen.elements, slug)),
    ];
    const extra = await db
      .select({ id: screen.id })
      .from(screen)
      .where(
        and(
          visibleSql(screen, viewer, "list"),
          ...appFilter(screen.appId, undefined, platform),
          or(...termConditions),
        ),
      )
      .orderBy(desc(screen.createdAt))
      .limit(limit);
    for (const { id } of extra)
      if (!screenIds.includes(id) && screenIds.length < limit) screenIds.push(id);
  }
  const flowIds = [...flowIdsRanked];
  if (flowIds.length < limit && flowTypes.length > 0) {
    const extra = await db
      .select({ id: flow.id })
      .from(flow)
      .where(
        and(
          visibleSql(flow, viewer, "list"),
          ...appFilter(flow.appId, undefined, platform),
          inJsonArray(flow.type, flowTypes),
        ),
      )
      .orderBy(desc(flow.createdAt))
      .limit(limit);
    for (const { id } of extra)
      if (!flowIds.includes(id) && flowIds.length < limit) flowIds.push(id);
  }

  const [appRows, screenRows, flowRows] = await Promise.all([
    appIds.length ? db.select().from(app).where(inJsonArray(app.id, appIds)) : [],
    screenIds.length ? db.select().from(screen).where(inJsonArray(screen.id, screenIds)) : [],
    flowIds.length ? db.select().from(flow).where(inJsonArray(flow.id, flowIds)) : [],
  ]);
  const [apps, screens, flows] = await Promise.all([
    appSummaries(viewer, orderByIds(appRows, appIds)),
    screensToApi(viewer, orderByIds(screenRows, screenIds)),
    flowSummaries(viewer, orderByIds(flowRows, flowIds)),
  ]);
  return { apps, screens, flows, terms };
}
