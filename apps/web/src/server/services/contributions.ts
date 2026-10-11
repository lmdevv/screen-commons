import {
  updateScreenInputSchema,
  updateFlowInputSchema,
  visualFingerprintSchema,
  appInputSchema,
} from "@screen-commons/core";
import { app, screen, flow, flowStep, collectionItem, inJsonArray } from "@screen-commons/db";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { getDb } from "../env";
import { badRequest, forbidden, notFound, parseInput } from "../errors";
import { isAdmin, type Principal } from "../principal";
import { getScreen, getFlow } from "./catalog";
import { findApp } from "./ingest";
import { dropScreenFromFlows } from "./review";
import { screensToApi, visibleSql } from "./shared";

export function contributionPermissions(
  principal: Principal | null,
  row: { contributorId: string | null; status: string; removalReason: string | null },
) {
  const owner = !!principal && row.contributorId === principal.user.id;
  const admin = isAdmin(principal);
  return {
    edit: owner || admin,
    delete: admin || (owner && row.status !== "published"),
    requestRemoval: owner && !admin && row.status === "published",
    removalRequested: !!row.removalReason,
  };
}

async function editable(principal: Principal, kind: "screen" | "flow", id: string) {
  kind = parseInput(z.enum(["screen", "flow"]), kind);
  const table = kind === "screen" ? screen : flow;
  const [row] = await getDb().select().from(table).where(eq(table.id, id)).limit(1);
  if (!row) throw notFound(kind);
  if (row.contributorId !== principal.user.id && !isAdmin(principal))
    throw forbidden("Only the contributor can change this contribution");
  return row;
}

export async function updateScreen(principal: Principal, id: string, input: unknown) {
  const row = await editable(principal, "screen", id);
  const patch = parseInput(updateScreenInputSchema, input);
  if (row.status === "rejected") {
    const [duplicate] = await getDb()
      .select({ id: screen.id })
      .from(screen)
      .where(
        and(
          eq(screen.appId, row.appId),
          eq(screen.imageKey, (row as { imageKey: string }).imageKey),
          visibleSql(screen, principal, "detail"),
          sql`${screen.status} != 'rejected'`,
        ),
      )
      .limit(1);
    if (duplicate)
      throw badRequest(
        "An active copy of this screenshot already exists. Use that contribution instead.",
      );
  }
  await getDb()
    .update(screen)
    .set({
      ...patch,
      updatedAt: new Date(),
      ...(row.status === "rejected"
        ? {
            status: isAdmin(principal) ? ("published" as const) : ("pending" as const),
            reviewReason: null,
          }
        : {}),
    })
    .where(eq(screen.id, id));
  return getScreen(principal, id);
}

export async function updateFlow(principal: Principal, id: string, input: unknown) {
  const row = await editable(principal, "flow", id);
  const patch = parseInput(updateFlowInputSchema, input);
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
  const writes: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    getDb()
      .update(flow)
      .set({
        name: patch.name,
        type: patch.type ?? null,
        description: patch.description ?? null,
        stepCount: ids.length,
        ...(row.status === "rejected" ? { status: "pending" as const, reviewReason: null } : {}),
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
        .values({ flowId: id, screenId: step.screenId, position, label: step.label ?? null }),
    ),
  ];
  await getDb().batch(writes);
  return getFlow(principal, id, { countView: false });
}

export async function deleteContribution(
  principal: Principal,
  kind: "screen" | "flow",
  id: string,
) {
  const row = await editable(principal, kind, id);
  if (!contributionPermissions(principal, row).delete)
    throw forbidden("Published contributions need a removal request");
  const db = getDb();
  const writes: BatchItem<"sqlite">[] = kind === "screen" ? await dropScreenFromFlows(id) : [];
  writes.push(
    db
      .delete(collectionItem)
      .where(and(eq(collectionItem.kind, kind), eq(collectionItem.itemId, id))),
  );
  writes.push(
    db
      .delete(kind === "screen" ? screen : flow)
      .where(eq((kind === "screen" ? screen : flow).id, id)),
  );
  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  // Content-addressed media may also belong to a concurrent upload. Keep it rather than race
  // reference checks with another contributor's insert; unreferenced keys aren't served.
}

export async function requestRemoval(
  principal: Principal,
  kind: "screen" | "flow",
  id: string,
  input: unknown,
) {
  const row = await editable(principal, kind, id);
  if (row.status !== "published")
    throw badRequest("Only published contributions need a removal request");
  const { reason } = parseInput(z.object({ reason: z.string().trim().min(1).max(500) }), input);
  const table = kind === "screen" ? screen : flow;
  await getDb()
    .update(table)
    .set({ removalReason: reason, updatedAt: new Date() })
    .where(eq(table.id, id));
}

export async function listRemovalRequests(principal: Principal) {
  if (!isAdmin(principal)) throw forbidden();
  const [screens, flows] = await Promise.all([
    getDb()
      .select({
        id: screen.id,
        title: screen.title,
        reason: screen.removalReason,
        appName: app.name,
      })
      .from(screen)
      .innerJoin(app, eq(app.id, screen.appId))
      .where(sql`${screen.removalReason} IS NOT NULL`)
      .orderBy(asc(screen.updatedAt)),
    getDb()
      .select({ id: flow.id, title: flow.name, reason: flow.removalReason, appName: app.name })
      .from(flow)
      .innerJoin(app, eq(app.id, flow.appId))
      .where(sql`${flow.removalReason} IS NOT NULL`)
      .orderBy(asc(flow.updatedAt)),
  ]);
  return [
    ...screens.map((s) => ({ ...s, kind: "screen" as const })),
    ...flows.map((f) => ({ ...f, kind: "flow" as const })),
  ];
}

export async function reviewRemoval(
  principal: Principal,
  kind: "screen" | "flow",
  id: string,
  remove: boolean,
) {
  if (!isAdmin(principal)) throw forbidden();
  kind = parseInput(z.enum(["screen", "flow"]), kind);
  remove = parseInput(z.boolean(), remove);
  if (remove) return deleteContribution(principal, kind, id);
  const table = kind === "screen" ? screen : flow;
  await getDb()
    .update(table)
    .set({ removalReason: null, updatedAt: new Date() })
    .where(eq(table.id, id));
}

export async function duplicateCandidates(principal: Principal, input: unknown) {
  const query = parseInput(
    z.object({ app: appInputSchema, after: z.string().max(64).optional() }),
    input,
  );
  const target = await findApp(query.app);
  if (!target) return { items: [], after: null };
  const rows = await getDb()
    .select({ row: screen })
    .from(screen)
    .innerJoin(app, eq(app.id, screen.appId))
    .where(
      and(
        eq(app.id, target.id),
        visibleSql(screen, principal, "detail"),
        sql`${screen.status} != 'rejected'`,
        query.after ? gt(screen.id, query.after) : undefined,
      ),
    )
    .orderBy(asc(screen.id))
    .limit(21);
  const page = rows.slice(0, 20);
  const items = await screensToApi(
    principal,
    page.map((r) => r.row),
  );
  return {
    items: items.map((item, i) => ({ screen: item, fingerprint: page[i]!.row.visualFingerprint })),
    after: rows.length > 20 ? page[19]!.row.id : null,
  };
}

export async function rememberFingerprint(principal: Principal, id: string, input: unknown) {
  await editable(principal, "screen", id);
  const fingerprint = parseInput(visualFingerprintSchema, input);
  await getDb()
    .update(screen)
    .set({ visualFingerprint: fingerprint })
    .where(and(eq(screen.id, id), sql`${screen.visualFingerprint} IS NULL`));
}
