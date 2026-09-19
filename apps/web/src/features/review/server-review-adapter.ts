import type { ReviewAdapter, ReviewDecisionInput, ReviewDetail, ReviewQueueItem } from "./types";

async function jsonRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
  if (!body) throw new Error("The server returned an empty response.");
  return body;
}

export const serverReviewAdapter: ReviewAdapter = {
  async listQueue() {
    const body = await jsonRequest<{ queue: ReviewQueueItem[] }>("/api/review");
    return body.queue;
  },
  async get(submissionId: string) {
    try {
      const body = await jsonRequest<{ detail: ReviewDetail }>(
        `/api/review?id=${encodeURIComponent(submissionId)}`,
      );
      return body.detail;
    } catch (error) {
      if (error instanceof Error && error.message === "Submission not found") return null;
      throw error;
    }
  },
  async decide(submissionId: string, input: ReviewDecisionInput) {
    const body = await jsonRequest<{ detail: ReviewDetail }>("/api/review", {
      body: JSON.stringify({ action: input.decision, note: input.note, submissionId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return body.detail;
  },
  async retry(submissionId: string) {
    const body = await jsonRequest<{ detail: ReviewDetail }>("/api/review", {
      body: JSON.stringify({ action: "retry", submissionId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return body.detail;
  },
};
