/// <reference lib="webworker" />
import { ImageValidationError, processImage } from "./image-processing";

export type WorkerRequest = { id: number; file: Blob; kind: "web" | "mobile" };
export type WorkerResponse =
  | { id: number; ok: true; result: Awaited<ReturnType<typeof processImage>> }
  | { id: number; ok: false; error: string; validation: boolean };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file, kind } = event.data;
  try {
    const result = await processImage(file, kind);
    (self as DedicatedWorkerGlobalScope).postMessage({
      id,
      ok: true,
      result,
    } satisfies WorkerResponse);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      validation: error instanceof ImageValidationError,
    } satisfies WorkerResponse);
  }
};
