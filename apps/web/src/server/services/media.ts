import {
  DISPLAY_POLICY,
  IMAGE_EXTENSIONS,
  LIMITS,
  backfillDisplayInputSchema,
  derivativeKey,
  isDisplayReady,
  isThumbnailOf,
  sniffImage,
  thumbnailKindFor,
  type BackfillDisplayResult,
  type StoredImageType,
  type ThumbnailKind,
} from "@screen-commons/core";
import { app, screen } from "@screen-commons/db";
import { and, asc, count, eq, gt, isNull, lt, or } from "drizzle-orm";

import { deriveDisplayImage, deriveThumbnail, type DecodedImage } from "../display";
import { getDb, getImages, getMedia } from "../env";
import { ServiceError, forbidden, parseInput } from "../errors";
import { sha256Hex } from "../ids";
import { isAdmin, type Principal } from "../principal";

export interface StoredImage {
  key: string;
  type: StoredImageType;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Store bytes under a content-addressed key, once (an existing object is the same image). Width
 * and height ride along as custom metadata so derivatives can be reused without decoding them.
 */
export async function putOnce(
  key: string,
  data: Uint8Array,
  image: Pick<StoredImage, "type" | "width" | "height">,
): Promise<StoredImage> {
  const media = getMedia();
  if (!(await media.head(key))) {
    await media.put(key, data, {
      httpMetadata: { contentType: image.type },
      customMetadata: { width: String(image.width), height: String(image.height) },
    });
  }
  return {
    key,
    type: image.type,
    width: image.width,
    height: image.height,
    bytes: data.byteLength,
  };
}

/** A derivative stored by an earlier upload or backfill run (same source, same policy version). */
async function findDerivative(key: string): Promise<StoredImage | null> {
  const head = await getMedia().head(key);
  const width = Number(head?.customMetadata?.width);
  const height = Number(head?.customMetadata?.height);
  if (!head || !(width > 0) || !(height > 0)) return null;
  return { key, type: DISPLAY_POLICY.type, width, height, bytes: head.size };
}

export interface MediaSource extends DecodedImage {
  sha256: string;
}

/** A validated thumbnail candidate, stored only if it is used. */
export interface ThumbnailCandidate {
  type: StoredImageType;
  store: () => Promise<StoredImage>;
}

export interface ScreenMedia {
  full: StoredImage;
  thumb: StoredImage;
  /** Retained source when `full` is a server-derived display image. */
  originalKey: string | null;
  /** `DISPLAY_POLICY.version` when `full` and `thumb` meet the policy; null to retry later. */
  displayVersion: number | null;
}

/** Keys a source can end up under, for dedupe: as uploaded, as retained original, as derivative. */
export function sourceKeys(source: Pick<MediaSource, "sha256" | "type">): string[] {
  const ext = IMAGE_EXTENSIONS[source.type];
  return [
    `img/${source.sha256}.${ext}`,
    `orig/${source.sha256}.${ext}`,
    derivativeKey("img", source.sha256),
  ];
}

/**
 * Display image and thumbnail for a screen's source, per the display policy (shared by ingest
 * and backfill):
 * - Display-ready WebP is stored as uploaded. Anything else gets a WebP derivative from the
 *   Images binding under a versioned key (`img/<sha>.v1.webp`), with the source retained
 *   separately (`orig/<sha>.<ext>`, never served), unless WebP isn't smaller and no resize is
 *   needed, in which case the source is the display image.
 * - If the binding fails, the source is displayed as uploaded (it is within the upload limits;
 *   pages taller than 16,383px stay PNG/JPEG) and `displayVersion` is null so the backfill
 *   retries. This is the only case where a non-conforming full image is displayed.
 * - A client WebP thumbnail is used as sent. Otherwise one is derived from the source; a client
 *   JPEG/PNG thumbnail is only a fallback when that fails. Without either, the upload fails
 *   (`unavailable`): a full image is never displayed as a thumbnail.
 * - Derivatives are content-addressed by source + policy version, so retries, duplicate uploads
 *   and backfill runs reuse them instead of re-encoding.
 */
export async function resolveScreenMedia(input: {
  source: MediaSource;
  /** Where the source is already stored (backfill); otherwise it is stored here as needed. */
  sourceKey?: string;
  thumbnail?: ThumbnailCandidate;
  kind: ThumbnailKind;
  label: string;
}): Promise<ScreenMedia> {
  const { source, kind, label } = input;
  const [uploadedKey, originalKey] = sourceKeys(source) as [string, string, string];
  const { type, width, height } = source;
  const storeSource = async (key: string): Promise<StoredImage> =>
    input.sourceKey
      ? { key: input.sourceKey, type, width, height, bytes: source.data.byteLength }
      : putOnce(key, source.data, source);
  const images = getImages();
  let normalized = true;

  let full: StoredImage;
  let retained: string | null = null;
  const imageKey = derivativeKey("img", source.sha256);
  const ready = isDisplayReady({ type, width, height, bytes: source.data.byteLength });
  let derived = ready ? null : await findDerivative(imageKey);
  if (!ready && !derived) {
    const result = await deriveDisplayImage(images, source);
    if (result.status === "derived")
      derived = await putOnce(imageKey, result.image.data, result.image);
    else if (result.status === "failed") {
      normalized = false;
      console.warn(
        `screen-commons: ${label}: displaying the source as uploaded (${result.reason})`,
      );
    }
  }
  if (derived) {
    full = derived;
    retained = (await storeSource(originalKey)).key;
  } else full = await storeSource(uploadedKey);

  let thumb: StoredImage | undefined;
  if (input.thumbnail?.type === DISPLAY_POLICY.type) thumb = await input.thumbnail.store();
  else {
    const thumbKey = derivativeKey("thumb", source.sha256, kind);
    thumb = (await findDerivative(thumbKey)) ?? undefined;
    if (!thumb) {
      const result = await deriveThumbnail(images, source, kind);
      if (result.status === "derived")
        thumb = await putOnce(thumbKey, result.image.data, result.image);
      else if (input.thumbnail) {
        normalized = false;
        console.warn(`screen-commons: ${label}: keeping the sent thumbnail (${result.reason})`);
        thumb = await input.thumbnail.store();
      } else {
        console.warn(`screen-commons: ${label}: thumbnail generation failed (${result.reason})`);
        throw new ServiceError(
          "unavailable",
          `${label}: a thumbnail couldn't be generated right now. Retry later, or send a thumbnail with the image.`,
        );
      }
    }
  }

  return {
    full,
    thumb,
    originalKey: retained,
    displayVersion: normalized ? DISPLAY_POLICY.version : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Backfill: bring existing screens up to the current policy version
// ---------------------------------------------------------------------------------------------

const outdated = or(
  isNull(screen.displayVersion),
  lt(screen.displayVersion, DISPLAY_POLICY.version),
);

async function remainingCount(): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(screen).where(outdated);
  return row?.n ?? 0;
}

/** The screen's current thumbnail, when it is a real thumbnail of the source (not the full image). */
async function existingThumbnail(
  row: { imageKey: string; thumbKey: string; thumbWidth: number; thumbHeight: number },
  source: MediaSource,
): Promise<ThumbnailCandidate | undefined> {
  if (row.thumbKey === row.imageKey) return undefined;
  const head = await getMedia().head(row.thumbKey);
  const type = head?.httpMetadata?.contentType as StoredImageType | undefined;
  const size = { width: row.thumbWidth, height: row.thumbHeight };
  if (!head || !type || !(type in IMAGE_EXTENSIONS)) return undefined;
  if (head.size > LIMITS.maxThumbnailBytes || !isThumbnailOf(size, source)) return undefined;
  return { type, store: async () => ({ key: row.thumbKey, type, ...size, bytes: head.size }) };
}

/**
 * One page of the display backfill (admin only): screens whose `display_version` is missing or
 * older than the policy, oldest id first. Each is re-resolved from its retained original (or its
 * current image) exactly like a new upload, then its keys, size and version are updated. Old
 * objects are left in place (the replaced image becomes `original_key`), so the run is safe to
 * repeat or interrupt; failures stay below the version for the next run.
 */
export async function backfillDisplay(
  principal: Principal,
  input: unknown,
): Promise<BackfillDisplayResult> {
  if (!isAdmin(principal)) throw forbidden();
  const { limit, cursor, dryRun } = parseInput(backfillDisplayInputSchema, input ?? {});
  const db = getDb();
  const rows = await db
    .select({
      id: screen.id,
      imageKey: screen.imageKey,
      thumbKey: screen.thumbKey,
      thumbWidth: screen.thumbWidth,
      thumbHeight: screen.thumbHeight,
      originalKey: screen.originalKey,
      platform: app.platform,
    })
    .from(screen)
    .innerJoin(app, eq(app.id, screen.appId))
    .where(cursor ? and(outdated, gt(screen.id, cursor)) : outdated)
    .orderBy(asc(screen.id))
    .limit(limit);

  const items: BackfillDisplayResult["items"] = [];
  for (const row of rows) {
    const item = { screenId: row.id, imageKey: row.imageKey, thumbKey: row.thumbKey };
    if (dryRun) {
      items.push({ ...item, action: "pending" });
      continue;
    }
    try {
      const sourceKey = row.originalKey ?? row.imageKey;
      const object = await getMedia().get(sourceKey);
      if (!object) throw new Error(`${sourceKey} is missing`);
      const data = new Uint8Array(await object.arrayBuffer());
      const header = sniffImage(data);
      if (!header) throw new Error(`${sourceKey} is not a readable PNG, JPEG or WebP image`);
      const source: MediaSource = { data, ...header, sha256: await sha256Hex(data) };
      const media = await resolveScreenMedia({
        source,
        sourceKey,
        thumbnail: await existingThumbnail(row, source),
        kind: thumbnailKindFor(row.platform),
        label: `screen ${row.id}`,
      });
      await db
        .update(screen)
        .set({
          imageKey: media.full.key,
          thumbKey: media.thumb.key,
          width: media.full.width,
          height: media.full.height,
          bytes: media.full.bytes,
          thumbWidth: media.thumb.width,
          thumbHeight: media.thumb.height,
          originalKey: media.originalKey,
          displayVersion: media.displayVersion,
        })
        .where(eq(screen.id, row.id));
      const changed = media.full.key !== row.imageKey || media.thumb.key !== row.thumbKey;
      items.push({
        screenId: row.id,
        imageKey: media.full.key,
        thumbKey: media.thumb.key,
        action: media.displayVersion === null ? "failed" : changed ? "updated" : "current",
        ...(media.displayVersion === null ? { reason: "the Images binding failed" } : {}),
      });
    } catch (error) {
      items.push({
        ...item,
        action: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    items,
    nextCursor: rows.length === limit ? rows.at(-1)!.id : null,
    remaining: await remainingCount(),
  };
}
