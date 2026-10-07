import {
  LIMITS,
  appInputSchema,
  base64ToBytes,
  captureBatchInputSchema,
  createFlowInputSchema,
  createScreenInputSchema,
  hostnameOf,
  readImageHeader,
  slugify,
  versionLabel,
  type CaptureBatchResult,
  type FlowDetail,
  type Screen,
  type Source,
  type Status,
  type catalogTools,
} from "@open-ui/core";
import {
  app,
  flow,
  flowStep,
  inJsonArray,
  screen,
  type AppRow,
  type NewAppRow,
  type NewScreenRow,
} from "@open-ui/db";
import { and, eq, like, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { z } from "zod";

import { getDb, getMedia } from "../env";
import { ServiceError, badRequest, notFound, parseInput } from "../errors";
import { newId, sha256Hex } from "../ids";
import { isAdmin, type Principal } from "../principal";
import { getFlow, getScreenRow } from "./catalog";
import { screensToApi, visibleSql } from "./shared";

type AppInput = z.output<typeof appInputSchema>;
type ImageKind = "img" | "thumb" | "logo";

const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

const KIND_LIMITS: Record<ImageKind, { bytes: number; width: number; height: number }> = {
  img: { bytes: LIMITS.maxImageBytes, width: LIMITS.maxImageWidth, height: LIMITS.maxImageHeight },
  // Clients send 640px-wide thumbnails; allow up to 2x for HiDPI encoders.
  thumb: {
    bytes: LIMITS.maxThumbnailBytes,
    width: LIMITS.thumbnailWidth * 2,
    height: LIMITS.maxImageHeight,
  },
  logo: { bytes: 512 * 1024, width: 1024, height: 1024 },
};

export interface StoredImage {
  key: string;
  type: keyof typeof EXTENSIONS;
  width: number;
  height: number;
  bytes: number;
}

interface PendingImage {
  kind: ImageKind;
  data: Uint8Array;
  header: { type: keyof typeof EXTENSIONS; width: number; height: number };
}

/** Validate type/size/dimensions from the file header (never trust declared values). */
function checkImage(kind: ImageKind, data: Uint8Array, label: string): PendingImage {
  const limits = KIND_LIMITS[kind];
  if (data.byteLength > limits.bytes) {
    throw new ServiceError(
      "payload_too_large",
      `${label} is ${data.byteLength} bytes; the limit is ${limits.bytes}`,
    );
  }
  const header = readImageHeader(data);
  if (!header) {
    throw new ServiceError("unsupported_media_type", `${label} must be a PNG, JPEG or WebP image`);
  }
  if (header.width < 1 || header.height < 1) throw badRequest(`${label} has invalid dimensions`);
  if (header.width > limits.width || header.height > limits.height) {
    throw badRequest(
      `${label} is ${header.width}x${header.height}; the limit is ${limits.width}x${limits.height}`,
    );
  }
  return { kind, data, header };
}

/** Store under a content-addressed key (`img/<sha256>.png`); skips the upload when present. */
async function storeImage(image: PendingImage): Promise<StoredImage> {
  const hash = await sha256Hex(image.data);
  const key = `${image.kind}/${hash}.${EXTENSIONS[image.header.type]}`;
  const media = getMedia();
  if (!(await media.head(key))) {
    await media.put(key, image.data, { httpMetadata: { contentType: image.header.type } });
  }
  return {
    key,
    type: image.header.type,
    width: image.header.width,
    height: image.header.height,
    bytes: image.data.byteLength,
  };
}

function decodeBase64(base64: string, label: string): Uint8Array {
  try {
    return base64ToBytes(base64.replace(/^data:[^,]*,/u, "").replace(/\s+/gu, ""));
  } catch {
    throw badRequest(`${label} is not valid base64`);
  }
}

function parseDate(value: string | undefined): Date {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

const statusFor = (principal: Principal): Status => (isAdmin(principal) ? "published" : "pending");

// ---------------------------------------------------------------------------------------------
// App upsert
// ---------------------------------------------------------------------------------------------

async function uniqueSlug(platform: string, base: string): Promise<string> {
  const rows = await getDb()
    .select({ slug: app.slug })
    .from(app)
    .where(and(eq(app.platform, platform), or(eq(app.slug, base), like(app.slug, `${base}-%`))));
  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base.slice(0, 76)}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Find the app a contribution belongs to (explicit slug → website host → name slug) or prepare a
 * new one. Returns the row plus the write to include in the batch.
 */
async function resolveApp(
  principal: Principal,
  input: AppInput,
  logoKey: string | null,
  now: Date,
): Promise<{ row: AppRow; write: BatchItem<"sqlite">; created: boolean }> {
  const db = getDb();
  const platform = input.platform;
  const host = input.websiteUrl ? hostnameOf(input.websiteUrl) : null;
  const find = async (condition: ReturnType<typeof eq>) =>
    (
      await db
        .select()
        .from(app)
        .where(and(eq(app.platform, platform), condition))
        .limit(1)
    )[0];

  let existing: AppRow | undefined;
  if (input.slug) existing = await find(eq(app.slug, input.slug));
  if (!existing && host) existing = await find(eq(app.host, host));
  if (!existing && !input.slug) {
    const bySlug = await find(eq(app.slug, slugify(input.name) || "app"));
    if (bySlug && (!host || !bySlug.host || bySlug.host === host)) existing = bySlug;
  }

  if (existing) {
    const patch: Partial<NewAppRow> = { updatedAt: now };
    if (!existing.tagline && input.tagline) patch.tagline = input.tagline;
    if (!existing.description && input.description) patch.description = input.description;
    if (!existing.category && input.category) patch.category = input.category;
    if (!existing.websiteUrl && input.websiteUrl) {
      patch.websiteUrl = input.websiteUrl;
      patch.host = host;
    }
    if (logoKey && (!existing.logoKey || isAdmin(principal))) patch.logoKey = logoKey;
    if (isAdmin(principal) && existing.status !== "published") patch.status = "published";
    return {
      row: { ...existing, ...patch } as AppRow,
      write: db.update(app).set(patch).where(eq(app.id, existing.id)),
      created: false,
    };
  }

  const values = {
    id: newId(),
    slug: await uniqueSlug(platform, input.slug ?? (slugify(input.name) || "app")),
    name: input.name,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    websiteUrl: input.websiteUrl ?? null,
    host,
    platform,
    category: input.category ?? null,
    logoKey,
    accentColor: null,
    status: statusFor(principal),
    contributorId: principal.user.id,
    viewCount: 0,
    saveCount: 0,
    createdAt: now,
    updatedAt: now,
  } satisfies AppRow;
  return { row: values, write: db.insert(app).values(values), created: true };
}

// ---------------------------------------------------------------------------------------------
// Ingest pipeline shared by POST /captures, POST /screens and the MCP upload tool
// ---------------------------------------------------------------------------------------------

interface IngestScreen {
  image: Uint8Array;
  /** Omitted only by the MCP upload tool; the full image doubles as the thumbnail. */
  thumbnail?: Uint8Array;
  title?: string;
  sourceUrl?: string;
  patterns: string[];
  elements: string[];
  tags: string[];
  version?: string;
  dominantColor?: string;
  capturedAt?: string;
  text?: string;
  stepLabel?: string;
}

interface IngestInput {
  app: AppInput;
  logo?: Uint8Array;
  screens: IngestScreen[];
  flow?: { name: string; type?: string; description?: string };
  source: Source;
}

interface IngestResult {
  app: AppRow;
  screens: { id: string; status: Status }[];
  flow: { id: string; status: Status } | null;
}

async function ingest(principal: Principal, input: IngestInput): Promise<IngestResult> {
  // 1. Validate every image before writing anything.
  const checked = input.screens.map((item, index) => ({
    item,
    image: checkImage("img", item.image, `screens[${index}].image`),
    thumbnail: item.thumbnail
      ? checkImage("thumb", item.thumbnail, `screens[${index}].thumbnail`)
      : undefined,
  }));
  const logo = input.logo ? checkImage("logo", input.logo, "logo") : undefined;

  // 2. Store media (content addressed, so retries are idempotent).
  const stored = await Promise.all(
    checked.map(async ({ item, image, thumbnail }) => {
      const full = await storeImage(image);
      return { item, full, thumb: thumbnail ? await storeImage(thumbnail) : full };
    }),
  );
  const logoKey = logo ? (await storeImage(logo)).key : null;

  // 3. Rows.
  const db = getDb();
  const now = new Date();
  const status = statusFor(principal);
  const resolved = await resolveApp(principal, input.app, logoKey, now);
  const appRow = resolved.row;

  const existingByKey = new Map<string, { id: string; status: Status }>();
  if (!resolved.created) {
    const rows = await db
      .select({ id: screen.id, imageKey: screen.imageKey, status: screen.status })
      .from(screen)
      .where(
        and(
          eq(screen.appId, appRow.id),
          inJsonArray(
            screen.imageKey,
            stored.map(({ full }) => full.key),
          ),
          visibleSql(screen, principal, "detail"),
          sql`${screen.status} != 'rejected'`,
        ),
      );
    for (const row of rows) existingByKey.set(row.imageKey, { id: row.id, status: row.status });
  }

  const writes: BatchItem<"sqlite">[] = [resolved.write];
  const screens: { id: string; status: Status }[] = [];
  for (const { item, full, thumb } of stored) {
    const duplicate = existingByKey.get(full.key);
    if (duplicate) {
      screens.push(duplicate);
      continue;
    }
    const capturedAt = parseDate(item.capturedAt);
    const values: NewScreenRow = {
      id: newId(),
      appId: appRow.id,
      imageKey: full.key,
      thumbKey: thumb.key,
      width: full.width,
      height: full.height,
      bytes: full.bytes,
      thumbWidth: thumb.width,
      thumbHeight: thumb.height,
      title: item.title ?? null,
      sourceUrl: item.sourceUrl ?? null,
      text: item.text ?? null,
      patterns: [...new Set(item.patterns)],
      elements: [...new Set(item.elements)],
      tags: [...new Set(item.tags)],
      version: item.version ?? versionLabel(capturedAt),
      dominantColor: item.dominantColor?.toLowerCase() ?? null,
      status,
      source: input.source,
      contributorId: principal.user.id,
      capturedAt,
      createdAt: now,
      updatedAt: now,
    };
    existingByKey.set(full.key, { id: values.id, status });
    writes.push(db.insert(screen).values(values));
    screens.push({ id: values.id, status });
  }

  let flowResult: IngestResult["flow"] = null;
  if (input.flow) {
    if (screens.length < 2) throw badRequest("A flow needs at least two distinct screens");
    const flowId = newId();
    writes.push(
      db.insert(flow).values({
        id: flowId,
        appId: appRow.id,
        name: input.flow.name,
        type: input.flow.type ?? null,
        description: input.flow.description ?? null,
        status,
        contributorId: principal.user.id,
        stepCount: screens.length,
        createdAt: now,
        updatedAt: now,
      }),
    );
    screens.forEach((item, position) => {
      writes.push(
        db.insert(flowStep).values({
          flowId,
          position,
          screenId: item.id,
          label: stored[position]?.item.stepLabel ?? null,
        }),
      );
    });
    flowResult = { id: flowId, status };
  }

  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { app: appRow, screens, flow: flowResult };
}

// ---------------------------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------------------------

/** POST /api/v1/captures — JSON batch with base64 images. */
export async function captures(
  principal: Principal,
  input: unknown,
  origin: string,
): Promise<CaptureBatchResult> {
  const batch = parseInput(captureBatchInputSchema, input);
  const result = await ingest(principal, {
    app: batch.app,
    logo: batch.logo ? decodeBase64(batch.logo.base64, "logo") : undefined,
    flow: batch.flow,
    source: batch.source,
    screens: batch.screens.map(({ image, thumbnail, ...meta }, index) => ({
      ...meta,
      image: decodeBase64(image.base64, `screens[${index}].image`),
      thumbnail: decodeBase64(thumbnail.base64, `screens[${index}].thumbnail`),
    })),
  });
  return {
    app: {
      id: result.app.id,
      slug: result.app.slug,
      name: result.app.name,
      platform: result.app.platform as CaptureBatchResult["app"]["platform"],
      logoUrl: result.app.logoKey ? `/media/${result.app.logoKey}` : null,
      accentColor: result.app.accentColor,
    },
    screens: result.screens.map((item) => ({ ...item, url: `${origin}/screens/${item.id}` })),
    flow: result.flow ? { ...result.flow, url: `${origin}/flows/${result.flow.id}` } : null,
  };
}

async function blobBytes(value: unknown, label: string): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (value && typeof value === "object" && "arrayBuffer" in value) {
    return new Uint8Array(await (value as Blob).arrayBuffer());
  }
  throw badRequest(`${label} file is required`);
}

/** POST /api/v1/screens — one image + client thumbnail + `meta` (CreateScreenInput). */
export async function createScreen(
  principal: Principal,
  input: { image: unknown; thumbnail: unknown; meta: unknown },
): Promise<{ screen: Screen }> {
  let meta = input.meta;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      throw badRequest("meta must be JSON");
    }
  }
  const parsed = parseInput(createScreenInputSchema, meta);
  const { app: appInput, source, ...screenMeta } = parsed;
  const result = await ingest(principal, {
    app: appInput,
    source,
    screens: [
      {
        ...screenMeta,
        image: await blobBytes(input.image, "image"),
        thumbnail: await blobBytes(input.thumbnail, "thumbnail"),
      },
    ],
  });
  const row = await getScreenRow(principal, result.screens[0]!.id);
  const [apiScreen] = await screensToApi(principal, [row]);
  return { screen: apiScreen! };
}

/** MCP `upload_screen`: no thumbnail is sent, so the full image is reused as the thumbnail. */
export async function uploadScreenFromTool(
  principal: Principal,
  input: z.output<(typeof catalogTools)["upload_screen"]["input"]>,
  origin: string,
) {
  const result = await ingest(principal, {
    app: input.app,
    source: "mcp",
    screens: [
      {
        image: decodeBase64(input.image.base64, "image"),
        title: input.title,
        sourceUrl: input.sourceUrl,
        patterns: input.patterns,
        elements: input.elements,
        tags: [],
      },
    ],
  });
  const item = result.screens[0]!;
  return {
    app: { id: result.app.id, slug: result.app.slug, name: result.app.name },
    screen: { ...item, url: `${origin}/screens/${item.id}` },
  };
}

/** POST /api/v1/flows — order existing screens of one app into a flow. */
export async function createFlow(
  principal: Principal,
  input: unknown,
): Promise<{ flow: FlowDetail }> {
  const parsed = parseInput(createFlowInputSchema, input);
  const db = getDb();
  const [appRow] = await db
    .select({ id: app.id })
    .from(app)
    .where(and(eq(app.id, parsed.appId), visibleSql(app, principal, "detail")))
    .limit(1);
  if (!appRow) throw notFound("App");

  const ids = parsed.steps.map((step) => step.screenId);
  const found = await db
    .select({ id: screen.id })
    .from(screen)
    .where(
      and(
        inJsonArray(screen.id, ids),
        eq(screen.appId, appRow.id),
        visibleSql(screen, principal, "detail"),
      ),
    );
  const foundIds = new Set(found.map((row) => row.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw badRequest(`Screens not found in this app: ${[...new Set(missing)].join(", ")}`);
  }

  const now = new Date();
  const flowId = newId();
  const writes: BatchItem<"sqlite">[] = [
    db.insert(flow).values({
      id: flowId,
      appId: appRow.id,
      name: parsed.name,
      type: parsed.type ?? null,
      description: parsed.description ?? null,
      status: statusFor(principal),
      contributorId: principal.user.id,
      stepCount: parsed.steps.length,
      createdAt: now,
      updatedAt: now,
    }),
    ...parsed.steps.map((step, position) =>
      db
        .insert(flowStep)
        .values({ flowId, position, screenId: step.screenId, label: step.label ?? null }),
    ),
  ];
  await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { flow: await getFlow(principal, flowId, { countView: false }) };
}
