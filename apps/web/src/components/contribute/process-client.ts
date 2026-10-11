import {
  ImageValidationError,
  processImage as processOnMainThread,
  type ProcessedImage,
} from "./image-processing";
import type { WorkerRequest, WorkerResponse } from "./image.worker";

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (value: ProcessedImage) => void; reject: (error: Error) => void }
>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    worker = null;
    return worker;
  }
  try {
    worker = new Worker(new URL("./image.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.ok) job.resolve(data.result);
      else
        job.reject(data.validation ? new ImageValidationError(data.error) : new Error(data.error));
    };
    worker.onerror = () => {
      // Worker failed to start (CSP, old browser): finish queued jobs on the main thread.
      worker?.terminate();
      worker = null;
      for (const [id, job] of pending) {
        pending.delete(id);
        job.reject(new Error("Worker unavailable"));
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Process an image off the main thread when possible. */
function processNow(file: Blob, kind: "web" | "mobile"): Promise<ProcessedImage> {
  const w = getWorker();
  if (!w) return processOnMainThread(file, kind);
  const id = nextId++;
  return new Promise<ProcessedImage>((resolve, reject) => {
    const timer = setTimeout(() => {
      w.terminate();
      worker = null;
      for (const [jobId, job] of pending) {
        pending.delete(jobId);
        // The slow image itself fails outright: redoing it on the main thread would freeze the tab.
        job.reject(
          jobId === id
            ? new ImageValidationError("Took too long to process")
            : new Error("Image worker restarted"),
        );
      }
    }, 45_000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    try {
      w.postMessage({ id, file, kind } satisfies WorkerRequest);
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  }).catch((error: unknown) => {
    if (error instanceof ImageValidationError) throw error;
    return processOnMainThread(file, kind);
  });
}

// Bound decoded bitmap/canvas memory even when a whole batch arrives at once.
let active = 0;
const queue: (() => void)[] = [];
export function processImage(file: Blob, kind: "web" | "mobile"): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const start = () => {
      active++;
      void processNow(file, kind)
        .then(resolve, reject)
        .finally(() => {
          active--;
          queue.shift()?.();
        });
    };
    if (active < 2) start();
    else queue.push(start);
  });
}
