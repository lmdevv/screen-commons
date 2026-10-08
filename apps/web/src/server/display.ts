import type { ImagesBinding } from "@cloudflare/workers-types";
import {
  DISPLAY_POLICY,
  displaySize,
  encodeWithinBudget,
  isDisplayReady,
  keepSource,
  sniffImage,
  thumbnailBox,
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
  /** Binding missing, failing or over budget; the caller decides the fallback. */
  | { status: "failed"; reason: string };

async function encode(
  images: ImagesBinding,
  data: Uint8Array,
  transform: Transform | null,
  quality: number,
): Promise<DecodedImage & { bytes: number }> {
  let input = images.input(
    new Blob([data as Uint8Array<ArrayBuffer>]).stream() as unknown as ImageStream,
  );
  if (transform) input = input.transform(transform);
  const result = await input.output({
    format: DISPLAY_POLICY.type,
    quality: Math.round(quality * 100),
  });
  const bytes = new Uint8Array(await result.response().arrayBuffer());
  const header = sniffImage(bytes);
  if (!header) throw new Error("the Images binding returned an unreadable image");
  return { data: bytes, ...header, bytes: bytes.byteLength };
}

function failure(outcome: Exclude<EncodeOutcome<unknown>, { status: "ok" }>): Derivation {
  if (outcome.status === "over_budget") {
    return { status: "failed", reason: `${outcome.bytes} bytes at the lowest quality` };
  }
  if (outcome.status === "unsupported") {
    return { status: "failed", reason: `the binding returned ${outcome.type}` };
  }
  return { status: "failed", reason: outcome.message };
}

const errorReason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The display image (`DISPLAY_POLICY.full`) for a source: WebP, scaled to fit, within budget. */
export async function deriveDisplayImage(
  images: ImagesBinding | undefined,
  source: DecodedImage,
): Promise<Derivation> {
  const info = { ...source, bytes: source.data.byteLength };
  if (isDisplayReady(info)) return { status: "kept" };
  if (!images) return { status: "failed", reason: "the IMAGES binding is unavailable" };
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
    return { status: "failed", reason: errorReason(error) };
  }
}

/** Thumbnail (`DISPLAY_POLICY.thumbnail`): ≤640px wide WebP, never upscaled, top-anchored crop. */
export async function deriveThumbnail(
  images: ImagesBinding | undefined,
  source: DecodedImage,
  kind: ThumbnailKind,
): Promise<Exclude<Derivation, { status: "kept" }>> {
  if (!images) return { status: "failed", reason: "the IMAGES binding is unavailable" };
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
    if (outcome.status !== "ok") return failure(outcome) as { status: "failed"; reason: string };
    return { status: "derived", image: outcome.image };
  } catch (error) {
    return { status: "failed", reason: errorReason(error) };
  }
}
