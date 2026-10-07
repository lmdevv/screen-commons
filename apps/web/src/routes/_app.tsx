import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { LibraryOverlays } from "../components/library/overlays";
import { AppShell } from "../components/shell";
import { overlaySearchSchema } from "../lib/search-params";

/**
 * Pathless layout for everything that requires sign-in. Owns the `?screen=` / `?flow=` overlay
 * params so the screen and flow viewers can open on top of any signed-in page.
 */
export const Route = createFileRoute("/_app")({
  validateSearch: overlaySearchSchema,
  beforeLoad: ({ context, location }) => {
    if (!context.user) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    return { user: context.user };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
      <LibraryOverlays />
    </AppShell>
  );
}
