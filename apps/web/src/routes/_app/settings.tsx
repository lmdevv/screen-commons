import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SettingsPage } from "../../components/settings/settings-page";
import { getInstanceOrigin } from "../../components/settings/settings.functions";
import { queries } from "../../lib/queries";

const originQuery = () =>
  queryOptions({ queryKey: ["origin"], queryFn: () => getInstanceOrigin(), staleTime: Infinity });

export const Route = createFileRoute("/_app/settings")({
  validateSearch: z.object({
    tab: z.enum(["profile", "keys", "integrations"]).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(originQuery()),
      deps.tab === "keys" ? context.queryClient.ensureQueryData(queries.keys()) : null,
    ]),
  head: () => ({ meta: [{ title: "Settings · Screen Commons" }] }),
  component: Settings,
});

function Settings() {
  const { tab } = Route.useSearch();
  const { user } = Route.useRouteContext();
  const { data: origin } = useSuspenseQuery(originQuery());
  return <SettingsPage tab={tab ?? "profile"} user={user} origin={origin} />;
}
