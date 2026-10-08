import {
  API_PREFIX,
  type ApiErrorBody,
  type ApiResponses,
  type BackfillDisplayInput,
  type ErrorCode,
  type ListAppsQuery,
  type ListFlowsQuery,
  type ListScreensQuery,
  type SearchQuery,
} from "./api";
import type { CaptureBatchInput, CreateFlowInput, CreateScreenInput } from "./schemas";

export class ScreenCommonsApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;
  /** Seconds to wait before retrying (`Retry-After`), for `unavailable` and `rate_limited`. */
  readonly retryAfter: number | null;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ScreenCommonsApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

export interface ScreenCommonsClientOptions {
  /** Instance origin, e.g. `http://localhost:5173` or `https://screencommons.example.com`. */
  baseUrl: string;
  /** `sc_…` API key. Omit to rely on cookies (same-origin browser usage). */
  apiKey?: string;
  fetch?: typeof fetch;
  /** Extra headers on every request (e.g. a client identifier). */
  headers?: Record<string, string>;
}

export type SaveKind = "screen" | "flow" | "app";

type QueryValue = string | number | boolean | undefined | null;

function toQuery(params: object = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, QueryValue][]) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Typed client for the Screen Commons REST API. Works in browsers, Workers, Node and extensions. */
export function createScreenCommonsClient(options: ScreenCommonsClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/u, "");
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function request<T>(method: string, path: string, body?: BodyInit | object): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json", ...options.headers };
    if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData || typeof body === "string" || body instanceof Blob) {
      payload = body;
    } else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await doFetch(`${baseUrl}${API_PREFIX}${path}`, {
      method,
      headers,
      body: payload,
      credentials: options.apiKey ? "omit" : "include",
    });
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const error = (data as Partial<ApiErrorBody> | undefined)?.error;
      throw new ScreenCommonsApiError(
        response.status,
        error?.code ?? "internal",
        error?.message ?? `Request failed with ${response.status}`,
        error?.details,
        Number(response.headers.get("retry-after")) || null,
      );
    }
    return data as T;
  }

  return {
    baseUrl,
    me: () => request<ApiResponses["me"]>("GET", "/me"),
    taxonomy: () => request<ApiResponses["taxonomy"]>("GET", "/taxonomy"),

    listApps: (query: ListAppsQuery = {}) =>
      request<ApiResponses["listApps"]>("GET", `/apps${toQuery(query)}`),
    getApp: (slug: string) =>
      request<ApiResponses["getApp"]>("GET", `/apps/${encodeURIComponent(slug)}`),

    listScreens: (query: ListScreensQuery = {}) =>
      request<ApiResponses["listScreens"]>("GET", `/screens${toQuery(query)}`),
    getScreen: (id: string) =>
      request<ApiResponses["getScreen"]>("GET", `/screens/${encodeURIComponent(id)}`),

    listFlows: (query: ListFlowsQuery = {}) =>
      request<ApiResponses["listFlows"]>("GET", `/flows${toQuery(query)}`),
    getFlow: (id: string) =>
      request<ApiResponses["getFlow"]>("GET", `/flows/${encodeURIComponent(id)}`),

    search: (query: SearchQuery) =>
      request<ApiResponses["search"]>("GET", `/search${toQuery(query)}`),

    /** Multipart upload of one screen with a client-generated thumbnail. */
    createScreen: (input: { image: Blob; thumbnail: Blob; meta: CreateScreenInput }) => {
      const form = new FormData();
      form.set("image", input.image);
      form.set("thumbnail", input.thumbnail);
      form.set("meta", JSON.stringify(input.meta));
      return request<ApiResponses["createScreen"]>("POST", "/screens", form);
    },
    /** JSON batch upload (extension, MCP, seed). */
    captures: (input: CaptureBatchInput) =>
      request<ApiResponses["captures"]>("POST", "/captures", input),
    createFlow: (input: CreateFlowInput) =>
      request<ApiResponses["createFlow"]>("POST", "/flows", input),

    listCollections: () => request<ApiResponses["listCollections"]>("GET", "/collections"),
    createCollection: (name: string) =>
      request<ApiResponses["createCollection"]>("POST", "/collections", { name }),
    getCollection: (id: string) =>
      request<ApiResponses["getCollection"]>("GET", `/collections/${encodeURIComponent(id)}`),
    renameCollection: (id: string, name: string) =>
      request<ApiResponses["createCollection"]>("PATCH", `/collections/${encodeURIComponent(id)}`, {
        name,
      }),
    deleteCollection: (id: string) =>
      request<void>("DELETE", `/collections/${encodeURIComponent(id)}`),
    save: (kind: SaveKind, id: string, collectionId?: string) =>
      request<void>("POST", "/saves", { kind, id, collectionId }),
    unsave: (kind: SaveKind, id: string, collectionId?: string) =>
      request<void>("DELETE", `/saves${toQuery({ kind, id, collectionId })}`),

    listKeys: () => request<ApiResponses["listKeys"]>("GET", "/keys"),
    createKey: (name: string) => request<ApiResponses["createKey"]>("POST", "/keys", { name }),
    revokeKey: (id: string) => request<void>("DELETE", `/keys/${encodeURIComponent(id)}`),

    reviewQueue: () => request<ApiResponses["reviewQueue"]>("GET", "/review"),
    review: (
      kind: "screen" | "flow",
      id: string,
      decision: "approve" | "reject",
      reason?: string,
    ) => request<void>("POST", `/review/${kind}/${encodeURIComponent(id)}`, { decision, reason }),
    backfillDisplay: (input: BackfillDisplayInput = {}) =>
      request<ApiResponses["backfillDisplay"]>("POST", "/admin/media/backfill", input),
  };
}

export type ScreenCommonsClient = ReturnType<typeof createScreenCommonsClient>;
