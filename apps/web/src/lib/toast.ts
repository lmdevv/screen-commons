/**
 * Lazy facade over the design system's `toast` (sonner). Importing sonner eagerly would add it to
 * every route's first-load JS; toasts only ever follow a user action, by which time the chunk
 * (also used by the deferred <Toaster />) is loaded.
 */
type ToastFn = typeof import("@open-ui/ui/components/toast").toast;
type Options = Parameters<ToastFn>[1];

let loading: Promise<ToastFn> | null = null;
const load = () => (loading ??= import("@open-ui/ui/components/toast").then((m) => m.toast));

export const notify = {
  message: (message: string, options?: Options) => void load().then((t) => t(message, options)),
  success: (message: string, options?: Options) =>
    void load().then((t) => t.success(message, options)),
  error: (message: string, options?: Options) => void load().then((t) => t.error(message, options)),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong";
}
