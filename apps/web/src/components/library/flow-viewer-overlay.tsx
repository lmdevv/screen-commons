/*
 * Flow viewer overlay (`?flow=<id>`, lazy chunk): the ordered strip of steps. Clicking a step
 * stacks the screen viewer on top (`?flow=…&screen=…`), whose ←/→ then walk the flow's steps.
 */
import { Lightbox, LightboxHeader, LightboxTitle, Skeleton } from "@screen-commons/ui";
import { FlowViewer, type ViewerFlow } from "@screen-commons/ui/components/flow-viewer";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";

import { queries } from "../../lib/queries";
import { errorMessage, notify } from "../../lib/toast";
import { copyText, downloadScreensZip } from "./image-actions";
import { useRegisterResultList } from "./result-list";
import { useSaveToggle } from "./saving";

export default function FlowViewerOverlay({
  id,
  open,
  activeScreenId,
  onClose,
}: {
  id: string;
  open: boolean;
  activeScreenId?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const toggleSave = useSaveToggle();
  const detail = useQuery({ ...queries.flow(id), staleTime: 5 * 60_000 });
  const flow = detail.data;

  const failed = detail.isError && !flow;
  useEffect(() => {
    if (!failed) return;
    notify.error("That flow isn’t available");
    onClose();
  }, [failed, onClose]);

  // The flow's steps become the screen viewer's ←/→ list while the flow is open.
  const list = useMemo(
    () =>
      flow && open
        ? {
            key: `flow:${flow.id}`,
            screens: flow.steps.map((step) => step.screen),
            hasMore: false,
            priority: 1,
          }
        : null,
    [flow, open],
  );
  useRegisterResultList(list);

  const activeIndex = flow?.steps.findIndex((step) => step.screen.id === activeScreenId);

  const openStep = useCallback(
    (screenId: string) =>
      void navigate({
        to: ".",
        search: (current: Record<string, unknown>) => ({ ...current, screen: screenId }),
        resetScroll: false,
      }),
    [navigate],
  );

  if (!flow) return failed ? null : <FlowSkeleton open={open} onClose={onClose} />;

  return (
    <FlowViewer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      flow={flow}
      activeIndex={activeIndex !== undefined && activeIndex >= 0 ? activeIndex : undefined}
      onStepClick={(step) => openStep(step.screen.id)}
      onSaveToggle={(target: ViewerFlow, saved) =>
        void toggleSave({ kind: "flow", id: target.id }, saved)
      }
      onCopy={async (target: ViewerFlow) => {
        try {
          await copyText(`${location.origin}/flows/${target.id}`);
          notify.message("Link copied");
        } catch (error) {
          notify.error(errorMessage(error));
        }
      }}
      onDownload={async () => {
        try {
          notify.message(`Preparing ${flow.steps.length} screens…`);
          await downloadScreensZip(
            flow.steps.map((step) => step.screen),
            `${flow.app.name} ${flow.name}`,
          );
        } catch (error) {
          notify.error(errorMessage(error));
        }
      }}
    />
  );
}

function FlowSkeleton({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Lightbox open={open} onOpenChange={(next) => !next && onClose()}>
      <LightboxHeader className="h-[72px]">
        <LightboxTitle>
          <Skeleton className="h-5 w-56" />
          <span className="sr-only">Loading flow</span>
        </LightboxTitle>
      </LightboxHeader>
      <div className="flex min-h-0 flex-1 items-center gap-5 overflow-hidden px-6 md:px-8">
        {[0, 1, 2].map((index) => (
          <Skeleton
            key={index}
            className="aspect-[16/10] w-[min(78vw,640px)] shrink-0 rounded-shot"
          />
        ))}
      </div>
    </Lightbox>
  );
}
