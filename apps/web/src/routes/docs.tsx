import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute } from "@tanstack/react-router";

import docsCss from "../components/docs/docs.css?url";
import { DocsLayout } from "../components/docs/docs-layout";
import { docsNavQuery } from "../components/docs/queries";

export const Route = createFileRoute("/docs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(docsNavQuery()),
  head: () => ({ links: [{ rel: "stylesheet", href: docsCss }] }),
  component: Docs,
});

function Docs() {
  const { data: sections } = useSuspenseQuery(docsNavQuery());
  return (
    <DocsLayout sections={sections}>
      <Outlet />
    </DocsLayout>
  );
}
