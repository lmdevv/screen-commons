import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { intrinsicSize, screenFrame } from "../lib/screen";
import { ScreenTile, type ScreenTileData } from "./screen-tile";

const webScreen: ScreenTileData = {
  id: "scr_1",
  title: "Pricing",
  thumbUrl: "/thumb.webp",
  width: 1440,
  height: 2400,
  saved: false,
  app: { name: "Northwind", platform: "web" },
};

describe("screenFrame", () => {
  it("uses 16:10 for web and 9:19.5 for phones", () => {
    expect(screenFrame("web", 1440, 900).aspectRatio).toBe("16 / 10");
    expect(screenFrame("ios", 390, 844).aspectRatio).toBe("9 / 19.5");
    expect(screenFrame("android", 412, 915).kind).toBe("mobile");
  });

  it("crops tall captures from the top and letterboxes short/wide ones", () => {
    expect(screenFrame("web", 1440, 4000)).toMatchObject({ fit: "cover", objectPosition: "top" });
    expect(screenFrame("web", 1440, 900).fit).toBe("cover"); // exactly 16:10
    expect(screenFrame("web", 1440, 600).fit).toBe("contain"); // wider than the frame
    expect(screenFrame("ios", 390, 844).fit).toBe("cover");
    expect(screenFrame("ios", 844, 390).fit).toBe("contain"); // landscape phone shot
  });

  it("treats invalid dimensions as cover", () => {
    expect(screenFrame("web", 0, 0).fit).toBe("cover");
  });

  it("computes intrinsic sizes that keep the aspect ratio", () => {
    expect(intrinsicSize(1440, 900)).toEqual({ width: 640, height: 400 });
    expect(intrinsicSize(390, 844)).toEqual({ width: 390, height: 844 });
  });
});

describe("ScreenTile", () => {
  it("renders a lazy image with explicit size inside the platform frame", () => {
    const { container } = render(<ScreenTile screen={webScreen} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("width")).toBe("640");
    expect(img.getAttribute("height")).toBe("1067");
    expect(img.className).toContain("object-cover");
    expect(img.className).toContain("object-top");
    expect((img.parentElement as HTMLElement).style.aspectRatio).toBe("16 / 10");
  });

  it("prioritises above-the-fold tiles", () => {
    const { container } = render(<ScreenTile screen={webScreen} priority />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("uses the bare phone frame for mobile platforms", () => {
    const { container } = render(
      <ScreenTile
        screen={{ ...webScreen, width: 390, height: 844, app: { name: "Tally", platform: "ios" } }}
      />,
    );
    expect((container.querySelector("img")!.parentElement as HTMLElement).style.aspectRatio).toBe(
      "9 / 19.5",
    );
    expect(container.querySelector(".bg-tile")).toBeNull();
  });

  it("opens and toggles save without nesting interactive elements", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onSaveToggle = vi.fn();
    render(<ScreenTile screen={webScreen} onOpen={onOpen} onSaveToggle={onSaveToggle} />);
    await user.click(screen.getByRole("button", { name: "Pricing — Northwind" }));
    expect(onOpen).toHaveBeenCalledWith(webScreen);
    const save = screen.getByRole("button", { name: "Save Pricing — Northwind" });
    expect(save.getAttribute("aria-pressed")).toBe("false");
    await user.click(save);
    expect(onSaveToggle).toHaveBeenCalledWith(webScreen, true);
    expect(save.closest("button")?.parentElement?.closest("button")).toBeNull();
  });
});
