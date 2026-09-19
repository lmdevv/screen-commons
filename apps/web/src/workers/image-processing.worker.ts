/// <reference lib="webworker" />

import {
  processImageOffscreen,
  type ImageWorkerRequest,
  type ImageWorkerResponse,
} from "../features/contribution/image-processing";

const context = self as unknown as DedicatedWorkerGlobalScope;

context.onmessage = async (event: MessageEvent<ImageWorkerRequest>) => {
  const { file, id } = event.data;
  try {
    const image = await processImageOffscreen(file, (phase, percent) => {
      const response: ImageWorkerResponse = { id, percent, phase, type: "progress" };
      context.postMessage(response);
    });
    const response: ImageWorkerResponse = { id, image, type: "complete" };
    context.postMessage(response, [image.full.bytes, image.thumbnail.bytes]);
  } catch (error) {
    const response: ImageWorkerResponse = {
      error: error instanceof Error ? error.message : "Image processing failed.",
      id,
      type: "error",
    };
    context.postMessage(response);
  }
};
