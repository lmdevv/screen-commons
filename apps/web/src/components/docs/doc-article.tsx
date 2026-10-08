import { Prose, cn } from "@screen-commons/ui";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DocMeta, RenderedDoc, TocEntry } from "./markdown";

const GITHUB_EDIT = "https://github.com/lmdevv/open-ui/edit/main/apps/web/content/docs";

const CHECK_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

/**
 * One docs page: title + lead, server-rendered HTML, prev/next, "On this page". The only client
 * work is a delegated click handler (copy buttons, client-side navigation for internal links)
 * and the TOC scroll-spy.
 */
export function DocArticle({
  doc,
  prev,
  next,
}: {
  doc: RenderedDoc;
  prev: DocMeta | null;
  next: DocMeta | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const copy = target.closest<HTMLButtonElement>("[data-copy]");
      if (copy) {
        const code = copy.parentElement?.querySelector("pre")?.textContent ?? "";
        void navigator.clipboard.writeText(code).then(() => {
          const icon = copy.innerHTML;
          copy.setAttribute("data-copied", "");
          copy.setAttribute("aria-label", "Copied");
          copy.innerHTML = CHECK_ICON;
          setTimeout(() => {
            copy.removeAttribute("data-copied");
            copy.setAttribute("aria-label", "Copy code");
            copy.innerHTML = icon;
          }, 1500);
        });
        return;
      }
      const link = target.closest<HTMLAnchorElement>("a[href]");
      const href = link?.getAttribute("href");
      if (
        !link ||
        !href ||
        !href.startsWith("/") ||
        href.startsWith("//") ||
        link.target ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      void router.navigate({ href });
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [router]);

  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_200px]">
      <article className="min-w-0 pb-8">
        <p className="text-sm font-medium text-fg-muted">{doc.section}</p>
        <h1 className="mt-2 text-xl font-semibold text-fg sm:text-2xl">{doc.title}</h1>
        {doc.description ? (
          <p className="mt-3 max-w-[680px] text-md text-pretty text-fg-muted">{doc.description}</p>
        ) : null}
        <div ref={ref}>
          <Prose
            className="mt-8 max-w-[720px]"
            // Rendered at build time from our own Markdown files.
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />
        </div>
        <div className="mt-14 max-w-[720px]">
          <nav aria-label="Pagination" className="grid gap-3 sm:grid-cols-2">
            {prev ? <PageLink doc={prev} direction="prev" /> : <span />}
            {next ? <PageLink doc={next} direction="next" /> : null}
          </nav>
          <a
            href={`${GITHUB_EDIT}/${doc.slug}.md`}
            target="_blank"
            rel="noreferrer noopener"
            className="ou-focus-ring mt-8 inline-block rounded-xs text-sm text-fg-muted transition-colors hover:text-fg"
          >
            Edit this page on GitHub
          </a>
        </div>
      </article>
      {doc.toc.length > 1 ? <OnThisPage toc={doc.toc} key={doc.slug} /> : null}
    </div>
  );
}

function PageLink({ doc, direction }: { doc: DocMeta; direction: "prev" | "next" }) {
  const next = direction === "next";
  return (
    <Link
      to={doc.slug === "index" ? "/docs" : "/docs/$slug"}
      params={doc.slug === "index" ? undefined : { slug: doc.slug }}
      className={cn(
        "ou-focus-ring group flex flex-col gap-1 rounded-card border border-border px-4 py-3.5 transition-colors duration-150 hover:border-border-strong hover:bg-muted/40",
        next && "items-end text-right sm:col-start-2",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm text-fg-muted">
        {next ? null : <ArrowLeft aria-hidden className="size-3.5" />}
        {next ? "Next" : "Previous"}
        {next ? <ArrowRight aria-hidden className="size-3.5" /> : null}
      </span>
      <span className="text-base font-medium text-fg">{doc.title}</span>
    </Link>
  );
}

function OnThisPage({ toc }: { toc: TocEntry[] }) {
  const [active, setActive] = useState<string | null>(toc[0]?.id ?? null);

  useEffect(() => {
    const headings = toc
      .map((entry) => document.getElementById(entry.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;
    const onScroll = () => {
      // The last heading above the top 30% of the viewport is the current section.
      const line = window.innerHeight * 0.3;
      let current = headings[0]!.id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= line) current = heading.id;
        else break;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [toc]);

  return (
    <aside className="hidden xl:block">
      <nav
        aria-label="On this page"
        className="sticky top-[calc(var(--spacing-topbar)+24px)] max-h-[calc(100dvh-var(--spacing-topbar)-48px)] overflow-y-auto pb-10"
      >
        <h2 className="text-sm font-medium text-fg">On this page</h2>
        <ul className="mt-3 flex flex-col gap-2 border-l border-border">
          {toc.map((entry) => (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                aria-current={active === entry.id ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l py-0.5 text-sm transition-colors duration-150",
                  entry.depth === 3 ? "pl-6" : "pl-3",
                  active === entry.id
                    ? "border-fg font-medium text-fg"
                    : "border-transparent text-fg-muted hover:text-fg",
                )}
              >
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
