/**
 * Saving: optimistic toggles that patch every cached copy of an item (grids, viewer, search,
 * collections), a brief toast with "Add to collection", and the collection picker store.
 */
import type { SaveKind } from "@screen-commons/core";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import { errorMessage, notify } from "../../lib/toast";
import { saveItem, unsaveItem } from "../../server/functions";

export interface SaveTarget {
  kind: SaveKind;
  id: string;
}

const PATCHABLE_ROOTS = new Set(["screens", "screen", "flows", "flow", "search", "collection"]);

function isItem(value: Record<string, unknown>, target: SaveTarget): boolean {
  if (value.id !== target.id || typeof value.saved !== "boolean") return false;
  if (target.kind === "screen") return "imageUrl" in value;
  if (target.kind === "flow") return "stepCount" in value;
  return false;
}

/** Structural patch that keeps references of untouched branches (no needless re-renders). */
function patch(value: unknown, target: SaveTarget, saved: boolean): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const patched = patch(item, target, saved);
      if (patched !== item) changed = true;
      return patched;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (isItem(record, target)) return record.saved === saved ? record : { ...record, saved };
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      const patched = patch(child, target, saved);
      if (patched !== child) changed = true;
      next[key] = patched;
    }
    return changed ? next : value;
  }
  return value;
}

export function setSavedInCaches(queryClient: QueryClient, target: SaveTarget, saved: boolean) {
  for (const query of queryClient.getQueryCache().getAll()) {
    const root = query.queryKey[0];
    if (typeof root !== "string" || !PATCHABLE_ROOTS.has(root)) continue;
    const data = query.state.data;
    if (data === undefined) continue;
    const next = patch(data, target, saved);
    if (next !== data) queryClient.setQueryData(query.queryKey, next);
  }
}

/** Refresh what saving changes on the server (collections, memberships). */
export function invalidateSaves(queryClient: QueryClient, targets: readonly SaveTarget[]) {
  void queryClient.invalidateQueries({ queryKey: ["collections"] });
  void queryClient.invalidateQueries({ queryKey: ["collection"] });
  for (const target of targets) {
    void queryClient.invalidateQueries({ queryKey: ["saved-in", target.kind, target.id] });
  }
}

const KIND_LABEL: Record<SaveKind, string> = { screen: "Screen", flow: "Flow", app: "App" };

/**
 * `toggle(target, saved)` → optimistic update, server call, toast with "Add to collection".
 * Rolls back and toasts the error on failure.
 */
export function useSaveToggle() {
  const queryClient = useQueryClient();
  return useCallback(
    async (target: SaveTarget, saved: boolean) => {
      setSavedInCaches(queryClient, target, saved);
      if (target.kind === "app") {
        queryClient.setQueryData(["saved-in", "app", target.id], saved ? ["optimistic"] : []);
      }
      try {
        await (saved ? saveItem : unsaveItem)({ data: target });
        notify.message(saved ? `${KIND_LABEL[target.kind]} saved` : "Removed from saved", {
          action: saved
            ? { label: "Add to collection", onClick: () => openCollectionPicker([target]) }
            : undefined,
        });
      } catch (error) {
        setSavedInCaches(queryClient, target, !saved);
        notify.error(errorMessage(error));
      } finally {
        invalidateSaves(queryClient, [target]);
      }
    },
    [queryClient],
  );
}

// --- collection picker store -----------------------------------------------------------------

let pickerTargets: readonly SaveTarget[] | null = null;
const pickerListeners = new Set<() => void>();

export function openCollectionPicker(targets: readonly SaveTarget[]) {
  pickerTargets = targets;
  for (const listener of pickerListeners) listener();
}

export function closeCollectionPicker() {
  pickerTargets = null;
  for (const listener of pickerListeners) listener();
}

export function useCollectionPickerTargets(): readonly SaveTarget[] | null {
  return useSyncExternalStore(
    (listener) => {
      pickerListeners.add(listener);
      return () => pickerListeners.delete(listener);
    },
    () => pickerTargets,
    () => null,
  );
}
