import { Link } from "@tanstack/react-router";

import { prefetchFlowViewer, prefetchScreenViewer } from "./overlays";

/**
 * Link element for `linkRender` props that opens an overlay on the current page
 * (`?screen=` / `?flow=`), keeping the scroll position and warming the viewer chunk on hover.
 */
export function screenLink(id: string, step?: number) {
  return (
    <Link
      to="."
      search={(current: Record<string, unknown>) => ({ ...current, screen: id, step })}
      resetScroll={false}
      onPointerEnter={prefetchScreenViewer}
      onFocus={prefetchScreenViewer}
    />
  );
}

export function flowLink(id: string) {
  return (
    <Link
      to="."
      search={(current: Record<string, unknown>) => ({
        ...current,
        flow: id,
        screen: undefined,
        step: undefined,
      })}
      resetScroll={false}
      onPointerEnter={prefetchFlowViewer}
      onFocus={prefetchFlowViewer}
    />
  );
}
