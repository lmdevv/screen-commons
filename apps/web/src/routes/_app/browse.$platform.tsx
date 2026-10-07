import { platformSchema } from "@open-ui/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { queries } from "../../lib/queries";

export const Route = createFileRoute("/_app/browse/$platform")({
  loader: async ({ context, params }) => {
    const platform = platformSchema.safeParse(params.platform);
    if (!platform.success) throw notFound();
    await context.queryClient.ensureQueryData(queries.apps({ platform: platform.data }));
  },
  component: Browse,
});

function Browse() {
  const { platform } = Route.useParams();
  const { data } = useSuspenseQuery(queries.apps({ platform: platform as "web" }));
  return (
    <main>
      <h1>Apps ({platform})</h1>
      {data.items.length === 0 ? <p>No apps yet.</p> : null}
      <ul>
        {data.items.map((app) => (
          <li key={app.id}>
            <Link to="/apps/$slug" params={{ slug: app.slug }}>
              {app.name}
            </Link>{" "}
            — {app.screenCount} screens, {app.flowCount} flows
          </li>
        ))}
      </ul>
    </main>
  );
}
