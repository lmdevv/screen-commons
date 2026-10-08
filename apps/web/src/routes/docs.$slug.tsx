import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { DocArticle } from "../components/docs/doc-article";
import { docPageQuery } from "../components/docs/queries";

export const Route = createFileRoute("/docs/$slug")({
  beforeLoad: ({ params }) => {
    if (params.slug === "index") throw redirect({ to: "/docs" });
  },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(docPageQuery(params.slug)),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.doc.title ?? "Docs"} · Screen Commons docs` },
      { name: "description", content: loaderData?.doc.description ?? "" },
    ],
  }),
  component: DocPage,
});

function DocPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(docPageQuery(slug));
  return <DocArticle doc={data.doc} prev={data.prev} next={data.next} />;
}
