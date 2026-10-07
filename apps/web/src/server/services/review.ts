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
 * Approve or reject a pending screen or flow. Approving also publishes the parent app (and, for
 * flows, the flow's still-pending screens) so approved content is reachable.
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
        .set({ status: "published" })
        .where(and(eq(app.id, row.appId), sql`${app.status} != 'published'`)),
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
  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}
