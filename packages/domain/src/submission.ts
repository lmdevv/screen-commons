import { z } from "zod";

import { entityIdSchema, isoDateTimeSchema, sha256Schema } from "./common.ts";
import {
  imageMimeTypeSchema,
  platformSchema,
  rightsStatusSchema,
  screenMetadataInputSchema,
} from "./content.ts";

export const submissionKindSchema = z.enum(["standalone_screen", "flow"]);
export const submissionStateSchema = z.enum([
  "draft",
  "uploading",
  "submitted",
  "automated_review",
  "awaiting_human",
  "processing_failed",
  "changes_requested",
  "rejected",
  "published",
  "removal_pending",
  "deleted",
]);

export const submissionSchema = z.object({
  id: entityIdSchema,
  createdById: entityIdSchema,
  kind: submissionKindSchema,
  state: submissionStateSchema,
  productId: entityIdSchema.nullable(),
  productVersionId: entityIdSchema.nullable(),
  flowName: z.string().trim().min(1).max(160).nullable(),
  platform: platformSchema,
  rightsStatus: rightsStatusSchema,
  pipelineVersion: z.string().min(1).max(100),
  correlationId: z.uuidv4(),
  submittedAt: isoDateTimeSchema.nullable(),
  publishedAt: isoDateTimeSchema.nullable(),
  removalRequestedAt: isoDateTimeSchema.nullable(),
  deletionDueAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  updatedById: entityIdSchema.nullable(),
});

export const stagedAssetSchema = z
  .object({
    objectKey: z.string().min(1).max(1_024),
    mimeType: imageMimeTypeSchema,
    byteSize: z
      .number()
      .int()
      .positive()
      .max(15 * 1024 * 1024),
    width: z.number().int().positive().max(20_000),
    height: z.number().int().positive().max(20_000),
    sha256: sha256Schema,
  })
  .refine((asset) => asset.width * asset.height <= 20_000_000, {
    message: "Image dimensions may not exceed 20 megapixels",
    path: ["width"],
  });

export const submissionItemSchema = z.object({
  id: entityIdSchema,
  submissionId: entityIdSchema,
  position: z.number().int().min(0).max(49),
  metadata: screenMetadataInputSchema,
  fullAsset: stagedAssetSchema,
  thumbnailAsset: stagedAssetSchema,
  perceptualHash: z.string().min(16).max(128).nullable(),
  linkedScreenId: entityIdSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  createdById: entityIdSchema.nullable(),
  updatedById: entityIdSchema.nullable(),
});

export const createSubmissionInputSchema = z
  .object({
    kind: submissionKindSchema,
    productId: entityIdSchema.nullable(),
    productVersionId: entityIdSchema.nullable(),
    flowName: z.string().trim().min(1).max(160).nullable(),
    platform: platformSchema,
    rightsStatus: rightsStatusSchema,
    items: z.array(
      z.object({
        metadata: screenMetadataInputSchema,
        fullAsset: stagedAssetSchema,
        thumbnailAsset: stagedAssetSchema,
      }),
    ),
  })
  .superRefine((submission, context) => {
    const expectedMaximum = submission.kind === "standalone_screen" ? 1 : 50;
    if (submission.items.length < 1 || submission.items.length > expectedMaximum) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message:
          submission.kind === "standalone_screen"
            ? "A standalone submission must contain exactly one screen"
            : "A flow must contain between 1 and 50 screens",
      });
    }
    if (submission.kind === "flow" && submission.flowName === null) {
      context.addIssue({
        code: "custom",
        path: ["flowName"],
        message: "A flow name is required for flow submissions",
      });
    }
    if (submission.kind === "standalone_screen" && submission.flowName !== null) {
      context.addIssue({
        code: "custom",
        path: ["flowName"],
        message: "Standalone submissions cannot have a flow name",
      });
    }
  });

export const submissionTransitions = {
  draft: ["uploading"],
  uploading: ["draft", "submitted"],
  submitted: ["automated_review"],
  automated_review: ["published", "awaiting_human", "processing_failed", "rejected"],
  awaiting_human: ["published", "changes_requested", "rejected"],
  processing_failed: ["automated_review", "rejected"],
  changes_requested: ["draft", "uploading"],
  rejected: [],
  published: ["removal_pending"],
  removal_pending: ["published", "deleted"],
  deleted: [],
} as const satisfies Record<SubmissionState, readonly SubmissionState[]>;

export function canTransitionSubmission(from: SubmissionState, to: SubmissionState): boolean {
  return (submissionTransitions[from] as readonly SubmissionState[]).includes(to);
}

export function assertSubmissionTransition(from: SubmissionState, to: SubmissionState): void {
  if (!canTransitionSubmission(from, to)) {
    throw new InvalidSubmissionTransitionError(from, to);
  }
}

export class InvalidSubmissionTransitionError extends Error {
  readonly from: SubmissionState;
  readonly to: SubmissionState;

  constructor(from: SubmissionState, to: SubmissionState) {
    super(`Invalid submission transition: ${from} -> ${to}`);
    this.name = "InvalidSubmissionTransitionError";
    this.from = from;
    this.to = to;
  }
}

export type SubmissionKind = z.infer<typeof submissionKindSchema>;
export type SubmissionState = z.infer<typeof submissionStateSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type SubmissionItem = z.infer<typeof submissionItemSchema>;
export type CreateSubmissionInput = z.infer<typeof createSubmissionInputSchema>;
