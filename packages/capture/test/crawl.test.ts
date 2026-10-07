import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  crawl,
  normalizeUrl,
  parseHtmlLinks,
  parseRobots,
  rankUrl,
  shouldSkipUrl,
} from "../src/crawl";
import { startFixtureSite, type FixtureSite } from "./fixture-server";

let site: FixtureSite;
beforeAll(async () => {
  site = await startFixtureSite();
});
afterAll(() => site.close());

describe("ranking + filters", () => {
  it("ranks canonical marketing pages first", () => {
    const urls = [
      "https://x.com/blog/some-post",
      "https://x.com/privacy",
      "https://x.com/pricing",
      "https://x.com/de/pricing",
      "https://x.com/",
      "https://x.com/careers",
      "https://x.com/login",
      "https://x.com/en/signup",
      "https://x.com/docs",
      "https://x.com/random",
    ];
    const ordered = [...urls].sort((a, b) => rankUrl(b) - rankUrl(a));
    expect(ordered.slice(0, 5)).toEqual([
      "https://x.com/",
      "https://x.com/pricing",
      "https://x.com/login",
      "https://x.com/en/signup",
      "https://x.com/docs",
    ]);
    expect(ordered.at(-1)).toBe("https://x.com/privacy");
    expect(rankUrl("https://x.com/de/pricing")).toBeLessThan(rankUrl("https://x.com/about"));
  });

  it("skips assets, auth callbacks and non-http links", () => {
    expect(shouldSkipUrl("https://x.com/file.pdf")).toBe(true);
    expect(shouldSkipUrl("https://x.com/logo.svg")).toBe(true);
    expect(shouldSkipUrl("https://x.com/auth/callback")).toBe(true);
    expect(shouldSkipUrl("https://x.com/login?redirect_uri=/x")).toBe(true);
    expect(shouldSkipUrl("mailto:a@b.c")).toBe(true);
    expect(shouldSkipUrl("https://x.com/pricing")).toBe(false);
    expect(shouldSkipUrl("https://x.com/docs/api")).toBe(false);
  });

  it("normalizes URLs", () => {
    expect(normalizeUrl("https://x.com/a/?utm_source=t&b=2&a=1#h")).toBe("https://x.com/a?a=1&b=2");
    expect(normalizeUrl("https://x.com/")).toBe("https://x.com/");
  });

  it("parses links from HTML", () => {
    const parsed = parseHtmlLinks(
      `<title> A &amp; B </title><a href="/x">X <b>bold</b></a><a href='https://x.com/y#z'>Y</a>
       <a href="https://other.com/">O</a><a href="mailto:a@b.c">M</a><a href=/x>dup</a>`,
      "https://x.com/start",
    );
    expect(parsed.title).toBe("A & B");
    expect(parsed.links).toEqual([
      { url: "https://x.com/x", text: "X bold" },
      { url: "https://x.com/y", text: "Y" },
    ]);
  });

  it("parses robots.txt groups", () => {
    expect(
      parseRobots(
        "User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /private\nAllow: /\n",
      ),
    ).toEqual(["/private"]);
  });
});

describe("crawl (fetch visitor, fixture site)", () => {
  it("returns ranked same-origin pages and honours robots, redirects and junk filters", async () => {
    const pages = await crawl(site.url, { maxPages: 20, maxDepth: 1, delayMs: 0 });
    const paths = pages.map((page) => new URL(page.url).pathname);
    expect(paths.slice(0, 4)).toEqual(["/", "/pricing", "/login", "/signup"]);
    expect(paths).toContain("/docs/intro");
    expect(paths).toContain("/blog");
    expect(paths).toContain("/customers");
    expect(paths).not.toContain("/careers"); // robots.txt
    expect(paths).not.toContain("/redirect-out");
    expect(paths).not.toContain("/files/report.pdf");
    expect(paths).not.toContain("/auth/callback");
    expect(paths.indexOf("/de/pricing")).toBeGreaterThan(paths.indexOf("/about"));
    expect(paths.at(-1)).toBe("/privacy");
    expect(pages.find((page) => page.url.endsWith("/pricing"))?.patterns).toEqual(["pricing"]);
    expect(pages[0]?.patterns).toEqual(["landing"]);
    expect(pages.find((page) => page.url.endsWith("/signup"))?.url).toBe(`${site.origin}/signup`);
    // depth limit: post-2 is only linked from /blog (depth 2)
    expect(paths).not.toContain("/blog/post-2");
  });

  it("applies include/exclude and maxPages", async () => {
    const pages = await crawl(site.url, {
      maxPages: 3,
      include: ["blog", "pricing"],
      exclude: ["/de/"],
      delayMs: 0,
    });
    expect(pages.map((page) => new URL(page.url).pathname)).toEqual(["/", "/pricing", "/blog"]);
  });

  it("goes deeper with maxDepth", async () => {
    const pages = await crawl(site.url, { maxPages: 30, maxDepth: 2, delayMs: 0, robots: false });
    const paths = pages.map((page) => new URL(page.url).pathname);
    expect(paths).toContain("/blog/post-2");
    expect(paths).toContain("/careers");
  });
});
