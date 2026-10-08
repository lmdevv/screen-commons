import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { ALLOW_ANY_ORIGIN, isCrossOrigin } from "./server/http/cors";
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
    if (declaredTooLarge(request, limit)) {
      // Cross-origin API/MCP callers (the extension) need CORS to read the 413 envelope.
      const cors = isCrossOrigin(request) ? ALLOW_ANY_ORIGIN : undefined;
      return errorResponse(bodyTooLarge(limit), cors);
    }
    return handler.fetch(limitRequestBody(request, limit + BACKSTOP_SLACK), options);
  },
});
