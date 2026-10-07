import type * as React from "react";

import { cn } from "../lib/cn";

export interface KeyValueProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  children: React.ReactNode;
}

/** Stacked label/value (app header meta: "Platform / Web"). */
export function KeyValue({ label, children, className, ...props }: KeyValueProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)} {...props}>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="truncate text-md text-fg tabular-nums">{children}</dd>
    </div>
  );
}

/** Horizontal row of KeyValues, wrapping on small screens. Renders a `<dl>`. */
export function KeyValueGroup({ className, ...props }: React.HTMLAttributes<HTMLDListElement>) {
  return (
    <dl
      className={cn("flex flex-wrap gap-x-10 gap-y-4 sm:gap-x-12", className)}
      {...props}
    />
  );
}

/** Vertical label ↔ value rows (viewer details panel, settings summaries). Renders a `<dl>`. */
export function DetailList({ className, ...props }: React.HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn("flex flex-col", className)} {...props} />;
}

export interface DetailRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  children: React.ReactNode;
}

export function DetailRow({ label, children, className, ...props }: DetailRowProps) {
  return (
    <div
      className={cn(
        "flex min-h-10 items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-0",
        className,
      )}
      {...props}
    >
      <dt className="shrink-0 text-sm text-fg-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-fg tabular-nums">{children}</dd>
    </div>
  );
}

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Small secondary line (delta, unit). */
  hint?: React.ReactNode;
}

/** Big number + label (landing stats, review queue counts). */
export function Stat({ label, value, hint, className, ...props }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      <div className="text-xl font-semibold text-fg tabular-nums">{value}</div>
      <div className="text-sm text-fg-muted">{label}</div>
      {hint ? <div className="text-xs text-fg-subtle">{hint}</div> : null}
    </div>
  );
}
