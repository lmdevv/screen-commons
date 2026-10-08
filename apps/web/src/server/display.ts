import type { ImagesBinding } from "@cloudflare/workers-types";
import {
  DISPLAY_POLICY,
  bindingAccepts,
  displaySize,
  encodeWithinBudget,
  isDisplayReady,
  keepSource,
  sniffImage,
  thumbnailBox,
  type DisplayException,
  type EncodeOutcome,
  type ImageSize,
  type StoredImageType,
  type ThumbnailKind,
} from "@screen-commons/core";

/**
 * Server-side display derivatives with the Cloudflare Images binding, for sources a client
 * couldn't encode per the display policy (remote API/MCP uploads, browsers without a WebP
 * encoder, old clients, backfill). Same quality ladders, budgets and read-back checks as the
 * client encoders; the binding may round resized edges differently, so ±1px is accepted.
 *
 * Sources outside the binding's input limits (`IMAGES_BINDING_LIMITS`) are never sent to it.
 */

type ImageStream = Parameters<ImagesBinding["input"]>[0];
type Transform = Parameters<ReturnType<ImagesBinding["input"]>["transform"]>[0];

export interface DecodedImage extends ImageSize {
  data: Uint8Array;
  type: StoredImageType;
}

export type Derivation =
  | { status: "derived"; image: DecodedImage }
  /** The source is (or stays) the display image: already display-ready, or WebP isn't smaller. */
  | { status: "kept" }
  /**
   * No derivative. With `exception`, retrying can't help (no binding, source outside its limits,
   * unusable output); without, the binding call failed (binding or network error, quota) and a
   * retry may succeed. The caller decides the fallback.
   */
  | { status: "failed"; reason: string; exception?: DisplayException };

type Failure = Extract<Derivation, { status: "failed" }>;

/** The binding answered, but not with a usable image: the same input would get the same. */
class UnusableOutput extends Error {}

/**
 * One Blob per source, shared by every attempt (display ladder, thumbnail): each attempt streams
 * it instead of copying the source again, which matters for 15 MB sources in 128 MB Workers.
 */
const sourceBlobs = new WeakMap<Uint8Array, Blob>();

function sourceStream(data: Uint8Array): ImageStream {
  let blob = sourceBlobs.get(data);
  if (!blob) {
    blob = new Blob([data as Uint8Array<ArrayBuffer>]);
    sourceBlobs.set(data, blob);
  }
  return blob.stream() as unknown as ImageStream;
}

async function encode(
  images: ImagesBinding,
  data: Uint8Array,
  transform: Transform | null,
  quality: number,
): Promise<DecodedImage & { bytes: number }> {
  let input = images.input(sourceStream(data));
  if (transform) input = input.transform(transform);
  const result = await input.output({
    format: DISPLAY_POLICY.type,
    quality: Math.round(quality * 100),
  });
  const bytes = new Uint8Array(await result.response().arrayBuffer());
  const header = sniffImage(bytes);
  if (!header) throw new UnusableOutput("the Images binding returned an unreadable image");
  return { data: bytes, ...header, bytes: bytes.byteLength };
}

const NO_BINDING: Failure = {
  status: "failed",
  reason: "this instance has no Images binding",
  exception: "no_binding",
};

/** Sources the binding must not be sent (`IMAGES_BINDING_LIMITS`). */
function outsideLimits(source: DecodedImage): Failure | null {
  const { type, width, height } = source;
  if (bindingAccepts({ type, width, height, bytes: source.data.byteLength })) return null;
  return {
    status: "failed",
    reason: `a ${width}x${height} ${type} is outside the Images binding's input limits (PNG/JPEG up to 12,000px a side, 100 MP, 20 MB)`,
    exception: "binding_limits",
  };
}

function failure(outcome: Exclude<EncodeOutcome<unknown>, { status: "ok" }>): Failure {
  const reason =
    outcome.status === "over_budget"
      ? `${outcome.bytes} bytes at the lowest quality`
      : outcome.status === "unsupported"
        ? `the binding returned ${outcome.type}`
        : outcome.message;
  return { status: "failed", reason, exception: "unconvertible" };
}

function thrown(error: unknown): Failure {
  const reason = error instanceof Error ? error.message : String(error);
  return error instanceof UnusableOutput
    ? { status: "failed", reason, exception: "unconvertible" }
    : { status: "failed", reason };
}

/** The display image (`DISPLAY_POLICY.full`) for a source: WebP, scaled to fit, within budget. */
export async function deriveDisplayImage(
  images: ImagesBinding | undefined,
  source: DecodedImage,
): Promise<Derivation> {
  const info = { ...source, bytes: source.data.byteLength };
  if (isDisplayReady(info)) return { status: "kept" };
  if (!images) return NO_BINDING;
  const blocked = outsideLimits(source);
  if (blocked) return blocked;
  const size = displaySize(source.width, source.height);
  // Only the edge that constrains: given both, the binding fits inside them and rounds the other
  // edge from the scaled one (300x18000 → 273x16380 instead of 273x16383).
  const { maxWidth, maxHeight } = DISPLAY_POLICY.full;
  const resize: Transform | null = !size.scaled
    ? null
    : maxHeight / source.height < maxWidth / source.width
      ? { height: size.height, fit: "scale-down" }
      : { width: size.width, fit: "scale-down" };
  try {
    const outcome = await encodeWithinBudget(
      (quality) => encode(images, source.data, resize, quality),
      size,
      DISPLAY_POLICY.full,
      1,
    );
    if (outcome.status !== "ok") return failure(outcome);
    if (keepSource(info, outcome.image.bytes)) return { status: "kept" };
    return { status: "derived", image: outcome.image };
  } catch (error) {
    return thrown(error);
  }
}

/**
 * Thumbnail (`DISPLAY_POLICY.thumbnail`): ≤640px wide WebP, never upscaled and no wider than the
 * display image, top-anchored crop, made from the source.
 */
export async function deriveThumbnail(
  images: ImagesBinding | undefined,
  source: DecodedImage,
  kind: ThumbnailKind,
): Promise<Exclude<Derivation, { status: "kept" }>> {
  if (!images) return NO_BINDING;
  const blocked = outsideLimits(source);
  if (blocked) return blocked;
  const box = thumbnailBox(source.width, source.height, kind);
  try {
    const outcome = await encodeWithinBudget(
      (quality) =>
        encode(
          images,
          source.data,
          box.cropped
            ? { width: box.width, height: box.height, fit: "cover", gravity: "top" }
            : { width: box.width, fit: "scale-down" },
          quality,
        ),
      box,
      DISPLAY_POLICY.thumbnail,
      1,
    );
    if (outcome.status !== "ok") return failure(outcome);
    return { status: "derived", image: outcome.image };
  } catch (error) {
    return thrown(error);
  }
}
