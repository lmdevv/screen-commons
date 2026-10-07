import { lazy, Suspense, useEffect, useState } from "react";

const Toaster = lazy(() =>
  import("@open-ui/ui/components/toast").then((module) => ({ default: module.Toaster })),
);

/** Mounts the toast viewport after hydration (its own chunk), off the first-paint path. */
export function DeferredToaster() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  ) : null;
}
