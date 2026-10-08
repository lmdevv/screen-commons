import { z } from "zod";

import {
  CATEGORY_SLUGS,
  ELEMENT_SLUGS,
  FLOW_TYPE_SLUGS,
  PATTERN_SLUGS,
  PLATFORM_SLUGS,
} from "./taxonomy";
import { ACCEPTED_IMAGE_TYPES, LIMITS } from "./limits";

export { ACCEPTED_IMAGE_TYPES, LIMITS } from "./limits";

export const platformSchema = z.enum(PLATFORM_SLUGS);
export const categorySchema = z.enum(CATEGORY_SLUGS);
export const patternSchema = z.enum(PATTERN_SLUGS);
export const elementSchema = z.enum(ELEMENT_SLUGS);
export const flowTypeSchema = z.enum(FLOW_TYPE_SLUGS);
export const statusSchema = z.enum(["published", "pending", "rejected"]);
export const sourceSchema = z.enum(["upload", "extension", "mcp", "seed"]);
export const roleSchema = z.enum(["admin", "member"]);
export const imageTypeSchema = z.enum(ACCEPTED_IMAGE_TYPES);

export type Status = z.infer<typeof statusSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Role = z.infer<typeof roleSchema>;

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "lowercase letters, digits and dashes");
const id = z.string().min(1).max(64);
const isoDate = z.string();
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/iu);

// ---------------------------------------------------------------------------------------------
// Entities (API representations)
// ---------------------------------------------------------------------------------------------

export const userSchema = z.object({
  id,
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  role: roleSchema,
  createdAt: isoDate,
});
export type User = z.infer<typeof userSchema>;

export const appSummarySchema = z.object({
  id,
  slug,
  name: z.string(),
  tagline: z.string().nullable(),
  platform: platformSchema,
  category: categorySchema.nullable(),
  websiteUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
  accentColor: hexColor.nullable(),
  screenCount: z.number().int(),
  flowCount: z.number().int(),
  /** Up to 3 most recent screen thumbnails for app cards. */
  previews: z.array(z.object({ id, thumbUrl: z.string(), width: z.number(), height: z.number() })),
  status: statusSchema,
  updatedAt: isoDate,
});
export type AppSummary = z.infer<typeof appSummarySchema>;

export const appDetailSchema = appSummarySchema.extend({
  description: z.string().nullable(),
  versions: z.array(z.string()),
  patterns: z.array(z.object({ slug: z.string(), count: z.number().int() })),
  elements: z.array(z.object({ slug: z.string(), count: z.number().int() })),
  createdAt: isoDate,
});
export type AppDetail = z.infer<typeof appDetailSchema>;

export const appRefSchema = appSummarySchema.pick({
  id: true,
  slug: true,
  name: true,
  platform: true,
  logoUrl: true,
  accentColor: true,
});
export type AppRef = z.infer<typeof appRefSchema>;

export const screenSchema = z.object({
  id,
  app: appRefSchema,
  title: z.string().nullable(),
  imageUrl: z.string(),
  thumbUrl: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  bytes: z.number().int(),
  sourceUrl: z.string().nullable(),
  patterns: z.array(patternSchema),
  elements: z.array(elementSchema),
  tags: z.array(z.string()),
  version: z.string().nullable(),
  dominantColor: hexColor.nullable(),
  status: statusSchema,
  source: sourceSchema,
  saved: z.boolean(),
  capturedAt: isoDate,
  createdAt: isoDate,
});
export type Screen = z.infer<typeof screenSchema>;

export const screenDetailSchema = screenSchema.extend({
  /** Neighbours within the same app (ordered by capture), for ←/→ navigation. */
  previousId: id.nullable(),
  nextId: id.nullable(),
  /** Flows this screen belongs to. */
  flows: z.array(z.object({ id, name: z.string(), position: z.number().int() })),
});
export type ScreenDetail = z.infer<typeof screenDetailSchema>;

export const flowStepSchema = z.object({
  position: z.number().int(),
  label: z.string().nullable(),
  screen: screenSchema,
});
export type FlowStep = z.infer<typeof flowStepSchema>;

export const flowSummarySchema = z.object({
  id,
  app: appRefSchema,
  name: z.string(),
  type: flowTypeSchema.nullable(),
  description: z.string().nullable(),
  stepCount: z.number().int(),
  previews: z.array(z.object({ id, thumbUrl: z.string(), width: z.number(), height: z.number() })),
  status: statusSchema,
  saved: z.boolean(),
  createdAt: isoDate,
});
export type FlowSummary = z.infer<typeof flowSummarySchema>;

export const flowDetailSchema = flowSummarySchema.extend({
  steps: z.array(flowStepSchema),
});
export type FlowDetail = z.infer<typeof flowDetailSchema>;

export const collectionSchema = z.object({
  id,
  name: z.string(),
  isDefault: z.boolean(),
  itemCount: z.number().int(),
  previews: z.array(z.object({ thumbUrl: z.string() })),
  createdAt: isoDate,
});
export type Collection = z.infer<typeof collectionSchema>;

export const apiKeySchema = z.object({
  id,
  name: z.string(),
  prefix: z.string(),
  lastUsedAt: isoDate.nullable(),
  createdAt: isoDate,
});
export type ApiKey = z.infer<typeof apiKeySchema>;

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

/** Identifies an existing app by slug, or describes one to create (upsert by slug/website). */
export const appInputSchema = z.object({
  slug: slug.optional(),
  name: z.string().trim().min(1).max(80),
  websiteUrl: z.url().optional(),
  platform: platformSchema.default("web"),
  category: categorySchema.optional(),
  tagline: z.string().trim().max(140).optional(),
  description: z.string().trim().max(2000).optional(),
});
export type AppInput = z.input<typeof appInputSchema>;

export const screenMetaSchema = z.object({
  title: z.string().trim().max(160).optional(),
  sourceUrl: z.url().optional(),
  patterns: z.array(patternSchema).max(8).default([]),
  elements: z.array(elementSchema).max(24).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(16).default([]),
  version: z.string().trim().max(40).optional(),
  dominantColor: hexColor.optional(),
  capturedAt: isoDate.optional(),
  /** Visible text on the screen (DOM innerText or OCR), indexed for "text in screenshot" search. */
  text: z.string().max(20_000).optional(),
  width: z.number().int().positive().max(LIMITS.maxImageWidth),
  height: z.number().int().positive().max(LIMITS.maxImageHeight),
});
export type ScreenMeta = z.input<typeof screenMetaSchema>;

/** `meta` part of the multipart POST /api/v1/screens. */
export const createScreenInputSchema = screenMetaSchema.extend({
  app: appInputSchema,
  source: sourceSchema.default("upload"),
});
export type CreateScreenInput = z.input<typeof createScreenInputSchema>;

/** One screen inside a JSON capture batch; images are base64 (no data: prefix). */
export const captureScreenSchema = screenMetaSchema.extend({
  image: z.object({ type: imageTypeSchema, base64: z.string().min(1) }),
  thumbnail: z.object({ type: imageTypeSchema, base64: z.string().min(1) }),
  /** Flow step label when the batch creates a flow. */
  stepLabel: z.string().trim().max(80).optional(),
});
export type CaptureScreen = z.input<typeof captureScreenSchema>;

export const captureBatchInputSchema = z.object({
  app: appInputSchema,
  /** Optional app logo (favicon/apple-touch-icon), base64 PNG/WebP/JPEG. */
  logo: z.object({ type: imageTypeSchema, base64: z.string().min(1) }).optional(),
  screens: z.array(captureScreenSchema).min(1).max(LIMITS.maxScreensPerBatch),
  /** When present, the screens (in order) become a flow. */
  flow: z
    .object({
      name: z.string().trim().min(1).max(80),
      type: flowTypeSchema.optional(),
      description: z.string().trim().max(500).optional(),
    })
    .optional(),
  source: sourceSchema.default("extension"),
});
export type CaptureBatchInput = z.input<typeof captureBatchInputSchema>;

export const captureBatchResultSchema = z.object({
  app: appRefSchema,
  screens: z.array(z.object({ id, status: statusSchema, url: z.string() })),
  flow: z.object({ id, status: statusSchema, url: z.string() }).nullable(),
});
export type CaptureBatchResult = z.infer<typeof captureBatchResultSchema>;

export const createFlowInputSchema = z.object({
  appId: id,
  name: z.string().trim().min(1).max(80),
  type: flowTypeSchema.optional(),
  description: z.string().trim().max(500).optional(),
  steps: z
    .array(z.object({ screenId: id, label: z.string().trim().max(80).optional() }))
    .min(2)
    .max(LIMITS.maxFlowSteps),
});
export type CreateFlowInput = z.input<typeof createFlowInputSchema>;

export const createApiKeyInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});
