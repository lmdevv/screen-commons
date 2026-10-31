import { ContributionActions } from "./contribution-actions";
/*
 * Flow viewer overlay (`?flow=<id>`, lazy chunk): the ordered strip of steps. Clicking a step
 * stacks the screen viewer on top (`?flow=…&screen=…`), whose ←/→ then walk the flow's steps.
 * "Open as a page" leads to the standalone /flows/$id page.
 */
import { distinctStepScreens } from "@screen-commons/core/utils";
import {
  Button,
  Lightbox,
  LightboxHeader,
  LightboxTitle,
  Skeleton,
  Tooltip,
} from "@screen-commons/ui";
import { FlowViewer, type ViewerFlow } from "@screen-commons/ui/components/flow-viewer";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";

import { queries } from "../../lib/queries";
import { errorMessage, notify } from "../../lib/toast";
import { copyText, downloadScreensZip } from "./image-actions";
import { resultListIndex, useRegisterResultList } from "./result-list";
import { useSaveToggle } from "./saving";

export default function FlowViewerOverlay({
  id,
  open,
  activeScreenId,
  activeStep,
  onClose,
  stacked,
}: {
  id: string;
  open: boolean;
  activeScreenId?: string;
  activeStep?: number;
  onClose: () => void;
  /** The overlay on top of this one, shown once the flow it steps through has loaded. */
  stacked?: ReactNode;
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
            flowId: flow.id,
          }
        : null,
    [flow, open],
  );
  useRegisterResultList(list);

  const activeIndex = resultListIndex(list, activeScreenId, activeStep);

  const openStep = useCallback(
    (screenId: string, step: number) =>
      void navigate({
        to: ".",
        search: (current: Record<string, unknown>) => ({ ...current, screen: screenId, step }),
        resetScroll: false,
      }),
    [navigate],
  );

  // A failed flow closes itself, and the stacked overlay then renders on its own.
  if (!flow) return failed ? null : <FlowSkeleton open={open} onClose={onClose} />;

  return (
    <FlowViewer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      flow={flow}
      stacked={stacked}
      activeIndex={activeIndex >= 0 ? activeIndex : undefined}
      onStepClick={(step, index) => openStep(step.screen.id, index)}
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
          // One file per screen: a repeated step isn't another image.
          const screens = distinctStepScreens(flow.steps);
          notify.message(`Preparing ${screens.length} screens…`);
          await downloadScreensZip(screens, `${flow.app.name} ${flow.name}`);
        } catch (error) {
          notify.error(errorMessage(error));
        }
      }}
      actions={
        <>
          <ContributionActions key={id} kind="flow" item={flow} onDeleted={onClose} />
          <Tooltip content="Open page">
            <Button
              variant="secondary"
              icon
              aria-label="Open as a page"
              render={<Link to="/flows/$id" params={{ id: flow.id }} />}
            >
              <ExternalLink />
            </Button>
          </Tooltip>
        </>
      }
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
