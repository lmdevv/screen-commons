import { describe, expect, it } from "vitest";

import { LIMITS } from "./limits";
import { describeMatch, flowImageSteps, toolErrorText } from "./mcp-results";
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

describe("describeMatch", () => {
  const match = {
    mode: "relaxed" as const,
    app: null,
    appWithoutResults: null,
    appNotFound: null,
    matchedTerms: [],
    unmatchedTerms: [],
  };

  it("says when the app the query names has nothing that matches", () => {
    expect(
      describeMatch({ ...match, app: "linear", unmatchedTerms: ["progress", "bar"] }, "flow"),
    ).toBe('The app "linear" has no flow matching "progress", "bar".');
  });

  it("says when every app answers for an app named in passing", () => {
    expect(
      describeMatch({ ...match, appWithoutResults: "resend", matchedTerms: ["invite"] }, "screen"),
    ).toBe(
      'The app "resend" has no screen matching the rest of the query, so these results come from every app. Fewer than 3 results contain every search term, so results that contain some of them follow.',
    );
  });
});
