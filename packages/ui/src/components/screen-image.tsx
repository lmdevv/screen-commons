import type { Platform } from "@screen-commons/core/taxonomy";
import type * as React from "react";

import { cn } from "../lib/cn";
import { intrinsicSize, screenFrame, stepSource } from "../lib/screen";

export interface ScreenImageProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** The thumbnail, or the full image for `natural`. */
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
  /** Full image of a flow step: the step is shown whole in its frame (`stepSource`). */
  fullSrc?: string;
  /**
   * Offer `fullSrc` in `srcset` for a slot wider than the thumbnail (the flow strip). A grid keeps
   * the thumbnail, so tiles that lazy loading fetches below the fold stay small.
   */
  fullSrcSet?: boolean;
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
  fullSrc,
  fullSrcSet = false,
  placeholderColor,
  className,
  imgClassName,
  style,
  ...props
}: ScreenImageProps) {
  const frame = screenFrame(platform, width, height);
  const size = intrinsicSize(width, height, layout === "natural" ? 2400 : 640);
  const mobile = frame.kind === "mobile";
  const step =
    fullSrc === undefined
      ? null
      : stepSource({ thumbUrl: src, imageUrl: fullSrc, width, height }, platform);
  const whole = step?.fit === "whole";
  const shot = (box: React.CSSProperties) => (
    <div
      className={cn(
        "relative overflow-hidden bg-bg",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--color-shot-border)]",
        mobile ? "rounded-[clamp(10px,10cqw,36px)]" : "rounded-[clamp(4px,1.8cqw,10px)]",
      )}
      style={{ ...box, backgroundColor: placeholderColor ?? undefined }}
    >
      <img
        src={step?.src ?? src}
        srcSet={fullSrcSet ? step?.srcSet : undefined}
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
          whole || layout === "natural" || frame.fit === "cover"
            ? "object-cover"
            : "object-contain",
          "object-top",
          imgClassName,
        )}
      />
    </div>
  );
  return (
    <div className={cn("@container/shot w-full", className)} style={style} {...props}>
      {whole ? (
        // The frame keeps grids and strips aligned; the letterbox around the shot is transparent.
        <div className="flex w-full justify-center" style={{ aspectRatio: frame.aspectRatio }}>
          {shot({
            aspectRatio: `${width} / ${height}`,
            ...(width / height < frame.ratio ? { height: "100%" } : { width: "100%" }),
          })}
        </div>
      ) : (
        shot({
          width: "100%",
          aspectRatio: layout === "natural" ? `${size.width} / ${size.height}` : frame.aspectRatio,
        })
      )}
    </div>
  );
}
