import { createFileRoute } from "@tanstack/react-router";

import { ContributeWizard } from "../../components/contribute/contribute-wizard";

export const Route = createFileRoute("/_app/contribute")({
  head: () => ({ meta: [{ title: "Contribute · Screen Commons" }] }),
  component: Contribute,
});

function Contribute() {
  const { user } = Route.useRouteContext();
  return <ContributeWizard isAdmin={user.role === "admin"} />;
}
