import {
  reviewDecisionSchema,
  reviewQueueQuerySchema,
  type ReviewKind,
  type ReviewQueue,
  type ReviewStatus,
} from "@screen-commons/core";
import { app, flow, flowStep, screen } from "@screen-commons/db";
import { and, asc, eq, lt, ne, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb } from "../env";
import { badRequest, forbidden, notFound, parseInput } from "../errors";
import { isAdmin, type Principal } from "../principal";
import { decodeCursor, encodeCursor, flowSummaries, screensToApi, toPage } from "./shared";

function requireAdmin(principal: Principal) {
  if (!isAdmin(principal)) throw forbidden("Only admins can review contributions");
}

/** Pending rows after the cursor in (createdAt, id) order, bounded so the status index serves it. */
function pendingAfter(table: typeof screen | typeof flow, sort: string, cursor?: string): SQL {
  const pending = eq(table.status, "pending");
  if (!cursor) return pending;
  const { key, id } = decodeCursor(cursor, sort);
  return sql`${pending} AND ${table.createdAt} >= ${key} AND (${table.createdAt} > ${key} OR ${table.id} > ${id})`;
}

/** One page of pending screens or flows, oldest first. */
export async function reviewQueue(principal: Principal, input: unknown): Promise<ReviewQueue> {
  requireAdmin(principal);
  const { kind, cursor, limit } = parseInput(reviewQueueQuerySchema, input);
  const db = getDb();
  const sort = `review-${kind}`;
  const cursorOf = (row: { id: string; createdAt: Date }) =>
    encodeCursor(sort, row.createdAt.getTime(), row.id);
  if (kind === "screen") {
    const rows = await db
      .select()
      .from(screen)
      .where(pendingAfter(screen, sort, cursor))
      .orderBy(asc(screen.createdAt), asc(screen.id))
      .limit(limit + 1);
    const page = toPage(rows, limit, cursorOf);
    return { kind, items: await screensToApi(principal, page.rows), nextCursor: page.nextCursor };
  }
  const rows = await db
    .select()
    .from(flow)
    .where(pendingAfter(flow, sort, cursor))
    .orderBy(asc(flow.createdAt), asc(flow.id))
    .limit(limit + 1);
  const page = toPage(rows, limit, cursorOf);
  return { kind, items: await flowSummaries(principal, page.rows), nextCursor: page.nextCursor };
}

async function findItem(input: string, id: string) {
  if (input !== "screen" && input !== "flow") throw badRequest("kind must be screen or flow");
  const kind: ReviewKind = input;
  const table = kind === "screen" ? screen : flow;
  const [row] = await getDb()
    .select({ appId: table.appId, status: table.status })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  if (!row) throw notFound(kind === "screen" ? "Screen" : "Flow");
  return { kind, table, row };
}

/** An item's moderation status, read without counting a view as `getScreen` and `getFlow` do. */
export async function reviewStatus(
  principal: Principal,
  kind: string,
  id: string,
): Promise<ReviewStatus> {
  requireAdmin(principal);
  const item = await findItem(kind, id);
  return { kind: item.kind, id, status: item.row.status };
}

/**
 * Approve or reject a screen or flow. A decision the item already has writes nothing, so a
 * repeated or resumed review run changes no row and no `updatedAt`.
 * - Approving publishes the parent app (and bumps its `updatedAt`, since member uploads never
 *   touch a published app themselves); approving a flow also publishes its pending screens.
 * - Rejecting a screen removes it from every flow that contains it (remaining steps are
 *   renumbered); a published flow left with fewer than 2 steps goes back to `pending`.
 */
export async function review(
  principal: Principal,
  kind: string,
  id: string,
  input: unknown,
): Promise<void> {
  requireAdmin(principal);
  const { decision, reason } = parseInput(reviewDecisionSchema, input);
  const { table, row } = await findItem(kind, id);
  const db = getDb();
  const status = decision === "approve" ? "published" : "rejected";
  if (row.status === status) return;
  const writes: BatchItem<"sqlite">[] = [
    db
      .update(table)
      .set({ status, reviewReason: reason ?? null })
      .where(eq(table.id, id)),
  ];
  if (decision === "approve") {
    writes.push(
      db
        .update(app)
        .set({ status: "published", updatedAt: new Date() })
        .where(eq(app.id, row.appId)),
    );
    if (kind === "flow") {
      writes.push(
        db
          .update(screen)
          .set({ status: "published" })
          .where(
            and(
              eq(screen.status, "pending"),
              sql`${screen.id} IN (SELECT ${flowStep.screenId} FROM ${flowStep} WHERE ${flowStep.flowId} = ${id})`,
            ),
          ),
      );
    }
  }
  if (decision === "reject" && kind === "screen") {
    // A rejected screen stops counting as a duplicate, so the same image can be uploaded again.
    writes.push(db.update(screen).set({ dedupeImageKey: null }).where(eq(screen.id, id)));
    writes.push(...dropScreenFromFlows(id));
  }
  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

/**
 * Batch writes removing a screen from all flows. They read nothing beforehand: each statement
 * works on the rows as they are when the batch runs, so a concurrent flow edit or deletion can't
 * be overwritten. Step counts and statuses are fixed first (a published flow left with fewer
 * than 2 steps goes back to `pending`); the remaining steps are renumbered through negative
 * positions so the (flow, position) key never collides.
 */
export function dropScreenFromFlows(screenId: string): BatchItem<"sqlite">[] {
  const db = getDb();
  const affected = sql`SELECT ${flowStep.flowId} FROM ${flowStep} WHERE ${flowStep.screenId} = ${screenId}`;
  const remaining = sql`(SELECT count(*) FROM ${flowStep} WHERE ${flowStep.flowId} = ${flow.id} AND ${flowStep.screenId} != ${screenId})`;
  const ranked = db
    .select({
      flowId: flowStep.flowId,
      position: flowStep.position,
      rank: sql<number>`row_number() OVER (PARTITION BY ${flowStep.flowId} ORDER BY ${flowStep.position}) - 1`.as(
        "rank",
      ),
    })
    .from(flowStep)
    .where(and(ne(flowStep.screenId, screenId), sql`${flowStep.flowId} IN (${affected})`))
    .as("ranked");
  return [
    db
      .update(flow)
      .set({
        stepCount: remaining,
        status: sql`CASE WHEN ${flow.status} = 'published' AND ${remaining} < 2 THEN 'pending' ELSE ${flow.status} END`,
      })
      .where(sql`${flow.id} IN (${affected})`),
    db
      .update(flowStep)
      .set({ position: sql`-1 - ${ranked.rank}` })
      .from(ranked)
      .where(and(eq(flowStep.flowId, ranked.flowId), eq(flowStep.position, ranked.position))),
    db.delete(flowStep).where(eq(flowStep.screenId, screenId)),
    db
      .update(flowStep)
      .set({ position: sql`-1 - ${flowStep.position}` })
      .where(lt(flowStep.position, 0)),
  ];
}
