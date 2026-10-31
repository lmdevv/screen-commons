import { ScreenCommonsApiError } from "@screen-commons/core";

/** A failure with a stable code, for reports and the CLI's `code: message` errors. */
export class CodedError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CodedError";
    this.code = code;
  }
}

export interface ErrorInfo {
  code: string;
  message: string;
}

export function errorInfo(error: unknown, url?: string): ErrorInfo {
  if (error instanceof CodedError || error instanceof ScreenCommonsApiError) {
    return { code: error.code, message: error.message };
  }
  const instance = url ? ` at ${url}` : "";
  if (error instanceof SyntaxError) {
    return { code: "bad_response", message: `Unexpected non-JSON response${instance}` };
  }
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
    if (error.name === "TimeoutError") {
      return { code: "network", message: `Timed out waiting for a response${instance}` };
    }
    if (error.name === "TypeError" && /fetch failed/u.test(error.message)) {
      const reason = cause?.code ?? cause?.message ?? "network error";
      return { code: "network", message: `Could not reach Screen Commons${instance} (${reason})` };
    }
    return { code: "internal", message: error.message };
  }
  return { code: "internal", message: String(error) };
}
