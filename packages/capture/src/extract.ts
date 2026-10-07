/**
 * In-page extractors. Every exported function here is self-contained (no imports, no closures)
 * so it can be serialized into a page with `page.evaluate(fn, arg)`, injected by the browser
 * extension with `scripting.executeScript({ func })`, or run in a test DOM.
 */
import type { PageMetadata } from "@open-ui/core";

export interface IconCandidate {
  url: string;
  rel: string;
  sizes: string | null;
  type: string | null;
  /** Largest declared edge in px (0 when unknown, 1024 for "any"/SVG). */
  size: number;
}

export interface ExtractedMetadata extends PageMetadata {
  /** All declared icons (apple-touch-icon, icon, mask-icon…), best candidates first. */
  icons: IconCandidate[];
}

export const MAX_SCREEN_TEXT = 20_000;

/** Extract `PageMetadata` (+ icon candidates) from the current document. */
export function extractMetadataInPage(): ExtractedMetadata {
  const collapse = (value: string | null | undefined, max = 300) =>
    (value ?? "").replace(/\s+/gu, " ").trim().slice(0, max);
  const base = document.baseURI || location.href;
  const resolve = (href: string | null | undefined): string | null => {
    if (!href) return null;
    try {
      const url = new URL(href.trim(), base);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.href;
    } catch {
      return null;
    }
  };
  const meta = (...keys: string[]): string | null => {
    for (const key of keys) {
      const element = document.querySelector<HTMLMetaElement>(
        `meta[name="${key}" i], meta[property="${key}" i]`,
      );
      const content = element?.content?.trim();
      if (content) return content;
    }
    return null;
  };

  const pageUrl = new URL(location.href);
  pageUrl.hash = "";

  const icons: IconCandidate[] = [];
  for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel][href]"))) {
    const rel = link.rel.toLowerCase();
    if (
      !/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed|shortcut|mask-icon)(\s|$)/u.test(
        rel,
      )
    ) {
      continue;
    }
    const url = resolve(link.getAttribute("href"));
    if (!url) continue;
    const sizes = link.getAttribute("sizes");
    const type = link.getAttribute("type");
    let size = 0;
    if (sizes) {
      for (const token of sizes.toLowerCase().split(/\s+/u)) {
        if (token === "any") size = Math.max(size, 1024);
        const match = /^(\d+)x(\d+)$/u.exec(token);
        if (match) size = Math.max(size, Number(match[1]));
      }
    }
    if (!size && (type === "image/svg+xml" || /\.svg(\?|$)/iu.test(url))) size = 1024;
    if (!size && rel.includes("apple-touch-icon")) size = 180;
    icons.push({ url, rel, sizes, type, size });
  }
  const rank = (icon: IconCandidate) =>
    (icon.rel.includes("apple-touch-icon") ? 10_000 : 0) +
    (icon.rel.includes("mask-icon") ? -20_000 : 0) +
    icon.size;
  icons.sort((a, b) => rank(b) - rank(a));
  const regularIcons = icons.filter(
    (icon) => !icon.rel.includes("apple-touch-icon") && !icon.rel.includes("mask-icon"),
  );
  const faviconUrl =
    regularIcons.sort((a, b) => b.size - a.size)[0]?.url ?? resolve("/favicon.ico");

  let themeColor: string | null = null;
  for (const element of Array.from(
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color" i]'),
  )) {
    const media = element.getAttribute("media");
    if (!media || /light/u.test(media) || !themeColor) themeColor = element.content.trim() || null;
    if (!media) break;
  }

  const headings: string[] = [];
  for (const heading of Array.from(document.querySelectorAll<HTMLElement>("h1, h2"))) {
    const text = collapse(heading.innerText || heading.textContent, 140);
    if (text && !headings.includes(text)) headings.push(text);
    if (headings.length >= 24) break;
  }

  const links: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const raw = anchor.getAttribute("href");
    if (!raw || /^(mailto|tel|javascript|data|sms):/iu.test(raw.trim())) continue;
    const href = resolve(raw);
    if (!href) continue;
    const url = new URL(href);
    if (url.origin !== pageUrl.origin) continue;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|ref$|ref_|gclid|fbclid|mc_)/iu.test(key)) url.searchParams.delete(key);
    }
    const key = url.href;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = collapse(
      anchor.innerText ||
        anchor.getAttribute("aria-label") ||
        anchor.getAttribute("title") ||
        anchor.textContent,
      120,
    );
    links.push({ url: key, text });
  }

  const title =
    collapse(document.title, 200) ||
    collapse(meta("og:title"), 200) ||
    collapse(document.querySelector("h1")?.textContent, 200);

  return {
    url: pageUrl.href,
    title,
    description: meta("description", "og:description", "twitter:description"),
    siteName: meta("og:site_name", "application-name", "apple-mobile-web-app-title"),
    faviconUrl,
    ogImageUrl: resolve(meta("og:image", "og:image:url", "twitter:image", "twitter:image:src")),
    themeColor,
    lang: document.documentElement.lang || null,
    headings,
    links,
    icons,
  };
}

export interface VisibleTextOptions {
  /** `viewport`: text intersecting the current viewport; `full`: the whole document. */
  mode: "viewport" | "full";
  /** Restrict to an element (selector captures). */
  selector?: string | null;
  maxChars?: number;
}

/**
 * Visible text of the page for "text in screenshot" search, whitespace-collapsed and truncated.
 * Viewport mode walks text nodes and keeps those whose layout boxes intersect the viewport.
 */
export function visibleTextInPage(options: VisibleTextOptions): string {
  const max = options.maxChars ?? 20_000;
  const collapse = (value: string) => value.replace(/\s+/gu, " ").trim().slice(0, max);
  const root = options.selector
    ? document.querySelector<HTMLElement>(options.selector)
    : document.body;
  if (!root) return "";
  if (options.mode === "full" || options.selector) return collapse(root.innerText || "");

  const width = window.innerWidth;
  const height = window.innerHeight;
  const parts: string[] = [];
  let length = 0;
  const styleCache = new Map<Element, boolean>();
  const isVisible = (element: Element): boolean => {
    const cached = styleCache.get(element);
    if (cached !== undefined) return cached;
    let visible: boolean;
    if (typeof element.checkVisibility === "function") {
      // Checks ancestors too (opacity:0 menus, visibility:hidden panels, content-visibility).
      visible = element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    } else {
      const style = getComputedStyle(element);
      visible =
        style.visibility !== "hidden" &&
        style.visibility !== "collapse" &&
        style.display !== "none" &&
        Number(style.opacity) > 0.05;
    }
    styleCache.set(element, visible);
    return visible;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement!;
    if (!isVisible(parent)) continue;
    range.selectNodeContents(node);
    let intersects = false;
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width) {
        intersects = true;
        break;
      }
    }
    if (!intersects) continue;
    const text = node.textContent!.replace(/\s+/gu, " ").trim();
    if (!text) continue;
    parts.push(text);
    length += text.length + 1;
    if (length > max) break;
  }
  return collapse(parts.join(" "));
}
