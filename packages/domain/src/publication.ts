import { z } from "zod";

import { userRoleSchema } from "./content.ts";
import {
  deterministicReviewSchema,
  duplicateOutcomeSchema,
  moderationOutcomeSchema,
} from "./moderation.ts";

export const publicationDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), reason: z.string().min(1) }),
  z.object({ action: z.literal("await_human"), reason: z.string().min(1) }),
  z.object({ action: z.literal("reject"), reason: z.string().min(1) }),
]);

export const publicationPolicyInputSchema = z.object({
  role: userRoleSchema,
  deterministic: deterministicReviewSchema,
  automatedReview: z.object({
    outcome: moderationOutcomeSchema,
    confidence: z.number().min(0).max(1),
    duplicateOutcome: duplicateOutcomeSchema,
  }),
  trustedAutoPublishConfidence: z.number().min(0).max(1).default(0.9),
});

export function decidePublication(rawInput: PublicationPolicyInput): PublicationDecision {
  const input = publicationPolicyInputSchema.parse(rawInput);
  const deterministic = input.deterministic;

  if (!deterministic.schemaValid || !deterministic.filesValid || !deterministic.ownershipValid) {
    return { action: "reject", reason: "deterministic_checks_failed" };
  }

  if (deterministic.exactDuplicateFound || input.automatedReview.duplicateOutcome === "exact") {
    return { action: "await_human", reason: "exact_duplicate_requires_reuse_decision" };
  }

  if (input.role === "administrator") {
    return { action: "publish", reason: "administrator_deterministic_checks_passed" };
  }

  if (input.role === "trusted_contributor") {
    const review = input.automatedReview;
    if (
      review.outcome === "clean" &&
      review.confidence >= input.trustedAutoPublishConfidence &&
      review.duplicateOutcome === "none"
    ) {
      return { action: "publish", reason: "trusted_contributor_clean_high_confidence" };
    }
    return { action: "await_human", reason: "trusted_contributor_review_required" };
  }

  return { action: "await_human", reason: "role_requires_human_approval" };
}

export type PublicationDecision = z.infer<typeof publicationDecisionSchema>;
export type PublicationPolicyInput = z.input<typeof publicationPolicyInputSchema>;
