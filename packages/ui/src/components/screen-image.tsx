import type { Platform } from "@screen-commons/core/taxonomy";
import type * as React from "react";

import { cn } from "../lib/cn";
import { intrinsicSize, screenFrame } from "../lib/screen";

export interface ScreenImageProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  src: string;
  /** Intrinsic pixel size of the source image (from the API). */
  width: number;
  height: number;
  platform: Platform;
  alt: string;
  /** Above-the-fold: eager + `fetchpriority="high"`. Use for the first row only. */
  priority?: boolean;
  /** Responsive `sizes` hint. */
  sizes?: string;
  /**
   * `frame` (default): uniform platform frame (16:10 / 9:19.5), top-anchored crop.
   * `natural`: the image's own aspect ratio (viewer, tall full-page screenshots).
   */
  layout?: "frame" | "natural";
  /** Placeholder colour while loading (screen.dominantColor). */
  placeholderColor?: string | null;
  imgClassName?: string;
}

/**
 * A screenshot with a 1px hairline and a platform-appropriate radius. Always sets explicit
 * width/height and an aspect-ratio box so grids never shift while images load.
 */
export function ScreenImage({
  src,
  width,
  height,
  platform,
  alt,
  priority = false,
  sizes,
  layout = "frame",
  placeholderColor,
  className,
  imgClassName,
  style,
  ...props
}: ScreenImageProps) {
  const frame = screenFrame(platform, width, height);
  const size = intrinsicSize(width, height, layout === "natural" ? 2400 : 640);
  const mobile = frame.kind === "mobile";
  return (
    <div className={cn("@container/shot w-full", className)} style={style} {...props}>
      <div
        className={cn(
          "relative w-full overflow-hidden bg-bg",
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--color-shot-border)]",
          mobile ? "rounded-[clamp(10px,10cqw,36px)]" : "rounded-[clamp(4px,1.8cqw,10px)]",
        )}
        style={{
          aspectRatio: layout === "frame" ? frame.aspectRatio : `${size.width} / ${size.height}`,
          backgroundColor: placeholderColor ?? undefined,
        }}
      >
        <img
          src={src}
          alt={alt}
          width={size.width}
          height={size.height}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          // React 19 supports the camel-cased attribute.
          fetchPriority={priority ? "high" : "auto"}
          draggable={false}
          className={cn(
            "absolute inset-0 size-full",
            layout === "natural" || frame.fit === "cover" ? "object-cover" : "object-contain",
            "object-top",
            imgClassName,
          )}
        />
      </div>
    </div>
  );
}
