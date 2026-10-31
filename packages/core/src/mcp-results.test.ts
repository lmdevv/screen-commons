import { describe, expect, it } from "vitest";

import { LIMITS } from "./limits";
import { flowImageSteps } from "./mcp-results";
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
