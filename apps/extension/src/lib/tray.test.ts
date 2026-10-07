import { captureBatchInputSchema } from "@open-ui/core/schemas";
import { describe, expect, it } from "vitest";

import { chunkByBudget, estimateScreenBytes } from "./chunk";
import { dominantColor } from "./color";
import { normalizeServerUrl, originMatchPattern, sanitizeSettings } from "./settings";
import {
  EMPTY_DRAFT,
  moveItem,
  nextOrder,
  normalizeText,
  reindex,
  sortShots,
  type ShotSummary,
  type TrayDraft,
} from "./tray";
import {
  buildAppInput,
  buildFlowInput,
  buildScreenInput,
  planUpload,
  validateDraft,
} from "./upload-plan";

describe("tray ordering", () => {
  const items = ["a", "b", "c", "d"];

  it("moves items forward and backward", () => {
    expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(items, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(items, 1, 1)).toEqual(items);
  });

  it("clamps out-of-range targets and ignores bad sources", () => {
    expect(moveItem(items, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(items, 9, 0)).toEqual(items);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("reindexes only changed items", () => {
    const shots = [
      { id: "x", order: 0 },
      { id: "y", order: 5 },
      { id: "z", order: 1 },
    ];
    expect(reindex(shots)).toEqual([
      { id: "y", order: 1 },
      { id: "z", order: 2 },
    ]);
  });

  it("sorts by order then capture time and appends after the max", () => {
    const shots = [
      { order: 2, capturedAt: "2026-01-01T00:00:00Z" },
      { order: 0, capturedAt: "2026-01-03T00:00:00Z" },
      { order: 0, capturedAt: "2026-01-02T00:00:00Z" },
    ];
    expect(sortShots(shots).map((s) => s.capturedAt)).toEqual([
      "2026-01-02T00:00:00Z",
      "2026-01-03T00:00:00Z",
      "2026-01-01T00:00:00Z",
    ]);
    expect(nextOrder(shots)).toBe(3);
    expect(nextOrder([])).toBe(0);
  });
});

describe("normalizeText", () => {
  it("collapses whitespace and caps at a word boundary", () => {
    expect(normalizeText("  Hello\n\n  world\t ")).toBe("Hello world");
    const long = "word ".repeat(5000);
    const out = normalizeText(long, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith("word")).toBe(true);
    expect(normalizeText(null)).toBe("");
  });
});

describe("chunkByBudget", () => {
  it("splits by count", () => {
    const chunks = chunkByBudget(
      Array.from({ length: 120 }, () => 1),
      { maxCount: 50, maxBytes: 1e9 },
    );
    expect(chunks.map((c) => c.length)).toEqual([50, 50, 20]);
    expect(chunks.flat()).toEqual([...Array(120).keys()]);
  });

  it("splits by bytes and isolates oversized items", () => {
    expect(chunkByBudget([40, 40, 40, 200, 10], { maxCount: 50, maxBytes: 100 })).toEqual([
      [0, 1],
      [2],
      [3],
      [4],
    ]);
  });

  it("returns nothing for no items", () => {
    expect(chunkByBudget([])).toEqual([]);
  });

  it("estimates base64 overhead", () => {
    expect(estimateScreenBytes(3000, 300, 100)).toBe(4400 + 100 + 2048);
  });
});

describe("dominantColor", () => {
  it("picks the most common bucket and averages it", () => {
    const pixels: number[] = [];
    for (let i = 0; i < 10; i += 1) pixels.push(250, 250, 250, 255);
    for (let i = 0; i < 4; i += 1) pixels.push(10, 20, 200, 255);
    expect(dominantColor(pixels)).toBe("#fafafa");
  });

  it("ignores transparent pixels", () => {
    expect(dominantColor([0, 0, 0, 0, 255, 0, 0, 255])).toBe("#ff0000");
    expect(dominantColor([0, 0, 0, 0])).toBeNull();
  });
});

describe("settings", () => {
  it("normalises server URLs", () => {
    expect(normalizeServerUrl("localhost:5173/")).toBe("http://localhost:5173");
    expect(normalizeServerUrl("ui.example.com")).toBe("https://ui.example.com");
    expect(normalizeServerUrl("https://ui.example.com/openui/")).toBe(
      "https://ui.example.com/openui",
    );
    expect(normalizeServerUrl("ftp://x")).toBeNull();
    expect(normalizeServerUrl("")).toBeNull();
  });

  it("builds match patterns without ports", () => {
    expect(originMatchPattern("http://localhost:3000")).toBe("http://localhost/*");
    expect(originMatchPattern("https://ui.example.com/sub")).toBe("https://ui.example.com/*");
  });

  it("sanitizes stored settings", () => {
    const settings = sanitizeSettings({
      bridgePort: 99_999,
      serverUrl: "nope://",
      fullPageMethod: "weird" as never,
    });
    expect(settings.bridgePort).toBe(7457);
    expect(settings.serverUrl).toBe("http://localhost:5173");
    expect(settings.fullPageMethod).toBe("auto");
  });
});

function shot(overrides: Partial<ShotSummary> = {}): ShotSummary {
  return {
    id: "s1",
    order: 0,
    mode: "full",
    kind: "desktop",
    url: "https://linear.app/pricing",
    pageTitle: "Pricing – Linear",
    title: "Pricing",
    patterns: ["pricing"],
    width: 1440,
    height: 4000,
    bytes: 1_000_000,
    imageType: "image/png",
    thumbnailWidth: 640,
    thumbnailHeight: 400,
    dominantColor: "#ffffff",
    text: "Plans and pricing",
    faviconUrl: null,
    siteName: null,
    truncated: false,
    capturedAt: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

const draft = (overrides: Partial<TrayDraft["flow"]> = {}): TrayDraft => ({
  ...EMPTY_DRAFT,
  app: {
    name: "Linear",
    websiteUrl: "https://linear.app",
    platform: "web",
    category: "productivity",
  },
  flow: { enabled: false, name: "", type: "", ...overrides },
});

describe("upload plan", () => {
  it("validates the draft", () => {
    expect(validateDraft(draft(), [])).toMatch(/empty/u);
    expect(validateDraft({ ...draft(), app: { ...draft().app, name: " " } }, [shot()])).toMatch(
      /app name/u,
    );
    expect(
      validateDraft({ ...draft(), app: { ...draft().app, websiteUrl: "linear" } }, [shot()]),
    ).toMatch(/full URL/u);
    expect(validateDraft(draft({ enabled: true }), [shot(), shot()])).toMatch(/Name the flow/u);
    expect(validateDraft(draft({ enabled: true, name: "Sign up" }), [shot()])).toMatch(
      /two screens/u,
    );
    expect(validateDraft(draft(), [shot()])).toBeNull();
  });

  it("puts a single-batch flow inline and splits large flows", () => {
    expect(planUpload(draft({ enabled: true, name: "x" }), [shot(), shot()], [1000, 1000])).toEqual(
      {
        chunks: [[0, 1]],
        flowMode: "inline",
      },
    );
    const many = Array.from({ length: 60 }, () => shot());
    const plan = planUpload(
      draft({ enabled: true, name: "x" }),
      many,
      many.map(() => 1000),
    );
    expect(plan.flowMode).toBe("separate");
    expect(plan.chunks.map((c) => c.length)).toEqual([25, 25, 10]);
    expect(
      planUpload(
        draft(),
        many,
        many.map(() => 1000),
        1e12,
      ).chunks.map((c) => c.length),
    ).toEqual([50, 10]);
  });

  it("produces a batch that satisfies captureBatchInputSchema", () => {
    const d = draft({ enabled: true, name: "Pricing tour", type: "upgrading" });
    const screen = buildScreenInput(
      shot(),
      { type: "image/png", base64: "aGVsbG8=" },
      { type: "image/webp", base64: "aGk=" },
      { stepLabel: true },
    );
    const input = {
      app: buildAppInput(d),
      screens: [screen],
      flow: buildFlowInput(d),
      source: "extension" as const,
    };
    const parsed = captureBatchInputSchema.parse(input);
    expect(parsed.screens[0]).toMatchObject({
      title: "Pricing",
      sourceUrl: "https://linear.app/pricing",
      stepLabel: "Pricing",
      text: "Plans and pricing",
      version: "Oct 2026",
      patterns: ["pricing"],
    });
    expect(parsed.app).toMatchObject({ name: "Linear", category: "productivity", platform: "web" });
    expect(parsed.flow).toEqual({ name: "Pricing tour", type: "upgrading" });
  });

  it("omits empty optional fields", () => {
    const d = {
      ...draft(),
      app: { name: "X", websiteUrl: "", platform: "web" as const, category: "" as const },
    };
    expect(buildAppInput(d)).toEqual({ name: "X", platform: "web" });
    expect(buildFlowInput(d)).toBeUndefined();
    const screen = buildScreenInput(
      shot({ title: "", dominantColor: null, text: "", url: "chrome://x" }),
      { type: "image/png", base64: "a" },
      { type: "image/webp", base64: "b" },
    );
    expect(screen).not.toHaveProperty("title");
    expect(screen).not.toHaveProperty("sourceUrl");
    expect(screen).not.toHaveProperty("text");
    expect(screen).not.toHaveProperty("dominantColor");
  });
});
