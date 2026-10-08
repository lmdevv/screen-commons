import { suggestPatterns, type PatternSlug } from "@screen-commons/core";
import type { Page } from "playwright-core";

import { extractMetadata, navigate } from "./capture";

export interface VisitResult {
  /** Final URL after redirects. */
  url: string;
  title: string;
  status: number | null;
  links: { url: string; text: string }[];
}

/** Loads one URL and reports its final URL, title and links. */
export type Visitor = (url: string) => Promise<VisitResult>;

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  /** Substrings a path must contain (any). The start URL is always kept. */
  include?: string[];
  /** Substrings that exclude a path. */
  exclude?: string[];
  /** Delay between requests, ms. Default 400. */
  delayMs?: number;
  visit?: Visitor;
  /** Fallback visitor when the primary yields too few links (e.g. a JS-only site). */
  fallbackVisit?: Visitor;
  /** Respect robots.txt `Disallow` rules for `User-agent: *`. Default true. */
  robots?: boolean;
  signal?: AbortSignal;
  onPage?: (page: CrawledPage) => void;
}

export interface CrawledPage {
  url: string;
  title: string;
  patterns: PatternSlug[];
  depth: number;
  score: number;
}

const ASSET_EXTENSION =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|pdf|zip|gz|tgz|rar|7z|dmg|exe|msi|pkg|deb|rpm|apk|mp4|mov|webm|avi|mkv|mp3|wav|ogg|m4a|woff2?|ttf|otf|eot|css|js|mjs|map|json|xml|rss|atom|txt|csv|ics|wasm)$/iu;

const SKIP_PATH =
  /(^|\/)(auth\/callback|callback|oauth2?|sso|saml|logout|log-out|signout|sign-out|cdn-cgi|_next|static|assets|wp-admin|wp-json|rss|graphql|unsubscribe|redirect|out|go)(\/|$)/iu;

const LOCALE_SEGMENT =
  /^(ar|bg|cs|da|de|el|es|et|fi|fr|he|hi|hu|id|it|ja|ko|lt|lv|nb|nl|no|pl|pt|ro|ru|sk|sl|sv|th|tr|uk|vi|zh)(-[a-z]{2,4})?$/iu;

/** Canonical marketing pages, best first. Keys are first path segments. */
const CANONICAL_RANK: [RegExp, number][] = [
  [/^$/u, 100],
  [/^(pricing|plans|price)$/u, 95],
  [/^(login|log-in|signin|sign-in|sign_in)$/u, 92],
  [/^(signup|sign-up|sign_up|register|join|get-started|start)$/u, 90],
  [/^(features|product|products|platform|tour|how-it-works)$/u, 86],
  [/^(customers|case-studies|stories|showcase|testimonials)$/u, 82],
  [/^(docs|documentation|guides|developers|reference)$/u, 80],
  [/^(blog)$/u, 76],
  [/^(changelog|releases|whats-new|updates)$/u, 74],
  [/^(about|company|team|mission)$/u, 72],
  [/^(integrations|apps|marketplace)$/u, 68],
  [/^(enterprise|security|solutions|use-cases)$/u, 64],
  [/^(contact|sales|support|help)$/u, 60],
  [/^(careers|jobs)$/u, 56],
  [/^(templates|examples|gallery|resources)$/u, 52],
  [/^(download|downloads|mobile|desktop)$/u, 50],
  [/^(privacy|terms|legal|cookies|dpa|imprint|gdpr)$/u, 8],
];

function pathSegments(url: URL): string[] {
  return url.pathname
    .split("/")
    .map((segment) => decodeURIComponent(segment).toLowerCase())
    .filter(Boolean);
}

/**
 * Score a URL for capture interest: canonical marketing pages first, shallow before deep,
 * localized duplicates and legal pages last.
 */
export function rankUrl(input: string | URL): number {
  const url = typeof input === "string" ? new URL(input) : input;
  let segments = pathSegments(url);
  let score = 0;
  if (segments[0] && LOCALE_SEGMENT.test(segments[0]) && !/^en(-|$)/u.test(segments[0])) {
    score -= 60;
    segments = segments.slice(1);
  } else if (segments[0] && /^en(-[a-z]{2})?$/u.test(segments[0])) {
    segments = segments.slice(1);
  }
  const first = segments[0] ?? "";
  const canonical = CANONICAL_RANK.find(([pattern]) => pattern.test(first))?.[1];
  score += canonical ?? 30;
  // depth penalty: /blog is a canonical page, /blog/post-123 much less so
  score -= Math.max(0, segments.length - 1) * 18;
  if (url.search) score -= 15;
  if (/\d{4,}/u.test(url.pathname)) score -= 6;
  return score;
}

/** Whether a discovered URL should be skipped regardless of filters. */
export function shouldSkipUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return true;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  if (ASSET_EXTENSION.test(url.pathname)) return true;
  if (SKIP_PATH.test(url.pathname)) return true;
  if (/[?&](redirect_uri|return_to|returnTo|callbackUrl|code|state)=/iu.test(url.search))
    return true;
  return false;
}

/** Normalize for dedupe: drop hash, tracking params and trailing slash (except root). */
export function normalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^(utm_|ref$|ref_|gclid|fbclid|mc_)/iu.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/u, "");
  }
  return url.href;
}

/** Allow www/non-www as the same site. */
export function sameSite(a: URL, b: URL): boolean {
  const strip = (host: string) => host.replace(/^www\./u, "");
  return a.protocol === b.protocol && strip(a.host) === strip(b.host);
}

function matchesFilters(url: URL, include?: string[], exclude?: string[]): boolean {
  const path = `${url.pathname}${url.search}`.toLowerCase();
  if (exclude?.some((needle) => needle && path.includes(needle.toLowerCase()))) return false;
  if (include?.length && !include.some((needle) => path.includes(needle.toLowerCase()))) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Visitors
// ---------------------------------------------------------------------------------------------

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#0?39;|&apos;/gu, "'")
    .replace(/&nbsp;/gu, " ")
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)));

/** Extract `<title>` and same-origin `<a href>` links from raw HTML (no DOM required). */
export function parseHtmlLinks(html: string, pageUrl: string): Omit<VisitResult, "status"> {
  const baseHref = /<base\s[^>]*href=["']([^"']+)["']/iu.exec(html)?.[1];
  const base = baseHref ? new URL(decodeEntities(baseHref), pageUrl).href : pageUrl;
  const origin = new URL(pageUrl).origin;
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1] ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  const links: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  const anchor = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/giu;
  for (const match of html.matchAll(anchor)) {
    const raw = decodeEntities((match[1] ?? match[2] ?? match[3] ?? "").trim());
    if (!raw || /^(mailto|tel|javascript|data|sms):/iu.test(raw) || raw.startsWith("#")) continue;
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    url.hash = "";
    const key = url.href;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = decodeEntities((match[4] ?? "").replace(/<[^>]+>/gu, " "))
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 120);
    links.push({ url: key, text });
  }
  return { url: pageUrl, title, links };
}

const CRAWLER_UA =
  "Mozilla/5.0 (compatible; OpenUI-Capture/0.1; +https://github.com/screen-commons) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Lightweight visitor using `fetch` + HTML parsing. Good for server-rendered marketing sites. */
export function createFetchVisitor(
  options: { timeoutMs?: number; fetch?: typeof fetch } = {},
): Visitor {
  const doFetch = options.fetch ?? fetch;
  return async (url) => {
    const response = await doFetch(url, {
      redirect: "follow",
      headers: { "user-agent": CRAWLER_UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    const finalUrl = response.url || url;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html")) {
      await response.body?.cancel().catch(() => undefined);
      return { url: finalUrl, title: "", status: response.status, links: [] };
    }
    const html = await response.text();
    return { ...parseHtmlLinks(html, finalUrl), status: response.status };
  };
}

/** Visitor that renders pages in a browser tab (for client-rendered sites). */
export function createPageVisitor(page: Page, options: { timeoutMs?: number } = {}): Visitor {
  return async (url) => {
    const navigation = await navigate(page, url, { timeoutMs: options.timeoutMs ?? 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
    const metadata = await extractMetadata(page);
    return {
      url: navigation.url,
      title: metadata.title,
      status: navigation.status,
      links: metadata.links,
    };
  };
}

// ---------------------------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------------------------

export function parseRobots(text: string): string[] {
  const disallow: string[] = [];
  let applies = false;
  let inAgentBlock = false;
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const key = field!.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!inAgentBlock) applies = false;
      inAgentBlock = true;
      if (value === "*") applies = true;
      continue;
    }
    inAgentBlock = false;
    if (applies && key === "disallow" && value) disallow.push(value);
  }
  return disallow;
}

function robotsBlocks(rules: string[], url: URL): boolean {
  const path = `${url.pathname}${url.search}`;
  return rules.some((rule) => {
    if (rule.includes("*") || rule.endsWith("$")) {
      const pattern = rule
        .replace(/[.+?^{}()|[\]\\]/gu, "\\$&")
        .replace(/\*/gu, ".*")
        .replace(/\\\$$|\$$/u, "$");
      return new RegExp(`^${pattern}`, "u").test(path);
    }
    return path.startsWith(rule);
  });
}

async function loadRobots(origin: string): Promise<string[]> {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": CRAWLER_UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    return parseRobots(await response.text());
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Breadth-first, same-site crawl from `startUrl`. Each BFS level is visited best-ranked first
 * (canonical marketing pages before deep links) until `maxPages` pages were visited. Returns the
 * visited pages sorted by rank, each with suggested patterns.
 */
export async function crawl(startUrl: string, options: CrawlOptions = {}): Promise<CrawledPage[]> {
  const maxPages = options.maxPages ?? 12;
  const maxDepth = options.maxDepth ?? 1;
  const delayMs = options.delayMs ?? 400;
  let visit = options.visit ?? createFetchVisitor();

  const start = new URL(normalizeUrl(startUrl));
  let site = start;
  const robots = options.robots === false ? [] : await loadRobots(start.origin);

  const queued = new Set<string>([start.href]);
  const visited = new Set<string>();
  const results: CrawledPage[] = [];
  let frontier: { url: string; depth: number }[] = [{ url: start.href, depth: 0 }];

  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth += 1) {
    frontier.sort((a, b) => rankUrl(b.url) - rankUrl(a.url));
    const next: { url: string; depth: number }[] = [];
    for (const item of frontier) {
      if (results.length >= maxPages || options.signal?.aborted) break;
      if (visited.has(item.url)) continue;
      visited.add(item.url);
      if (results.length > 0) await sleep(delayMs);

      let result: VisitResult;
      try {
        result = await visit(item.url);
        if (depth === 0 && result.links.length < 3 && options.fallbackVisit) {
          visit = options.fallbackVisit;
          result = await visit(item.url);
        }
      } catch {
        if (depth === 0 && options.fallbackVisit && visit !== options.fallbackVisit) {
          visit = options.fallbackVisit;
          try {
            result = await visit(item.url);
          } catch {
            continue;
          }
        } else {
          continue;
        }
      }
      if (result.status !== null && result.status >= 400) continue;

      let finalUrl: URL;
      try {
        finalUrl = new URL(normalizeUrl(result.url));
      } catch {
        continue;
      }
      // The start page may redirect (http→https, apex→www): adopt the final origin.
      if (depth === 0) site = finalUrl;
      else if (!sameSite(finalUrl, site)) continue;
      if (depth > 0 && visited.has(finalUrl.href) && finalUrl.href !== item.url) continue;
      visited.add(finalUrl.href);
      if (results.some((page) => page.url === finalUrl.href)) continue;

      const page: CrawledPage = {
        url: finalUrl.href,
        title: result.title,
        patterns: suggestPatterns(finalUrl.href, result.title),
        depth,
        score: rankUrl(finalUrl),
      };
      results.push(page);
      options.onPage?.(page);

      if (depth >= maxDepth) continue;
      for (const link of result.links) {
        let url: URL;
        try {
          url = new URL(normalizeUrl(link.url));
        } catch {
          continue;
        }
        if (!sameSite(url, site)) continue;
        if (queued.has(url.href) || shouldSkipUrl(url.href)) continue;
        if (!matchesFilters(url, options.include, options.exclude)) continue;
        if (robotsBlocks(robots, url)) continue;
        queued.add(url.href);
        next.push({ url: url.href, depth: depth + 1 });
      }
    }
    frontier = next;
  }

  return results.sort((a, b) => b.score - a.score || a.depth - b.depth);
}
