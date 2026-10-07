import { describe, expect, it } from "vitest";

import {
  appNameFromUrl,
  bytesToBase64,
  base64ToBytes,
  readImageHeader,
  slugify,
  suggestPatterns,
} from "./utils";

describe("suggestPatterns", () => {
  it("tags common marketing routes", () => {
    expect(suggestPatterns("https://linear.app/")).toEqual(["landing"]);
    expect(suggestPatterns("https://linear.app/pricing")).toEqual(["pricing"]);
    expect(suggestPatterns("https://linear.app/login")).toEqual(["login"]);
    expect(suggestPatterns("https://vercel.com/en-us/signup")).toEqual(["signup"]);
    expect(suggestPatterns("https://stripe.com/blog/some-post")).toEqual(["article"]);
    expect(suggestPatterns("https://stripe.com/blog")).toEqual(["blog"]);
  });
  it("falls back to detail for unknown paths", () => {
    expect(suggestPatterns("https://x.com/whatever/deep")).toEqual(["detail"]);
  });
});

describe("naming", () => {
  it("derives app names", () => {
    expect(appNameFromUrl("https://www.linear.app/features")).toBe("Linear");
    expect(appNameFromUrl("https://stripe.com", "Stripe | Financial Infrastructure")).toBe(
      "Stripe",
    );
    expect(slugify("Crypto & Web3 Ünïcode")).toBe("crypto-web3-unicode");
  });
});

describe("readImageHeader", () => {
  it("reads PNG dimensions", () => {
    // 1x1 transparent PNG
    const png = base64ToBytes(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    );
    expect(readImageHeader(png)).toEqual({ type: "image/png", width: 1, height: 1 });
    expect(base64ToBytes(bytesToBase64(png))).toEqual(png);
  });
});
