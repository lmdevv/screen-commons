import type { AppRef } from "@screen-commons/core/schemas";
import type * as React from "react";

import { cn } from "../lib/cn";

export type AppLogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizes: Record<AppLogoSize, { px: number; className: string }> = {
  xs: { px: 20, className: "size-5 rounded-[5px] text-[10px]" },
  sm: { px: 28, className: "size-7 rounded-[7px] text-xs" },
  md: { px: 36, className: "size-9 rounded-[9px] text-sm" },
  lg: { px: 48, className: "size-12 rounded-[12px] text-lg" },
  xl: { px: 80, className: "size-20 rounded-[20px] text-[32px]" },
};

export type AppLogoData = Pick<AppRef, "name"> & Partial<Pick<AppRef, "logoUrl" | "accentColor">>;

export interface AppLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  app: AppLogoData;
  size?: AppLogoSize;
  /** Eager-load (above-the-fold headers). */
  priority?: boolean;
}

/** Perceived lightness of a #rrggbb colour, 0–1. */
function lightness(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * App icon: rounded square with a hairline inner border (so white logos don't dissolve into
 * white backgrounds). Falls back to the initial on the app's accent colour.
 */
export function AppLogo({ app, size = "md", priority = false, className, ...props }: AppLogoProps) {
  const s = sizes[size];
  const accent = app.accentColor ?? null;
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold select-none",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--color-shot-border)]",
        !app.logoUrl && !accent && "bg-muted-strong text-fg-muted",
        s.className,
        className,
      )}
      style={
        !app.logoUrl && accent
          ? { backgroundColor: accent, color: lightness(accent) > 0.62 ? "#0a0a0a" : "#ffffff" }
          : undefined
      }
      {...props}
    >
      {app.logoUrl ? (
        <img
          src={app.logoUrl}
          alt=""
          width={s.px}
          height={s.px}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="size-full bg-bg object-cover"
        />
      ) : (
        <span aria-hidden>{app.name.trim().charAt(0).toUpperCase() || "?"}</span>
      )}
    </span>
  );
}
