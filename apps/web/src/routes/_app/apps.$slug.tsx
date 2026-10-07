import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { queries } from "../../lib/queries";

export const Route = createFileRoute("/_app/apps/$slug")({
  loader: async ({ context, params }) => {
    const app = await context.queryClient.ensureQueryData(queries.app(params.slug));
    await context.queryClient.ensureQueryData(queries.screens({ app: app.id }));
  },
  component: AppPage,
});

function AppPage() {
  const { slug } = Route.useParams();
  const { data: app } = useSuspenseQuery(queries.app(slug));
  const { data: screens } = useSuspenseQuery(queries.screens({ app: app.id }));
  return (
    <main>
      <h1>{app.name}</h1>
      {app.tagline ? <p>{app.tagline}</p> : null}
      <ul>
        {screens.items.map((screen) => (
          <li key={screen.id}>
            <img src={screen.thumbUrl} alt={screen.title ?? ""} width={160} loading="lazy" />{" "}
            {screen.title ?? screen.id}
          </li>
        ))}
      </ul>
    </main>
  );
}
