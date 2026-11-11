import { describe, expect, it } from "vitest";

import { stepSource } from "./screen";

const step = (width: number, height: number) => ({
  thumbUrl: "/media/thumb.webp",
  imageUrl: "/media/full.webp",
  width,
  height,
});

describe("stepSource", () => {
  it("shows a landscape step taller than 16:10 whole, from the full image", () => {
    expect(stepSource(step(1920, 1320), "web")).toEqual({ src: "/media/full.webp", fit: "whole" });
  });

  it("offers the full image beside an uncropped thumbnail for 2x displays", () => {
    expect(stepSource(step(1440, 900), "web")).toEqual({
      src: "/media/thumb.webp",
      srcSet: "/media/thumb.webp 640w, /media/full.webp 1440w",
      fit: "whole",
    });
  });

  it("keeps the top crop of a page capture from its thumbnail alone", () => {
    expect(stepSource(step(1440, 6000), "web")).toEqual({ src: "/media/thumb.webp", fit: "top" });
  });

  it("uses the thumbnail alone when it is the full size", () => {
    expect(stepSource(step(320, 200), "web")).toEqual({ src: "/media/thumb.webp", fit: "whole" });
  });

  it("shows a phone step taller than 9:19.5 whole", () => {
    expect(stepSource(step(1080, 2400), "android")).toEqual({
      src: "/media/full.webp",
      fit: "whole",
    });
    expect(stepSource(step(1179, 2556), "ios")).toEqual({
      src: "/media/thumb.webp",
      srcSet: "/media/thumb.webp 640w, /media/full.webp 1179w",
      fit: "whole",
    });
  });
});
