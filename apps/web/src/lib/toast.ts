/**
 * Lazy facade over the design system's `toast` (sonner). sonner and the <Toaster /> viewport are
 * a separate chunk, mounted on the first toast (or once the page is idle), so they never weigh on
 * a route's first load. Use `notify.*` from app code.
 */
type ToastFn = typeof import("@open-ui/ui/components/toast").toast;
type Options = Parameters<ToastFn>[1];

let loading: Promise<ToastFn> | null = null;
const load = () => (loading ??= import("@open-ui/ui/components/toast").then((m) => m.toast));

// --- toaster mounting handshake (see components/shell/deferred-toaster.tsx) ---------------------
let requested = false;
const listeners = new Set<() => void>();
let markReady: () => void = () => {};
const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

export const toasterStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  isRequested: () => requested,
  request() {
    if (requested) return;
    requested = true;
    for (const listener of listeners) listener();
  },
  /** Called by the mounted <Toaster /> wrapper. */
  ready: () => markReady(),
};

function show(run: (toast: ToastFn) => void) {
  toasterStore.request();
  void Promise.all([load(), ready]).then(([toast]) => run(toast));
}

export const notify = {
  message: (message: string, options?: Options) => show((t) => t(message, options)),
  success: (message: string, options?: Options) => show((t) => t.success(message, options)),
  error: (message: string, options?: Options) => show((t) => t.error(message, options)),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong";
}
