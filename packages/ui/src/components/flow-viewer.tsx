import type { FlowDetail } from "@screen-commons/core/schemas";
import { labelFor } from "@screen-commons/core/taxonomy";
import { Bookmark, Copy, Download } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { formatDimensions, pluralize } from "../lib/format";
import { AppLogo } from "./app-logo";
import { Button } from "./button";
import { FlowStrip, type FlowStripStep } from "./flow-strip";
import { Lightbox, LightboxFooter, LightboxHeader, LightboxTitle } from "./lightbox";

export type ViewerFlow = Pick<FlowDetail, "id" | "name" | "app" | "stepCount"> &
  Partial<Pick<FlowDetail, "type" | "description" | "saved">> & {
    steps: readonly FlowStripStep[];
  };

export interface FlowViewerProps {
  flow: ViewerFlow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Click a step → usually opens the screen viewer on top (`?flow=…&screen=…`). */
  onStepClick?: (step: FlowStripStep, index: number) => void;
  activeIndex?: number;
  onSaveToggle?: (flow: ViewerFlow, saved: boolean) => void;
  onCopy?: (flow: ViewerFlow) => void;
  onDownload?: (flow: ViewerFlow) => void;
  /** Extra footer actions. */
  actions?: React.ReactNode;
}

/**
 * Flow viewer overlay (`?flow=$id`): "Onboarding on [logo] App", the ordered strip of steps with
 * labels, Save / Copy in the footer, device + size info on the right.
 */
export function FlowViewer({
  flow,
  open,
  onOpenChange,
  onStepClick,
  activeIndex,
  onSaveToggle,
  onCopy,
  onDownload,
  actions,
}: FlowViewerProps) {
  const first = flow.steps[0]?.screen;
  return (
    <Lightbox open={open} onOpenChange={onOpenChange}>
      <LightboxHeader className="h-[72px]">
        <LightboxTitle className="text-lg tracking-[-0.014em]">
          <span className="truncate">{flow.name}</span>
          <span className="shrink-0 font-normal text-fg-subtle">on</span>
          <AppLogo app={flow.app} size="sm" />
          <span className="truncate">{flow.app.name}</span>
        </LightboxTitle>
      </LightboxHeader>
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-4">
        {flow.description ? (
          <p className="mx-6 mb-5 max-w-2xl text-base text-fg-muted md:mx-8">{flow.description}</p>
        ) : null}
        <FlowStrip
          steps={flow.steps}
          activeIndex={activeIndex}
          onStepClick={onStepClick}
          size="lg"
          fullImages
          aria-label={`${flow.name} steps`}
        />
      </div>
      <LightboxFooter className="justify-between">
        <div className="hidden min-w-0 flex-1 text-sm text-fg-muted md:block">
          {pluralize(flow.stepCount, "screen")}
          {flow.type ? ` · ${labelFor(flow.type)}` : null}
        </div>
        <div className="flex flex-1 items-center justify-center gap-2 md:flex-none">
          {onSaveToggle ? (
            <Button
              variant={flow.saved ? "secondary" : "primary"}
              aria-pressed={flow.saved ?? false}
              onClick={() => onSaveToggle(flow, !flow.saved)}
            >
              <Bookmark className={cn(flow.saved && "fill-current")} />
              {flow.saved ? "Saved" : "Save"}
            </Button>
          ) : null}
          {onCopy ? (
            <Button variant="secondary" onClick={() => onCopy(flow)}>
              <Copy />
              Copy
            </Button>
          ) : null}
          {onDownload ? (
            <Button
              variant="secondary"
              icon
              aria-label="Download all"
              onClick={() => onDownload(flow)}
            >
              <Download />
            </Button>
          ) : null}
          {actions}
        </div>
        <div className="hidden flex-1 text-right text-sm md:block">
          {first ? (
            <span className="text-fg-muted">
              {labelFor(first.app.platform)}{" "}
              <span className="tabular-nums">({formatDimensions(first.width, first.height)})</span>
            </span>
          ) : null}
        </div>
      </LightboxFooter>
    </Lightbox>
  );
}
