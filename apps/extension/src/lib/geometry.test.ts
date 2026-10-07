import { describe, expect, it } from "vitest";

import {
  documentRect,
  kindForViewport,
  planCapture,
  planStitchTiles,
  planThumbnail,
  tilePlacement,
} from "./geometry";

describe("planCapture", () => {
  it("captures at device resolution when within limits", () => {
    const plan = planCapture({ x: 0, y: 0, width: 1440, height: 3200 }, 2);
    expect(plan).toMatchObject({
      scale: 2,
      outputWidth: 2880,
      outputHeight: 6400,
      truncated: false,
    });
    expect(plan.clip).toEqual({ x: 0, y: 0, width: 1440, height: 3200 });
  });

  it("reduces scale toward 1 before truncating tall pages", () => {
    const plan = planCapture({ x: 0, y: 0, width: 1440, height: 12_000 }, 2);
    expect(plan.scale).toBeCloseTo(16_384 / 12_000, 3);
    expect(plan.truncated).toBe(false);
    expect(plan.outputHeight).toBeLessThanOrEqual(16_384);
  });

  it("truncates when even scale 1 does not fit", () => {
    const plan = planCapture({ x: 0, y: 0, width: 1280, height: 40_000 }, 1);
    expect(plan.scale).toBe(1);
    expect(plan.truncated).toBe(true);
    expect(plan.clip.height).toBe(16_384);
    expect(plan.outputHeight).toBe(16_384);
  });

  it("scales down wide content to the max width", () => {
    const plan = planCapture({ x: 0, y: 0, width: 5000, height: 1000 }, 1);
    expect(plan.outputWidth).toBeLessThanOrEqual(4096);
    expect(plan.scale).toBeCloseTo(4096 / 5000, 3);
  });

  it("rounds fractional element rects outward and keeps the origin", () => {
    const plan = planCapture({ x: 10.6, y: 250.2, width: 300.4, height: 99.1 }, 1);
    expect(plan.clip).toEqual({ x: 10, y: 250, width: 301, height: 100 });
  });

  it("treats invalid dpr as 1", () => {
    expect(planCapture({ x: 0, y: 0, width: 100, height: 100 }, Number.NaN).scale).toBe(1);
  });
});

describe("planStitchTiles", () => {
  it("returns a single tile for short pages", () => {
    expect(planStitchTiles(500, 900)).toEqual([0]);
    expect(planStitchTiles(900, 900)).toEqual([0]);
  });

  it("clamps the last tile to the document bottom", () => {
    expect(planStitchTiles(2000, 900)).toEqual([0, 900, 1100]);
  });

  it("does not duplicate an exact multiple", () => {
    expect(planStitchTiles(2700, 900)).toEqual([0, 900, 1800]);
  });
});

describe("tilePlacement", () => {
  it("places tiles at scrollY × ratio and trims the overflow", () => {
    expect(tilePlacement(1100, 1800, 2, 4000)).toEqual({ destY: 2200, srcHeight: 1800 });
    expect(tilePlacement(1800, 1800, 2, 4000)).toEqual({ destY: 3600, srcHeight: 400 });
    expect(tilePlacement(2000, 1800, 2, 4000)).toBeNull();
  });
});

describe("planThumbnail", () => {
  it("crops tall desktop shots from the top to 16:10", () => {
    expect(planThumbnail(2880, 9000, "desktop")).toEqual({
      sx: 0,
      sy: 0,
      sw: 2880,
      sh: 1800,
      width: 640,
      height: 400,
    });
  });

  it("keeps the aspect of short shots", () => {
    expect(planThumbnail(1280, 400, "desktop")).toEqual({
      sx: 0,
      sy: 0,
      sw: 1280,
      sh: 400,
      width: 640,
      height: 200,
    });
  });

  it("uses 9:19.5 for mobile", () => {
    const plan = planThumbnail(1170, 8000, "mobile");
    expect(plan.sh).toBe(Math.round(1170 * (19.5 / 9)));
    expect(plan.width).toBe(640);
    expect(plan.height).toBe(Math.round((plan.sh * 640) / 1170));
  });

  it("never upscales small images", () => {
    expect(planThumbnail(300, 150, "desktop")).toMatchObject({ width: 300, height: 150 });
  });
});

describe("helpers", () => {
  it("classifies viewports", () => {
    expect(kindForViewport(390)).toBe("mobile");
    expect(kindForViewport(1440)).toBe("desktop");
  });

  it("converts and clamps element rects to the document", () => {
    expect(
      documentRect(
        { x: -10, y: 20, width: 100, height: 50 },
        { x: 0, y: 1000 },
        { width: 1200, height: 5000 },
      ),
    ).toEqual({
      x: 0,
      y: 1020,
      width: 90,
      height: 50,
    });
    expect(
      documentRect(
        { x: 0, y: 0, width: 0, height: 10 },
        { x: 0, y: 0 },
        { width: 100, height: 100 },
      ),
    ).toBeNull();
  });
});
