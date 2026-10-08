import type * as React from "react";

import { cn } from "../lib/cn";

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterColumn {
  title: string;
  links: readonly FooterLink[];
}

export interface FooterProps extends React.HTMLAttributes<HTMLElement> {
  /** Logo lockup (usually a link to "/"). */
  logo: React.ReactNode;
  tagline?: React.ReactNode;
  columns?: readonly FooterColumn[];
  /** Bottom-left, e.g. "© 2026 Screen Commons · Apache-2.0". */
  legal?: React.ReactNode;
  /** Bottom-right: ThemeToggle, GitHub icon link… */
  aside?: React.ReactNode;
  /** Render internal links with your router: `(link, className) => <Link to={link.href} className={className}>{link.label}</Link>`. */
  renderLink?: (link: FooterLink, className: string) => React.ReactNode;
}

const linkClassName =
  "ou-focus-ring rounded-xs text-base text-fg-muted transition-colors duration-150 hover:text-fg";

/** Site footer: logo + tagline, link columns, legal row. Quiet: hairline top, muted links. */
export function Footer({
  logo,
  tagline,
  columns = [],
  legal,
  aside,
  renderLink,
  className,
  ...props
}: FooterProps) {
  return (
    <footer className={cn("border-t border-border", className)} {...props}>
      <div className="mx-auto w-full max-w-page px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="flex max-w-xs flex-col gap-3">
            {logo}
            {tagline ? <p className="text-base text-fg-muted">{tagline}</p> : null}
          </div>
          {columns.length > 0 ? (
            <nav
              aria-label="Footer"
              className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:gap-x-16"
            >
              {columns.map((column) => (
                <div key={column.title} className="flex flex-col gap-3">
                  <h2 className="text-sm font-medium text-fg">{column.title}</h2>
                  <ul className="flex flex-col gap-2.5">
                    {column.links.map((link) => (
                      <li key={`${link.label}:${link.href}`}>
                        {renderLink && !link.external ? (
                          renderLink(link, linkClassName)
                        ) : (
                          <a
                            href={link.href}
                            className={linkClassName}
                            {...(link.external
                              ? { target: "_blank", rel: "noreferrer noopener" }
                              : {})}
                          >
                            {link.label}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          ) : null}
        </div>
        {legal || aside ? (
          <div className="mt-12 flex flex-col-reverse gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-fg-muted">{legal}</div>
            {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
