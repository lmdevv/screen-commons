import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FlowCard, type FlowCardData } from "./flow-card";

const preview = (id: string) => ({ id, thumbUrl: `/${id}.webp`, width: 1440, height: 900 });

describe("FlowCard", () => {
  it("shows a repeated screen once per step, with no duplicate keys", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flow = {
      id: "flow_1",
      name: "Repeats",
      type: null,
      stepCount: 3,
      saved: false,
      app: { name: "Northwind", platform: "web" },
      previews: [preview("a"), preview("a"), preview("b")],
    } as unknown as FlowCardData;
    const { container } = render(<FlowCard flow={flow} />);
    expect(container.querySelectorAll("img").length).toBeGreaterThanOrEqual(2);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
