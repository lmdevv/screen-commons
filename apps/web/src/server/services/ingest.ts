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

export const KIND_LIMITS: Record<ImageKind, { bytes: number; width: number; height: number }> = {
  img: { bytes: LIMITS.maxImageBytes, width: LIMITS.maxImageWidth, height: LIMITS.maxImageHeight },
  // Clients send 640px-wide thumbnails; allow up to 2x for HiDPI encoders.
  thumb: {
    bytes: LIMITS.maxThumbnailBytes,
    width: LIMITS.thumbnailWidth * 2,
    height: LIMITS.maxImageHeight,
  },
  logo: { bytes: 512 * 1024, width: 1024, height: 1024 },
};

const tooLarge = (message: string) => new ServiceError("payload_too_large", message);

// ---------------------------------------------------------------------------------------------
// Image sources: sized cheaply up front, decoded lazily one at a time
// ---------------------------------------------------------------------------------------------

/** An image not yet decoded: base64 text (JSON transports) or a Blob (multipart). */
export type ImageSource = { base64: string } | { blob: Blob };

/** Upper bound of the decoded size, computed without allocating. */
function estimatedBytes(source: ImageSource): number {
  if ("blob" in source) return source.blob.size;
  return Math.floor((source.base64.length * 3) / 4);
}

async function loadSource(source: ImageSource, label: string): Promise<Uint8Array> {
  if ("blob" in source) return new Uint8Array(await source.blob.arrayBuffer());
  let text = source.base64;
  if (text.startsWith("data:")) text = text.slice(text.indexOf(",") + 1);
  if (/\s/u.test(text)) text = text.replace(/\s+/gu, "");
  try {
    return base64ToBytes(text);
  } catch {
    throw badRequest(`${label} is not valid base64`);
  }
}

interface SizedImage {
  kind: ImageKind;
  source: ImageSource;
  label: string;
}

/**
 * Enforce per-image and per-request byte limits before anything is decoded or read into memory.
 * Base64 sizes are upper bounds (allowing 2 bytes of padding slack); exact sizes are re-checked
 * after decoding.
 */
function checkBudget(images: SizedImage[]) {
  let total = 0;
  for (const { kind, source, label } of images) {
    const size = estimatedBytes(source);
    const limit = KIND_LIMITS[kind].bytes;
    if (size > limit + 2) throw tooLarge(`${label} is ~${size} bytes; the limit is ${limit}`);
    total += size;
  }
  if (total > LIMITS.maxBatchBytes + 2 * images.length) {
    throw tooLarge(
      `Upload is ~${total} bytes of images; the limit per request is ${LIMITS.maxBatchBytes}. Split it into smaller batches.`,
    );
  }
}

export interface StoredImage {
  key: string;
  type: keyof typeof EXTENSIONS;
  width: number;
  height: number;
  bytes: number;
}

/** Validate type/size/dimensions from the file header (never trust declared values). */
function checkImage(kind: ImageKind, data: Uint8Array, label: string) {
  const limits = KIND_LIMITS[kind];
  if (data.byteLength > limits.bytes) {
    throw tooLarge(`${label} is ${data.byteLength} bytes; the limit is ${limits.bytes}`);
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
  return header;
}

/**
 * Decode, validate and store one image under a content-addressed key (`img/<sha256>.png`),
 * skipping the upload when the object already exists. The decoded bytes are released on return.
 */
async function ingestImage({ kind, source, label }: SizedImage): Promise<StoredImage> {
  const data = await loadSource(source, label);
  const header = checkImage(kind, data, label);
  const key = `${kind}/${await sha256Hex(data)}.${EXTENSIONS[header.type]}`;
  const media = getMedia();
  if (!(await media.head(key))) {
    await media.put(key, data, { httpMetadata: { contentType: header.type } });
  }
  return {
    key,
    type: header.type,
    width: header.width,
    height: header.height,
    bytes: data.byteLength,
  };
}

function parseDate(value: string | undefined): Date {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

const statusFor = (principal: Principal): Status => (isAdmin(principal) ? "published" : "pending");

/** Flows publish only when an admin creates them and every step's screen is published. */
const flowStatusFor = (principal: Principal, screenStatuses: Status[]): Status =>
  isAdmin(principal) && screenStatuses.every((status) => status === "published")
    ? "published"
    : "pending";

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

/** The app a contribution belongs to: explicit slug → website host → name slug. */
async function findApp(input: AppInput): Promise<AppRow | undefined> {
  const db = getDb();
  const host = input.websiteUrl ? hostnameOf(input.websiteUrl) : null;
  const find = async (condition: ReturnType<typeof eq>) =>
    (
      await db
        .select()
        .from(app)
        .where(and(eq(app.platform, input.platform), condition))
        .limit(1)
    )[0];
  if (input.slug) {
    const bySlug = await find(eq(app.slug, input.slug));
    if (bySlug) return bySlug;
  }
  if (host) {
    const byHost = await find(eq(app.host, host));
    if (byHost) return byHost;
  }
  if (!input.slug) {
    const bySlug = await find(eq(app.slug, slugify(input.name) || "app"));
    if (bySlug && (!host || !bySlug.host || bySlug.host === host)) return bySlug;
  }
  return undefined;
}

/**
 * App metadata is moderated: only admins, or the member whose own app is still pending, may
 * change it. Everyone else's uploads attach screens without touching the app row.
 */
function canEditApp(principal: Principal, existing: AppRow | undefined): boolean {
  if (!existing || isAdmin(principal)) return true;
  return existing.status === "pending" && existing.contributorId === principal.user.id;
}

async function appWrite(
  principal: Principal,
  input: AppInput,
  existing: AppRow | undefined,
  logoKey: string | null,
  now: Date,
): Promise<{ row: AppRow; write: BatchItem<"sqlite"> | null }> {
  const db = getDb();
  const host = input.websiteUrl ? hostnameOf(input.websiteUrl) : null;
  if (existing) {
    if (!canEditApp(principal, existing)) return { row: existing, write: null };
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
    };
  }

  const values = {
    id: newId(),
    slug: await uniqueSlug(input.platform, input.slug ?? (slugify(input.name) || "app")),
    name: input.name,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    websiteUrl: input.websiteUrl ?? null,
    host,
    platform: input.platform,
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
  return { row: values, write: db.insert(app).values(values) };
}

// ---------------------------------------------------------------------------------------------
// Ingest pipeline shared by POST /captures, POST /screens, server functions and MCP upload
// ---------------------------------------------------------------------------------------------

interface IngestScreen {
  image: ImageSource;
  /** Omitted only by the MCP upload tool; the full image doubles as the thumbnail. */
  thumbnail?: ImageSource;
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
  logo?: ImageSource;
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
  // 1. Byte budget, before decoding or reading anything.
  checkBudget([
    ...(input.logo ? [{ kind: "logo" as const, source: input.logo, label: "logo" }] : []),
    ...input.screens.flatMap((item, index) => [
      { kind: "img" as const, source: item.image, label: `screens[${index}].image` },
      ...(item.thumbnail
        ? [{ kind: "thumb" as const, source: item.thumbnail, label: `screens[${index}].thumbnail` }]
        : []),
    ]),
  ]);

  // 2. App lookup decides whether this contribution may set app metadata (incl. the logo).
  const existing = await findApp(input.app);
  const logoKey =
    input.logo && canEditApp(principal, existing)
      ? (await ingestImage({ kind: "logo", source: input.logo, label: "logo" })).key
      : null;

  // 3. Decode → validate → store one image at a time (content addressed: retries are idempotent;
  //    objects stored before a later validation failure stay unreferenced and are never served).
  const stored: { item: IngestScreen; full: StoredImage; thumb: StoredImage }[] = [];
  for (const [index, item] of input.screens.entries()) {
    const full = await ingestImage({
      kind: "img",
      source: item.image,
      label: `screens[${index}].image`,
    });
    const thumb = item.thumbnail
      ? await ingestImage({
          kind: "thumb",
          source: item.thumbnail,
          label: `screens[${index}].thumbnail`,
        })
      : full;
    stored.push({ item, full, thumb });
  }

  // 4. Rows, written in one batch.
  const db = getDb();
  const now = new Date();
  const status = statusFor(principal);
  const resolved = await appWrite(principal, input.app, existing, logoKey, now);
  const appRow = resolved.row;

  const existingByKey = new Map<string, { id: string; status: Status }>();
  if (existing) {
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

  const writes: BatchItem<"sqlite">[] = resolved.write ? [resolved.write] : [];
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
    const flowStatus = flowStatusFor(
      principal,
      screens.map((item) => item.status),
    );
    writes.push(
      db.insert(flow).values({
        id: flowId,
        appId: appRow.id,
        name: input.flow.name,
        type: input.flow.type ?? null,
        description: input.flow.description ?? null,
        status: flowStatus,
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
    flowResult = { id: flowId, status: flowStatus };
  }

  if (writes.length > 0) await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { app: appRow, screens, flow: flowResult };
}

// ---------------------------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------------------------

/** POST /api/v1/captures (and the `submitCaptures` server function) — JSON batch, base64. */
export async function captures(
  principal: Principal,
  input: unknown,
  origin: string,
): Promise<CaptureBatchResult> {
  const batch = parseInput(captureBatchInputSchema, input);
  const result = await ingest(principal, {
    app: batch.app,
    logo: batch.logo ? { base64: batch.logo.base64 } : undefined,
    flow: batch.flow,
    source: batch.source,
    screens: batch.screens.map(({ image, thumbnail, ...meta }) => ({
      ...meta,
      image: { base64: image.base64 },
      thumbnail: { base64: thumbnail.base64 },
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

function blobSource(value: unknown, label: string): ImageSource {
  if (value && typeof value === "object" && "arrayBuffer" in value && "size" in value) {
    return { blob: value as Blob };
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
        image: blobSource(input.image, "image"),
        thumbnail: blobSource(input.thumbnail, "thumbnail"),
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
        image: { base64: input.image.base64 },
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
    .select({ id: screen.id, status: screen.status })
    .from(screen)
    .where(
      and(
        inJsonArray(screen.id, ids),
        eq(screen.appId, appRow.id),
        visibleSql(screen, principal, "detail"),
        sql`${screen.status} != 'rejected'`,
      ),
    );
  const statusById = new Map(found.map((row) => [row.id, row.status]));
  const missing = ids.filter((id) => !statusById.has(id));
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
      status: flowStatusFor(
        principal,
        ids.map((id) => statusById.get(id)!),
      ),
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
