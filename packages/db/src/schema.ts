import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () => timestamp("created_at").default(now).notNull();
const updatedAt = () =>
  timestamp("updated_at")
    .default(now)
    .$onUpdate(() => new Date())
    .notNull();

type Status = "published" | "pending" | "rejected";
type Source = "upload" | "extension" | "mcp" | "seed";
type Role = "admin" | "member";
export type CollectionItemKind = "screen" | "flow" | "app";

// ---------------------------------------------------------------------------------------------
// Better Auth core tables (user has an extra `role` column)
// ---------------------------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  role: text("role").$type<Role>().default("member").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// ---------------------------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------------------------

export const app = sqliteTable(
  "app",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    tagline: text("tagline"),
    description: text("description"),
    websiteUrl: text("website_url"),
    /** Hostname of `websiteUrl` without `www.`, used to upsert captures onto the same app. */
    host: text("host"),
    platform: text("platform").notNull(),
    category: text("category"),
    logoKey: text("logo_key"),
    accentColor: text("accent_color"),
    status: text("status").$type<Status>().default("pending").notNull(),
    contributorId: text("contributor_id").references(() => user.id, { onDelete: "set null" }),
    viewCount: integer("view_count").default(0).notNull(),
    saveCount: integer("save_count").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("app_platform_slug_idx").on(table.platform, table.slug),
    index("app_platform_host_idx").on(table.platform, table.host),
    index("app_status_created_idx").on(table.status, table.createdAt),
    index("app_contributor_idx").on(table.contributorId),
  ],
);

export const screen = sqliteTable(
  "screen",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => app.id, { onDelete: "cascade" }),
    imageKey: text("image_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    thumbWidth: integer("thumb_width").notNull(),
    thumbHeight: integer("thumb_height").notNull(),
    title: text("title"),
    sourceUrl: text("source_url"),
    /** Visible text on the screen (DOM innerText / OCR), indexed for search. */
    text: text("text"),
    /** JSON arrays of taxonomy slugs / free tags. */
    patterns: text("patterns", { mode: "json" })
      .$type<string[]>()
      .default(sql`'[]'`)
      .notNull(),
    elements: text("elements", { mode: "json" })
      .$type<string[]>()
      .default(sql`'[]'`)
      .notNull(),
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .default(sql`'[]'`)
      .notNull(),
    version: text("version"),
    dominantColor: text("dominant_color"),
    status: text("status").$type<Status>().default("pending").notNull(),
    source: text("source").$type<Source>().default("upload").notNull(),
    contributorId: text("contributor_id").references(() => user.id, { onDelete: "set null" }),
    reviewReason: text("review_reason"),
    viewCount: integer("view_count").default(0).notNull(),
    saveCount: integer("save_count").default(0).notNull(),
    capturedAt: timestamp("captured_at").default(now).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("screen_status_created_idx").on(table.status, table.createdAt),
    index("screen_app_created_idx").on(table.appId, table.createdAt),
    index("screen_app_image_idx").on(table.appId, table.imageKey),
    index("screen_contributor_idx").on(table.contributorId),
  ],
);

export const flow = sqliteTable(
  "flow",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => app.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type"),
    description: text("description"),
    status: text("status").$type<Status>().default("pending").notNull(),
    contributorId: text("contributor_id").references(() => user.id, { onDelete: "set null" }),
    reviewReason: text("review_reason"),
    stepCount: integer("step_count").default(0).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    saveCount: integer("save_count").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("flow_status_created_idx").on(table.status, table.createdAt),
    index("flow_app_idx").on(table.appId),
    index("flow_contributor_idx").on(table.contributorId),
  ],
);

export const flowStep = sqliteTable(
  "flow_step",
  {
    flowId: text("flow_id")
      .notNull()
      .references(() => flow.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    screenId: text("screen_id")
      .notNull()
      .references(() => screen.id, { onDelete: "cascade" }),
    label: text("label"),
  },
  (table) => [
    primaryKey({ columns: [table.flowId, table.position] }),
    index("flow_step_screen_idx").on(table.screenId),
  ],
);

export const collection = sqliteTable(
  "collection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("collection_user_idx").on(table.userId),
    uniqueIndex("collection_user_default_idx")
      .on(table.userId)
      .where(sql`${table.isDefault} = 1`),
  ],
);

export const collectionItem = sqliteTable(
  "collection_item",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade" }),
    kind: text("kind").$type<CollectionItemKind>().notNull(),
    itemId: text("item_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.kind, table.itemId] }),
    index("collection_item_item_idx").on(table.kind, table.itemId),
  ],
);

export const apiKey = sqliteTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First 8 characters of the token, for display. */
    prefix: text("prefix").notNull(),
    /** Hex SHA-256 of the full token. */
    hash: text("hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [index("api_key_user_idx").on(table.userId)],
);

/** Tables Better Auth's drizzle adapter needs. */
export const authSchema = { user, session, account, verification };

export type UserRow = typeof user.$inferSelect;
export type AppRow = typeof app.$inferSelect;
export type NewAppRow = typeof app.$inferInsert;
export type ScreenRow = typeof screen.$inferSelect;
export type NewScreenRow = typeof screen.$inferInsert;
export type FlowRow = typeof flow.$inferSelect;
export type NewFlowRow = typeof flow.$inferInsert;
export type FlowStepRow = typeof flowStep.$inferSelect;
export type CollectionRow = typeof collection.$inferSelect;
export type CollectionItemRow = typeof collectionItem.$inferSelect;
export type ApiKeyRow = typeof apiKey.$inferSelect;
