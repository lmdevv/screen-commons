/**
 * Markdown → HTML for the docs, run on the server only (via `docs.functions.ts`), so neither
 * `marked` nor `shiki` ever reaches the browser.
 *
 * - YAML-ish frontmatter (`key: value` lines) → `DocMeta`
 * - heading ids + "On this page" entries (h2/h3)
 * - fenced code → shiki (JS regex engine, light/dark via CSS variables) + copy button
 * - `> **Note**` / `> **Warning**` / `> **Tip**` blockquotes → callouts
 * - external links open in a new tab
 */
import { Marked, type Tokens } from "marked";
import { createHighlighterCoreSync, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/dist/langs/bash.mjs";
import http from "shiki/dist/langs/http.mjs";
import json from "shiki/dist/langs/json.mjs";
import tsx from "shiki/dist/langs/tsx.mjs";
import typescript from "shiki/dist/langs/typescript.mjs";
import yaml from "shiki/dist/langs/yaml.mjs";
import githubDark from "shiki/dist/themes/github-dark-default.mjs";
import githubLight from "shiki/dist/themes/github-light-default.mjs";

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  order: number;
  section: string;
}

export interface TocEntry {
  id: string;
  text: string;
  depth: 2 | 3;
}

export interface RenderedDoc extends DocMeta {
  html: string;
  toc: TocEntry[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u;

/** Parse `key: value` frontmatter lines. Values may be quoted. */
export function parseFrontmatter(source: string): {
  data: Record<string, string>;
  body: string;
} {
  const match = FRONTMATTER.exec(source);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/u)) {
    const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/u.exec(line);
    if (!pair) continue;
    let value = pair[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[pair[1]!] = value;
  }
  return { data, body: source.slice(match[0].length) };
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/gu, "")
    .replace(/&[a-z]+;|&#\d+;/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/gu, "-");
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");

/** Strip inline markdown/HTML for TOC labels. */
const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/gu, "")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, "&");

let highlighter: HighlighterCore | null = null;
function getHighlighter(): HighlighterCore {
  highlighter ??= createHighlighterCoreSync({
    themes: [githubLight, githubDark],
    langs: [bash, json, http, typescript, tsx, yaml],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

const LANG_ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  ts: "typescript",
  js: "typescript",
  javascript: "typescript",
  jsonc: "json",
  yml: "yaml",
};
const LANG_LABELS: Record<string, string> = {
  bash: "Terminal",
  json: "JSON",
  http: "HTTP",
  typescript: "TypeScript",
  tsx: "TSX",
  yaml: "YAML",
};

const COPY_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const CALLOUT_ICONS: Record<string, string> = {
  note: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  warning:
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
};
CALLOUT_ICONS.tip = CALLOUT_ICONS.note!;

function highlight(code: string, rawLang: string | undefined): string {
  const lang = rawLang ? (LANG_ALIASES[rawLang] ?? rawLang) : "text";
  const label = LANG_LABELS[lang] ?? (lang === "text" || !rawLang ? "" : rawLang.toUpperCase());
  let pre: string;
  if (getHighlighter().getLoadedLanguages().includes(lang)) {
    pre = getHighlighter().codeToHtml(code, {
      lang,
      themes: { light: "github-light-default", dark: "github-dark-default" },
      defaultColor: false,
    });
    // The tile background comes from our CSS, not the theme.
    pre = pre.replace(/ style="[^"]*"/u, "").replace(/ tabindex="0"/u, "");
  } else {
    pre = `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }
  return `<div class="docs-code"${label ? ` data-label="${escapeHtml(label)}"` : ""}>${
    label ? `<div class="docs-code-label">${escapeHtml(label)}</div>` : ""
  }${pre}<button type="button" class="docs-copy" data-copy aria-label="Copy code">${COPY_ICON}</button></div>`;
}

/** Render one markdown document (without frontmatter). */
export function renderMarkdown(body: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const used = new Map<string, number>();
  const uniqueId = (base: string) => {
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const text = plainText(inner);
        const id = uniqueId(slugifyHeading(text) || "section");
        if (depth === 2 || depth === 3) toc.push({ id, text, depth });
        if (depth === 1) return `<h1 id="${id}">${inner}</h1>\n`;
        return `<h${depth} id="${id}"><a class="docs-anchor" href="#${id}">${inner}</a></h${depth}>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        return highlight(text.replace(/\n$/u, ""), lang?.trim().split(/\s+/u)[0] || undefined);
      },
      blockquote({ tokens }: Tokens.Blockquote) {
        const first = tokens[0];
        if (first?.type === "paragraph") {
          const lead = (first as Tokens.Paragraph).tokens?.[0];
          const kind = lead?.type === "strong" ? (lead as Tokens.Strong).text.toLowerCase() : null;
          if (kind && kind in CALLOUT_ICONS) {
            const paragraph = first as Tokens.Paragraph;
            // Drop the "**Note**" marker and the soft line break after it.
            const rest = paragraph.tokens.slice(1);
            if (rest[0]?.type === "br") rest.shift();
            if (rest[0]?.type === "text") {
              const text = rest[0] as Tokens.Text;
              rest[0] = {
                ...text,
                text: text.text.replace(/^\s+/u, ""),
                raw: text.raw.trimStart(),
              };
            }
            const lead = rest.length > 0 ? `<p>${this.parser.parseInline(rest)}</p>` : "";
            const others = this.parser.parse(tokens.slice(1));
            const title = kind.charAt(0).toUpperCase() + kind.slice(1);
            return `<aside class="docs-callout" data-tone="${kind}" role="note"><div class="docs-callout-title">${CALLOUT_ICONS[kind]}${title}</div>${lead}${others}</aside>\n`;
          }
        }
        return `<blockquote>${this.parser.parse(tokens)}</blockquote>\n`;
      },
      link({ href, title, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const external = /^https?:\/\//u.test(href);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return external
          ? `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noreferrer noopener">${inner}</a>`
          : `<a href="${escapeHtml(href)}"${titleAttr}>${inner}</a>`;
      },
      table(token: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: "th" | "td") => {
          const align = c.align ? ` style="text-align:${c.align}"` : "";
          return `<${tag}${align}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        };
        const head = `<tr>${token.header.map((c) => cell(c, "th")).join("")}</tr>`;
        const rows = token.rows
          .map((row) => `<tr>${row.map((c) => cell(c, "td")).join("")}</tr>`)
          .join("");
        return `<div class="docs-table"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });

  const html = marked.parse(body, { async: false });
  return { html, toc };
}

/** Parse + render one docs file. */
export function renderDoc(slug: string, source: string): RenderedDoc {
  const { data, body } = parseFrontmatter(source);
  const { html, toc } = renderMarkdown(body);
  return {
    slug,
    title: data.title ?? slug,
    description: data.description ?? "",
    order: Number(data.order ?? 999),
    section: data.section ?? "Docs",
    html,
    toc,
  };
}
