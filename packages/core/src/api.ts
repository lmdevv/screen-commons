import { z } from "zod";

import {
  LIMITS,
  categorySchema,
  elementSchema,
  flowTypeSchema,
  patternSchema,
  platformSchema,
  type AppDetail,
  type AppSummary,
  type ApiKey,
  type CaptureBatchResult,
  type Collection,
  type FlowDetail,
  type FlowSummary,
  type Screen,
  type ScreenDetail,
  type User,
} from "./schemas";
import type { Taxonomy } from "./taxonomy";

export const API_PREFIX = "/api/v1";
export const API_KEY_PREFIX = "oui_";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

const limit = z.coerce
  .number<number>()
  .int()
  .min(1)
  .max(LIMITS.maxPageSize)
  .default(LIMITS.pageSize);
const cursor = z.string().max(200).optional();
const q = z.string().trim().max(200).optional();
export const sortSchema = z.enum(["latest", "popular"]).default("latest");

export const listAppsQuerySchema = z.object({
  platform: platformSchema.optional(),
  category: categorySchema.optional(),
  q,
  sort: sortSchema,
  cursor,
  limit,
});
export type ListAppsQuery = z.input<typeof listAppsQuerySchema>;

export const listScreensQuerySchema = z.object({
  app: z.string().max(80).optional(),
  platform: platformSchema.optional(),
  pattern: patternSchema.optional(),
  element: elementSchema.optional(),
  version: z.string().max(40).optional(),
  q,
  sort: sortSchema,
  cursor,
  limit,
});
export type ListScreensQuery = z.input<typeof listScreensQuerySchema>;

export const listFlowsQuerySchema = z.object({
  app: z.string().max(80).optional(),
  platform: platformSchema.optional(),
  type: flowTypeSchema.optional(),
  q,
  cursor,
  limit,
});
export type ListFlowsQuery = z.input<typeof listFlowsQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  platform: platformSchema.optional(),
  limit: z.coerce.number<number>().int().min(1).max(30).default(8),
});
export type SearchQuery = z.input<typeof searchQuerySchema>;

export interface SearchResult {
  apps: AppSummary[];
  screens: Screen[];
  flows: FlowSummary[];
  /** Taxonomy terms whose label matches the query, for quick filters. */
  terms: { kind: "pattern" | "element" | "flowType" | "category"; slug: string; label: string }[];
}

export interface ReviewQueue {
  screens: Screen[];
  flows: FlowSummary[];
}

/** Response shapes, keyed by endpoint, so clients and handlers agree. */
export interface ApiResponses {
  me: User;
  taxonomy: Taxonomy;
  listApps: Page<AppSummary>;
  getApp: AppDetail;
  listScreens: Page<Screen>;
  getScreen: ScreenDetail;
  listFlows: Page<FlowSummary>;
  getFlow: FlowDetail;
  search: SearchResult;
  createScreen: { screen: Screen };
  captures: CaptureBatchResult;
  createFlow: { flow: FlowDetail };
  listCollections: { items: Collection[] };
  listKeys: { items: ApiKey[] };
  /** `token` is only ever returned once, at creation. */
  createKey: { key: ApiKey; token: string };
  reviewQueue: ReviewQueue;
}
