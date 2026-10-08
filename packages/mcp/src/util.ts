import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ScreenCommonsApiError } from "@screen-commons/core";

import { BridgeError } from "./bridge";

export type ToolResult = CallToolResult;
export type Content = CallToolResult["content"][number];

/** Error whose message is already written for the agent. */
export class FriendlyError extends Error {}

export const text = (value: string): Content => ({ type: "text", text: value });

export const image = (buffer: Buffer | Uint8Array, mimeType: string): Content => ({
  type: "image",
  data: Buffer.from(buffer).toString("base64"),
  mimeType,
});

export function ok(...content: Content[]): ToolResult {
  return { content };
}

export function absoluteUrl(baseUrl: string, url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, `${baseUrl}/`).href;
  } catch {
    return url;
  }
}

/** Turn any error into an actionable message for the agent. */
export function describeError(error: unknown, context: { url: string }): string {
  if (error instanceof FriendlyError) return error.message;
  if (error instanceof ScreenCommonsApiError) {
    if (error.status === 401) {
      return `Screen Commons rejected the API key (401). Create a new key at ${context.url}/settings and set SCREEN_COMMONS_API_KEY in the MCP server config.`;
    }
    if (error.status === 403) return `Forbidden (403): ${error.message}`;
    if (error.status === 404) return `Not found (404): ${error.message}`;
    if (error.status === 413)
      return `Payload too large (413): ${error.message}. Capture fewer pages per call.`;
    return `Screen Commons API error ${error.status} (${error.code}): ${error.message}`;
  }
  if (error instanceof BridgeError) {
    return `Browser extension error (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
    if (error.name === "TypeError" && /fetch failed/u.test(error.message)) {
      return `Could not reach Screen Commons at ${context.url} (${cause?.code ?? cause?.message ?? "network error"}). Is the instance running? Set SCREEN_COMMONS_URL if it lives elsewhere.`;
    }
    if (error instanceof SyntaxError) {
      return `Unexpected (non-JSON) response from ${context.url}. Is SCREEN_COMMONS_URL pointing at an Screen Commons instance?`;
    }
    return error.message;
  }
  return String(error);
}

export function failure(error: unknown, context: { url: string }): ToolResult {
  return { content: [text(describeError(error, context))], isError: true };
}

/** Run `fn` over items with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface ProgressExtra {
  _meta?: { progressToken?: string | number };
  sendNotification: (notification: {
    method: "notifications/progress";
    params: { progressToken: string | number; progress: number; total?: number; message?: string };
  }) => Promise<void>;
}

export async function reportProgress(
  extra: unknown,
  progress: number,
  total: number,
  message: string,
): Promise<void> {
  const typed = extra as ProgressExtra | undefined;
  const token = typed?._meta?.progressToken;
  if (token === undefined || !typed) return;
  await typed
    .sendNotification({
      method: "notifications/progress",
      params: { progressToken: token, progress, total, message },
    })
    .catch(() => undefined);
}
