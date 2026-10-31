import { reviewDecisionSchema, type ReviewQueue } from "@screen-commons/core";
import { app, flow, flowStep, screen } from "@screen-commons/db";
import { and, asc, eq, lt, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb } from "../env";
import { badRequest, forbidden, notFound, parseInput } from "../errors";
import { isAdmin, type Principal } from "../principal";
import { flowSummaries, screensToApi } from "./shared";

const QUEUE_LIMIT = 100;

function requireAdmin(principal: Principal) {
  if (!isAdmin(principal)) throw forbidden("Only admins can review contributions");
}

/** Pending screens and flows, oldest first. */
export async function reviewQueue(principal: Principal): Promise<ReviewQueue> {
  requireAdmin(principal);
  const db = getDb();
  const [screenRows, flowRows] = await Promise.all([
    db
      .select()
      .from(screen)
      .where(eq(screen.status, "pending"))
      .orderBy(asc(screen.createdAt), asc(screen.id))
      .limit(QUEUE_LIMIT),
    db
      .select()
      .from(flow)
      .where(eq(flow.status, "pending"))
      .orderBy(asc(flow.createdAt), asc(flow.id))
      .limit(QUEUE_LIMIT),
  ]);
  const [screens, flows] = await Promise.all([
    screensToApi(principal, screenRows),
    flowSummaries(principal, flowRows),
  ]);
  return { screens, flows };
}

/**
 * Approve or reject a screen or flow.
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
  if (kind !== "screen" && kind !== "flow") throw badRequest("kind must be screen or flow");
  const { decision, reason } = parseInput(reviewDecisionSchema, input);
  const db = getDb();
  const table = kind === "screen" ? screen : flow;
  const [row] = await db
    .select({ id: table.id, appId: table.appId })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  if (!row) throw notFound(kind === "screen" ? "Screen" : "Flow");

  const status = decision === "approve" ? "published" : "rejected";
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
