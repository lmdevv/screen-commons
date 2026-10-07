import type { Status } from "@open-ui/core/schemas";
import type * as React from "react";

import { cn } from "../lib/cn";

export type BadgeTone = "neutral" | "inverse" | "accent" | "success" | "warning" | "danger" | "glass";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-muted text-fg-muted",
  inverse: "bg-inverse text-inverse-fg",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  /** For use on top of screenshots ("New", "Updated"). */
  glass: "bg-black/55 text-white backdrop-blur-md",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Leading status dot. */
  dot?: boolean;
}

/** Small label: counts, statuses, "New" markers. */
export function Badge({ tone = "neutral", dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium tabular-nums whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const statusTone: Record<Status, BadgeTone> = {
  published: "success",
  pending: "warning",
  rejected: "danger",
};

const statusLabel: Record<Status, string> = {
  published: "Published",
  pending: "Pending review",
  rejected: "Rejected",
};

/** Content moderation status (`published` | `pending` | `rejected`). */
export function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  return (
    <Badge tone={statusTone[status]} dot className={className}>
      {statusLabel[status]}
    </Badge>
  );
}
