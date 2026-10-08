import { Container, TopBarIconButton } from "@screen-commons/ui";
import { useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Suspense, lazy, useState, type ReactNode } from "react";

import { SiteFooter } from "../marketing/site-chrome";
import { SiteHeader } from "../shell";
import type { DocsSection } from "./content";
import { DocsNav } from "./docs-nav";

const DocsNavSheet = lazy(() => import("./docs-nav-sheet"));
const loadSheet = () => void import("./docs-nav-sheet");

function currentSlug(pathname: string): string {
  const match = /^\/docs\/([^/?#]+)/u.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : "index";
}

/** Docs chrome: public header, sticky left nav (sheet on mobile), page, footer. */
export function DocsLayout({
  sections,
  children,
}: {
  sections: DocsSection[];
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = currentSlug(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLoaded, setMenuLoaded] = useState(false);

  return (
    <>
      <SiteHeader
        actions={
          <TopBarIconButton
            aria-label="Open documentation menu"
            className="lg:hidden"
            onPointerEnter={loadSheet}
            onFocus={loadSheet}
            onClick={() => {
              setMenuLoaded(true);
              setMenuOpen(true);
            }}
          >
            <Menu />
          </TopBarIconButton>
        }
      />
      <Container className="grid gap-10 pt-8 sm:pt-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--spacing-topbar)+24px)] -ml-2.5 max-h-[calc(100dvh-var(--spacing-topbar)-48px)] overflow-y-auto pb-10">
            <DocsNav sections={sections} current={current} />
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </Container>
      <SiteFooter />
      {menuLoaded ? (
        <Suspense fallback={null}>
          <DocsNavSheet
            open={menuOpen}
            onOpenChange={setMenuOpen}
            sections={sections}
            current={current}
          />
        </Suspense>
      ) : null}
    </>
  );
}
