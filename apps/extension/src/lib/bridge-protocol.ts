import type { BridgeMessage, BridgeMethod, BridgeMethods } from "@open-ui/core/bridge";
import { z } from "zod";

/** Max accepted inbound frame. Requests are tiny; anything larger is hostile or a bug. */
export const MAX_INBOUND_BYTES = 64 * 1024;

const httpUrl = z
  .string()
  .max(4096)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "must be an absolute http(s) URL");

const tabId = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Strict param schemas: unknown keys are rejected so nothing unexpected reaches the browser. */
export const bridgeParamSchemas = {
  navigate: z.strictObject({
    url: httpUrl,
    viewport: z.enum(["desktop", "mobile"]).optional(),
    newTab: z.boolean().optional(),
  }),
  screenshot: z.strictObject({
    fullPage: z.boolean().optional(),
    selector: z.string().trim().min(1).max(1000).optional(),
    tabId: tabId.optional(),
  }),
  extract: z.strictObject({ tabId: tabId.optional() }),
  listTabs: z.strictObject({}),
} satisfies { [M in BridgeMethod]: z.ZodType<BridgeMethods[M]["params"]> };

export const BRIDGE_METHODS = Object.keys(bridgeParamSchemas) as BridgeMethod[];

const requestId = z.string().min(1).max(128);

const envelopeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    protocol: z.number().int(),
    server: z.object({ name: z.string().max(200), version: z.string().max(100) }),
  }),
  z.object({ type: z.literal("ping"), at: z.number() }),
  z.object({ type: z.literal("pong"), at: z.number() }),
  z.object({
    type: z.literal("request"),
    id: requestId,
    method: z.string().max(64),
    params: z.unknown().optional(),
  }),
]);

export type BridgeRequest = {
  [M in BridgeMethod]: { id: string; method: M; params: BridgeMethods[M]["params"] };
}[BridgeMethod];

export type InboundMessage =
  | Extract<BridgeMessage, { type: "welcome" | "ping" | "pong" }>
  | { type: "request"; request: BridgeRequest }
  /** A request we must answer with an error (we know its id). */
  | { type: "invalid-request"; id: string; error: { message: string; code: string } }
  /** Garbage we drop. */
  | { type: "ignored"; reason: string };

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "params"}: ${issue.message}`)
    .join("; ");
}

/** Parse and strictly validate one inbound WebSocket frame from the bridge server. */
export function parseInbound(raw: unknown): InboundMessage {
  if (typeof raw !== "string") return { type: "ignored", reason: "binary frame" };
  if (raw.length > MAX_INBOUND_BYTES) return { type: "ignored", reason: "frame too large" };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { type: "ignored", reason: "invalid JSON" };
  }
  const envelope = envelopeSchema.safeParse(data);
  if (!envelope.success) {
    const id = (data as { id?: unknown } | null)?.id;
    if (
      (data as { type?: unknown } | null)?.type === "request" &&
      typeof id === "string" &&
      id.length <= 128
    ) {
      return {
        type: "invalid-request",
        id,
        error: { code: "bad_request", message: formatIssues(envelope.error) },
      };
    }
    return { type: "ignored", reason: "unknown message" };
  }
  const message = envelope.data;
  if (message.type !== "request") return message;

  if (!(BRIDGE_METHODS as string[]).includes(message.method)) {
    return {
      type: "invalid-request",
      id: message.id,
      error: { code: "unknown_method", message: `Unknown method "${message.method}"` },
    };
  }
  const method = message.method as BridgeMethod;
  const params = bridgeParamSchemas[method].safeParse(message.params ?? {});
  if (!params.success) {
    return {
      type: "invalid-request",
      id: message.id,
      error: { code: "bad_request", message: formatIssues(params.error) },
    };
  }
  return {
    type: "request",
    request: { id: message.id, method, params: params.data } as BridgeRequest,
  };
}

/** Reconnect delay: exponential from 1s, capped, with ±20% jitter. */
export function backoffDelay(
  attempt: number,
  random: () => number = Math.random,
  capMs = 30_000,
): number {
  const base = Math.min(capMs, 1000 * 2 ** Math.max(0, attempt));
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.round(base * jitter);
}
