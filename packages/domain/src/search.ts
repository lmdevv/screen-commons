import { z } from "zod";

import { entityIdSchema, isoDateSchema, paginationSchema, slugSchema } from "./common.ts";
import { platformSchema } from "./content.ts";

export const searchResultTypeSchema = z.enum(["product", "flow", "screen"]);

export const searchFiltersSchema = paginationSchema.extend({
  query: z.string().trim().max(200).default(""),
  productId: entityIdSchema.optional(),
  platform: platformSchema.optional(),
  resultTypes: z.array(searchResultTypeSchema).max(3).default([]),
  tags: z.array(slugSchema).max(20).default([]),
  capturedFrom: isoDateSchema.optional(),
  capturedTo: isoDateSchema.optional(),
  versionId: entityIdSchema.optional(),
});

const searchResultBase = {
  id: entityIdSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(4_000).nullable(),
  score: z.number(),
  thumbnailScreenId: entityIdSchema.nullable(),
};

export const searchResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("product"), productId: entityIdSchema, ...searchResultBase }),
  z.object({
    type: z.literal("flow"),
    productId: entityIdSchema,
    productVersionId: entityIdSchema,
    ...searchResultBase,
  }),
  z.object({
    type: z.literal("screen"),
    productId: entityIdSchema,
    productVersionId: entityIdSchema,
    ...searchResultBase,
  }),
]);

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResultType = z.infer<typeof searchResultTypeSchema>;
