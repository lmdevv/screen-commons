import type { Platform } from "@open-ui/core/taxonomy";

/**
 * Screenshot framing rules shared by tiles, cards, strips and the viewer.
 *
 * Thumbnails are produced by clients as top-anchored crops (max 16:10 for desktop, 9:19.5 for
 * mobile, see docs/spec.md). Grids use a uniform frame per platform so rows line up and nothing
 * shifts while images load.
 */

/** Width / height of the frame a screenshot is shown in. */
export const FRAME_ASPECT = {
  /** Desktop/web: 16:10. */
  web: 16 / 10,
  /** Phones: 9:19.5 (modern iPhone / Android). */
  mobile: 9 / 19.5,
} as const;

export type FrameKind = keyof typeof FRAME_ASPECT;

export function isMobilePlatform(platform: Platform): boolean {
  return platform === "ios" || platform === "android";
}

export function frameKind(platform: Platform): FrameKind {
  return isMobilePlatform(platform) ? "mobile" : "web";
}

export interface ScreenFrame {
  kind: FrameKind;
  /** CSS `aspect-ratio` value for the frame, e.g. `"16 / 10"`. */
  aspectRatio: string;
  /** Numeric width / height of the frame. */
  ratio: number;
  /**
   * How the image fills the frame:
   * - `cover` — image is taller than (or equal to) the frame: fill the width, crop the bottom.
   * - `contain` — image is wider/shorter than the frame: show it whole, anchored to the top,
   *   so a short landing-page strip is never cropped at the sides.
   */
  fit: "cover" | "contain";
  /** Always top-anchored: the top of a page is the most recognisable part. */
  objectPosition: "top";
}

const RATIO_EPSILON = 0.02;

/**
 * Frame + fit for a screenshot of `width`×`height` on `platform`.
 * Invalid dimensions (0, NaN) fall back to `cover`.
 */
export function screenFrame(platform: Platform, width: number, height: number): ScreenFrame {
  const kind = frameKind(platform);
  const ratio = FRAME_ASPECT[kind];
  const imageRatio = width > 0 && height > 0 ? width / height : Number.NaN;
  const fit = Number.isFinite(imageRatio) && imageRatio > ratio + RATIO_EPSILON ? "contain" : "cover";
  return {
    kind,
    aspectRatio: kind === "web" ? "16 / 10" : "9 / 19.5",
    ratio,
    fit,
    objectPosition: "top",
  };
}

/**
 * Pixel size for the `<img width height>` attributes: keeps the intrinsic aspect so the browser
 * can reserve space (no CLS) while CSS sizes the frame.
 */
export function intrinsicSize(
  width: number,
  height: number,
  maxWidth = 640,
): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: maxWidth, height: Math.round(maxWidth / 1.6) };
  const scale = Math.min(1, maxWidth / width);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** `sizes` attribute for grid thumbnails, matching ScreenGrid's column breakpoints. */
export function gridSizes(kind: FrameKind): string {
  return kind === "web"
    ? "(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
    : "(min-width: 1536px) 16vw, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw";
}
