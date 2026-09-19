import { createFileRoute } from "@tanstack/react-router";

import type {
  ReviewDetail,
  ReviewEvidence,
  ReviewEvent,
  ReviewQueueItem,
} from "../features/review/types";
import { ENV } from "../env.server";
import { AuthorizationError, requireRole } from "../server/auth";
import { publishSubmission } from "../server/publication";

type DetailRow = {
  captureDate: number;
  correlationId: string;
  createdAt: number;
  flowName: string | null;
  id: string;
  itemCount: number;
  kind: "flow" | "standalone_screen";
  productName: string;
  productVersion: string;
  sourceUrl: string | null;
  state: ReviewDetail["status"];
  submitterName: string;
};

type ItemRow = {
  fullHeight: number;
  fullSha256: string;
  fullWidth: number;
  id: string;
  fullObjectKey: string;
  perceptualHash: string | null;
  position: number;
  title: string;
};

type ModerationRow = {
  confidence: number;
  duplicateOutcome: string;
  evidence: string;
  id: string;
  outcome: "blocked" | "clean" | "error" | "warning";
  provider: string;
  stage: string;
};

type EventRow = {
  actor: string | null;
  at: number;
  eventType: string;
  id: string;
  reason: string | null;
};

const detailSql = `
  SELECT s.id, s.kind, s.state, s.flow_name AS flowName, s.correlation_id AS correlationId,
         s.created_at AS createdAt, u.display_name AS submitterName, p.name AS productName,
         pv.label AS productVersion, MIN(si.source_url) AS sourceUrl,
         MIN(si.captured_at) AS captureDate, COUNT(si.id) AS itemCount
    FROM submissions s
    JOIN users u ON u.id = s.owner_id
    JOIN products p ON p.id = s.product_id
    JOIN product_versions pv ON pv.id = s.product_version_id
    LEFT JOIN submission_items si ON si.submission_id = s.id
   WHERE s.id = ?
   GROUP BY s.id`;

function parseEvidence(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function loadDetail(submissionId: string): Promise<ReviewDetail | null> {
  const row = await ENV.DB.prepare(detailSql).bind(submissionId).first<DetailRow>();
  if (!row) return null;
  const [itemResult, moderationResult, eventResult] = await Promise.all([
    ENV.DB.prepare(
      `SELECT id, position, title, full_object_key AS fullObjectKey,
              full_width AS fullWidth, full_height AS fullHeight,
              full_sha256 AS fullSha256, perceptual_hash AS perceptualHash
         FROM submission_items WHERE submission_id = ? ORDER BY position`,
    )
      .bind(submissionId)
      .all<ItemRow>(),
    ENV.DB.prepare(
      `SELECT id, provider, stage, outcome, confidence_basis_points AS confidence,
              duplicate_outcome AS duplicateOutcome, evidence
         FROM moderation_results WHERE submission_id = ? ORDER BY reviewed_at`,
    )
      .bind(submissionId)
      .all<ModerationRow>(),
    ENV.DB.prepare(
      `SELECT re.id, re.event_type AS eventType, re.reason, re.created_at AS at,
              u.display_name AS actor
         FROM review_events re LEFT JOIN users u ON u.id = re.actor_id
        WHERE re.submission_id = ? ORDER BY re.created_at`,
    )
      .bind(submissionId)
      .all<EventRow>(),
  ]);
  const evidence: ReviewEvidence[] = moderationResult.results.map((result) => ({
    confidence: result.confidence / 10_000,
    detail:
      parseEvidence(result.evidence).join(" · ") ||
      `${result.stage} returned ${result.outcome}${result.duplicateOutcome !== "none" ? ` (${result.duplicateOutcome} duplicate)` : ""}.`,
    id: result.id,
    label: `${result.provider} · ${result.stage}`,
    source:
      result.stage === "deterministic"
        ? "deterministic"
        : result.stage === "vision"
          ? "vision"
          : "moderation",
    status:
      result.outcome === "clean"
        ? "pass"
        : result.outcome === "blocked"
          ? "fail"
          : result.outcome === "error"
            ? "unavailable"
            : "warning",
  }));
  const timeline: ReviewEvent[] = eventResult.results.map((event) => ({
    actor: event.actor ?? "Open UI automation",
    at: new Date(event.at).toISOString(),
    detail: event.reason?.replaceAll("_", " ") || event.eventType.replaceAll("_", " "),
    id: event.id,
    type: event.eventType.includes("retry")
      ? "retry"
      : event.eventType.includes("decision") || event.eventType === "publication"
        ? "decision"
        : event.eventType === "workflow_started"
          ? "check"
          : "submitted",
  }));
  return {
    ageHours: Math.max(0, Math.floor((Date.now() - row.createdAt) / 3_600_000)),
    captureDate: new Date(row.captureDate || row.createdAt).toISOString().slice(0, 10),
    createdAt: new Date(row.createdAt).toISOString(),
    evidence,
    flagged: evidence.some((result) => result.status !== "pass"),
    id: row.id,
    itemCount: row.itemCount,
    kind: row.kind === "standalone_screen" ? "standalone" : "flow",
    productName: row.productName,
    productVersion: row.productVersion,
    screens: itemResult.results.map((item) => ({
      dimensions: `${item.fullWidth} × ${item.fullHeight}`,
      id: item.id,
      objectKey: item.fullObjectKey,
      order: item.position + 1,
      perceptualHash: item.perceptualHash ?? "unavailable",
      sha256: item.fullSha256,
      title: item.title,
    })),
    sourceUrl: row.sourceUrl ?? "",
    status: row.state,
    submitterName: row.submitterName,
    tags: [],
    timeline,
    title:
      row.kind === "flow"
        ? row.flowName || "Untitled flow"
        : itemResult.results[0]?.title || "Untitled screen",
  };
}

function queueItem(detail: ReviewDetail): ReviewQueueItem {
  return {
    ageHours: detail.ageHours,
    createdAt: detail.createdAt,
    flagged: detail.flagged,
    id: detail.id,
    itemCount: detail.itemCount,
    kind: detail.kind,
    productName: detail.productName,
    status: detail.status as ReviewQueueItem["status"],
    submitterName: detail.submitterName,
    title: detail.title,
  };
}

export const Route = createFileRoute("/api/review")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireRole("reviewer");
        } catch (error) {
          if (error instanceof AuthorizationError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          throw error;
        }
        const submissionId = new URL(request.url).searchParams.get("id");
        if (submissionId) {
          const detail = await loadDetail(submissionId);
          return detail
            ? Response.json({ detail }, { headers: { "Cache-Control": "private, no-store" } })
            : Response.json({ error: "Submission not found" }, { status: 404 });
        }
        const result = await ENV.DB.prepare(
          "SELECT id FROM submissions WHERE state IN ('awaiting_human', 'automated_review', 'processing_failed') ORDER BY updated_at",
        ).all<{ id: string }>();
        const details = await Promise.all(result.results.map((row) => loadDetail(row.id)));
        return Response.json(
          {
            queue: details
              .filter((detail): detail is ReviewDetail => Boolean(detail))
              .map(queueItem),
          },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      },
      POST: async ({ request }) => {
        let reviewer;
        try {
          reviewer = await requireRole("reviewer");
        } catch (error) {
          if (error instanceof AuthorizationError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          throw error;
        }
        const input = (await request.json().catch(() => null)) as {
          action: "approve" | "reject" | "request_changes" | "retry";
          note?: string;
          submissionId?: string;
        } | null;
        if (
          !input?.submissionId ||
          !["approve", "reject", "request_changes", "retry"].includes(input.action)
        ) {
          return Response.json({ error: "Invalid review action" }, { status: 400 });
        }
        const existing = await ENV.DB.prepare(
          "SELECT state, correlation_id FROM submissions WHERE id = ?",
        )
          .bind(input.submissionId)
          .first<{ correlation_id: string; state: ReviewDetail["status"] }>();
        if (!existing) return Response.json({ error: "Submission not found" }, { status: 404 });
        if (input.action === "approve") {
          await publishSubmission(
            ENV.DB,
            input.submissionId,
            reviewer.id,
            input.note?.trim() || "reviewer_approved",
          );
        } else if (input.action === "retry") {
          if (existing.state !== "processing_failed") {
            return Response.json(
              { error: "Only failed processing can be retried" },
              { status: 409 },
            );
          }
          const now = Date.now();
          await ENV.DB.batch([
            ENV.DB.prepare(
              "UPDATE submissions SET state = 'automated_review', updated_at = ?, updated_by_id = ? WHERE id = ?",
            ).bind(now, reviewer.id, input.submissionId),
            ENV.DB.prepare(
              `INSERT INTO review_events
               (id, submission_id, actor_id, event_type, from_state, to_state, reason, detail, correlation_id, created_at)
               VALUES (?, ?, ?, 'retry', 'processing_failed', 'automated_review', 'reviewer_retry', '{}', ?, ?)`,
            ).bind(
              crypto.randomUUID(),
              input.submissionId,
              reviewer.id,
              existing.correlation_id,
              now,
            ),
          ]);
          const workflow = ENV.SUBMISSION_WORKFLOW as unknown as Workflow<{
            correlationId: string;
            submissionId: string;
          }>;
          await workflow.create({
            id: `${input.submissionId}:${crypto.randomUUID()}`,
            params: { correlationId: existing.correlation_id, submissionId: input.submissionId },
          });
        } else {
          if (!input.note?.trim())
            return Response.json({ error: "A reviewer note is required" }, { status: 400 });
          if (existing.state !== "awaiting_human" && existing.state !== "automated_review") {
            return Response.json(
              { error: "Submission is not awaiting a decision" },
              { status: 409 },
            );
          }
          const nextState = input.action === "reject" ? "rejected" : "changes_requested";
          const now = Date.now();
          await ENV.DB.batch([
            ENV.DB.prepare(
              "UPDATE submissions SET state = ?, updated_at = ?, updated_by_id = ? WHERE id = ?",
            ).bind(nextState, now, reviewer.id, input.submissionId),
            ENV.DB.prepare(
              `INSERT INTO review_events
               (id, submission_id, actor_id, event_type, from_state, to_state, reason, detail, correlation_id, created_at)
               VALUES (?, ?, ?, 'decision', ?, ?, ?, '{}', ?, ?)`,
            ).bind(
              crypto.randomUUID(),
              input.submissionId,
              reviewer.id,
              existing.state,
              nextState,
              input.note.trim(),
              existing.correlation_id,
              now,
            ),
          ]);
        }
        return Response.json({ detail: await loadDetail(input.submissionId) });
      },
    },
  },
});
