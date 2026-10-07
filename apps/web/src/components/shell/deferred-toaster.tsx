import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";

import { toasterStore } from "../../lib/toast";

const Toaster = lazy(() =>
  import("@open-ui/ui/components/toast").then(({ Toaster: Viewport }) => ({
    default: function ReadyToaster() {
      // Child effects (sonner's subscription) run before this one: safe to emit afterwards.
      useEffect(() => toasterStore.ready(), []);
      return <Viewport />;
    },
  })),
);

/**
 * The toast viewport, mounted on the first `notify()` or when the page goes idle (so direct
 * `toast()` calls from `@open-ui/ui` work too) — never on the first-paint path.
 */
export function DeferredToaster() {
  const requested = useSyncExternalStore(
    toasterStore.subscribe,
    toasterStore.isRequested,
    () => false,
  );
  useEffect(() => {
    if (requested) return;
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1));
    const timer = window.setTimeout(() => idle(() => toasterStore.request()), 4000);
    return () => window.clearTimeout(timer);
  }, [requested]);
  return requested ? (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  ) : null;
}
