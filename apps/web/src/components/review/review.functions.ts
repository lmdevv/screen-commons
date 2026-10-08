import type { FlowSummary, ReviewQueue, Screen } from "@screen-commons/core";
import { flow, flowStep, screen, user } from "@screen-commons/db";
import { notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { inArray } from "drizzle-orm";

import { getDb } from "../../server/env";
import { getSessionPrincipal, isAdmin } from "../../server/principal";
import * as services from "../../server/services";

export interface Contributor {
  name: string;
  email: string;
}

export interface ReviewQueueDetailed extends ReviewQueue {
  /** Contributor per item id (screens and flows). Missing when the account was deleted. */
  contributors: Record<string, Contributor>;
  /** Pending screens per flow id, so approving a flow can drop them from the screen list. */
  flowScreens: Record<string, string[]>;
}

/**
 * Admin review queue plus who contributed each item (the core `ReviewQueue` shape has no
 * contributor). Members get a 404, like any hidden page.
 */
export const getReviewQueueDetailed = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReviewQueueDetailed> => {
    const principal = await getSessionPrincipal(getRequest().headers);
    if (!principal) throw redirect({ to: "/sign-in", search: { redirect: "/review" } });
    if (!isAdmin(principal)) throw notFound();
    const queue = await services.reviewQueue(principal);
    const db = getDb();
    const screenIds = queue.screens.map((s: Screen) => s.id);
    const flowIds = queue.flows.map((f: FlowSummary) => f.id);
    const [screenRows, flowRows, stepRows] = await Promise.all([
      screenIds.length
        ? db
            .select({ id: screen.id, contributorId: screen.contributorId })
            .from(screen)
            .where(inArray(screen.id, screenIds))
        : [],
      flowIds.length
        ? db
            .select({ id: flow.id, contributorId: flow.contributorId })
            .from(flow)
            .where(inArray(flow.id, flowIds))
        : [],
      flowIds.length
        ? db
            .select({ flowId: flowStep.flowId, screenId: flowStep.screenId })
            .from(flowStep)
            .where(inArray(flowStep.flowId, flowIds))
        : [],
    ]);
    const owners = [...screenRows, ...flowRows];
    const userIds = [
      ...new Set(owners.map((row) => row.contributorId).filter(Boolean)),
    ] as string[];
    const users = userIds.length
      ? await db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(inArray(user.id, userIds))
      : [];
    const byId = new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
    const contributors: Record<string, Contributor> = {};
    for (const row of owners) {
      const found = row.contributorId ? byId.get(row.contributorId) : undefined;
      if (found) contributors[row.id] = found;
    }
    const flowScreens: Record<string, string[]> = {};
    for (const step of stepRows) (flowScreens[step.flowId] ??= []).push(step.screenId);
    return { ...queue, contributors, flowScreens };
  },
);
