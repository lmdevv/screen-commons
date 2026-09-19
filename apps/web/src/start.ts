import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { moderateImage, suggestScreenMetadata } from "./server/moderation";
import { publishSubmission } from "./server/publication";

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [clerkMiddleware(), csrfMiddleware],
  };
});

type WorkflowEnv = { ASSETS: R2Bucket; DB: D1Database; OPENAI_API_KEY: string };
type SubmissionWorkflowParams = { correlationId: string; submissionId: string };
type WorkflowSubmission = {
  correlation_id: string;
  id: string;
  owner_id: string;
  role: "administrator" | "contributor" | "reviewer" | "trusted_contributor";
  state: string;
};

export class SubmissionWorkflow extends WorkflowEntrypoint<WorkflowEnv, SubmissionWorkflowParams> {
  async run(event: WorkflowEvent<SubmissionWorkflowParams>, step: WorkflowStep) {
    const { correlationId, submissionId } = event.payload;
    try {
      const submission = await step.do("claim-submission", async () => {
        const row = await this.env.DB.prepare(
          `SELECT s.id, s.owner_id, s.state, s.correlation_id, u.role
             FROM submissions s JOIN users u ON u.id = s.owner_id WHERE s.id = ?`,
        )
          .bind(submissionId)
          .first<WorkflowSubmission>();
        if (!row) throw new Error("Submission not found");
        if (row.state === "published" || row.state === "awaiting_human") return row;
        const now = Date.now();
        await this.env.DB.batch([
          this.env.DB.prepare(
            "UPDATE submissions SET state = 'automated_review', updated_at = ? WHERE id = ? AND state IN ('submitted', 'processing_failed')",
          ).bind(now, submissionId),
          this.env.DB.prepare(
            `INSERT INTO review_events
             (id, submission_id, actor_id, event_type, from_state, to_state, reason, detail, correlation_id, created_at)
             VALUES (?, ?, NULL, 'workflow_started', ?, 'automated_review', 'durable_workflow', '{}', ?, ?)`,
          ).bind(crypto.randomUUID(), submissionId, row.state, correlationId, now),
        ]);
        return { ...row, state: "automated_review" };
      });
      if (submission.state === "published" || submission.state === "awaiting_human") return;

      const checks = await step.do("deterministic-checks", async () => {
        const result = await this.env.DB.prepare(
          `SELECT id, full_object_key, full_byte_size, full_sha256, thumbnail_object_key,
                  thumbnail_byte_size, thumbnail_sha256
             FROM submission_items WHERE submission_id = ? ORDER BY position`,
        )
          .bind(submissionId)
          .all<{
            full_byte_size: number;
            full_object_key: string;
            full_sha256: string;
            id: string;
            thumbnail_byte_size: number;
            thumbnail_object_key: string;
            thumbnail_sha256: string;
          }>();
        if (!result.results.length) throw new Error("Submission has no items");
        let exactDuplicateFound = false;
        for (const item of result.results) {
          const [full, thumbnail, duplicate] = await Promise.all([
            this.env.ASSETS.head(item.full_object_key),
            this.env.ASSETS.head(item.thumbnail_object_key),
            this.env.DB.prepare("SELECT id FROM screens WHERE sha256 = ?")
              .bind(item.full_sha256)
              .first(),
          ]);
          if (
            !full ||
            !thumbnail ||
            full.size !== item.full_byte_size ||
            thumbnail.size !== item.thumbnail_byte_size ||
            full.customMetadata?.sha256 !== item.full_sha256 ||
            thumbnail.customMetadata?.sha256 !== item.thumbnail_sha256
          ) {
            throw new Error(`Asset verification failed for ${item.id}`);
          }
          exactDuplicateFound ||= Boolean(duplicate);
        }
        const now = Date.now();
        await this.env.DB.prepare(
          `INSERT OR REPLACE INTO moderation_results
           (id, submission_id, submission_item_id, schema_version, provider, model, pipeline_version,
            stage, outcome, confidence_basis_points, categories, duplicate_outcome, suggested_tags,
            evidence, raw_response, reviewed_at, created_at, updated_at)
           VALUES (?, ?, NULL, 1, 'open-ui', 'deterministic-v1', 'v1', 'deterministic', 'clean',
                   10000, '[]', ?, '[]', ?, '{}', ?, ?, ?)`,
        )
          .bind(
            crypto.randomUUID(),
            submissionId,
            exactDuplicateFound ? "exact" : "none",
            JSON.stringify(["R2 ownership, size, and SHA-256 checks passed"]),
            now,
            now,
            now,
          )
          .run();
        return { exactDuplicateFound, items: result.results };
      });

      const automated = await step.do("automated-review", async () => {
        let clean = true;
        let minimumConfidence = 1;
        for (const item of checks.items) {
          const object = await this.env.ASSETS.get(item.thumbnail_object_key);
          if (!object) throw new Error(`Review asset missing for ${item.id}`);
          const bytes = new Uint8Array(await object.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8_192) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
          }
          const image = `data:image/webp;base64,${btoa(binary)}`;
          const reviewedAt = Date.now();
          try {
            const [moderation, metadata] = await Promise.all([
              moderateImage(this.env.OPENAI_API_KEY, image),
              suggestScreenMetadata(this.env.OPENAI_API_KEY, image),
            ]);
            const outcome = moderation.flagged
              ? "blocked"
              : metadata.privacyRisk
                ? "warning"
                : "clean";
            const confidence = Math.round(metadata.confidence * 10_000);
            clean &&= !moderation.flagged && !metadata.privacyRisk;
            minimumConfidence = Math.min(minimumConfidence, metadata.confidence);
            await this.env.DB.prepare(
              `INSERT OR REPLACE INTO moderation_results
               (id, submission_id, submission_item_id, schema_version, provider, model, pipeline_version,
                stage, outcome, confidence_basis_points, categories, duplicate_outcome, suggested_tags,
                suggested_title, evidence, raw_response, reviewed_at, created_at, updated_at)
               VALUES (?, ?, ?, 1, 'openai', ?, 'v1', 'moderation_vision', ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?, ?)`,
            )
              .bind(
                crypto.randomUUID(),
                submissionId,
                item.id,
                `${moderation.model} + ${metadata.model}`,
                outcome,
                confidence,
                JSON.stringify(
                  Object.entries(moderation.categories)
                    .filter(([, flagged]) => flagged)
                    .map(([name]) => name),
                ),
                JSON.stringify(metadata.tags),
                metadata.title ?? null,
                JSON.stringify([
                  moderation.flagged
                    ? "Safety moderation flagged this screen"
                    : "Safety moderation passed",
                  ...(metadata.privacyRisk
                    ? [
                        "Possible personal information requires human inspection",
                        ...metadata.privacyEvidence,
                      ]
                    : ["No obvious personal information detected"]),
                  `Metadata confidence ${Math.round(metadata.confidence * 100)}%`,
                ]),
                JSON.stringify({
                  moderationRequestId: moderation.providerRequestId,
                  usage: metadata.usage,
                }),
                reviewedAt,
                reviewedAt,
                reviewedAt,
              )
              .run();
          } catch (error) {
            clean = false;
            minimumConfidence = 0;
            await this.env.DB.prepare(
              `INSERT OR REPLACE INTO moderation_results
               (id, submission_id, submission_item_id, schema_version, provider, model, pipeline_version,
                stage, outcome, confidence_basis_points, categories, duplicate_outcome, suggested_tags,
                evidence, raw_response, reviewed_at, created_at, updated_at)
               VALUES (?, ?, ?, 1, 'openai', 'unavailable', 'v1', 'moderation_vision', 'error', 0,
                       '[]', 'none', '[]', ?, ?, ?, ?, ?)`,
            )
              .bind(
                crypto.randomUUID(),
                submissionId,
                item.id,
                JSON.stringify(["Provider unavailable; human review required"]),
                JSON.stringify({
                  message: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
                }),
                reviewedAt,
                reviewedAt,
                reviewedAt,
              )
              .run();
          }
        }
        return { clean, confidence: minimumConfidence };
      });

      await step.do("route-publication", async () => {
        if (submission.role === "administrator" && !checks.exactDuplicateFound) {
          await publishSubmission(
            this.env.DB,
            submissionId,
            submission.owner_id,
            "administrator_auto_publish",
          );
          return;
        }
        if (
          submission.role === "trusted_contributor" &&
          automated.clean &&
          automated.confidence >= 0.9 &&
          !checks.exactDuplicateFound
        ) {
          await publishSubmission(
            this.env.DB,
            submissionId,
            submission.owner_id,
            "trusted_contributor_clean_high_confidence",
          );
          return;
        }
        const now = Date.now();
        await this.env.DB.batch([
          this.env.DB.prepare(
            "UPDATE submissions SET state = 'awaiting_human', updated_at = ? WHERE id = ? AND state = 'automated_review'",
          ).bind(now, submissionId),
          this.env.DB.prepare(
            `INSERT INTO review_events
             (id, submission_id, actor_id, event_type, from_state, to_state, reason, detail, correlation_id, created_at)
             VALUES (?, ?, NULL, 'review_routed', 'automated_review', 'awaiting_human', ?, ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            submissionId,
            checks.exactDuplicateFound
              ? "exact_duplicate_requires_review"
              : "role_requires_human_approval",
            JSON.stringify({
              automated,
              exactDuplicateFound: checks.exactDuplicateFound,
            }),
            correlationId,
            now,
          ),
        ]);
      });
    } catch (error) {
      const now = Date.now();
      const message = error instanceof Error ? error.message : "Unknown workflow error";
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE submissions SET state = 'processing_failed', updated_at = ? WHERE id = ? AND state != 'published'",
        ).bind(now, submissionId),
        this.env.DB.prepare(
          `INSERT INTO review_events
           (id, submission_id, actor_id, event_type, from_state, to_state, reason, detail, correlation_id, created_at)
           VALUES (?, ?, NULL, 'workflow_failed', 'automated_review', 'processing_failed', 'processing_error', ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          submissionId,
          JSON.stringify({ message: message.slice(0, 500) }),
          correlationId,
          now,
        ),
      ]);
      throw error;
    }
  }
}
