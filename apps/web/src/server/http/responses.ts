import type { ApiErrorBody } from "@screen-commons/core";

import { toServiceError } from "../errors";

/** Any thrown value as the `{ error: { code, message } }` envelope, with the status for its code. */
export function errorResponse(error: unknown, headers?: HeadersInit): Response {
  const failure = toServiceError(error);
  const body: ApiErrorBody = { error: { code: failure.code, message: failure.message } };
  if (failure.details !== undefined && failure.code === "bad_request") {
    body.error.details = failure.details;
  }
  return Response.json(body, { status: failure.status, headers });
}

export const noContent = () => new Response(null, { status: 204 });
