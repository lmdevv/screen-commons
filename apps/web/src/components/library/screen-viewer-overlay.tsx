/*
 * Screen viewer overlay (`?screen=<id>`, lazy chunk). Shows the listed copy of the screen
 * instantly, then its detail (flows, neighbours). ←/→ walk the current result list (loading the
 * next page at its end), falling back to the app's capture order for deep links.
 */
import type { Screen, ScreenDetail } from "@open-ui/core";
import {
  Button,
  Lightbox,
  LightboxHeader,
  LightboxTitle,
  Skeleton,
  Tooltip,
  useHotkey,
} from "@open-ui/ui";
import { ScreenViewer } from "@open-ui/ui/components/screen-viewer";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { withDisplayTitle } from "../../lib/display-title";
import { queries } from "../../lib/queries";
import { errorMessage, notify } from "../../lib/toast";
import { copyImageToClipboard, copyText, downloadScreen } from "./image-actions";
import { findListedScreen, useResultListFor } from "./result-list";
import { useSaveToggle } from "./saving";

type ViewerData = Screen & Partial<Pick<ScreenDetail, "flows" | "previousId" | "nextId">>;

const ZOOM_KEY = "open-ui-viewer-zoom";

export default function ScreenViewerOverlay({
  id,
  open,
  onClose,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const toggleSave = useSaveToggle();
  const list = useResultListFor(id);
  const detail = useQuery({
    ...queries.screen(id),
    placeholderData: (previous) => (findListedScreen(id) as ScreenDetail | undefined) ?? previous,
  });
  const screen: ViewerData | undefined = useMemo(
    () => (detail.data ? withDisplayTitle(detail.data) : undefined),
    [detail.data],
  );
  const [zoom, setZoom] = useState<"fill" | "fit">(() => {
    try {
      return localStorage.getItem(ZOOM_KEY) === "fit" ? "fit" : "fill";
    } catch {
      return "fill";
    }
  });
  const changeZoom = useCallback((next: "fill" | "fit") => {
    setZoom(next);
    try {
      localStorage.setItem(ZOOM_KEY, next);
    } catch {
      // Not persisted; fine.
    }
  }, []);

  // A hidden / deleted screen: say so and close.
  const failed = detail.isError && !detail.isPlaceholderData && !screen;
  useEffect(() => {
    if (!failed) return;
    notify.error("That screen isn’t available");
    onClose();
  }, [failed, onClose]);

  // --- navigation within the current result list -------------------------------------------
  const ids = list?.screens.map((item) => item.id) ?? [];
  const index = ids.indexOf(id);
  const inList = index >= 0;
  const previousId = inList ? (ids[index - 1] ?? null) : (screen?.previousId ?? null);
  const nextId = inList ? (ids[index + 1] ?? null) : (screen?.nextId ?? null);
  const canLoadMore = inList && !nextId && !!list?.hasMore && !!list.loadMore;

  const go = useCallback(
    (target: string) =>
      void navigate({
        to: ".",
        search: (current: Record<string, unknown>) => ({ ...current, screen: target }),
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  );

  // At the end of a paginated list: fetch the next page, then advance.
  const advanceAfterLoad = useRef(false);
  const loadMoreAndAdvance = useCallback(() => {
    if (!list?.loadMore) return;
    advanceAfterLoad.current = true;
    void list.loadMore();
  }, [list]);
  useEffect(() => {
    if (advanceAfterLoad.current && nextId) {
      advanceAfterLoad.current = false;
      go(nextId);
    }
  }, [nextId, go]);

  // Warm the neighbours' full images so ←/→ feel instant.
  useEffect(() => {
    for (const neighbour of [previousId, nextId]) {
      const listed = neighbour ? findListedScreen(neighbour) : undefined;
      if (listed) new Image().src = listed.imageUrl;
    }
  }, [previousId, nextId]);

  // --- actions --------------------------------------------------------------------------------
  const save = useCallback(
    (target: ViewerData, saved: boolean) => void toggleSave({ kind: "screen", id: target.id }, saved),
    [toggleSave],
  );
  const copyImage = useCallback(async (target: ViewerData) => {
    try {
      await copyImageToClipboard(target.imageUrl);
      notify.message("Image copied to clipboard");
    } catch (error) {
      notify.error(errorMessage(error));
    }
  }, []);
  const download = useCallback(async (target: ViewerData) => {
    try {
      await downloadScreen(target);
    } catch (error) {
      notify.error(errorMessage(error));
    }
  }, []);
  const copyLink = useCallback(async (target: ViewerData) => {
    try {
      await copyText(`${location.origin}/screens/${target.id}`);
      notify.message("Link copied");
    } catch (error) {
      notify.error(errorMessage(error));
    }
  }, []);

  useHotkey("s", () => screen && save(screen, !screen.saved), { mod: false, enabled: open && !!screen });
  useHotkey("z", () => changeZoom(zoom === "fit" ? "fill" : "fit"), { mod: false, enabled: open });
  // ⌘C copies the image unless the user is copying selected text.
  useEffect(() => {
    if (!open || !screen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || !(event.metaKey || event.ctrlKey) || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (window.getSelection()?.toString()) return;
      event.preventDefault();
      void copyImage(screen);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, screen, copyImage]);

  if (!screen) {
    return failed ? null : <ViewerSkeleton open={open} onClose={onClose} />;
  }

  const platform = screen.app.platform;
  return (
    <ScreenViewer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      screen={screen}
      position={inList && !list?.hasMore ? { index, total: ids.length } : undefined}
      onPrev={previousId ? () => go(previousId) : null}
      onNext={nextId ? () => go(nextId) : canLoadMore ? loadMoreAndAdvance : null}
      onSaveToggle={save}
      onCopyImage={(target) => void copyImage(target)}
      onDownload={(target) => void download(target)}
      zoom={zoom}
      onZoomChange={changeZoom}
      actions={
        <>
          <Tooltip content="Copy link">
            <Button
              variant="ghost"
              icon
              className="hidden sm:inline-flex"
              aria-label="Copy link"
              onClick={() => void copyLink(screen)}
            >
              <Link2 />
            </Button>
          </Tooltip>
          <Tooltip content="Open page">
            <Button
              variant="ghost"
              icon
              aria-label="Open as a page"
              className="hidden md:inline-flex"
              render={<Link to="/screens/$id" params={{ id: screen.id }} />}
            >
              <ExternalLink />
            </Button>
          </Tooltip>
        </>
      }
      appLinkRender={<Link to="/apps/$slug" params={{ slug: screen.app.slug }} />}
      tagLinkRender={(kind, slug) => (
        <Link
          to="/browse/$platform"
          params={{ platform }}
          search={kind === "pattern" ? { tab: "screens", pattern: slug as never } : { tab: "elements", element: slug as never }}
        />
      )}
      flowLinkRender={(flow) => (
        <Link
          to="."
          search={(current: Record<string, unknown>) => ({ ...current, flow: flow.id, screen: undefined })}
          resetScroll={false}
        />
      )}
    />
  );
}

/** Deep link on first load: frame the overlay while the screen loads (no spinner flash). */
function ViewerSkeleton({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Lightbox open={open} onOpenChange={(next) => !next && onClose()}>
      <LightboxHeader>
        <LightboxTitle>
          <Skeleton className="size-7 rounded-[7px]" />
          <Skeleton className="h-4 w-40" />
          <span className="sr-only">Loading screen</span>
        </LightboxTitle>
      </LightboxHeader>
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 bg-tile px-4 py-6 md:px-16 md:py-10">
          <Skeleton className="mx-auto aspect-[16/10] w-full max-w-[1200px] rounded-shot bg-bg" />
        </div>
        <div className="hidden w-[360px] flex-col gap-4 border-l border-border p-6 lg:flex">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </Lightbox>
  );
}
