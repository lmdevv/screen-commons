import { Footer, Logo, ThemeToggle, cn } from "@screen-commons/ui";
import { Link } from "@tanstack/react-router";

export const GITHUB_URL = "https://github.com/lmdevv/screen-commons";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Library", href: "/browse/web" },
      { label: "Contribute", href: "/contribute" },
      { label: "Browser extension", href: "/docs/extension" },
      { label: "MCP for agents", href: "/docs/mcp" },
    ],
  },
  {
    title: "Docs",
    links: [
      { label: "Introduction", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "REST API", href: "/docs/api" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: GITHUB_URL, external: true },
      { label: "Issues", href: `${GITHUB_URL}/issues`, external: true },
      { label: "License", href: `${GITHUB_URL}/blob/main/LICENSE`, external: true },
    ],
  },
] as const;

/** Public footer (landing, docs). */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <Footer
      className={cn("mt-24", className)}
      logo={
        <Link to="/" aria-label="Screen Commons home" className="ou-focus-ring w-fit rounded-sm">
          <Logo size="sm" />
        </Link>
      }
      tagline="An open-source library of real product screens and flows."
      columns={FOOTER_COLUMNS}
      renderLink={(link, linkClassName) => (
        // Internal footer links are plain paths; let the router resolve them.
        <Link to={link.href as "/"} className={linkClassName}>
          {link.label}
        </Link>
      )}
      legal={<>Open source under the Apache-2.0 license.</>}
      aside={<ThemeToggle />}
    />
  );
}
