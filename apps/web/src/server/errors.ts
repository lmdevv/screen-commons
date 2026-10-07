import type { ErrorCode } from "@open-ui/core";
import { ZodError } from "zod";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  internal: 500,
};

/** Error thrown by the service layer; mapped to `{ error: { code, message } }` by the HTTP layer. */
export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ServiceError("bad_request", message, details);
export const unauthorized = (message = "Sign in or provide an API key") =>
  new ServiceError("unauthorized", message);
export const forbidden = (message = "You don't have access to this") =>
  new ServiceError("forbidden", message);
export const notFound = (what = "Resource") => new ServiceError("not_found", `${what} not found`);

/** Parse with a zod schema, turning validation failures into `bad_request`. */
export function parseInput<T>(schema: { parse: (input: unknown) => T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) throw fromZod(error);
    throw error;
  }
}

export function fromZod(error: ZodError): ServiceError {
  const first = error.issues[0];
  const where = first?.path.length ? `${first.path.join(".")}: ` : "";
  return badRequest(`${where}${first?.message ?? "Invalid input"}`, error.issues);
}

export function toServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  if (error instanceof ZodError) return fromZod(error);
  console.error(error);
  return new ServiceError("internal", "Something went wrong");
}
