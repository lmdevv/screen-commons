import {
  DISPLAY_POLICY,
  IMAGES_BINDING_LIMITS,
  IMAGE_EXTENSIONS,
  LIMITS,
  WEBP_MAX_DIMENSION,
  backfillDisplayInputSchema,
  derivativeKey,
  isDisplayReady,
  isThumbnailOf,
  sniffImage,
  thumbnailKindFor,
  type BackfillDisplayResult,
  type DisplayException,
  type StoredImageType,
  type ThumbnailKind,
} from "@screen-commons/core";
import { app, screen } from "@screen-commons/db";
import { and, asc, count, eq, gt, isNull, lt, or } from "drizzle-orm";

import { deriveDisplayImage, deriveThumbnail, type DecodedImage } from "../display";
import { getDb, getImages, getMedia } from "../env";
import { ServiceError, forbidden, parseInput, unavailable } from "../errors";
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
  /**
   * `DISPLAY_POLICY.version` when `full` and `thumb` were checked against the policy (they meet
   * it, or `displayException` documents why not); null when the binding failed and the backfill
   * should retry.
   */
  displayVersion: number | null;
  displayException: DisplayException | null;
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

/** Why an upload without a usable thumbnail can't be completed, for a permanent failure. */
function thumbnailRequired(
  label: string,
  source: MediaSource,
  exception: DisplayException,
  reason: string,
): ServiceError {
  const message =
    exception === "binding_limits"
      ? `${label}.image is a ${source.width}x${source.height} ${source.type}, too tall for the server to make a thumbnail of (PNG/JPEG up to ${IMAGES_BINDING_LIMITS.maxDimension.toLocaleString("en-US")}px). Send a thumbnail with it, or the image as WebP (up to ${WEBP_MAX_DIMENSION.toLocaleString("en-US")}px tall).`
      : exception === "no_binding"
        ? `${label}: this instance has no Images binding to make thumbnails with. Send a thumbnail with the image.`
        : `${label}: the server couldn't make a thumbnail of this image (${reason}). Send a thumbnail with it.`;
  return new ServiceError("unprocessable", message, { exception });
}

/**
 * Display image and thumbnail for a screen's source, per the display policy (shared by ingest
 * and backfill):
 * - Display-ready WebP is stored as uploaded. Anything else gets a WebP derivative from the
 *   Images binding under a versioned key (`img/<sha>.v1.webp`), with the source retained
 *   separately (`orig/<sha>.<ext>`, never served), unless WebP isn't smaller and no resize is
 *   needed, in which case the source is the display image.
 * - Without a derivative the source is displayed as uploaded (it is within the upload limits).
 *   When retrying can't help, that is a documented exception (`displayException`: source outside
 *   the binding's limits, no binding, unusable output) and the version is current, so the
 *   backfill doesn't loop on it; when the binding call failed, `displayVersion` is null and the
 *   backfill retries.
 * - A client WebP thumbnail is used as sent. Otherwise one is derived from the source; a client
 *   JPEG/PNG thumbnail is only a fallback when that fails. Without either the upload fails: 503
 *   `unavailable` (with `Retry-After`) when a retry may succeed, 422 `unprocessable` when only a
 *   thumbnail from the client will do. A full image is never displayed as a thumbnail.
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
  let retry = false;
  let exception: DisplayException | null = null;
  const fallBack = (result: { reason: string; exception?: DisplayException }, what: string) => {
    if (result.exception) exception ??= result.exception;
    else retry = true;
    console.warn(`screen-commons: ${label}: ${what} (${result.reason})`);
  };

  let full: StoredImage;
  let retained: string | null = null;
  const imageKey = derivativeKey("img", source.sha256);
  const ready = isDisplayReady({ type, width, height, bytes: source.data.byteLength });
  let derived = ready ? null : await findDerivative(imageKey);
  if (!ready && !derived) {
    const result = await deriveDisplayImage(images, source);
    if (result.status === "derived")
      derived = await putOnce(imageKey, result.image.data, result.image);
    else if (result.status === "failed") fallBack(result, "displaying the source as uploaded");
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
        fallBack(result, "keeping the sent thumbnail");
        thumb = await input.thumbnail.store();
      } else {
        console.warn(`screen-commons: ${label}: thumbnail generation failed (${result.reason})`);
        if (result.exception) {
          throw thumbnailRequired(label, source, result.exception, result.reason);
        }
        throw unavailable(
          `${label}: a thumbnail couldn't be generated right now. Retry later, or send a thumbnail with the image.`,
        );
      }
    }
  }

  return {
    full,
    thumb,
    originalKey: retained,
    displayVersion: retry ? null : DISPLAY_POLICY.version,
    displayException: exception,
  };
}

// ---------------------------------------------------------------------------------------------
// Backfill: bring existing screens up to the current policy version
// ---------------------------------------------------------------------------------------------

/**
 * Screens the backfill should look at: below the current policy version (or never checked), plus,
 * once the instance has an Images binding, those stored as uploaded for lack of one.
 */
function outdated() {
  return or(
    isNull(screen.displayVersion),
    lt(screen.displayVersion, DISPLAY_POLICY.version),
    getImages() ? eq(screen.displayException, "no_binding") : undefined,
  );
}

async function remainingCount(): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(screen).where(outdated());
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

/** The exception behind a permanent `unprocessable` failure from `resolveScreenMedia`. */
function permanentException(error: unknown): DisplayException | undefined {
  if (!(error instanceof ServiceError) || error.code !== "unprocessable") return undefined;
  return (error.details as { exception?: DisplayException } | undefined)?.exception;
}

/**
 * One page of the display backfill (admin only): screens whose `display_version` is missing or
 * older than the policy, oldest id first. Each is re-resolved from its retained original (or its
 * current image) exactly like a new upload, then its keys, size and version are updated.
 * - Old objects are left in place (the replaced image becomes `original_key`), so the run is safe
 *   to repeat or interrupt.
 * - A screen that already has a derivative keeps it when the run makes none (binding failure, or
 *   the source would now be displayed as is): `original_key` is never served, so it never becomes
 *   the display image. Only the version (and exception) are recorded then.
 * - Binding failures stay below the version for the next run; documented exceptions are recorded
 *   at the current version and not retried.
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
    .where(cursor ? and(outdated(), gt(screen.id, cursor)) : outdated())
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
      const keepDisplay = row.originalKey !== null && media.originalKey === null;
      const imageKey = keepDisplay ? row.imageKey : media.full.key;
      if (imageKey.startsWith("orig/")) throw new Error(`${imageKey} can't be a display image`);
      await db
        .update(screen)
        .set({
          ...(keepDisplay
            ? {}
            : {
                imageKey,
                width: media.full.width,
                height: media.full.height,
                bytes: media.full.bytes,
                originalKey: media.originalKey,
              }),
          thumbKey: media.thumb.key,
          thumbWidth: media.thumb.width,
          thumbHeight: media.thumb.height,
          displayVersion: media.displayVersion,
          displayException: media.displayException,
        })
        .where(eq(screen.id, row.id));
      const result = { screenId: row.id, imageKey, thumbKey: media.thumb.key };
      if (media.displayVersion === null) {
        items.push({ ...result, action: "failed", reason: "the Images binding failed" });
      } else if (media.displayException) {
        items.push({ ...result, action: "exception", exception: media.displayException });
      } else {
        const changed = imageKey !== row.imageKey || media.thumb.key !== row.thumbKey;
        items.push({ ...result, action: changed ? "updated" : "current" });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const exception = permanentException(error);
      if (exception) {
        // Only a thumbnail from a client would do; don't retry it on every run.
        await db
          .update(screen)
          .set({ displayVersion: DISPLAY_POLICY.version, displayException: exception })
          .where(eq(screen.id, row.id));
        items.push({ ...item, action: "exception", exception, reason });
      } else items.push({ ...item, action: "failed", reason });
    }
  }
  return {
    items,
    nextCursor: rows.length === limit ? rows.at(-1)!.id : null,
    remaining: await remainingCount(),
  };
}
