import { Button } from "@open-ui/ui/components/button";
import { Textarea } from "@open-ui/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { useState } from "react";

import { capture } from "../../lib/analytics";

import { SubmissionStatusBadge } from "../contribution/status";
import { mediaUrlQueryOptions } from "../library/queries";
import { serverReviewAdapter } from "./server-review-adapter";
import type { ReviewAdapter, ReviewDecision, ReviewEvidence } from "./types";

const evidenceStyle: Record<ReviewEvidence["status"], { icon: typeof Check; style: string }> = {
  fail: { icon: X, style: "border-red-500/30 bg-red-500/5 text-red-300" },
  pass: { icon: Check, style: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" },
  unavailable: { icon: CircleAlert, style: "border-muted bg-muted/30 text-muted-foreground" },
  warning: { icon: AlertTriangle, style: "border-amber-500/30 bg-amber-500/5 text-amber-300" },
};

export function ReviewDetailPage({
  adapter = serverReviewAdapter,
  submissionId,
}: {
  adapter?: ReviewAdapter;
  submissionId: string;
}) {
  const [selectedScreen, setSelectedScreen] = useState(0);
  const [decision, setDecision] = useState<ReviewDecision>("approve");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["review-detail", submissionId],
    queryFn: () => adapter.get(submissionId),
  });
  const detail = detailQuery.data;
  const objectKey = detail?.screens[selectedScreen]?.objectKey;
  const mediaQuery = useQuery(mediaUrlQueryOptions(objectKey));
  const decisionMutation = useMutation({
    mutationFn: (input: { decision: ReviewDecision; note: string }) =>
      adapter.decide(submissionId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(["review-detail", submissionId], updated);
      void queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
  const retryMutation = useMutation({
    mutationFn: () => adapter.retry(submissionId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["review-detail", submissionId], updated);
      void queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    },
  });
  const saving = decisionMutation.isPending || retryMutation.isPending;

  const applyDecision = async () => {
    if ((decision === "reject" || decision === "request_changes") && !note.trim()) {
      setMessage("Add a note so the contributor knows what to do next.");
      return;
    }
    if (
      decision === "reject" &&
      !window.confirm("Reject this submission? The audit event cannot be removed.")
    )
      return;
    setMessage(null);
    try {
      await decisionMutation.mutateAsync({ decision, note: note.trim() });
      capture(
        decision === "approve"
          ? "submission_published"
          : decision === "reject"
            ? "submission_rejected"
            : "review_completed",
        {
          decision,
          submissionId,
        },
      );
      setMessage(
        decision === "approve"
          ? "Approved. The submission is now published."
          : decision === "request_changes"
            ? "Changes requested. The contributor can see your note."
            : "Submission rejected and hidden.",
      );
      setNote("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The decision could not be saved.");
    }
  };

  const retry = async () => {
    setMessage(null);
    try {
      await retryMutation.mutateAsync();
      setMessage("Automated review was queued again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The retry could not be queued.");
    }
  };

  if (detailQuery.isPending) {
    return (
      <main className="grid min-h-80 place-items-center text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-label="Loading submission" />
      </main>
    );
  }

  if (detailQuery.isError) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <ShieldAlert className="mx-auto mb-4 size-8 text-red-400" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Review unavailable</h1>
        <p role="alert" className="mt-2 text-sm text-muted-foreground">
          {detailQuery.error.message}
        </p>
        <a href="/library" className="mt-4 inline-flex text-xs font-medium underline">
          Return to library
        </a>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <ShieldAlert className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Submission not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have left the queue or is no longer available to this reviewer.
        </p>
        <a href="/review" className="mt-4 inline-flex text-xs font-medium underline">
          Return to review queue
        </a>
      </main>
    );
  }

  const screen = detail.screens[selectedScreen] ?? detail.screens[0];
  const canDecide = ["awaiting_human", "automated_review"].includes(detail.status);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <a
        href="/review"
        className="mb-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" aria-hidden="true" /> Review queue
      </a>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SubmissionStatusBadge status={detail.status} />
            {detail.flagged ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                <AlertTriangle className="size-3" aria-hidden="true" /> Needs attention
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {detail.productName} · {detail.productVersion} · submitted by {detail.submitterName}
          </p>
        </div>
        {detail.status === "processing_failed" ? (
          <Button variant="outline" disabled={saving} onClick={() => void retry()}>
            <RefreshCw className={saving ? "animate-spin" : ""} aria-hidden="true" /> Retry checks
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          <section className="border bg-card">
            <div className="border-b p-4">
              <h2 className="text-sm font-medium">Screen inspection</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Select each screen and inspect warnings at full size before deciding.
              </p>
            </div>
            <div className="grid md:grid-cols-[9rem_minmax(0,1fr)]">
              <div className="flex gap-2 overflow-x-auto border-b p-3 md:flex-col md:border-r md:border-b-0">
                {detail.screens.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selectedScreen === index}
                    className="w-28 shrink-0 border p-2 text-left hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted md:w-auto"
                    onClick={() => setSelectedScreen(index)}
                  >
                    <span className="mb-2 grid aspect-[4/3] place-items-center bg-gradient-to-br from-muted via-muted/40 to-background text-lg font-semibold text-muted-foreground">
                      {item.order}
                    </span>
                    <span className="block truncate text-[11px] font-medium">{item.title}</span>
                  </button>
                ))}
              </div>
              <div className="p-4">
                {screen ? (
                  <>
                    <div className="relative mx-auto grid min-h-[24rem] max-w-3xl place-items-center overflow-hidden border bg-[linear-gradient(135deg,var(--muted),transparent_45%,var(--muted))]">
                      {mediaQuery.data ? (
                        <img
                          src={mediaQuery.data}
                          alt={screen.title}
                          className="max-h-[70svh] w-auto max-w-full object-contain"
                        />
                      ) : screen.objectKey ? (
                        <div className="text-center text-xs text-muted-foreground">
                          {mediaQuery.error?.message || "Loading protected preview…"}
                        </div>
                      ) : (
                        <div
                          className="w-[78%] border bg-background shadow-2xl"
                          aria-label="Submission preview"
                        >
                          <div className="flex h-8 items-center gap-1.5 border-b px-3">
                            <span className="size-2 rounded-full bg-red-400/50" />
                            <span className="size-2 rounded-full bg-amber-400/50" />
                            <span className="size-2 rounded-full bg-emerald-400/50" />
                          </div>
                          <div className="grid min-h-56 grid-cols-[5rem_1fr]">
                            <div className="border-r bg-muted/30 p-2">
                              <div className="h-2 w-10 bg-muted-foreground/20" />
                            </div>
                            <div className="space-y-3 p-5">
                              <div className="h-4 w-36 bg-foreground/15" />
                              <div className="h-20 border bg-muted/40" />
                              <div className="grid grid-cols-2 gap-3">
                                <div className="h-16 bg-muted" />
                                <div className="h-16 bg-muted" />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
                      <span className="font-medium">
                        {screen.order}. {screen.title}
                      </span>
                      <span className="text-muted-foreground">{screen.dimensions}</span>
                    </div>
                    <details className="mt-3 border p-3 text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer font-medium text-foreground">
                        Asset fingerprints
                      </summary>
                      <dl className="mt-2 grid gap-1 font-mono break-all">
                        <div>
                          <dt className="inline font-sans">SHA-256: </dt>
                          <dd className="inline">{screen.sha256}</dd>
                        </div>
                        <div>
                          <dt className="inline font-sans">pHash: </dt>
                          <dd className="inline">{screen.perceptualHash}</dd>
                        </div>
                      </dl>
                    </details>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          <section className="border bg-card p-4">
            <h2 className="text-sm font-medium">Submission metadata</h2>
            <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-2">
              <Metadata
                label="Captured"
                value={new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
                  new Date(`${detail.captureDate}T12:00:00`),
                )}
              />
              <Metadata
                label="Type"
                value={
                  detail.kind === "flow"
                    ? `Ordered flow · ${detail.itemCount} screens`
                    : "Standalone screen"
                }
              />
              <Metadata
                label="Tags"
                value={detail.tags.length > 0 ? detail.tags.join(", ") : "No tags supplied"}
              />
              <div>
                <dt className="text-muted-foreground">Source</dt>
                <dd className="mt-1">
                  <a
                    href={detail.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-4"
                  >
                    Open source <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </dd>
              </div>
            </dl>
          </section>

          <section className="border bg-card p-4">
            <h2 className="text-sm font-medium">Audit history</h2>
            <ol className="mt-4 space-y-4 border-l pl-4">
              {detail.timeline.map((event) => (
                <li
                  key={event.id}
                  className="relative text-xs before:absolute before:top-1 before:-left-[1.25rem] before:size-2 before:rounded-full before:bg-muted-foreground"
                >
                  <div className="font-medium">{event.actor}</div>
                  <div className="mt-0.5 text-muted-foreground">{event.detail}</div>
                  <time className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock3 className="size-3" aria-hidden="true" />
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(event.at))}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="border bg-card p-4">
            <h2 className="text-sm font-medium">Review evidence</h2>
            <div className="mt-3 space-y-2">
              {detail.evidence.map((evidence) => {
                const style = evidenceStyle[evidence.status];
                const Icon = style.icon;
                return (
                  <div key={evidence.id} className={`border p-3 ${style.style}`}>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <Icon className="size-3.5 shrink-0" aria-hidden="true" /> {evidence.label}
                      {evidence.confidence !== undefined ? (
                        <span className="ml-auto text-[10px] opacity-70">
                          {Math.round(evidence.confidence * 100)}%
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed opacity-80">
                      {evidence.detail}
                    </p>
                    <p className="mt-2 text-[9px] tracking-wide uppercase opacity-60">
                      {evidence.source}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
              Confidence is evidence, not truth. Automated output never replaces the reviewer’s
              inspection.
            </p>
          </section>

          {canDecide ? (
            <section className="border bg-card p-4">
              <h2 className="text-sm font-medium">Decision</h2>
              <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Review decision">
                {(
                  [
                    ["approve", "Approve & publish", CheckCircle2],
                    ["request_changes", "Request changes", CircleAlert],
                    ["reject", "Reject", X],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 border p-2 text-xs has-[:checked]:border-foreground has-[:checked]:bg-muted"
                  >
                    <input
                      type="radio"
                      name="decision"
                      value={value}
                      checked={decision === value}
                      onChange={() => setDecision(value)}
                    />
                    <Icon className="size-4" aria-hidden="true" /> {label}
                  </label>
                ))}
              </div>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-3 min-h-24"
                placeholder={
                  decision === "approve"
                    ? "Optional internal note"
                    : "Required contributor-facing reason"
                }
                aria-label="Decision note"
              />
              <Button
                className="mt-3 w-full"
                variant={decision === "reject" ? "destructive" : "default"}
                disabled={saving}
                onClick={() => void applyDecision()}
              >
                {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                Apply decision
              </Button>
              {message ? (
                <p className="mt-3 text-xs" role="status">
                  {message}
                </p>
              ) : null}
            </section>
          ) : (
            <section className="border bg-card p-4">
              <h2 className="text-sm font-medium">Decision recorded</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                This submission is no longer awaiting a reviewer.
              </p>
              {message ? (
                <p className="mt-3 text-xs text-emerald-300" role="status">
                  {message}
                </p>
              ) : null}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
