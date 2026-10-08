import { API_PREFIX } from "@screen-commons/core";
import { createMiddleware } from "@tanstack/react-start";

import { ServiceError } from "../errors";
import { requestPrincipal } from "./auth";
import { isCrossOrigin, preflightResponse } from "./cors";
import { errorResponse } from "./responses";

/**
 * Unknown paths, and methods an endpoint doesn't support, both get this JSON 404 (the `ANY`
 * handler of every API route).
 */
export const noSuchEndpoint = () => {
  throw new ServiceError("not_found", "No such endpoint");
};

/**
 * REST API (`/api/v1/*`) request middleware, applied by the `/api/v1` layout route to every
 * endpoint below it: answers CORS preflights, resolves the principal (any origin may call with a
 * bearer key; cookies only count for same-origin requests), turns thrown errors into the JSON
 * error envelope and marks every response `private, no-store`.
 */
export const apiMiddleware = createMiddleware().server(async ({ request, pathname, next }) => {
  if (request.method === "OPTIONS") return preflightResponse();
  try {
    // One URL per endpoint, as the Hono router had it. TanStack matches case-insensitively and
    // ignores a trailing slash, so endpoint routes set `caseSensitive` (their own segments) and
    // the prefix and trailing slash are checked here.
    if (!pathname.startsWith(API_PREFIX) || pathname.endsWith("/")) noSuchEndpoint();
    const result = await next({ context: { principal: await requestPrincipal(request) } });
    withApiHeaders(request, result.response);
    return result;
  } catch (error) {
    return withApiHeaders(request, errorResponse(error));
  }
});

function withApiHeaders(request: Request, response: Response): Response {
  if (isCrossOrigin(request)) response.headers.set("access-control-allow-origin", "*");
  response.headers.set("cache-control", "private, no-store");
  return response;
}

/** Query string as a record; the first value wins when a key repeats. */
export function query(request: Request): Record<string, string> {
  const params: Record<string, string> = Object.create(null);
  for (const [key, value] of new URL(request.url).searchParams) params[key] ??= value;
  return params;
}
