import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { docPage, docsNav } from "./content";

/** Docs are public and change only on deploy. */
function cacheable() {
  setResponseHeader("cache-control", "public, max-age=300");
}

export const getDocsNav = createServerFn({ method: "GET" }).handler(() => {
  cacheable();
  return docsNav();
});

export const getDocPage = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => ({ slug: String(data.slug) }))
  .handler(({ data }) => {
    const page = docPage(data.slug);
    if (!page) throw notFound();
    cacheable();
    return page;
  });
