import {
  listContributionsQuerySchema,
  updateScreenInputSchema,
  updateFlowInputSchema,
  type Contribution,
  type Page,
} from "@screen-commons/core";
import {
  screen,
  flow,
  flowStep,
  collectionItem,
  contributionEdit,
  inJsonArray,
  type FlowRow,
  type ScreenRow,
} from "@screen-commons/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { getDb } from "../env";
import { badRequest, forbidden, notFound, parseInput } from "../errors";
import { isAdmin, type Principal } from "../principal";
import { getScreen, getFlow } from "./catalog";
import { dropScreenFromFlows } from "./review";
import {
  decodeCursor,
  encodeCursor,
  flowSummaries,
  screensToApi,
  toPage,
  visibleSql,
} from "./shared";

async function requireChangeable(
  principal: Principal,
  kind: "screen" | "flow",
  id: string,
  change: "update" | "delete",
) {
  kind = parseInput(z.enum(["screen", "flow"]), kind);
  const table = kind === "screen" ? screen : flow;
  const [row] = await getDb()
    .select()
    .from(table)
    .where(and(eq(table.id, id), visibleSql(table, principal, "detail")))
    .limit(1);
  if (!row) throw notFound(kind === "screen" ? "Screen" : "Flow");
  if (row.contributorId === principal.user.id) return row;
  if (change === "update" && isAdmin(principal)) return row;
  throw forbidden(
    change === "update"
      ? "Only the contributor or an admin can edit this contribution"
      : "Only the contributor can delete this contribution",
  );
}

/** The audit row for an edit to someone else's contribution, which only an admin can make. */
function editRecord(
  principal: Principal,
  kind: "screen" | "flow",
  row: { id: string; contributorId: string | null },
): BatchItem<"sqlite">[] {
  if (row.contributorId === principal.user.id) return [];
  return [
    getDb().insert(contributionEdit).values({ kind, itemId: row.id, updatedBy: principal.user.id }),
  ];
}

export async function updateScreen(principal: Principal, id: string, input: unknown) {
  const row = await requireChangeable(principal, "screen", id, "update");
  const patch = parseInput(updateScreenInputSchema, input);
  await getDb().batch([
    getDb()
      .update(screen)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(screen.id, id)),
    ...editRecord(principal, "screen", row),
  ]);
  return getScreen(principal, id);
}

export async function updateFlow(principal: Principal, id: string, input: unknown) {
  const row = await requireChangeable(principal, "flow", id, "update");
  const patch = parseInput(updateFlowInputSchema, input);
  if (!patch.steps) {
    await getDb().batch([
      getDb()
        .update(flow)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(flow.id, id)),
      ...editRecord(principal, "flow", row),
    ]);
    return getFlow(principal, id, { countView: false });
  }
  const ids = patch.steps.map((step) => step.screenId);
  const found = await getDb()
    .select({ id: screen.id, status: screen.status })
    .from(screen)
    .where(
      and(
        eq(screen.appId, row.appId),
        inJsonArray(screen.id, ids),
        row.contributorId === principal.user.id
          ? visibleSql(screen, principal, "detail")
          : sql`(${screen.status} = 'published' OR ${screen.contributorId} = ${row.contributorId})`,
        sql`${screen.status} != 'rejected'`,
      ),
    );
  if (ids.some((id) => !found.some((s) => s.id === id)))
    throw badRequest("Every step must be an available screen from this app");
  await getDb().batch([
    getDb()
      .update(flow)
      .set({
        name: patch.name,
        type: patch.type,
        description: patch.description,
        stepCount: ids.length,
        updatedAt: new Date(),
        ...(row.status === "published" && found.some((s) => s.status !== "published")
          ? { status: "pending" as const }
          : {}),
      })
      .where(eq(flow.id, id)),
    getDb().delete(flowStep).where(eq(flowStep.flowId, id)),
    ...patch.steps.map((step, position) =>
      getDb()
        .insert(flowStep)
        .values({
          flowId: id,
          screenId: step.screenId,
          position,
          label: step.label ?? null,
        }),
    ),
    ...editRecord(principal, "flow", row),
  ]);
  return getFlow(principal, id, { countView: false });
}

export async function deleteContribution(
  principal: Principal,
  kind: "screen" | "flow",
  id: string,
) {
  await requireChangeable(principal, kind, id, "delete");
  const db = getDb();
  const table = kind === "screen" ? screen : flow;
  const writes: BatchItem<"sqlite">[] = kind === "screen" ? dropScreenFromFlows(id) : [];
  writes.push(
    db
      .delete(collectionItem)
      .where(and(eq(collectionItem.kind, kind), eq(collectionItem.itemId, id))),
    db.delete(table).where(eq(table.id, id)),
  );
  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  // Media is content-addressed and may be shared by another contribution.
}

type OwnRow = { kind: "screen"; row: ScreenRow } | { kind: "flow"; row: FlowRow };

const newestFirst = (a: OwnRow, b: OwnRow) =>
  b.row.createdAt.getTime() - a.row.createdAt.getTime() ||
  (a.row.id < b.row.id ? 1 : a.row.id > b.row.id ? -1 : 0);

export async function listContributions(
  principal: Principal,
  input: unknown = {},
): Promise<Page<Contribution>> {
  const query = parseInput(listContributionsQuerySchema, input);
  const after = query.cursor ? decodeCursor(query.cursor, "mine") : undefined;
  const mine = (table: typeof screen | typeof flow) =>
    and(
      eq(table.contributorId, principal.user.id),
      query.status ? eq(table.status, query.status) : undefined,
      // A row value, unlike an OR of the two comparisons, lets SQLite seek the index to the cursor.
      after ? sql`(${table.createdAt}, ${table.id}) < (${after.key}, ${after.id})` : undefined,
    );
  const db = getDb();
  const [screenRows, flowRows] = await Promise.all([
    query.kind === "flow"
      ? []
      : db
          .select()
          .from(screen)
          .where(mine(screen))
          .orderBy(desc(screen.createdAt), desc(screen.id))
          .limit(query.limit + 1),
    query.kind === "screen"
      ? []
      : db
          .select()
          .from(flow)
          .where(mine(flow))
          .orderBy(desc(flow.createdAt), desc(flow.id))
          .limit(query.limit + 1),
  ]);
  const merged: OwnRow[] = [
    ...screenRows.map((row) => ({ kind: "screen" as const, row })),
    ...flowRows.map((row) => ({ kind: "flow" as const, row })),
  ].sort(newestFirst);
  const { rows, nextCursor } = toPage(merged, query.limit, ({ row }) =>
    encodeCursor("mine", row.createdAt.getTime(), row.id),
  );
  const [screens, flows] = await Promise.all([
    screensToApi(
      principal,
      rows.flatMap((item) => (item.kind === "screen" ? [item.row] : [])),
    ),
    flowSummaries(
      principal,
      rows.flatMap((item) => (item.kind === "flow" ? [item.row] : [])),
    ),
  ]);
  const screensById = new Map(screens.map((item) => [item.id, item]));
  const flowsById = new Map(flows.map((item) => [item.id, item]));
  const items = rows.flatMap((item): Contribution[] => {
    const reviewReason = item.row.reviewReason;
    if (item.kind === "screen") {
      const found = screensById.get(item.row.id);
      return found ? [{ ...found, kind: "screen", reviewReason }] : [];
    }
    const found = flowsById.get(item.row.id);
    return found ? [{ ...found, kind: "flow", reviewReason }] : [];
  });
  return { items, nextCursor };
}
