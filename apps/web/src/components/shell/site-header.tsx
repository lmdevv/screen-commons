import { Button, Logo, TopBar, cn } from "@screen-commons/ui";
import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

export interface SiteHeaderProps {
  /** Replace the default nav (Docs · Library · GitHub). */
  nav?: ReactNode;
  /** Extra actions before the auth buttons. */
  actions?: ReactNode;
  className?: string;
}

const navLinkClassName =
  "ou-focus-ring rounded-sm px-1 text-base font-medium text-fg-muted transition-colors duration-150 hover:text-fg aria-[current=page]:text-fg";

/**
 * Public header for the landing page and docs: logo · Docs / Library / GitHub │ Sign in · Get
 * started (or "Open library" when signed in). Same 56px sticky bar as the library.
 */
export function SiteHeader({ nav, actions, className }: SiteHeaderProps) {
  const { user } = useRouteContext({ from: "__root__" });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <TopBar
      className={className}
      logo={
        <Link to="/" aria-label="Screen Commons home" className="ou-focus-ring rounded-sm">
          <Logo />
        </Link>
      }
      nav={
        nav ?? (
          <nav aria-label="Main" className="flex items-center gap-4">
            <Link
              to="/docs"
              className={navLinkClassName}
              aria-current={pathname.startsWith("/docs") ? "page" : undefined}
            >
              Docs
            </Link>
            <Link to="/browse/$platform" params={{ platform: "web" }} className={navLinkClassName}>
              Library
            </Link>
            <a
              href="https://github.com/lmdevv/open-ui"
              target="_blank"
              rel="noreferrer noopener"
              className={navLinkClassName}
            >
              GitHub
            </a>
          </nav>
        )
      }
      actions={
        <div className={cn("flex items-center gap-1.5")}>
          {actions}
          {user ? (
            <Button size="sm" render={<Link to="/browse/$platform" params={{ platform: "web" }} />}>
              Open library
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" render={<Link to="/sign-in" />}>
                Sign in
              </Button>
              <Button size="sm" render={<Link to="/sign-up" />}>
                Get started
              </Button>
            </>
          )}
        </div>
      }
    />
  );
}
