import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";

import { authClient } from "../lib/auth-client";

/** Pathless layout for everything that requires sign-in. */
export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    return { user: context.user };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    await router.invalidate();
    await router.navigate({ to: "/sign-in" });
  }

  return (
    <div>
      <header>
        <nav>
          <Link to="/browse/$platform" params={{ platform: "web" }}>
            Open UI
          </Link>{" "}
          · <Link to="/settings">Settings</Link> · <span>{user.email}</span> ({user.role}) ·{" "}
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
