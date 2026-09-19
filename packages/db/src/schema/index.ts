import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const USER_ROLES = [
  "contributor",
  "trusted_contributor",
  "reviewer",
  "administrator",
] as const;
export const USER_STATUSES = ["active", "suspended", "deleted"] as const;
export const PLATFORMS = ["web_desktop", "web_mobile", "web_responsive"] as const;
export const VISIBILITIES = ["private", "in_review", "published", "hidden", "deleted"] as const;
export const RIGHTS_STATUSES = [
  "unverified",
  "contributor_attested",
  "permission_granted",
  "restricted",
] as const;
export const SUBMISSION_KINDS = ["standalone_screen", "flow"] as const;
export const SUBMISSION_STATES = [
  "draft",
  "uploading",
  "submitted",
  "automated_review",
  "awaiting_human",
  "processing_failed",
  "changes_requested",
  "rejected",
  "published",
  "removal_pending",
  "deleted",
] as const;
export const MODERATION_OUTCOMES = ["clean", "warning", "blocked", "error"] as const;
export const DUPLICATE_OUTCOMES = ["none", "exact", "perceptual_match"] as const;

const now = sql`(unixepoch() * 1000)`;
const auditColumns = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  createdById: text("created_by_id"),
  updatedById: text("updated_by_id"),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    displayName: text("display_name").notNull(),
    primaryEmail: text("primary_email"),
    avatarUrl: text("avatar_url"),
    role: text("role", { enum: USER_ROLES }).notNull().default("contributor"),
    status: text("status", { enum: USER_STATUSES }).notNull().default("active"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("users_clerk_user_id_unique").on(table.clerkUserId),
    index("users_role_status_idx").on(table.role, table.status),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    description: text("description"),
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("private"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_visibility_name_idx").on(table.visibility, table.name),
  ],
);

export const productVersions = sqliteTable(
  "product_versions",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    description: text("description"),
    releasedOn: text("released_on"),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("private"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("product_versions_product_label_unique").on(table.productId, table.label),
    index("product_versions_product_captured_idx").on(table.productId, table.capturedAt),
  ],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: SUBMISSION_KINDS }).notNull(),
    state: text("state", { enum: SUBMISSION_STATES }).notNull().default("draft"),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    productVersionId: text("product_version_id").references(() => productVersions.id, {
      onDelete: "set null",
    }),
    flowName: text("flow_name"),
    platform: text("platform", { enum: PLATFORMS }).notNull(),
    rightsStatus: text("rights_status", { enum: RIGHTS_STATUSES }).notNull().default("unverified"),
    pipelineVersion: text("pipeline_version").notNull().default("v1"),
    correlationId: text("correlation_id").notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    removalRequestedAt: integer("removal_requested_at", { mode: "timestamp_ms" }),
    deletionDueAt: integer("deletion_due_at", { mode: "timestamp_ms" }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("submissions_correlation_id_unique").on(table.correlationId),
    index("submissions_owner_updated_idx").on(table.ownerId, table.updatedAt),
    index("submissions_state_updated_idx").on(table.state, table.updatedAt),
  ],
);

export const screens = sqliteTable(
  "screens",
  {
    id: text("id").primaryKey(),
    productVersionId: text("product_version_id")
      .notNull()
      .references(() => productVersions.id, { onDelete: "cascade" }),
    submissionId: text("submission_id").references(() => submissions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    platform: text("platform", { enum: PLATFORMS }).notNull(),
    sourceUrl: text("source_url"),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
    visibleText: text("visible_text"),
    sha256: text("sha256").notNull(),
    perceptualHash: text("perceptual_hash"),
    isStandalone: integer("is_standalone", { mode: "boolean" }).notNull().default(false),
    rightsStatus: text("rights_status", { enum: RIGHTS_STATUSES }).notNull().default("unverified"),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("private"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("screens_sha256_unique").on(table.sha256),
    index("screens_version_visibility_idx").on(table.productVersionId, table.visibility),
    index("screens_platform_captured_idx").on(table.platform, table.capturedAt),
    index("screens_perceptual_hash_idx").on(table.perceptualHash),
  ],
);

export const flows = sqliteTable(
  "flows",
  {
    id: text("id").primaryKey(),
    productVersionId: text("product_version_id")
      .notNull()
      .references(() => productVersions.id, { onDelete: "cascade" }),
    submissionId: text("submission_id").references(() => submissions.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    platform: text("platform", { enum: PLATFORMS }).notNull(),
    sourceUrl: text("source_url"),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
    rightsStatus: text("rights_status", { enum: RIGHTS_STATUSES }).notNull().default("unverified"),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("private"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("flows_version_slug_unique").on(table.productVersionId, table.slug),
    index("flows_version_visibility_idx").on(table.productVersionId, table.visibility),
    index("flows_platform_captured_idx").on(table.platform, table.capturedAt),
  ],
);

export const flowScreens = sqliteTable(
  "flow_screens",
  {
    id: text("id").primaryKey(),
    flowId: text("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    screenId: text("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    caption: text("caption"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("flow_screens_flow_position_unique").on(table.flowId, table.position),
    index("flow_screens_screen_idx").on(table.screenId),
    check("flow_screens_position_check", sql`${table.position} >= 0 AND ${table.position} < 50`),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("tags_slug_unique").on(table.slug),
    uniqueIndex("tags_name_unique").on(table.name),
  ],
);

export const screenTags = sqliteTable(
  "screen_tags",
  {
    screenId: text("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    createdById: text("created_by_id"),
  },
  (table) => [
    primaryKey({ columns: [table.screenId, table.tagId] }),
    index("screen_tags_tag_idx").on(table.tagId),
  ],
);

export const assetVariants = sqliteTable(
  "asset_variants",
  {
    id: text("id").primaryKey(),
    screenId: text("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["full", "thumbnail"] }).notNull(),
    objectKey: text("object_key").notNull(),
    mimeType: text("mime_type", { enum: ["image/webp"] })
      .notNull()
      .default("image/webp"),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sha256: text("sha256").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("asset_variants_screen_kind_unique").on(table.screenId, table.kind),
    uniqueIndex("asset_variants_object_key_unique").on(table.objectKey),
    check(
      "asset_variants_byte_size_check",
      sql`${table.byteSize} > 0 AND ${table.byteSize} <= 15728640`,
    ),
    check("asset_variants_dimensions_check", sql`${table.width} > 0 AND ${table.height} > 0`),
  ],
);

export const submissionItems = sqliteTable(
  "submission_items",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    sourceUrl: text("source_url"),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
    visibleText: text("visible_text"),
    fullObjectKey: text("full_object_key").notNull(),
    fullByteSize: integer("full_byte_size").notNull(),
    fullWidth: integer("full_width").notNull(),
    fullHeight: integer("full_height").notNull(),
    fullSha256: text("full_sha256").notNull(),
    thumbnailObjectKey: text("thumbnail_object_key").notNull(),
    thumbnailByteSize: integer("thumbnail_byte_size").notNull(),
    thumbnailWidth: integer("thumbnail_width").notNull(),
    thumbnailHeight: integer("thumbnail_height").notNull(),
    thumbnailSha256: text("thumbnail_sha256").notNull(),
    perceptualHash: text("perceptual_hash"),
    linkedScreenId: text("linked_screen_id").references(() => screens.id, { onDelete: "set null" }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("submission_items_submission_position_unique").on(
      table.submissionId,
      table.position,
    ),
    uniqueIndex("submission_items_full_object_key_unique").on(table.fullObjectKey),
    uniqueIndex("submission_items_thumbnail_object_key_unique").on(table.thumbnailObjectKey),
    index("submission_items_full_sha256_idx").on(table.fullSha256),
    check(
      "submission_items_position_check",
      sql`${table.position} >= 0 AND ${table.position} < 50`,
    ),
  ],
);

export const reviewEvents = sqliteTable(
  "review_events",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    fromState: text("from_state", { enum: SUBMISSION_STATES }),
    toState: text("to_state", { enum: SUBMISSION_STATES }),
    reason: text("reason"),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    correlationId: text("correlation_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    index("review_events_submission_created_idx").on(table.submissionId, table.createdAt),
  ],
);

export const moderationResults = sqliteTable(
  "moderation_results",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    submissionItemId: text("submission_item_id").references(() => submissionItems.id, {
      onDelete: "cascade",
    }),
    schemaVersion: integer("schema_version").notNull().default(1),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    pipelineVersion: text("pipeline_version").notNull(),
    stage: text("stage").notNull(),
    outcome: text("outcome", { enum: MODERATION_OUTCOMES }).notNull(),
    confidence: integer("confidence_basis_points").notNull(),
    categories: text("categories", { mode: "json" })
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'`),
    duplicateOutcome: text("duplicate_outcome", { enum: DUPLICATE_OUTCOMES })
      .notNull()
      .default("none"),
    duplicateScreenId: text("duplicate_screen_id").references(() => screens.id, {
      onDelete: "set null",
    }),
    suggestedTags: text("suggested_tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    suggestedTitle: text("suggested_title"),
    evidence: text("evidence", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    rawResponse: text("raw_response", { mode: "json" }).$type<unknown>(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }).notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("moderation_results_idempotency_unique").on(
      table.submissionId,
      table.submissionItemId,
      table.pipelineVersion,
      table.stage,
    ),
    index("moderation_results_submission_idx").on(table.submissionId, table.reviewedAt),
    check(
      "moderation_results_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 10000`,
    ),
  ],
);

export const reviewStageClaims = sqliteTable(
  "review_stage_claims",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    submissionItemId: text("submission_item_id").references(() => submissionItems.id, {
      onDelete: "cascade",
    }),
    pipelineVersion: text("pipeline_version").notNull(),
    stage: text("stage").notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
    attempt: integer("attempt").notNull().default(1),
    errorCode: text("error_code"),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }).notNull().default(now),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [index("review_stage_claims_submission_idx").on(table.submissionId, table.stage)],
);

export type UserRow = typeof users.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ProductVersionRow = typeof productVersions.$inferSelect;
export type ScreenRow = typeof screens.$inferSelect;
export type FlowRow = typeof flows.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
