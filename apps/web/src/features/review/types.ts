import type { SubmissionKind, SubmissionStatus } from "../contribution/types";

export type ReviewDecision = "approve" | "request_changes" | "reject";

export interface ReviewQueueItem {
  ageHours: number;
  createdAt: string;
  flagged: boolean;
  id: string;
  itemCount: number;
  kind: SubmissionKind;
  productName: string;
  status: Extract<SubmissionStatus, "awaiting_human" | "automated_review" | "processing_failed">;
  submitterName: string;
  title: string;
}

export interface ReviewEvidence {
  confidence?: number;
  detail: string;
  id: string;
  label: string;
  source: "deterministic" | "moderation" | "vision";
  status: "pass" | "warning" | "fail" | "unavailable";
}

export interface ReviewScreen {
  dimensions: string;
  id: string;
  objectKey?: string;
  order: number;
  perceptualHash: string;
  sha256: string;
  title: string;
}

export interface ReviewEvent {
  actor: string;
  at: string;
  detail: string;
  id: string;
  type: "submitted" | "check" | "decision" | "retry";
}

export interface ReviewDetail extends Omit<ReviewQueueItem, "status"> {
  captureDate: string;
  evidence: ReviewEvidence[];
  productVersion: string;
  screens: ReviewScreen[];
  sourceUrl: string;
  status: SubmissionStatus;
  tags: string[];
  timeline: ReviewEvent[];
}

export interface ReviewDecisionInput {
  decision: ReviewDecision;
  note: string;
}

export interface ReviewAdapter {
  decide(submissionId: string, input: ReviewDecisionInput): Promise<ReviewDetail>;
  get(submissionId: string): Promise<ReviewDetail | null>;
  listQueue(): Promise<ReviewQueueItem[]>;
  retry(submissionId: string): Promise<ReviewDetail>;
}
