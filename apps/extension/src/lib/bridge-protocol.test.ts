import { describe, expect, it } from "vitest";

import { backoffDelay, MAX_INBOUND_BYTES, parseInbound } from "./bridge-protocol";

const frame = (value: unknown) => JSON.stringify(value);

describe("parseInbound", () => {
  it("accepts welcome / ping / pong", () => {
    expect(
      parseInbound(
        frame({
          type: "welcome",
          protocol: 1,
          server: { name: "screen-commons-mcp", version: "0.1.0" },
        }),
      ),
    ).toMatchObject({
      type: "welcome",
    });
    expect(parseInbound(frame({ type: "ping", at: 1 }))).toEqual({ type: "ping", at: 1 });
    expect(parseInbound(frame({ type: "pong", at: 2 }))).toEqual({ type: "pong", at: 2 });
  });

  it("parses valid requests for every method", () => {
    expect(
      parseInbound(
        frame({
          type: "request",
          id: "1",
          method: "navigate",
          params: { url: "https://x.com", viewport: "mobile" },
        }),
      ),
    ).toEqual({
      type: "request",
      request: {
        id: "1",
        method: "navigate",
        params: { url: "https://x.com", viewport: "mobile" },
      },
    });
    expect(
      parseInbound(
        frame({
          type: "request",
          id: "2",
          method: "screenshot",
          params: { fullPage: true, selector: "#a" },
        }),
      ),
    ).toMatchObject({
      type: "request",
    });
    expect(
      parseInbound(frame({ type: "request", id: "3", method: "extract", params: { tabId: 4 } })),
    ).toMatchObject({ type: "request" });
    expect(
      parseInbound(frame({ type: "request", id: "4", method: "listTabs", params: {} })),
    ).toMatchObject({ type: "request" });
    expect(parseInbound(frame({ type: "request", id: "5", method: "listTabs" }))).toMatchObject({
      type: "request",
    });
  });

  it("rejects non-http navigation targets", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "chrome://settings",
      "not a url",
      "data:text/html,hi",
    ]) {
      expect(
        parseInbound(frame({ type: "request", id: "n", method: "navigate", params: { url } })),
      ).toMatchObject({
        type: "invalid-request",
        id: "n",
        error: { code: "bad_request" },
      });
    }
  });

  it("rejects unknown params (no arbitrary script / extra options)", () => {
    expect(
      parseInbound(
        frame({ type: "request", id: "x", method: "screenshot", params: { script: "alert(1)" } }),
      ),
    ).toMatchObject({
      type: "invalid-request",
      error: { code: "bad_request" },
    });
    expect(
      parseInbound(frame({ type: "request", id: "y", method: "extract", params: { tabId: -1 } })),
    ).toMatchObject({
      type: "invalid-request",
    });
    expect(
      parseInbound(
        frame({
          type: "request",
          id: "z",
          method: "screenshot",
          params: { selector: "a".repeat(2000) },
        }),
      ),
    ).toMatchObject({
      type: "invalid-request",
    });
  });

  it("answers unknown methods with unknown_method", () => {
    expect(
      parseInbound(
        frame({ type: "request", id: "e", method: "evaluate", params: { code: "1+1" } }),
      ),
    ).toEqual({
      type: "invalid-request",
      id: "e",
      error: { code: "unknown_method", message: 'Unknown method "evaluate"' },
    });
  });

  it("ignores garbage", () => {
    expect(parseInbound("{nope")).toMatchObject({ type: "ignored" });
    expect(parseInbound(new ArrayBuffer(4))).toMatchObject({ type: "ignored" });
    expect(parseInbound(frame({ type: "hello", token: "x" }))).toMatchObject({ type: "ignored" });
    expect(parseInbound("x".repeat(MAX_INBOUND_BYTES + 1))).toMatchObject({
      type: "ignored",
      reason: "frame too large",
    });
    expect(parseInbound(frame({ type: "request", id: 5, method: "listTabs" }))).toMatchObject({
      type: "ignored",
    });
  });
});

describe("backoffDelay", () => {
  it("grows exponentially with a cap", () => {
    const mid = () => 0.5;
    expect(backoffDelay(0, mid)).toBe(1000);
    expect(backoffDelay(3, mid)).toBe(8000);
    expect(backoffDelay(10, mid)).toBe(30_000);
    expect(backoffDelay(10, mid, 60_000)).toBe(60_000);
  });

  it("applies ±20% jitter", () => {
    expect(backoffDelay(1, () => 0)).toBe(1600);
    expect(backoffDelay(1, () => 1)).toBe(2400);
  });
});
