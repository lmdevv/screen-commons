import { describe, expect, it } from "vitest";

import { LIMITS } from "./limits";
import { flowImageSteps, toolErrorText } from "./mcp-results";
import type { FlowDetail } from "./index";

describe("flowImageSteps", () => {
  it("takes the first steps by position, up to the limit", () => {
    const steps = Array.from({ length: LIMITS.maxFlowSteps }, (_, index) => ({
      position: LIMITS.maxFlowSteps - index,
    }));
    const picked = flowImageSteps({ steps } as unknown as FlowDetail);
    expect(picked).toHaveLength(LIMITS.maxFlowImages);
    expect(picked.map((step) => step.position)).toEqual(
      Array.from({ length: LIMITS.maxFlowImages }, (_, index) => index + 1),
    );
  });
});

describe("toolErrorText", () => {
  it("reads code: message, with any wait", () => {
    expect(toolErrorText("not_found", "Flow not found")).toBe("not_found: Flow not found");
    expect(toolErrorText("unavailable", "Try later.", 60)).toBe(
      "unavailable: Try later. Retry in 60 seconds.",
    );
  });

  it("says whether an internal failure is safe to retry", () => {
    const text = toolErrorText("internal", "Something went wrong");
    expect(text).toMatch(/^internal: Something went wrong\. The change may or may not/u);
    expect(text).toContain("Retrying is safe");
    expect(text).toContain("create_flow without an id");
  });
});
