import { WEBP_MAX_DIMENSION } from "@screen-commons/core/image-policy";
import { LIMITS } from "@screen-commons/core/limits";

/**
 * Largest bitmap we produce. Chromium's compositor reliably captures up to 16384px per side;
 * stopping at WebP's 16,383px limit means full-height captures are encoded without a resample.
 */
export const MAX_OUTPUT_WIDTH = LIMITS.maxImageWidth;
export const MAX_OUTPUT_HEIGHT = WEBP_MAX_DIMENSION;

export type ShotKind = "desktop" | "mobile";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CapturePlan {
  /** Device pixels per CSS pixel to request. */
  scale: number;
  /** CSS-pixel area to capture (may be shorter than the document when truncated). */
  clip: Rect;
  outputWidth: number;
  outputHeight: number;
  truncated: boolean;
}

/**
 * Pick a capture scale and clip for an area of `width x height` CSS pixels at device pixel ratio
 * `dpr`, staying within the output limits. Prefers full device resolution; reduces scale (never
 * below 1, unless the width alone requires it) before truncating very tall pages.
 */
export function planCapture(
  area: Rect,
  dpr: number,
  limits: { maxWidth?: number; maxHeight?: number } = {},
): CapturePlan {
  const maxWidth = limits.maxWidth ?? MAX_OUTPUT_WIDTH;
  const maxHeight = limits.maxHeight ?? MAX_OUTPUT_HEIGHT;
  const width = Math.max(1, Math.ceil(area.width));
  const height = Math.max(1, Math.ceil(area.height));
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;

  const widthScale = maxWidth / width;
  let scale = Math.min(safeDpr, widthScale);
  if (height * scale > maxHeight) {
    const fit = maxHeight / height;
    scale = Math.min(scale, Math.max(fit, Math.min(1, widthScale)));
  }
  // Round to 4 decimals so integer outputs are stable across browsers.
  scale = Math.floor(scale * 10_000) / 10_000;
  const clipHeight = Math.min(height, Math.floor(maxHeight / scale));
  return {
    scale,
    clip: {
      x: Math.max(0, Math.floor(area.x)),
      y: Math.max(0, Math.floor(area.y)),
      width,
      height: clipHeight,
    },
    outputWidth: Math.round(width * scale),
    outputHeight: Math.round(clipHeight * scale),
    truncated: clipHeight < height,
  };
}

/**
 * Scroll positions for scroll-and-stitch. Tiles start at 0 and advance by one viewport; the last
 * tile is clamped so it ends exactly at the document bottom (it overlaps the previous tile).
 */
export function planStitchTiles(documentHeight: number, viewportHeight: number): number[] {
  const doc = Math.max(1, Math.ceil(documentHeight));
  const view = Math.max(1, Math.floor(viewportHeight));
  if (doc <= view) return [0];
  const positions: number[] = [];
  for (let y = 0; y + view < doc; y += view) positions.push(y);
  const last = doc - view;
  if (positions[positions.length - 1] !== last) positions.push(last);
  return positions;
}

/**
 * Where a captured viewport tile goes on the stitched canvas. `actualScrollY` is what the page
 * reports after scrolling (browsers clamp), `pixelRatio` is tile pixels per CSS pixel.
 */
export function tilePlacement(
  actualScrollY: number,
  tileHeightPx: number,
  pixelRatio: number,
  canvasHeightPx: number,
): { destY: number; srcHeight: number } | null {
  const destY = Math.round(actualScrollY * pixelRatio);
  if (destY >= canvasHeightPx) return null;
  return { destY, srcHeight: Math.min(tileHeightPx, canvasHeightPx - destY) };
}

/** Desktop vs mobile from the CSS viewport width a shot was taken at. */
export function kindForViewport(viewportWidth: number): ShotKind {
  return viewportWidth > 0 && viewportWidth < 600 ? "mobile" : "desktop";
}

/** Convert a viewport-relative element rect into a document rect clamped to the document. */
export function documentRect(
  rect: Rect,
  scroll: { x: number; y: number },
  documentSize: { width: number; height: number },
): Rect | null {
  const x = Math.max(0, rect.x + scroll.x);
  const y = Math.max(0, rect.y + scroll.y);
  const right = Math.min(documentSize.width, rect.x + scroll.x + rect.width);
  const bottom = Math.min(documentSize.height, rect.y + scroll.y + rect.height);
  const width = right - x;
  const height = bottom - y;
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}
