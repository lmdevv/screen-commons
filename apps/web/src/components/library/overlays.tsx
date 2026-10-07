import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { useCollectionPickerTargets } from "./saving";

const loadScreenViewer = () => import("./screen-viewer-overlay");
const loadFlowViewer = () => import("./flow-viewer-overlay");
const ScreenViewerOverlay = lazy(loadScreenViewer);
const FlowViewerOverlay = lazy(loadFlowViewer);
const CollectionPicker = lazy(() => import("./collection-picker"));

/** Warm the viewer chunk on intent (hovering a tile). */
export const prefetchScreenViewer = () => void loadScreenViewer();
export const prefetchFlowViewer = () => void loadFlowViewer();

type OverlayKey = "screen" | "flow";

function historyIndex(router: ReturnType<typeof useRouter>): number {
  return router.history.location.state.__TSR_index;
}

/**
 * URL-driven overlays for every signed-in page: `?flow=` (flow viewer) and `?screen=` (screen
 * viewer, stacked on top when both are set), plus the collection picker. Their code loads only
 * when opened. Closing an overlay that was opened in-app goes Back (so the browser's Back button
 * and Esc agree); a deep-linked overlay is closed by replacing the URL instead.
 */
export function LibraryOverlays() {
  const { screen, flow } = useSearch({ from: "/_app" });
  const navigate = useNavigate();
  const router = useRouter();
  const pickerTargets = useCollectionPickerTargets();

  // Keep the last overlay mounted (closed) so Base UI can play the exit and restore focus.
  const [lastScreen, setLastScreen] = useState(screen);
  const [lastFlow, setLastFlow] = useState(flow);
  const [pickerMounted, setPickerMounted] = useState(false);
  if (screen && screen !== lastScreen) setLastScreen(screen);
  if (flow && flow !== lastFlow) setLastFlow(flow);
  if (pickerTargets && !pickerMounted) setPickerMounted(true);

  // History entry each overlay was pushed on (null: deep-linked / opened on first load).
  const openedAt = useRef<Record<OverlayKey, number | null>>({ screen: null, flow: null });
  const previous = useRef<Record<OverlayKey, string | undefined> | null>(null);
  useEffect(() => {
    const before = previous.current;
    for (const key of ["screen", "flow"] as const) {
      const now = key === "screen" ? screen : flow;
      if (!now) openedAt.current[key] = null;
      else if (before && !before[key]) openedAt.current[key] = historyIndex(router);
    }
    previous.current = { screen, flow };
  }, [screen, flow, router]);

  const close = useCallback(
    (key: OverlayKey) => {
      if (openedAt.current[key] !== null && openedAt.current[key] === historyIndex(router)) {
        openedAt.current[key] = null;
        router.history.back();
        return;
      }
      void navigate({
        to: ".",
        search: (current: Record<string, unknown>) => ({ ...current, [key]: undefined }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, router],
  );

  return (
    <>
      {lastFlow ? (
        <Suspense fallback={null}>
          <FlowViewerOverlay
            id={flow ?? lastFlow}
            open={!!flow}
            activeScreenId={screen}
            onClose={() => close("flow")}
          />
        </Suspense>
      ) : null}
      {lastScreen ? (
        <Suspense fallback={null}>
          <ScreenViewerOverlay
            id={screen ?? lastScreen}
            open={!!screen}
            onClose={() => close("screen")}
          />
        </Suspense>
      ) : null}
      {pickerMounted ? (
        <Suspense fallback={null}>
          <CollectionPicker />
        </Suspense>
      ) : null}
    </>
  );
}
