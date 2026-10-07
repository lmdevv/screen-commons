import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./segmented-control";

const options = [
  { value: "web", label: "Web" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android", disabled: true },
] as const;

describe("SegmentedControl", () => {
  it("exposes radiogroup semantics with a single tab stop", () => {
    render(<SegmentedControl aria-label="Platform" options={options} defaultValue="ios" />);
    expect(screen.getByRole("radiogroup", { name: "Platform" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("moves and selects with arrow keys, skipping disabled options and wrapping", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Platform"
        options={options}
        defaultValue="web"
        onValueChange={onValueChange}
      />,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Web" }));

    await user.keyboard("{ArrowRight}");
    expect(onValueChange).toHaveBeenLastCalledWith("ios");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "iOS" }));

    // Android is disabled → wraps back to Web.
    await user.keyboard("{ArrowRight}");
    expect(onValueChange).toHaveBeenLastCalledWith("web");
    expect(screen.getByRole("radio", { name: "Web" }).getAttribute("aria-checked")).toBe("true");

    await user.keyboard("{End}");
    expect(onValueChange).toHaveBeenLastCalledWith("ios");
  });

  it("stays controlled", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = React.useState("web");
      return (
        <>
          <SegmentedControl aria-label="Platform" options={options} value={value} onValueChange={setValue} />
          <output>{value}</output>
        </>
      );
    }
    render(<Controlled />);
    await user.click(screen.getByRole("radio", { name: "iOS" }));
    expect(screen.getByRole("status").textContent).toBe("ios");
  });
});
