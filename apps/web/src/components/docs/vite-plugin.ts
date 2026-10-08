import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type { Plugin } from "vite";

import { renderDoc } from "./markdown";

const QUERY = "?doc";

/**
 * Renders `content/docs/*.md` at build time. Importing `…/page.md?doc` yields the fully rendered
 * `RenderedDoc` (frontmatter, HTML with highlighted code, TOC) as JSON, so the Worker and the
 * browser never load the Markdown/highlighting pipeline:
 *
 *   import.meta.glob("../../../content/docs/*.md", { query: "?doc", import: "default", eager: true })
 */
export function docsPlugin(): Plugin {
  return {
    name: "screen-commons:docs",
    enforce: "pre",
    async load(id) {
      if (!id.endsWith(`.md${QUERY}`)) return null;
      const file = id.slice(0, -QUERY.length);
      this.addWatchFile(file);
      const source = await readFile(file, "utf8");
      const doc = renderDoc(basename(file, ".md"), source);
      return { code: `export default ${JSON.stringify(doc)};`, map: null };
    },
  };
}
