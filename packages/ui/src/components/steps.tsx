import { Check } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";

export interface StepsProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: readonly { id: string; label: string }[];
  /** Index of the current step (0-based). Earlier steps render as complete. */
  current: number;
  /** Makes completed steps clickable. */
  onStepClick?: (index: number) => void;
}

/**
 * Wizard progress (contribute flow): ① Upload — ② App — ③ Tags — ④ Flow — ⑤ Review.
 * Labels collapse to numbers below `sm`, except the current one.
 */
export function Steps({ steps, current, onStepClick, className, ...props }: StepsProps) {
  return (
    <ol className={cn("flex items-center gap-2", className)} {...props}>
      {steps.map((step, index) => {
        const state = index < current ? "complete" : index === current ? "current" : "upcoming";
        const content = (
          <>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-150",
                state === "complete" && "bg-inverse text-inverse-fg",
                state === "current" && "bg-inverse text-inverse-fg",
                state === "upcoming" && "bg-muted text-fg-muted",
              )}
            >
              {state === "complete" ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
            <span
              className={cn(
                "text-base font-medium whitespace-nowrap",
                state === "upcoming" ? "text-fg-muted" : "text-fg",
                state !== "current" && "hidden sm:inline",
              )}
            >
              {step.label}
            </span>
          </>
        );
        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className="flex items-center gap-2"
          >
            {state === "complete" && onStepClick ? (
              <button
                type="button"
                onClick={() => onStepClick(index)}
                className="ou-focus-ring flex items-center gap-2 rounded-pill pr-1"
              >
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-2">{content}</span>
            )}
            {index < steps.length - 1 ? (
              <span aria-hidden className="h-px w-6 bg-border-strong sm:w-10" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
