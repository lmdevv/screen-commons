import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { ALLOW_ANY_ORIGIN, isCrossOrigin } from "./server/http/cors";
import {
  bodyLimitFor,
  bodyTooLarge,
  declaredTooLarge,
  drainBody,
  limitRequestBody,
} from "./server/http/limits";
import { withD1RowCount } from "./server/env";
import { errorResponse } from "./server/http/responses";

/** Route handlers count bytes themselves and answer a clean 413; this stream cap is a backstop. */
const BACKSTOP_SLACK = 64 * 1024;

export default createServerEntry({
  fetch: (request, options) => withD1RowCount(request, () => fetchWithBodyLimits(request, options)),
});

/**
 * Enforces request body limits for every route (server functions included) by counting streamed
 * bytes, then hands off to TanStack Start. Whatever answers early, the rest of the body is read
 * before the answer goes out.
 */
async function fetchWithBodyLimits(request: Request, options: Parameters<typeof handler.fetch>[1]) {
  if (!request.body) return handler.fetch(request, options);
  const limit = bodyLimitFor(new URL(request.url).pathname);
  if (declaredTooLarge(request, limit)) {
    // Cross-origin API/MCP callers (the extension) need CORS to read the 413 envelope.
    const cors = isCrossOrigin(request) ? ALLOW_ANY_ORIGIN : undefined;
    await drainBody(request);
    return errorResponse(bodyTooLarge(limit), cors);
  }
  const limited = limitRequestBody(request, limit + BACKSTOP_SLACK);
  const response = await handler.fetch(limited.request, options);
  await limited.drain();
  return response;
}
