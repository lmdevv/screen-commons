import assert from "node:assert/strict";
import test from "node:test";

import { entityIdSchema } from "./common.ts";
import { decidePublication } from "./publication.ts";
import {
  canTransitionSubmission,
  createSubmissionInputSchema,
  InvalidSubmissionTransitionError,
  assertSubmissionTransition,
} from "./submission.ts";

const deterministicPass = {
  schemaValid: true,
  filesValid: true,
  ownershipValid: true,
  exactDuplicateFound: false,
};

test("entity IDs are UUID v4 values", () => {
  assert.equal(entityIdSchema.safeParse("01890f3e-6f3a-4cb2-8f36-6b0f577c93c1").success, true);
  assert.equal(entityIdSchema.safeParse("seed_product_00000001").success, false);
});

test("administrator publication ignores non-deterministic warnings", () => {
  assert.deepEqual(
    decidePublication({
      role: "administrator",
      deterministic: deterministicPass,
      automatedReview: {
        outcome: "warning",
        confidence: 0.4,
        duplicateOutcome: "perceptual_match",
      },
    }),
    { action: "publish", reason: "administrator_deterministic_checks_passed" },
  );
});

test("trusted contributors publish only clean high-confidence results", () => {
  assert.equal(
    decidePublication({
      role: "trusted_contributor",
      deterministic: deterministicPass,
      automatedReview: { outcome: "clean", confidence: 0.95, duplicateOutcome: "none" },
    }).action,
    "publish",
  );
  assert.equal(
    decidePublication({
      role: "trusted_contributor",
      deterministic: deterministicPass,
      automatedReview: { outcome: "clean", confidence: 0.7, duplicateOutcome: "none" },
    }).action,
    "await_human",
  );
});

test("deterministic failures reject every role and exact duplicates require review", () => {
  assert.equal(
    decidePublication({
      role: "administrator",
      deterministic: { ...deterministicPass, filesValid: false },
      automatedReview: { outcome: "clean", confidence: 1, duplicateOutcome: "none" },
    }).action,
    "reject",
  );
  assert.equal(
    decidePublication({
      role: "administrator",
      deterministic: deterministicPass,
      automatedReview: { outcome: "clean", confidence: 1, duplicateOutcome: "exact" },
    }).action,
    "await_human",
  );
});

test("submission transition graph permits retries but protects terminal states", () => {
  assert.equal(canTransitionSubmission("processing_failed", "automated_review"), true);
  assert.equal(canTransitionSubmission("published", "draft"), false);
  assert.throws(
    () => assertSubmissionTransition("rejected", "published"),
    InvalidSubmissionTransitionError,
  );
});

test("standalone submission accepts exactly one item", () => {
  const asset = {
    objectKey: "staged/a.webp",
    mimeType: "image/webp" as const,
    byteSize: 10,
    width: 10,
    height: 10,
    sha256: "a".repeat(64),
  };
  const result = createSubmissionInputSchema.safeParse({
    kind: "standalone_screen",
    productId: null,
    productVersionId: null,
    flowName: null,
    platform: "web_desktop",
    rightsStatus: "contributor_attested",
    items: [
      {
        metadata: {
          title: "Sign in",
          capturedAt: "2026-09-01T12:00:00.000Z",
          platform: "web_desktop",
        },
        fullAsset: asset,
        thumbnailAsset: { ...asset, objectKey: "staged/a-thumb.webp" },
      },
    ],
  });
  assert.equal(result.success, true);
});
