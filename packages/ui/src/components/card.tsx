import type * as React from "react";

import { cn } from "../lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `outline` (hairline border, default) or `tile` (grey fill, no border). */
  tone?: "outline" | "tile";
}

/** Generic surface for settings panels, review items, docs callouts. */
export function Card({ tone = "outline", className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card",
        tone === "outline" && "border border-border bg-surface",
        tone === "tile" && "bg-tile",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-md font-semibold text-fg", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-base text-fg-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

export interface CalloutProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "neutral" | "accent" | "warning" | "danger" | "success";
  icon?: React.ReactNode;
}

/** Full-width notice bar (like an inline banner). */
export function Callout({ tone = "neutral", icon, className, children, ...props }: CalloutProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-control px-4 py-3 text-base [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        tone === "neutral" && "bg-tile text-fg",
        tone === "accent" && "bg-accent-soft text-fg [&>svg]:text-accent",
        tone === "warning" && "bg-warning-soft text-fg [&>svg]:text-warning",
        tone === "danger" && "bg-danger-soft text-fg [&>svg]:text-danger",
        tone === "success" && "bg-success-soft text-fg [&>svg]:text-success",
        className,
      )}
      {...props}
    >
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
