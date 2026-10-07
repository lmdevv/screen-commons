import type * as React from "react";

import { cn } from "../lib/cn";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `page` (full width with gutters, max 1760px), `narrow` (960px) or `prose` (720px). */
  size?: "page" | "narrow" | "prose";
}

/**
 * Page gutters: 16px mobile, 24px tablet, 32px desktop. Library pages are full-bleed up to 1760px
 * like Mobbin; settings/contribute use `narrow`; docs text uses `prose`.
 */
export function Container({ size = "page", className, ...props }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        size === "page" && "max-w-page",
        size === "narrow" && "max-w-[1024px]",
        size === "prose" && "max-w-[784px]",
        className,
      )}
      {...props}
    />
  );
}

/** Rendered markdown / long-form text styles (docs). */
export function Prose({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ou-prose", className)} {...props} />;
}
