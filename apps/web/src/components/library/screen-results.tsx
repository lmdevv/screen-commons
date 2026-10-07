import type { Screen } from "@open-ui/core";
import {
  ScreenGrid,
  ScreenGridItem,
  ScreenGridSkeleton,
  ScreenTile,
  SelectionBar,
  SelectionBarButton,
  frameKind,
  pluralize,
} from "@open-ui/ui";
import { useSearch } from "@tanstack/react-router";
import { Copy, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { Platform } from "../../lib/platform";
import { errorMessage, notify } from "../../lib/toast";
import { InfiniteSentinel } from "./infinite-sentinel";
import { screenLink } from "./overlay-link";
import { useRegisterResultList } from "./result-list";
import { openCollectionPicker, useSaveToggle } from "./saving";

export interface ScreenResultsProps {
  /** Identifies the list for the viewer's ←/→ (e.g. the query key). */
  listKey: string;
  screens: readonly Screen[];
  platform: Platform;
  /** App chip on hover (cross-app grids). */
  showApp?: boolean;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  loadMore?: () => Promise<unknown>;
  /** Bulk selection + SelectionBar. Default true. */
  selectable?: boolean;
  /** Name of the ZIP download ("Linear screens"). */
  downloadName?: string;
  /** Extra content under a tile (e.g. a screenshot-text match on /search). */
  renderCaption?: (screen: Screen) => ReactNode;
  /** Mark the first row as high priority (above the fold). Default true. */
  priority?: boolean;
  /** Replace the default save toggle (e.g. unsave from one collection only). */
  onSaveToggle?: (screen: Screen, saved: boolean) => void;
}

/**
 * A screen grid wired for the library: overlay links, save toggles, bulk selection
 * (checkbox on hover, ⌘/Shift-click, Shift range, Esc clears) with the SelectionBar, infinite
 * scroll with geometry-matched skeletons, and registration as the viewer's ←/→ list.
 */
export function ScreenResults({
  listKey,
  screens,
  platform,
  showApp = false,
  hasMore = false,
  isFetchingMore = false,
  loadMore,
  selectable = true,
  downloadName = "Open UI screens",
  renderCaption,
  priority = true,
  onSaveToggle,
}: ScreenResultsProps) {
  const toggleSave = useSaveToggle();
  const list = useMemo(
    () => ({ key: listKey, screens, hasMore, loadMore }),
    [listKey, screens, hasMore, loadMore],
  );
  useRegisterResultList(list);

  const selection = useSelection(screens);
  const firstRow = frameKind(platform) === "web" ? 4 : 6;

  return (
    <>
      <ScreenGrid platform={platform}>
        {screens.map((screen, index) => (
          <ScreenGridItem key={screen.id}>
            <ScreenTile
              data-screen-id={screen.id}
              screen={screen}
              showApp={showApp}
              priority={priority && index < firstRow}
              linkRender={screenLink(screen.id)}
              onSaveToggle={(_, saved) =>
                onSaveToggle
                  ? onSaveToggle(screen, saved)
                  : void toggleSave({ kind: "screen", id: screen.id }, saved)
              }
              selectable={selectable}
              selected={selection.selected.has(screen.id)}
              onSelectedChange={(selected) => selection.change(index, selected)}
              onClickCapture={(event) => selection.noteModifiers(event.shiftKey)}
            />
            {renderCaption?.(screen)}
          </ScreenGridItem>
        ))}
      </ScreenGrid>
      {isFetchingMore ? (
        <ScreenGridSkeleton platform={platform} count={firstRow} className="mt-6 lg:mt-8" />
      ) : null}
      {hasMore && loadMore ? (
        <InfiniteSentinel onVisible={() => void loadMore()} disabled={isFetchingMore} />
      ) : null}
      {selectable ? (
        <ScreenSelectionBar
          screens={screens}
          selected={selection.selected}
          onClear={selection.clear}
          downloadName={downloadName}
        />
      ) : null}
    </>
  );
}

/** Selected ids with Shift-range support. Esc clears it when no overlay or dialog is open. */
function useSelection(screens: readonly Screen[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<number | null>(null);
  const shift = useRef(false);
  const { screen: openScreen, flow: openFlow } = useSearch({ strict: false }) as {
    screen?: string;
    flow?: string;
  };

  // Drop ids that left the list (filters changed).
  useEffect(() => {
    setSelected((current) => {
      if (current.size === 0) return current;
      const ids = new Set(screens.map((screen) => screen.id));
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [screens]);

  const clear = useCallback(() => {
    anchor.current = null;
    setSelected(new Set());
  }, []);

  const overlayOpen = !!openScreen || !!openFlow;
  useEffect(() => {
    if (selected.size === 0 || overlayOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[role=dialog]")) return;
      clear();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected.size, overlayOpen, clear]);

  const change = useCallback(
    (index: number, value: boolean) => {
      const useRange = shift.current && anchor.current !== null;
      shift.current = false;
      setSelected((current) => {
        const next = new Set(current);
        if (useRange) {
          const [from, to] = [anchor.current!, index].sort((a, b) => a - b);
          for (let i = from!; i <= to!; i++) {
            const id = screens[i]?.id;
            if (id) next.add(id);
          }
        } else {
          const id = screens[index]?.id;
          if (!id) return current;
          if (value) next.add(id);
          else next.delete(id);
        }
        return next;
      });
      anchor.current = index;
    },
    [screens],
  );

  const noteModifiers = useCallback((shiftKey: boolean) => {
    shift.current = shiftKey;
  }, []);

  return { selected, change, clear, noteModifiers };
}

function ScreenSelectionBar({
  screens,
  selected,
  onClear,
  downloadName,
}: {
  screens: readonly Screen[];
  selected: ReadonlySet<string>;
  onClear: () => void;
  downloadName: string;
}) {
  const [zipping, setZipping] = useState(false);
  const chosen = () => screens.filter((screen) => selected.has(screen.id));

  async function download() {
    const items = chosen();
    if (items.length === 0) return;
    setZipping(true);
    try {
      const { downloadScreensZip } = await import("./image-actions");
      await downloadScreensZip(items, downloadName);
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setZipping(false);
    }
  }

  async function copy() {
    const items = chosen();
    try {
      const { copyImageToClipboard, copyText } = await import("./image-actions");
      if (items.length === 1) {
        await copyImageToClipboard(items[0]!.imageUrl);
        notify.message("Image copied to clipboard");
      } else {
        await copyText(items.map((item) => `${location.origin}/screens/${item.id}`).join("\n"));
        notify.message(`${pluralize(items.length, "link")} copied`);
      }
    } catch (error) {
      notify.error(errorMessage(error));
    }
  }

  return (
    <SelectionBar count={selected.size} onClear={onClear}>
      <SelectionBarButton
        icon
        aria-label={zipping ? "Preparing ZIP…" : "Download ZIP"}
        title="Download ZIP"
        disabled={zipping}
        onClick={() => void download()}
      >
        <Download className={zipping ? "animate-ou-pulse" : undefined} />
      </SelectionBarButton>
      <SelectionBarButton onClick={() => void copy()}>
        <Copy />
        {selected.size === 1 ? "Copy" : "Copy links"}
      </SelectionBarButton>
      <SelectionBarButton
        primary
        onClick={() =>
          openCollectionPicker(
            chosen().map((screen) => ({ kind: "screen" as const, id: screen.id })),
          )
        }
      >
        Save
      </SelectionBarButton>
    </SelectionBar>
  );
}
