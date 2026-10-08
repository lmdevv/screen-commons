import type * as React from "react";

import { cn } from "../lib/cn";

export interface LogoMarkProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  /** Accessible name; when omitted the mark is decorative. */
  title?: string;
}

/**
 * The Screen Commons mark: a 2×2 grid of screen tiles representing a shared library of
 * interfaces. Monochrome, inherits `currentColor`; legible down to 16px.
 */
export function LogoMark({ size = 22, title, className, ...props }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
      {...props}
    >
      <circle cx="6.25" cy="6.25" r="5.25" />
      <rect x="13" y="1" width="10.5" height="10.5" rx="2.75" />
      <rect x="1" y="13" width="10.5" height="10.5" rx="2.75" />
      <rect x="13" y="13" width="10.5" height="10.5" rx="2.75" fillOpacity="0.32" />
    </svg>
  );
}

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** `full` = mark + wordmark (default); `mark` = mark only. */
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { mark: 18, text: "text-[15px]", gap: "gap-1.5" },
  md: { mark: 22, text: "text-[17px]", gap: "gap-2" },
  lg: { mark: 30, text: "text-[23px]", gap: "gap-2.5" },
} as const;

/**
 * "Screen Commons" logo lockup. Wrap it in your home link: `<a href="/" aria-label="Screen Commons home"><Logo /></a>`.
 */
export function Logo({ variant = "full", size = "md", className, ...props }: LogoProps) {
  const s = sizes[size];
  return (
    <span
      className={cn("inline-flex items-center text-fg select-none", s.gap, className)}
      {...props}
    >
      <LogoMark size={s.mark} title={variant === "mark" ? "Screen Commons" : undefined} />
      {variant === "full" ? (
        <span className={cn("font-semibold leading-none tracking-[-0.03em]", s.text)}>
          Screen Commons
        </span>
      ) : null}
    </span>
  );
}
