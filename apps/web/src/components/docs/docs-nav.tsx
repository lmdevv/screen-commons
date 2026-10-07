import { cn } from "@open-ui/ui";
import { Link } from "@tanstack/react-router";

import type { DocsSection } from "./content";

/** Sidebar list: sections in order, the current page in full ink. */
export function DocsNav({
  sections,
  current,
  onNavigate,
  className,
}: {
  sections: DocsSection[];
  current: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav aria-label="Documentation" className={cn("flex flex-col gap-7", className)}>
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="px-2.5 text-sm font-medium text-fg-subtle">{section.title}</h2>
          <ul className="mt-2 flex flex-col gap-px">
            {section.items.map((item) => {
              const active = item.slug === current;
              return (
                <li key={item.slug}>
                  <Link
                    to={item.slug === "index" ? "/docs" : "/docs/$slug"}
                    params={item.slug === "index" ? undefined : { slug: item.slug }}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "ou-focus-ring flex h-8 items-center rounded-control px-2.5 text-base transition-colors duration-150",
                      active
                        ? "bg-muted font-medium text-fg"
                        : "text-fg-muted hover:bg-muted/60 hover:text-fg",
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
