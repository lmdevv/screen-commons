import { isNotFound, isRedirect } from "@tanstack/react-router";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { toServiceError } from "./server/errors";

/**
 * Server functions (SSR loaders included) send their error message to the browser, so anything
 * other than a ServiceError leaves as the generic `internal` message with its request id.
 */
const publicErrors = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (isRedirect(error) || isNotFound(error)) throw error;
    throw new Error(toServiceError(error).message);
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })],
  functionMiddleware: [publicErrors],
}));
