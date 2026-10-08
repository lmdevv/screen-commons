import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { AuthForm } from "../components/auth/auth-form";
import { AuthLayout } from "../components/auth/auth-layout";
import { safeRedirect } from "../components/auth/redirect";
import { authPageInfoQuery, landingQuery } from "../components/marketing/queries";

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => {
    if (context.user) throw redirect({ href: safeRedirect(search.redirect) });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(authPageInfoQuery()),
      // Decorative collage: a failure must never block the form.
      context.queryClient.ensureQueryData(landingQuery()).catch(() => null),
    ]),
  head: () => ({ meta: [{ title: "Sign in · Screen Commons" }] }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const { data: info } = useSuspenseQuery(authPageInfoQuery());
  const landing = useQuery(landingQuery());
  return (
    <AuthLayout screens={landing.data?.screens.slice(0, 6)}>
      <AuthForm mode="sign-in" redirectTo={search.redirect} github={info.github} />
    </AuthLayout>
  );
}
