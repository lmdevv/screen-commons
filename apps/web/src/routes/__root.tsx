import type { User } from "@screen-commons/core";
import {
  Button,
  EmptyState,
  ThemeProvider,
  TooltipProvider,
  themeScript,
} from "@screen-commons/ui";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { CircleAlert, SearchX } from "lucide-react";
import type { ReactNode } from "react";

import { DeferredToaster } from "../components/shell/deferred-toaster";
import { queries } from "../lib/queries";
import styles from "../styles.css?url";

/** The Screen Commons mark as an inline SVG favicon (follows the OS colour scheme). */
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>*{fill:#0a0a0a}@media (prefers-color-scheme:dark){*{fill:#f2f2f3}}</style><circle cx="6.25" cy="6.25" r="5.25"/><rect x="13" y="1" width="10.5" height="10.5" rx="2.75"/><rect x="1" y="13" width="10.5" height="10.5" rx="2.75"/><rect x="13" y="13" width="10.5" height="10.5" rx="2.75" fill-opacity=".32"/></svg>',
)}`;

export interface RouterContext {
  queryClient: QueryClient;
  /** Signed-in user (null when logged out), resolved once per navigation in `beforeLoad`. */
  user: User | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "color-scheme", content: "light dark" },
      { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#0b0b0c", media: "(prefers-color-scheme: dark)" },
      { title: "Screen Commons" },
      {
        name: "description",
        content: "An open-source library of real product screens and flows.",
      },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", type: "image/svg+xml", href: FAVICON },
    ],
  }),
  beforeLoad: async ({ context }) => ({
    user: await context.queryClient.fetchQuery(queries.session()),
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint: no flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <DeferredToaster />
          </TooltipProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

/** Root-level 404 (unknown URLs and `notFound()` from loaders without their own handler). */
export function NotFound() {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4">
      <EmptyState
        icon={<SearchX />}
        title="Page not found"
        description="The page you’re looking for doesn’t exist or isn’t visible to you."
        actions={
          <Button render={<Link to="/browse/$platform" params={{ platform: "web" }} />}>
            Browse the library
          </Button>
        }
      />
    </main>
  );
}

function RootError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4">
      <EmptyState
        icon={<CircleAlert />}
        title="Something went wrong"
        description={error instanceof Error ? error.message : "An unexpected error occurred."}
        actions={
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </main>
  );
}
