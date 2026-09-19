import { Button } from "@open-ui/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileImage, LoaderCircle, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { submissionAdapter } from "./server-adapter";
import { SubmissionStatusBadge } from "./status";
import type { SubmissionAdapter, SubmissionListItem, SubmissionStatus } from "./types";

type Filter = "all" | "in_review" | "published" | "needs_attention";

const filterStatus: Record<Exclude<Filter, "all">, SubmissionStatus[]> = {
  in_review: ["submitted", "automated_review", "awaiting_human"],
  needs_attention: ["changes_requested", "processing_failed", "rejected"],
  published: ["published"],
};

export function MySubmissions({ adapter = submissionAdapter }: { adapter?: SubmissionAdapter }) {
  const [filter, setFilter] = useState<Filter>("all");
  const submissionsQuery = useQuery({
    queryKey: ["my-submissions"],
    queryFn: () => adapter.listMySubmissions(),
  });
  const submissions: SubmissionListItem[] = submissionsQuery.data ?? [];

  const visible = useMemo(
    () =>
      filter === "all"
        ? submissions
        : submissions.filter((submission) => filterStatus[filter].includes(submission.status)),
    [filter, submissions],
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Contributions
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">My submissions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Track automated checks, reviewer feedback, and publication.
          </p>
        </div>
        <Button render={<a href="/contribute" />}>
          <Plus aria-hidden="true" /> New contribution
        </Button>
      </div>

      <div
        className="mb-4 flex flex-wrap gap-1 border-b"
        role="tablist"
        aria-label="Submission status"
      >
        {(["all", "in_review", "published", "needs_attention"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className="border-b-2 border-transparent px-3 py-2 text-xs text-muted-foreground hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground"
            onClick={() => setFilter(value)}
          >
            {value === "all"
              ? "All"
              : value === "in_review"
                ? "In review"
                : value === "needs_attention"
                  ? "Needs attention"
                  : "Published"}
          </button>
        ))}
      </div>

      {submissionsQuery.isPending ? (
        <div className="grid min-h-48 place-items-center text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-label="Loading submissions" />
        </div>
      ) : submissionsQuery.isError ? (
        <div
          role="alert"
          className="border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300"
        >
          {submissionsQuery.error.message}
        </div>
      ) : visible.length === 0 ? (
        <div className="grid min-h-64 place-items-center border border-dashed text-center">
          <div className="max-w-sm p-6">
            <FileImage className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-medium">No submissions here</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Change the status filter or start a new contribution.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y border bg-card">
          {visible.map((submission) => (
            <article
              key={submission.id}
              className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <SubmissionStatusBadge status={submission.status} />
                  <span className="text-[11px] text-muted-foreground">
                    {submission.kind === "flow"
                      ? `${submission.itemCount} screen flow`
                      : "Standalone screen"}
                  </span>
                </div>
                <h2 className="truncate text-sm font-medium">{submission.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {submission.productName} · Updated{" "}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                    new Date(submission.updatedAt),
                  )}
                </p>
                {submission.status === "changes_requested" ? (
                  <p className="mt-2 text-xs text-orange-300">
                    A reviewer asked for a cleaner capture without account details. Your original is
                    still hidden.
                  </p>
                ) : submission.status === "processing_failed" ? (
                  <p className="mt-2 text-xs text-red-300">
                    Automated checks stopped. Retry is available to a reviewer.
                  </p>
                ) : null}
              </div>
              <a
                href={
                  submission.status === "published" && submission.publishedHref
                    ? submission.publishedHref
                    : `/submissions#${submission.id}`
                }
                className="inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
              >
                {submission.status === "published" && submission.publishedHref
                  ? "Open published flow"
                  : "View status"}
                <ArrowRight className="size-3" aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
