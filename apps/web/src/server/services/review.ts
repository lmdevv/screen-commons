import { reviewDecisionSchema, type ReviewQueue } from "@open-ui/core";
import { app, flow, flowStep, screen } from "@open-ui/db";
import { and, asc, eq, sql } from "drizzle-orm";
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
  if (decision === "reject" && kind === "screen") writes.push(...(await dropScreenFromFlows(id)));
  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

/** Batch writes removing a screen from all flows (renumbering positions, fixing step counts). */
async function dropScreenFromFlows(screenId: string): Promise<BatchItem<"sqlite">[]> {
  const db = getDb();
  const steps = await db
    .select({ step: flowStep, status: flow.status })
    .from(flowStep)
    .innerJoin(flow, eq(flow.id, flowStep.flowId))
    .where(
      sql`${flowStep.flowId} IN (SELECT ${flowStep.flowId} FROM ${flowStep} WHERE ${flowStep.screenId} = ${screenId})`,
    )
    .orderBy(asc(flowStep.flowId), asc(flowStep.position));
  const byFlow = new Map<string, { status: string; steps: (typeof steps)[number]["step"][] }>();
  for (const { step, status } of steps) {
    const entry = byFlow.get(step.flowId) ?? { status, steps: [] };
    entry.steps.push(step);
    byFlow.set(step.flowId, entry);
  }
  const writes: BatchItem<"sqlite">[] = [];
  for (const [flowId, entry] of byFlow) {
    const remaining = entry.steps.filter((step) => step.screenId !== screenId);
    writes.push(db.delete(flowStep).where(eq(flowStep.flowId, flowId)));
    remaining.forEach((step, position) =>
      writes.push(db.insert(flowStep).values({ ...step, position })),
    );
    writes.push(
      db
        .update(flow)
        .set({
          stepCount: remaining.length,
          ...(remaining.length < 2 && entry.status === "published" ? { status: "pending" } : {}),
        })
        .where(eq(flow.id, flowId)),
    );
  }
  return writes;
}
