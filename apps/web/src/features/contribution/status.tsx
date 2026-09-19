import type { SubmissionStatus } from "./types";

const statusCopy: Record<SubmissionStatus, { className: string; label: string }> = {
  automated_review: { className: "bg-sky-500/10 text-sky-300", label: "Automated review" },
  awaiting_human: { className: "bg-amber-500/10 text-amber-300", label: "Awaiting review" },
  changes_requested: { className: "bg-orange-500/10 text-orange-300", label: "Changes requested" },
  draft: { className: "bg-muted text-muted-foreground", label: "Draft" },
  processing_failed: { className: "bg-red-500/10 text-red-300", label: "Processing failed" },
  published: { className: "bg-emerald-500/10 text-emerald-300", label: "Published" },
  rejected: { className: "bg-red-500/10 text-red-300", label: "Rejected" },
  submitted: { className: "bg-sky-500/10 text-sky-300", label: "Submitted" },
  uploading: { className: "bg-violet-500/10 text-violet-300", label: "Uploading" },
};

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const copy = statusCopy[status];
  return (
    <span className={`inline-flex px-2 py-1 text-[11px] font-medium ${copy.className}`}>
      {copy.label}
    </span>
  );
}

export function submissionStatusLabel(status: SubmissionStatus) {
  return statusCopy[status].label;
}
