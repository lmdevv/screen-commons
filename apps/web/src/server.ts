import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import {
  bodyLimitFor,
  bodyTooLarge,
  declaredTooLarge,
  limitRequestBody,
} from "./server/http/limits";
import { errorResponse } from "./server/http/responses";

/** Route handlers count bytes themselves and answer a clean 413; this stream cap is a backstop. */
const BACKSTOP_SLACK = 64 * 1024;

/**
 * Worker entry: enforces request body limits for every route (server functions included) by
 * counting streamed bytes, then hands off to TanStack Start.
 */
export default createServerEntry({
  fetch(request, options) {
    if (!request.body) return handler.fetch(request, options);
    const limit = bodyLimitFor(new URL(request.url).pathname);
    if (declaredTooLarge(request, limit)) return errorResponse(bodyTooLarge(limit));
    return handler.fetch(limitRequestBody(request, limit + BACKSTOP_SLACK), options);
  },
});
