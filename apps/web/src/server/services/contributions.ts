import { updateScreenInputSchema, updateFlowInputSchema } from "@screen-commons/core";
import { screen, flow, flowStep, collectionItem, inJsonArray } from "@screen-commons/db";
import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { getDb } from "../env";
import { badRequest, forbidden, notFound, parseInput } from "../errors";
import type { Principal } from "../principal";
import { getScreen, getFlow } from "./catalog";
import { dropScreenFromFlows } from "./review";
import { visibleSql } from "./shared";

async function requireOwner(principal: Principal, kind: "screen" | "flow", id: string) {
  kind = parseInput(z.enum(["screen", "flow"]), kind);
  const table = kind === "screen" ? screen : flow;
  const [row] = await getDb()
    .select()
    .from(table)
    .where(and(eq(table.id, id), visibleSql(table, principal, "detail")))
    .limit(1);
  if (!row) throw notFound(kind === "screen" ? "Screen" : "Flow");
  if (row.contributorId !== principal.user.id)
    throw forbidden("Only the contributor can change this contribution");
  return row;
}

export async function updateScreen(principal: Principal, id: string, input: unknown) {
  await requireOwner(principal, "screen", id);
  const patch = parseInput(updateScreenInputSchema, input);
  await getDb()
    .update(screen)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(screen.id, id));
  return getScreen(principal, id);
}

export async function updateFlow(principal: Principal, id: string, input: unknown) {
  const row = await requireOwner(principal, "flow", id);
  const patch = parseInput(updateFlowInputSchema, input);
  if (!patch.steps) {
    await getDb()
      .update(flow)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(flow.id, id));
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
        visibleSql(screen, principal, "detail"),
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
  ]);
  return getFlow(principal, id, { countView: false });
}

export async function deleteContribution(
  principal: Principal,
  kind: "screen" | "flow",
  id: string,
) {
  await requireOwner(principal, kind, id);
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
