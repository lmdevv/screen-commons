import type { FlowStep } from "@screen-commons/core/schemas";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";
import { useScrollEdges } from "../lib/hooks";
import { frameKind, type FrameKind } from "../lib/screen";
import { ScreenImage } from "./screen-image";

export type FlowStripStep = Pick<FlowStep, "position" | "label"> & {
  screen: Pick<FlowStep["screen"], "id" | "thumbUrl" | "imageUrl" | "width" | "height" | "title"> &
    Partial<Pick<FlowStep["screen"], "dominantColor">> & {
      app: Pick<FlowStep["screen"]["app"], "platform">;
    };
};

export interface FlowStripProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  steps: readonly FlowStripStep[];
  /** Highlighted step (e.g. the one open in the screen viewer). */
  activeIndex?: number;
  /** Click a step (open it in the screen viewer). */
  onStepClick?: (step: FlowStripStep, index: number) => void;
  /** `lg` for the flow viewer (tall), `md` for inline previews. */
  size?: "md" | "lg";
  "aria-label"?: string;
}

/** Step width per frame and strip size, with the matching `sizes` hint for the image. */
const ITEM_WIDTH: Record<FrameKind, Record<"md" | "lg", { className: string; sizes: string }>> = {
  web: {
    lg: {
      className: "w-[min(78vw,calc((100dvh-320px)*1.6),960px)]",
      sizes: "(min-width: 1231px) 960px, 78vw",
    },
    md: { className: "w-[min(70vw,360px)]", sizes: "(min-width: 515px) 360px, 70vw" },
  },
  mobile: {
    lg: {
      className: "w-[min(62vw,clamp(180px,calc((100dvh-300px)*0.4615),340px))]",
      sizes: "(min-width: 549px) 340px, 62vw",
    },
    md: { className: "w-[min(42vw,180px)]", sizes: "(min-width: 429px) 180px, 42vw" },
  },
};

/**
 * Horizontal, scroll-snapping strip of flow steps with step numbers and labels. Arrow buttons
 * page through; the strip itself is keyboard-scrollable (←/→ when focused).
 */
export function FlowStrip({
  steps,
  activeIndex,
  onStepClick,
  size = "lg",
  className,
  ...props
}: FlowStripProps) {
  const { ref, canScrollStart, canScrollEnd, scrollByPage } = useScrollEdges<HTMLOListElement>();
  const platform = steps[0]?.screen.app.platform ?? "web";
  const slot = ITEM_WIDTH[frameKind(platform)][size];

  React.useEffect(() => {
    if (activeIndex === undefined) return;
    const item = ref.current?.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeIndex, ref]);

  return (
    <div className={cn("group/strip relative", className)} {...props}>
      <ol
        ref={ref}
        tabIndex={0}
        aria-label={props["aria-label"] ?? "Flow steps"}
        className={cn(
          "ou-scrollbar-none flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth outline-none",
          "scroll-px-6 px-6 py-2 md:scroll-px-8 md:px-8",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
        )}
      >
        {steps.map((step, index) => {
          const active = index === activeIndex;
          const image = (
            <ScreenImage
              src={step.screen.thumbUrl}
              fullSrc={step.screen.imageUrl}
              width={step.screen.width}
              height={step.screen.height}
              platform={step.screen.app.platform}
              alt={step.label ?? step.screen.title ?? `Step ${index + 1}`}
              priority={index < 3}
              sizes={slot.sizes}
              placeholderColor={step.screen.dominantColor}
              className={cn(
                "transition-[box-shadow] duration-150",
                active &&
                  "rounded-[clamp(10px,10cqw,36px)] ring-2 ring-accent ring-offset-2 ring-offset-bg",
              )}
            />
          );
          return (
            <li
              key={`${step.position}-${step.screen.id}`}
              aria-current={active ? "step" : undefined}
              className={cn("flex shrink-0 snap-start flex-col gap-3", slot.className)}
            >
              {onStepClick ? (
                <button
                  type="button"
                  onClick={() => onStepClick(step, index)}
                  className="ou-focus-ring block rounded-[12px] text-left"
                  aria-label={`Open step ${index + 1}${step.label ? `: ${step.label}` : ""}`}
                >
                  {image}
                </button>
              ) : (
                image
              )}
              <div className="flex min-w-0 items-center gap-2 px-0.5">
                <span
                  className={cn(
                    "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill px-1.5 text-xs font-semibold tabular-nums",
                    active ? "bg-accent text-accent-fg" : "bg-muted text-fg-muted",
                  )}
                >
                  {index + 1}
                </span>
                <span className="truncate text-base text-fg">
                  {step.label ?? step.screen.title ?? `Step ${index + 1}`}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <StripArrow direction="prev" visible={canScrollStart} onClick={() => scrollByPage(-1)} />
      <StripArrow direction="next" visible={canScrollEnd} onClick={() => scrollByPage(1)} />
    </div>
  );
}

function StripArrow({
  direction,
  visible,
  onClick,
}: {
  direction: "prev" | "next";
  visible: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      className={cn(
        "absolute top-[calc(50%-18px)] z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-elevated text-fg shadow-overlay",
        "transition-[opacity,transform] duration-150 ease-out hover:scale-105 active:scale-95",
        direction === "prev" ? "left-3" : "right-3",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
