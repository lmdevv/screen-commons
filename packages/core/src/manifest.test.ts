import { describe, expect, it } from "vitest";

import { LIMITS } from "./limits";
import { captureManifestSchema, type CaptureManifestInput } from "./manifest";

const valid = (): CaptureManifestInput => ({
  version: 1,
  id: "acme-signup",
  app: { name: "Acme", websiteUrl: "https://acme.example.com" },
  screens: [
    { localId: "a", source: { file: "a.png" }, patterns: ["signup"], elements: [] },
    { localId: "b", source: { url: "https://acme.example.com/b.png" }, patterns: [], elements: [] },
  ],
  flows: [
    { localId: "f", name: "Sign up", steps: [{ screen: "a" }, { screen: "b", label: "Then" }] },
  ],
});

const issues = (input: unknown) => {
  const result = captureManifestSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("captureManifestSchema", () => {
  it("accepts a screen in many flows and a flow repeating a screen", () => {
    const manifest = valid();
    manifest.flows!.push({
      localId: "g",
      name: "Loop",
      steps: [{ screen: "a" }, { screen: "b" }, { screen: "a" }],
    });
    expect(issues(manifest)).toEqual([]);
  });

  it("defaults the platform and flows, and fixes the version", () => {
    const { flows: _flows, ...manifest } = valid();
    const parsed = captureManifestSchema.parse(manifest);
    expect(parsed.flows).toEqual([]);
    expect(parsed.app.platform).toBe("web");
    expect(issues({ ...manifest, version: 2 })).toEqual(["version"]);
  });

  it("refuses duplicate localIds and steps that resolve to nothing", () => {
    const manifest = valid();
    manifest.screens[1]!.localId = "a";
    manifest.flows!.push({ ...manifest.flows![0]!, steps: [{ screen: "a" }, { screen: "nope" }] });
    expect(issues(manifest)).toEqual([
      "screens.1.localId",
      "flows.1.localId",
      "flows.0.steps.1.screen",
      "flows.1.steps.1.screen",
    ]);
  });

  it("holds flows to the step limits", () => {
    const manifest = valid();
    manifest.flows![0]!.steps = [{ screen: "a" }];
    expect(issues(manifest)).toEqual(["flows.0.steps"]);
    manifest.flows![0]!.steps = Array.from({ length: LIMITS.maxFlowSteps + 1 }, () => ({
      screen: "a",
    }));
    expect(issues(manifest)).toEqual(["flows.0.steps"]);
  });

  it("takes https sources only, and refuses unknown fields and bad dates", () => {
    const manifest = valid();
    manifest.screens[1]!.source = { url: "http://acme.example.com/b.png" };
    expect(issues(manifest)).toEqual(["screens.1.source.url"]);
    expect(issues({ ...valid(), extra: true })).toEqual([""]);
    const dated = valid();
    dated.screens[0]!.capturedAt = "yesterday";
    expect(issues(dated)).toEqual(["screens.0.capturedAt"]);
    const unknownPattern = valid();
    unknownPattern.screens[0]!.patterns = ["not-a-pattern" as never];
    expect(issues(unknownPattern)).toEqual(["screens.0.patterns.0"]);
  });
});
