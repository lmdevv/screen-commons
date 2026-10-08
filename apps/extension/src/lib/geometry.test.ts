import { describe, expect, it } from "vitest";

import {
  MAX_OUTPUT_HEIGHT,
  documentRect,
  kindForViewport,
  planCapture,
  planStitchTiles,
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
    expect(plan.scale).toBeCloseTo(MAX_OUTPUT_HEIGHT / 12_000, 3);
    expect(plan.truncated).toBe(false);
    expect(plan.outputHeight).toBeLessThanOrEqual(MAX_OUTPUT_HEIGHT);
  });

  it("truncates when even scale 1 does not fit", () => {
    const plan = planCapture({ x: 0, y: 0, width: 1280, height: 40_000 }, 1);
    expect(plan.scale).toBe(1);
    expect(plan.truncated).toBe(true);
    expect(plan.clip.height).toBe(MAX_OUTPUT_HEIGHT);
    expect(plan.outputHeight).toBe(MAX_OUTPUT_HEIGHT);
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
