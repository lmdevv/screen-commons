import { auth } from "@clerk/tanstack-react-start/server";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const requireAuthenticatedUser = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();
  return session.isAuthenticated;
});

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ location }) => {
    if (await requireAuthenticatedUser()) return;

    throw redirect({
      href: `/sign-in?redirect_url=${encodeURIComponent(location.href)}`,
    });
  },
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
