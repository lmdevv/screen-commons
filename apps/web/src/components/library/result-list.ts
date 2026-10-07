/**
 * The ordered screens currently on screen (a Discover grid, an app page, search results, a
 * collection, a flow). The screen viewer navigates ←/→ within the most recently registered list
 * that contains the open screen — the CURRENT result list, not the app's capture order — and asks
 * it to load the next page when the user reaches its end.
 */
import type { Screen } from "@open-ui/core";
import { useEffect, useSyncExternalStore } from "react";

export interface ResultList {
  key: string;
  screens: readonly Screen[];
  hasMore: boolean;
  loadMore?: () => Promise<unknown>;
  /** Overlay lists (a flow's steps) win over the grid underneath. */
  priority?: number;
}

let lists: ResultList[] = [];
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Register (or update) a list while the component that renders it is mounted. */
export function useRegisterResultList(list: ResultList | null): void {
  const key = list?.key;
  useEffect(() => {
    if (!list) return;
    lists = [list, ...lists.filter((item) => item.key !== list.key)];
    emit();
  }, [list]);
  useEffect(() => {
    if (!key) return;
    return () => {
      lists = lists.filter((item) => item.key !== key);
      emit();
    };
  }, [key]);
}

/** The newest list containing `screenId` (re-renders when lists change). */
export function useResultListFor(screenId: string | undefined): ResultList | null {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  if (!screenId) return null;
  let best: ResultList | null = null;
  for (const list of lists) {
    if (!list.screens.some((screen) => screen.id === screenId)) continue;
    if (!best || (list.priority ?? 0) > (best.priority ?? 0)) best = list;
  }
  return best;
}

/** Any registered copy of a screen (instant viewer content while its detail loads). */
export function findListedScreen(screenId: string): Screen | undefined {
  for (const list of lists) {
    const found = list.screens.find((screen) => screen.id === screenId);
    if (found) return found;
  }
  return undefined;
}
