export const ANALYTICS_EVENTS = [
  "landing_viewed",
  "signup_started",
  "signup_completed",
  "library_opened",
  "catalog_searched",
  "product_opened",
  "flow_opened",
  "screen_opened",
  "draft_created",
  "upload_started",
  "upload_completed",
  "submission_created",
  "review_completed",
  "submission_published",
  "submission_rejected",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

type EventProperties = Record<string, string | number | boolean | null | undefined>;

export function capture(event: AnalyticsEvent, properties: EventProperties = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("open-ui:analytics", { detail: { event, properties } }));
  let distinctId: string;
  try {
    const storageKey = "open-ui:anonymous-id";
    distinctId = window.localStorage.getItem(storageKey) ?? crypto.randomUUID();
    window.localStorage.setItem(storageKey, distinctId);
  } catch {
    distinctId = crypto.randomUUID();
  }
  void fetch("/api/events", {
    body: JSON.stringify({ distinctId, event, properties }),
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
}

export function sanitizeSearchMetrics(query: string): { queryLength: number; wordCount: number } {
  const normalized = query.trim();
  return {
    queryLength: Math.min(normalized.length, 500),
    wordCount: normalized.length === 0 ? 0 : normalized.split(/\s+/u).length,
  };
}
