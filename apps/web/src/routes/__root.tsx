import { ClerkProvider } from "@clerk/tanstack-react-start";
import { Toaster } from "@open-ui/ui/components/sonner";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";

import Header from "../components/header";

import appCss from "../index.css?url";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Open UI — Complete interface flows",
      },
      {
        name: "description",
        content:
          "A free, community-maintained library of complete, ordered product interface flows.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 },
        },
      }),
  );
  return (
    <ClerkProvider>
      <QueryClientProvider client={queryClient}>
        <HotkeysProvider>
          <html lang="en" className="dark">
            <head>
              <HeadContent />
            </head>
            <body>
              <div className="grid h-svh grid-rows-[auto_1fr]">
                <Header />
                <Outlet />
              </div>
              <Toaster richColors />
              {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-left" /> : null}
              <Scripts />
            </body>
          </html>
        </HotkeysProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
