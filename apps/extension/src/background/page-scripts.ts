/**
 * Functions injected into pages with `scripting.executeScript({ func })`. Each one is serialised
 * on its own, so it must be fully self-contained: no imports, no outer-scope references, no
 * helpers defined outside the function body.
 */
import type { PageMetadata } from "@open-ui/core/bridge";

export interface PageMetrics {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
  scrollX: number;
  scrollY: number;
}

export interface ElementTarget {
  /** Document coordinates, CSS pixels. */
  rect: { x: number; y: number; width: number; height: number };
  /** Viewport coordinates at the time of return (after optional scrollIntoView). */
  viewportRect: { x: number; y: number; width: number; height: number };
  metrics: PageMetrics;
  text: string;
  label: string;
}

export function pageMetrics(): PageMetrics {
  const doc = document.documentElement;
  const body = document.body;
  return {
    width: Math.max(doc.scrollWidth, body ? body.scrollWidth : 0, doc.clientWidth),
    height: Math.max(doc.scrollHeight, body ? body.scrollHeight : 0, doc.clientHeight),
    viewportWidth: doc.clientWidth || window.innerWidth,
    viewportHeight: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

/**
 * Bounded lazy-load pass: scroll viewport by viewport (triggers IntersectionObserver and native
 * lazy loading), promote lazy images, wait for images and fonts with deadlines, return to top.
 */
export async function prepareFullPage(options: { lazyLoad: boolean; budgetMs: number }): Promise<PageMetrics> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const withDeadline = <T,>(promise: Promise<T>, ms: number) =>
    Promise.race([promise.then(() => undefined), sleep(ms)]);
  const doc = document.documentElement;
  const previousBehavior = doc.style.scrollBehavior;
  doc.style.scrollBehavior = "auto";
  const started = Date.now();
  try {
    if (options.lazyLoad) {
      for (const img of Array.from(document.images)) {
        if (img.loading === "lazy") img.loading = "eager";
      }
      let y = 0;
      let steps = 0;
      while (steps < 60 && Date.now() - started < options.budgetMs * 0.6) {
        const height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
        if (y >= height - window.innerHeight) break;
        y += Math.max(200, window.innerHeight * 0.9);
        window.scrollTo(0, y);
        steps += 1;
        await sleep(120);
      }
      window.scrollTo(0, Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0));
      await sleep(150);
      const remaining = Math.max(300, options.budgetMs - (Date.now() - started));
      const pending = Array.from(document.images)
        .filter((img) => !img.complete && img.getBoundingClientRect().width > 0)
        .slice(0, 200)
        .map((img) => img.decode().catch(() => undefined));
      await withDeadline(Promise.all(pending), Math.min(3000, remaining));
    }
    if (document.fonts) await withDeadline(document.fonts.ready, 1500);
  } finally {
    window.scrollTo(0, 0);
    doc.style.scrollBehavior = previousBehavior;
  }
  await frame();
  await frame();
  await sleep(80);
  const body = document.body;
  return {
    width: Math.max(doc.scrollWidth, body ? body.scrollWidth : 0, doc.clientWidth),
    height: Math.max(doc.scrollHeight, body ? body.scrollHeight : 0, doc.clientHeight),
    viewportWidth: doc.clientWidth || window.innerWidth,
    viewportHeight: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

/** Scroll to an absolute position and report where the page actually ended up. */
export async function scrollToPosition(x: number, y: number): Promise<{ scrollX: number; scrollY: number }> {
  const doc = document.documentElement;
  const previousBehavior = doc.style.scrollBehavior;
  doc.style.scrollBehavior = "auto";
  window.scrollTo(x, y);
  doc.style.scrollBehavior = previousBehavior;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return { scrollX: window.scrollX, scrollY: window.scrollY };
}

/** Hide fixed/sticky elements (for stitched tiles after the first). Reversible. */
export function hideFixedElements(): number {
  let count = 0;
  const all = document.querySelectorAll<HTMLElement>("body *");
  for (const el of Array.from(all)) {
    const position = getComputedStyle(el).position;
    if (position !== "fixed" && position !== "sticky") continue;
    if (el.hasAttribute("data-open-ui-hidden")) continue;
    el.setAttribute("data-open-ui-hidden", el.style.getPropertyValue("visibility") + "|" + el.style.getPropertyPriority("visibility"));
    el.style.setProperty("visibility", "hidden", "important");
    count += 1;
  }
  return count;
}

export function restoreFixedElements(): void {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-open-ui-hidden]"))) {
    const [value, priority] = (el.getAttribute("data-open-ui-hidden") ?? "|").split("|");
    if (value) el.style.setProperty("visibility", value, priority ?? "");
    else el.style.removeProperty("visibility");
    el.removeAttribute("data-open-ui-hidden");
  }
}

/** Visible text: full page, or only text whose box intersects the viewport. Whitespace-collapsed. */
export function collectText(mode: "visible" | "full"): string {
  const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
  if (!document.body) return "";
  if (mode === "full") return collapse(document.body.innerText || "").slice(0, 20_000);
  const parts: string[] = [];
  let length = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let visited = 0;
  for (let node = walker.nextNode(); node && visited < 50_000 && length < 20_000; node = walker.nextNode()) {
    visited += 1;
    const value = node.nodeValue;
    if (!value || !value.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest("script,style,noscript,template")) continue;
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= vh || rect.left >= vw) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === "hidden" || style.opacity === "0") continue;
    const text = collapse(value);
    parts.push(text);
    length += text.length + 1;
  }
  return parts.join(" ").slice(0, 20_000);
}

/** Locate an element by CSS selector. Throws a readable error for invalid or missing selectors. */
export async function findElement(selector: string, scrollIntoView: boolean): Promise<ElementTarget> {
  let el: Element | null;
  try {
    el = document.querySelector(selector);
  } catch {
    throw new Error(`Invalid CSS selector: ${selector}`);
  }
  if (!el) throw new Error(`No element matches ${selector}`);
  if (scrollIntoView) {
    el.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" as ScrollBehavior });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) throw new Error(`Element ${selector} has no visible size`);
  const doc = document.documentElement;
  const body = document.body;
  const text = ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 20_000);
  return {
    rect: { x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height },
    viewportRect: { x: box.left, y: box.top, width: box.width, height: box.height },
    metrics: {
      width: Math.max(doc.scrollWidth, body ? body.scrollWidth : 0, doc.clientWidth),
      height: Math.max(doc.scrollHeight, body ? body.scrollHeight : 0, doc.clientHeight),
      viewportWidth: doc.clientWidth || window.innerWidth,
      viewportHeight: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    text,
    label: el.tagName.toLowerCase(),
  };
}

/**
 * Interactive hover picker: highlights the element under the pointer; click selects, ↑/↓ walk
 * to parent/child, Esc cancels. Resolves with a unique-ish selector for the picked element.
 */
export function pickElement(): Promise<{ selector: string } | null> {
  const existing = document.getElementById("__open-ui-picker");
  if (existing) existing.remove();
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.id = "__open-ui-picker";
    host.style.cssText = "all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .box { position: fixed; border: 1.5px solid #0a0a0a; background: rgba(10,10,10,0.06);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.9); border-radius: 3px; transition: all 60ms ease-out; pointer-events: none; }
        .tag { position: fixed; font: 500 11px/1 Inter, ui-sans-serif, system-ui, sans-serif; color: #fff; background: #0a0a0a;
          padding: 5px 7px; border-radius: 999px; white-space: nowrap; pointer-events: none; font-variant-numeric: tabular-nums; }
        .hint { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); font: 500 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
          color: #fff; background: #0a0a0a; padding: 9px 14px; border-radius: 999px; box-shadow: 0 6px 24px rgba(0,0,0,0.18); pointer-events: none; }
        .hint span { color: #a1a1aa; margin-left: 8px; }
      </style>
      <div class="box"></div><div class="tag"></div>
      <div class="hint">Click an element to capture<span>↑ parent · Esc cancel</span></div>`;
    const box = root.querySelector<HTMLElement>(".box")!;
    const tag = root.querySelector<HTMLElement>(".tag")!;
    document.documentElement.appendChild(host);

    let current: Element | null = null;
    const draw = () => {
      if (!current) {
        box.style.display = tag.style.display = "none";
        return;
      }
      const r = current.getBoundingClientRect();
      box.style.display = tag.style.display = "block";
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      tag.textContent = `${current.tagName.toLowerCase()}  ${Math.round(r.width)} × ${Math.round(r.height)}`;
      tag.style.left = `${Math.max(4, r.left)}px`;
      tag.style.top = `${r.top > 28 ? r.top - 24 : Math.min(window.innerHeight - 24, r.bottom + 6)}px`;
    };
    const selectorFor = (el: Element): string => {
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.documentElement && parts.length < 12) {
        if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
        const parentEl: Element | null = node.parentElement;
        let part = node.tagName.toLowerCase();
        if (parentEl) {
          const same = Array.from(parentEl.children).filter((child) => child.tagName === node!.tagName);
          if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = parentEl;
      }
      return parts.join(" > ") || "body";
    };
    const finish = (result: { selector: string } | null) => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("mousedown", block, true);
      window.removeEventListener("mouseup", block, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", draw, true);
      host.remove();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(result)));
    };
    const onMove = (event: MouseEvent) => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      if (el && el !== current && el !== host) {
        current = el;
        draw();
      }
    };
    const block = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const onClick = (event: MouseEvent) => {
      block(event);
      if (current) finish({ selector: selectorFor(current) });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        block(event);
        finish(null);
      } else if (event.key === "ArrowUp" && current?.parentElement && current.parentElement !== document.documentElement) {
        block(event);
        current = current.parentElement;
        draw();
      } else if (event.key === "ArrowDown" && current?.firstElementChild) {
        block(event);
        current = current.firstElementChild;
        draw();
      } else if (event.key === "Enter" && current) {
        block(event);
        finish({ selector: selectorFor(current) });
      }
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("mousedown", block, true);
    window.addEventListener("mouseup", block, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", draw, true);
  });
}

/** Page metadata matching `PageMetadata` in packages/core/src/bridge.ts. */
export function extractMetadata(): PageMetadata {
  const abs = (value: string | null | undefined): string | null => {
    if (!value) return null;
    try {
      const url = new URL(value, document.baseURI);
      return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "data:" ? url.href : null;
    } catch {
      return null;
    }
  };
  const meta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || null;
  const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

  const icons = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel][href]"))
    .map((link) => {
      const rel = link.rel.toLowerCase();
      if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed|shortcut)(\s|$)/.test(rel)) return null;
      const size = Math.max(0, ...(link.getAttribute("sizes") ?? "").split(/\s+/).map((s) => Number.parseInt(s, 10) || 0));
      const apple = rel.includes("apple-touch-icon");
      const svg = (link.type || "").includes("svg") || link.href.endsWith(".svg");
      return { href: link.href, score: (apple ? 1000 : 0) + (svg ? 500 : 0) + (size || (apple ? 180 : 16)) };
    })
    .filter((icon): icon is { href: string; score: number } => icon !== null)
    .sort((a, b) => b.score - a.score);
  const faviconUrl = abs(icons[0]?.href) ?? abs("/favicon.ico");

  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((h) => collapse((h as HTMLElement).innerText || h.textContent || "").slice(0, 160))
    .filter(Boolean)
    .slice(0, 30);

  const seen = new Set<string>();
  const links: { url: string; text: string }[] = [];
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    if (links.length >= 300) break;
    let url: URL;
    try {
      url = new URL(a.getAttribute("href") ?? "", document.baseURI);
    } catch {
      continue;
    }
    if (url.origin !== location.origin) continue;
    url.hash = "";
    const href = url.href;
    if (seen.has(href)) continue;
    seen.add(href);
    links.push({ url: href, text: collapse(a.innerText || a.textContent || a.getAttribute("aria-label") || "").slice(0, 160) });
  }

  return {
    url: location.href,
    title: collapse(document.title || meta('meta[property="og:title"]') || ""),
    description: meta('meta[name="description"]') ?? meta('meta[property="og:description"]'),
    siteName: meta('meta[property="og:site_name"]') ?? meta('meta[name="application-name"]'),
    faviconUrl,
    ogImageUrl: abs(meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]')),
    themeColor: meta('meta[name="theme-color"]'),
    lang: document.documentElement.lang || null,
    headings,
    links,
  };
}
