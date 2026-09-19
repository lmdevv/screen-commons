import { z } from "zod";

import {
  entityIdSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nullableUrlSchema,
  sha256Schema,
  slugSchema,
  urlSchema,
} from "./common.ts";

export const userRoleSchema = z.enum([
  "contributor",
  "trusted_contributor",
  "reviewer",
  "administrator",
]);
export const userStatusSchema = z.enum(["active", "suspended", "deleted"]);
export const platformSchema = z.enum(["web_desktop", "web_mobile", "web_responsive"]);
export const contentVisibilitySchema = z.enum([
  "private",
  "in_review",
  "published",
  "hidden",
  "deleted",
]);
export const assetVariantKindSchema = z.enum(["full", "thumbnail"]);
export const imageMimeTypeSchema = z.enum(["image/webp"]);
export const rightsStatusSchema = z.enum([
  "unverified",
  "contributor_attested",
  "permission_granted",
  "restricted",
]);

const auditFields = {
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  createdById: entityIdSchema.nullable(),
  updatedById: entityIdSchema.nullable(),
};

export const userSchema = z.object({
  id: entityIdSchema,
  clerkUserId: z.string().trim().min(3).max(255),
  displayName: z.string().trim().min(1).max(100),
  primaryEmail: z.email().nullable(),
  avatarUrl: nullableUrlSchema,
  role: userRoleSchema,
  status: userStatusSchema,
  ...auditFields,
});

export const productSchema = z.object({
  id: entityIdSchema,
  slug: slugSchema,
  name: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  description: z.string().trim().max(2_000).nullable(),
  websiteUrl: nullableUrlSchema,
  logoUrl: nullableUrlSchema,
  visibility: contentVisibilitySchema,
  publishedAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  ...auditFields,
});

export const productVersionSchema = z.object({
  id: entityIdSchema,
  productId: entityIdSchema,
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2_000).nullable(),
  releasedOn: isoDateSchema.nullable(),
  capturedAt: isoDateTimeSchema,
  visibility: contentVisibilitySchema,
  publishedAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  ...auditFields,
});

export const screenSchema = z.object({
  id: entityIdSchema,
  productVersionId: entityIdSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4_000).nullable(),
  platform: platformSchema,
  sourceUrl: nullableUrlSchema,
  capturedAt: isoDateTimeSchema,
  visibleText: z.string().max(20_000).nullable(),
  sha256: sha256Schema,
  perceptualHash: z.string().min(16).max(128).nullable(),
  isStandalone: z.boolean(),
  rightsStatus: rightsStatusSchema,
  visibility: contentVisibilitySchema,
  publishedAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  ...auditFields,
});

export const flowSchema = z.object({
  id: entityIdSchema,
  productVersionId: entityIdSchema,
  slug: slugSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4_000).nullable(),
  platform: platformSchema,
  sourceUrl: nullableUrlSchema,
  capturedAt: isoDateTimeSchema,
  rightsStatus: rightsStatusSchema,
  visibility: contentVisibilitySchema,
  publishedAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  ...auditFields,
});

export const flowScreenSchema = z.object({
  id: entityIdSchema,
  flowId: entityIdSchema,
  screenId: entityIdSchema,
  position: z.number().int().min(0).max(49),
  caption: z.string().trim().max(500).nullable(),
  ...auditFields,
});

export const tagSchema = z.object({
  id: entityIdSchema,
  slug: slugSchema,
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).nullable(),
  ...auditFields,
});

export const assetVariantSchema = z
  .object({
    id: entityIdSchema,
    screenId: entityIdSchema,
    kind: assetVariantKindSchema,
    objectKey: z.string().min(1).max(1_024),
    mimeType: imageMimeTypeSchema,
    byteSize: z
      .number()
      .int()
      .positive()
      .max(15 * 1024 * 1024),
    width: z.number().int().positive().max(20_000),
    height: z.number().int().positive().max(20_000),
    sha256: sha256Schema,
    ...auditFields,
  })
  .refine((asset) => asset.width * asset.height <= 20_000_000, {
    message: "Image dimensions may not exceed 20 megapixels",
    path: ["width"],
  });

export const createProductInputSchema = productSchema.pick({
  name: true,
  aliases: true,
  description: true,
  websiteUrl: true,
  logoUrl: true,
});

export const screenMetadataInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4_000).nullable().default(null),
  sourceUrl: urlSchema.nullable().default(null),
  capturedAt: isoDateTimeSchema,
  platform: platformSchema,
  visibleText: z.string().max(20_000).nullable().default(null),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type User = z.infer<typeof userSchema>;
export type Product = z.infer<typeof productSchema>;
export type ProductVersion = z.infer<typeof productVersionSchema>;
export type Screen = z.infer<typeof screenSchema>;
export type Flow = z.infer<typeof flowSchema>;
export type FlowScreen = z.infer<typeof flowScreenSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type AssetVariant = z.infer<typeof assetVariantSchema>;
export type Platform = z.infer<typeof platformSchema>;
export type ContentVisibility = z.infer<typeof contentVisibilitySchema>;
export type RightsStatus = z.infer<typeof rightsStatusSchema>;
export type ScreenMetadataInput = z.infer<typeof screenMetadataInputSchema>;
