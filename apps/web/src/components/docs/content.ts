/**
 * The docs, rendered at build time by `docsPlugin` (see ./vite-plugin.ts). Only imported from
 * server function handlers (./docs.functions.ts), so page HTML is fetched per page, never bundled.
 */
import type { DocMeta, RenderedDoc } from "./markdown";

const modules = import.meta.glob<RenderedDoc>("../../../content/docs/*.md", {
  query: "?doc",
  import: "default",
  eager: true,
});

export interface DocsSection {
  title: string;
  items: DocMeta[];
}

const docs: RenderedDoc[] = Object.values(modules).sort(
  (a, b) => a.order - b.order || a.title.localeCompare(b.title),
);
const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));

const meta = ({ slug, title, description, order, section }: DocMeta): DocMeta => ({
  slug,
  title,
  description,
  order,
  section,
});

/** Sidebar: sections in order of their first page, pages by `order`. */
export function docsNav(): DocsSection[] {
  const sections = new Map<string, DocMeta[]>();
  for (const doc of docs) {
    const list = sections.get(doc.section) ?? [];
    list.push(meta(doc));
    sections.set(doc.section, list);
  }
  return [...sections].map(([title, items]) => ({ title, items }));
}

export function docPage(slug: string) {
  const doc = bySlug.get(slug);
  if (!doc) return null;
  const index = docs.indexOf(doc);
  const prev = docs[index - 1];
  const next = docs[index + 1];
  return {
    doc,
    prev: prev ? meta(prev) : null,
    next: next ? meta(next) : null,
  };
}
