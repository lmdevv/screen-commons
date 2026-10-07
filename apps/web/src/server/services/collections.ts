import type { AppSummary, Collection, FlowSummary, Screen } from "@open-ui/core";
import {
  app,
  collection,
  collectionItem,
  flow,
  flowStep,
  inJsonArray,
  screen,
  type CollectionItemKind,
  type CollectionRow,
} from "@open-ui/db";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../env";
import { badRequest, notFound, parseInput } from "../errors";
import { newId } from "../ids";
import type { Principal } from "../principal";
import {
  appSummaries,
  flowSummaries,
  mediaUrl,
  orderByIds,
  screensToApi,
  visibleSql,
} from "./shared";

export const DEFAULT_COLLECTION_NAME = "Saved";

export const saveKindSchema = z.enum(["screen", "flow", "app"]);
export const saveInputSchema = z.object({
  kind: saveKindSchema,
  id: z.string().min(1).max(64),
  collectionId: z.string().min(1).max(64).optional(),
});
export const collectionNameSchema = z.object({ name: z.string().trim().min(1).max(60) });

const ITEM_TABLES = { screen, flow, app } as const;

/** The user's default "Saved" collection, created on first use. */
export async function ensureDefaultCollection(principal: Principal): Promise<CollectionRow> {
  const db = getDb();
  const find = () =>
    db
      .select()
      .from(collection)
      .where(and(eq(collection.userId, principal.user.id), eq(collection.isDefault, true)))
      .limit(1);
  const [existing] = await find();
  if (existing) return existing;
  const now = new Date();
  await db
    .insert(collection)
    .values({
      id: newId(),
      userId: principal.user.id,
      name: DEFAULT_COLLECTION_NAME,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const [created] = await find();
  return created!;
}

async function ownedCollection(principal: Principal, id: string): Promise<CollectionRow> {
  const [row] = await getDb()
    .select()
    .from(collection)
    .where(and(eq(collection.id, id), eq(collection.userId, principal.user.id)))
    .limit(1);
  if (!row) throw notFound("Collection");
  return row;
}

/** Collection cards: item counts + up to 3 preview thumbnails each. */
async function toCollections(rows: CollectionRow[]): Promise<Collection[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((row) => row.id);
  const ranked = db
    .select({
      collectionId: collectionItem.collectionId,
      kind: collectionItem.kind,
      itemId: collectionItem.itemId,
      rank: sql<number>`row_number() OVER (PARTITION BY ${collectionItem.collectionId} ORDER BY ${collectionItem.createdAt} DESC)`.as(
        "rank",
      ),
    })
    .from(collectionItem)
    .where(inJsonArray(collectionItem.collectionId, ids))
    .as("ranked");
  const [counts, recent] = await Promise.all([
    db
      .select({ collectionId: collectionItem.collectionId, total: count() })
      .from(collectionItem)
      .where(inJsonArray(collectionItem.collectionId, ids))
      .groupBy(collectionItem.collectionId),
    db
      .select()
      .from(ranked)
      .where(sql`${ranked.rank} <= 3`)
      .orderBy(asc(ranked.rank)),
  ]);

  const idsOf = (kind: CollectionItemKind) =>
    recent.filter((item) => item.kind === kind).map((item) => item.itemId);
  const [screenThumbs, flowThumbs, appThumbs] = await Promise.all([
    idsOf("screen").length
      ? db
          .select({ id: screen.id, thumbKey: screen.thumbKey })
          .from(screen)
          .where(inJsonArray(screen.id, idsOf("screen")))
      : [],
    idsOf("flow").length
      ? db
          .select({ id: flowStep.flowId, thumbKey: screen.thumbKey })
          .from(flowStep)
          .innerJoin(screen, eq(screen.id, flowStep.screenId))
          .where(and(inJsonArray(flowStep.flowId, idsOf("flow")), eq(flowStep.position, 0)))
      : [],
    idsOf("app").length
      ? db
          .select({ id: screen.appId, thumbKey: sql<string>`max(${screen.thumbKey})` })
          .from(screen)
          .where(and(inJsonArray(screen.appId, idsOf("app")), eq(screen.status, "published")))
          .groupBy(screen.appId)
      : [],
  ]);
  const thumbs = {
    screen: new Map(screenThumbs.map((row) => [row.id, row.thumbKey])),
    flow: new Map(flowThumbs.map((row) => [row.id, row.thumbKey])),
    app: new Map(appThumbs.map((row) => [row.id, row.thumbKey])),
  };
  const countBy = new Map(counts.map((row) => [row.collectionId, row.total]));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    itemCount: countBy.get(row.id) ?? 0,
    previews: recent
      .filter((item) => item.collectionId === row.id)
      .flatMap((item) => {
        const url = mediaUrl(thumbs[item.kind].get(item.itemId) ?? null);
        return url ? [{ thumbUrl: url }] : [];
      }),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listCollections(principal: Principal): Promise<{ items: Collection[] }> {
  await ensureDefaultCollection(principal);
  const rows = await getDb()
    .select()
    .from(collection)
    .where(eq(collection.userId, principal.user.id))
    .orderBy(desc(collection.isDefault), asc(collection.createdAt));
  return { items: await toCollections(rows) };
}

export async function getCollection(
  principal: Principal,
  id: string,
): Promise<{
  collection: Collection;
  screens: Screen[];
  flows: FlowSummary[];
  apps: AppSummary[];
}> {
  const row = await ownedCollection(principal, id);
  const db = getDb();
  const items = await db
    .select()
    .from(collectionItem)
    .where(eq(collectionItem.collectionId, row.id))
    .orderBy(desc(collectionItem.createdAt));
  const idsOf = (kind: CollectionItemKind) =>
    items.filter((item) => item.kind === kind).map((item) => item.itemId);
  const [screenRows, flowRows, appRows, [summary]] = await Promise.all([
    idsOf("screen").length
      ? db
          .select()
          .from(screen)
          .where(
            and(inJsonArray(screen.id, idsOf("screen")), visibleSql(screen, principal, "detail")),
          )
      : [],
    idsOf("flow").length
      ? db
          .select()
          .from(flow)
          .where(and(inJsonArray(flow.id, idsOf("flow")), visibleSql(flow, principal, "detail")))
      : [],
    idsOf("app").length
      ? db
          .select()
          .from(app)
          .where(and(inJsonArray(app.id, idsOf("app")), visibleSql(app, principal, "detail")))
      : [],
    toCollections([row]),
  ]);
  const [screens, flows, apps] = await Promise.all([
    screensToApi(principal, orderByIds(screenRows, idsOf("screen"))),
    flowSummaries(principal, orderByIds(flowRows, idsOf("flow"))),
    appSummaries(principal, orderByIds(appRows, idsOf("app"))),
  ]);
  return { collection: summary!, screens, flows, apps };
}

export async function createCollection(
  principal: Principal,
  input: unknown,
): Promise<{ collection: Collection }> {
  const { name } = parseInput(collectionNameSchema, input);
  await ensureDefaultCollection(principal);
  const now = new Date();
  const [row] = await getDb()
    .insert(collection)
    .values({
      id: newId(),
      userId: principal.user.id,
      name,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const [summary] = await toCollections([row!]);
  return { collection: summary! };
}

export async function renameCollection(
  principal: Principal,
  id: string,
  input: unknown,
): Promise<{ collection: Collection }> {
  const { name } = parseInput(collectionNameSchema, input);
  const row = await ownedCollection(principal, id);
  const [updated] = await getDb()
    .update(collection)
    .set({ name })
    .where(eq(collection.id, row.id))
    .returning();
  const [summary] = await toCollections([updated!]);
  return { collection: summary! };
}

export async function deleteCollection(principal: Principal, id: string): Promise<void> {
  const row = await ownedCollection(principal, id);
  if (row.isDefault) throw badRequest("The default collection can't be deleted");
  // save_count decrements happen in the collection_item delete trigger (fires on cascade too).
  await getDb().delete(collection).where(eq(collection.id, row.id));
}

async function assertItemVisible(principal: Principal, kind: CollectionItemKind, id: string) {
  const table = ITEM_TABLES[kind];
  const [row] = await getDb()
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), visibleSql(table, principal, "detail")))
    .limit(1);
  if (!row) throw notFound(kind === "app" ? "App" : kind === "flow" ? "Flow" : "Screen");
}

/** Save an item into a collection (the default "Saved" one when none is given). Idempotent. */
export async function save(principal: Principal, input: unknown): Promise<void> {
  const { kind, id, collectionId } = parseInput(saveInputSchema, input);
  await assertItemVisible(principal, kind, id);
  const target = collectionId
    ? await ownedCollection(principal, collectionId)
    : await ensureDefaultCollection(principal);
  // save_count is maintained by the collection_item insert trigger.
  await getDb()
    .insert(collectionItem)
    .values({ collectionId: target.id, kind, itemId: id, createdAt: new Date() })
    .onConflictDoNothing();
}

/** Remove an item from one collection, or from all of the user's collections when omitted. */
export async function unsave(principal: Principal, input: unknown): Promise<void> {
  const { kind, id, collectionId } = parseInput(saveInputSchema, input);
  const db = getDb();
  const owned = collectionId
    ? sql`${collectionItem.collectionId} = ${(await ownedCollection(principal, collectionId)).id}`
    : sql`${collectionItem.collectionId} IN (SELECT id FROM collection WHERE user_id = ${principal.user.id})`;
  await db
    .delete(collectionItem)
    .where(and(eq(collectionItem.kind, kind), eq(collectionItem.itemId, id), owned));
}
