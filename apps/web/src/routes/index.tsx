import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { LandingPage } from "../components/marketing/landing";
import { landingQuery } from "../components/marketing/queries";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/browse/$platform", params: { platform: "web" } });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(landingQuery()),
  head: () => ({
    meta: [
      { title: "Open UI — Real product screens, open to everyone" },
      {
        name: "description",
        content:
          "An open-source, self-hostable library of real product screens and flows, searchable by pattern, element and flow.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { data } = useSuspenseQuery(landingQuery());
  return <LandingPage data={data} />;
}
