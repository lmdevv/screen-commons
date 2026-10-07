import type { User } from "@open-ui/core";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { queries } from "../lib/queries";
import styles from "../styles.css?url";

export interface RouterContext {
  queryClient: QueryClient;
  /** Signed-in user (null when logged out), resolved once per navigation in `beforeLoad`. */
  user: User | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Open UI" },
    ],
    links: [{ rel: "stylesheet", href: styles }],
  }),
  beforeLoad: async ({ context }) => ({
    user: await context.queryClient.fetchQuery(queries.session()),
  }),
  component: RootComponent,
  notFoundComponent: () => <p>Not found.</p>,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
