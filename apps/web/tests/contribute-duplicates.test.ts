import { describe, expect, it } from "vitest";

import { findDuplicates, looksSame, type Draft } from "../src/components/contribute/model";

const fingerprint = (fill: number, length = 64 * 40 * 4) =>
  new Uint8ClampedArray(length).fill(fill);

function image(fill: number, overrides: { width?: number; height?: number } = {}) {
  return { width: 1440, height: 900, ...overrides, fingerprint: fingerprint(fill) };
}

function draft(id: string, processed: ReturnType<typeof image> | undefined, status = "ready") {
  return { id, name: `${id}.png`, status, processed } as unknown as Draft;
}

describe("looksSame", () => {
  it("matches re-captures that differ only slightly", () => {
    const recapture = image(100);
    recapture.fingerprint[10] = 115;
    expect(looksSame(image(100), recapture)).toBe(true);
  });

  it("tells apart states that differ anywhere by more than the tolerance", () => {
    const changed = image(100);
    changed.fingerprint[10] = 165;
    expect(looksSame(image(100), changed)).toBe(false);
  });

  it("never matches images of different sizes", () => {
    expect(looksSame(image(100), image(100, { height: 901 }))).toBe(false);
  });
});

describe("findDuplicates", () => {
  it("flags later copies against the first, skipping drafts that aren't ready", () => {
    const drafts = [
      draft("a", image(100)),
      draft("b", image(200)),
      draft("c", image(100)),
      draft("d", image(100), "processing"),
      draft("e", undefined, "invalid"),
      draft("f", image(200)),
    ];
    const duplicates = findDuplicates(drafts);
    expect([...duplicates].map(([id, original]) => [id, original.id])).toEqual([
      ["c", "a"],
      ["f", "b"],
    ]);
  });

  it("keeps the next copy once the first is removed", () => {
    const drafts = [draft("a", image(100)), draft("c", image(100)), draft("g", image(100))];
    const duplicates = findDuplicates(drafts.slice(1));
    expect([...duplicates.keys()]).toEqual(["g"]);
    expect(duplicates.get("g")?.id).toBe("c");
  });
});
