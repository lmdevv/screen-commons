import { z } from "zod";

import { entityIdSchema, isoDateTimeSchema } from "./common.ts";

export const moderationOutcomeSchema = z.enum(["clean", "warning", "blocked", "error"]);
export const duplicateOutcomeSchema = z.enum(["none", "exact", "perceptual_match"]);

export const moderationCategoryScoreSchema = z.object({
  category: z.string().trim().min(1).max(100),
  score: z.number().min(0).max(1),
  flagged: z.boolean(),
});

export const normalizedModerationResultSchema = z.object({
  schemaVersion: z.literal(1),
  submissionId: entityIdSchema,
  submissionItemId: entityIdSchema.nullable(),
  provider: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  pipelineVersion: z.string().trim().min(1).max(100),
  stage: z.string().trim().min(1).max(100),
  outcome: moderationOutcomeSchema,
  confidence: z.number().min(0).max(1),
  categories: z.array(moderationCategoryScoreSchema).max(100),
  duplicateOutcome: duplicateOutcomeSchema,
  duplicateScreenId: entityIdSchema.nullable(),
  suggestedTags: z.array(z.string().trim().min(1).max(60)).max(30),
  suggestedTitle: z.string().trim().min(1).max(160).nullable(),
  evidence: z.array(z.string().trim().min(1).max(500)).max(30),
  reviewedAt: isoDateTimeSchema,
});

export const deterministicReviewSchema = z.object({
  schemaValid: z.boolean(),
  filesValid: z.boolean(),
  ownershipValid: z.boolean(),
  exactDuplicateFound: z.boolean(),
});

export type ModerationOutcome = z.infer<typeof moderationOutcomeSchema>;
export type DuplicateOutcome = z.infer<typeof duplicateOutcomeSchema>;
export type NormalizedModerationResult = z.infer<typeof normalizedModerationResultSchema>;
export type DeterministicReview = z.infer<typeof deterministicReviewSchema>;
