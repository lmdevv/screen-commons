import { describe, expect, it } from "vitest";

import { ImageDownloadError, downloadImage, isLocalOrigin } from "./image-download";
import { base64ToBytes } from "./utils";

/** The smallest file `sniffImage` accepts: a 1×1 VP8L WebP. */
const WEBP = base64ToBytes(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
) as Uint8Array<ArrayBuffer>;

type Reply = (url: URL) => Response | Promise<Response>;

const options = (reply: Reply, extra = {}) => ({
  fetch: (async (input: RequestInfo | URL) => reply(new URL(String(input)))) as typeof fetch,
  ...extra,
});

const refused = async (url: string, extra = {}, reply: Reply = () => new Response(WEBP)) => {
  const error = await downloadImage(url, options(reply, extra)).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ImageDownloadError);
  return error as ImageDownloadError;
};

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

describe("downloadImage", () => {
  it("returns the bytes of a public https image", async () => {
    const bytes = await downloadImage(
      "https://cdn.example.com/a.webp",
      options(() => new Response(WEBP)),
    );
    expect(bytes).toEqual(WEBP);
  });

  it("follows relative and absolute redirects", async () => {
    const seen: string[] = [];
    const bytes = await downloadImage(
      "https://short.example.com/a",
      options((url) => {
        seen.push(url.href);
        if (url.host === "short.example.com" && url.pathname === "/a") return redirect("/b", 301);
        if (url.pathname === "/b") return redirect("https://cdn.example.com/c?sig=secret");
        return new Response(WEBP);
      }),
    );
    expect(bytes).toEqual(WEBP);
    expect(seen).toHaveLength(3);
  });

  it.each([
    ["http://cdn.example.com/a.webp", "must use https, not http"],
    ["ftp://cdn.example.com/a.webp", "must use https, not ftp"],
    ["file:///etc/passwd", "must use https, not file"],
    ["https://user:pass@cdn.example.com/a.webp", "must not contain a username"],
    ["https://localhost/a.webp", "must use a public hostname"],
    ["https://localhost./a.webp", "must use a public hostname"],
    ["https://foo.localhost/a.webp", "must use a public hostname"],
    ["https://printer.local/a.webp", "must use a public hostname"],
    ["https://db.internal/a.webp", "must use a public hostname"],
    ["https://intranet/a.webp", "must use a public hostname"],
    ["https://127.0.0.1/a.webp", "must use a public hostname"],
    ["https://169.254.169.254/latest", "must use a public hostname"],
    ["https://2130706433/a.webp", "must use a public hostname"],
    ["https://0x7f.1/a.webp", "must use a public hostname"],
    ["https://[::1]/a.webp", "must use a public hostname"],
    ["https://[::ffff:127.0.0.1]/a.webp", "must use a public hostname"],
  ])("refuses %s outside local development", async (url, message) => {
    const error = await refused(url);
    expect(error.code).toBe("bad_request");
    expect(error.message).toContain(message);
  });

  it("allows http and local hosts only with allowLocal", async () => {
    const bytes = await downloadImage(
      "http://127.0.0.1:9/a.webp",
      options(() => new Response(WEBP), { allowLocal: true }),
    );
    expect(bytes).toEqual(WEBP);
    expect((await refused("ftp://127.0.0.1/a.webp", { allowLocal: true })).code).toBe(
      "bad_request",
    );
  });

  it("checks every redirect target, naming only its host", async () => {
    const error = await refused("https://cdn.example.com/a", {}, () =>
      redirect("http://169.254.169.254/latest?token=secret"),
    );
    expect(error.code).toBe("bad_request");
    expect(error.message).toContain("redirected to 169.254.169.254");
    expect(error.message).not.toContain("secret");
  });

  it("stops after a few redirects", async () => {
    let hops = 0;
    const error = await refused("https://cdn.example.com/a", {}, () => {
      hops += 1;
      return redirect("/again");
    });
    expect(error.code).toBe("unprocessable");
    expect(error.message).toContain("redirected more than 3 times");
    expect(hops).toBe(4);
  });

  it("refuses a declared size over the limit without reading it", async () => {
    const error = await refused(
      "https://cdn.example.com/a",
      { maxBytes: 10 },
      () => new Response(WEBP, { headers: { "content-length": "999" } }),
    );
    expect(error.code).toBe("payload_too_large");
    expect(error.message).toContain("999 bytes");
  });

  it("caps what actually arrives when the size isn't declared", async () => {
    const error = await refused(
      "https://cdn.example.com/a",
      { maxBytes: 10 },
      () => new Response(new Blob([WEBP]).stream()),
    );
    expect(error.code).toBe("payload_too_large");
  });

  it("explains error statuses, non-images and connection failures", async () => {
    const status = await refused(
      "https://cdn.example.com/a",
      {},
      () => new Response("no", { status: 403 }),
    );
    expect(status.code).toBe("unprocessable");
    expect(status.message).toContain("HTTP 403");

    const html = await refused(
      "https://cdn.example.com/a",
      {},
      () => new Response("<html>", { headers: { "content-type": "text/html; charset=utf-8" } }),
    );
    expect(html.code).toBe("unsupported_media_type");
    expect(html.message).toContain("returned text/html");

    const down = await refused("https://cdn.example.com/a", {}, () => {
      throw new TypeError("fetch failed");
    });
    expect(down.code).toBe("unprocessable");
    expect(down.message).toContain("Could not connect to cdn.example.com");
  });

  it("times out over a body that never finishes", async () => {
    const error = await refused(
      "https://cdn.example.com/a",
      { timeoutMs: 20 },
      () => new Response(new ReadableStream({ start: () => undefined })),
    );
    expect(error.code).toBe("unprocessable");
    expect(error.message).toContain("timed out");
  });
});

describe("isLocalOrigin", () => {
  it("is true only for this machine", () => {
    expect(isLocalOrigin("http://localhost:5200")).toBe(true);
    expect(isLocalOrigin("http://127.0.0.1:5200")).toBe(true);
    expect(isLocalOrigin("https://screen-commons.lmdev.workers.dev")).toBe(false);
    expect(isLocalOrigin("https://localhost.example.com")).toBe(false);
    expect(isLocalOrigin(undefined)).toBe(false);
    expect(isLocalOrigin("not a url")).toBe(false);
  });
});
