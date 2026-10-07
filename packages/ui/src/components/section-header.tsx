import type * as React from "react";

import { cn } from "../lib/cn";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions. */
  actions?: React.ReactNode;
  /** Above the title, e.g. a back link or breadcrumb. */
  eyebrow?: React.ReactNode;
}

/** Page title block (40px, tight): "Discover", "Saved", "Settings". */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
        <h1 className="text-xl font-semibold text-fg sm:text-2xl">{title}</h1>
        {description ? <p className="max-w-2xl text-md text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  /** Secondary line: "14 screens", a description. */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Heading level. Default `h2`. */
  as?: "h2" | "h3";
  size?: "md" | "lg";
}

/**
 * Section title inside a page: "Onboarding on [logo] Linear · 14 screens", "Recently added",
 * "Flows". Put a "See all" link in `actions`.
 */
export function SectionHeader({
  title,
  description,
  actions,
  as: Heading = "h2",
  size = "md",
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <header className={cn("flex items-end justify-between gap-4", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1">
        <Heading
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-x-2 font-semibold text-fg",
            size === "md" ? "text-lg" : "text-xl",
          )}
        >
          {title}
        </Heading>
        {description ? <p className="text-base text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Toolbar row above grids: left (tabs/sort), right (filters/count). */
export function Toolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-3",
        className,
      )}
      {...props}
    />
  );
}

/** "Showing 508 screens" — right side of a toolbar. */
export function ResultCount({
  count,
  noun,
  className,
}: {
  count: number;
  noun: string;
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-fg-muted tabular-nums", className)} aria-live="polite">
      <span className="font-medium text-fg">{count.toLocaleString("en-US")}</span> {noun}
    </p>
  );
}
