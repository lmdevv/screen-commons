import type { CreateFlowInput, CreateScreenInput, FlowDetail, Screen } from "@screen-commons/core";

/**
 * `fetch`-compatible adapter over XMLHttpRequest, so the core API client can report upload
 * progress (fetch has no upload progress events).
 */
export function progressFetch(onProgress: (fraction: number) => void): typeof fetch {
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(init?.method ?? "GET", String(input));
      xhr.timeout = 120_000;
      xhr.ontimeout = () => reject(new TypeError("Upload timed out. Retry to resume."));
      xhr.withCredentials = init?.credentials === "include";
      new Headers(init?.headers).forEach((value, key) => xhr.setRequestHeader(key, value));
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
      xhr.onload = () => {
        onProgress(1);
        resolve(
          new Response(xhr.status === 204 ? null : xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: {
              "content-type": xhr.getResponseHeader("content-type") ?? "application/json",
            },
          }),
        );
      };
      xhr.onerror = () => reject(new TypeError("Network error — check your connection"));
      xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
      const abort = () => xhr.abort();
      if (init?.signal?.aborted) {
        reject(new DOMException("Upload paused", "AbortError"));
        return;
      }
      init?.signal?.addEventListener("abort", abort, { once: true });
      xhr.addEventListener("loadend", () => init?.signal?.removeEventListener("abort", abort));
      xhr.send((init?.body as XMLHttpRequestBodyInit | null | undefined) ?? null);
    });
}

/** The core client pulls in zod (via the API schema module): load it only when submitting. */
async function client(onProgress: (fraction: number) => void, signal?: AbortSignal) {
  const { createScreenCommonsClient } = await import("@screen-commons/core/client");
  return createScreenCommonsClient({
    baseUrl: location.origin,
    fetch: (input, init) => progressFetch(onProgress)(input, { ...init, signal }),
  });
}

export async function uploadScreen(
  input: { image: Blob; thumbnail: Blob; meta: CreateScreenInput },
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Screen> {
  const api = await client(onProgress, signal);
  const { screen } = await api.createScreen(input);
  return screen;
}

export async function createFlow(
  input: CreateFlowInput,
  signal?: AbortSignal,
): Promise<FlowDetail> {
  const api = await client(() => undefined, signal);
  const { flow } = await api.createFlow(input);
  return flow;
}
