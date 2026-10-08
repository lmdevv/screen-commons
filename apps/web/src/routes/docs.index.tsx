import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { DocArticle } from "../components/docs/doc-article";
import { docPageQuery } from "../components/docs/queries";

export const Route = createFileRoute("/docs/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(docPageQuery("index")),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.doc.title ?? "Docs"} · Screen Commons docs` },
      { name: "description", content: loaderData?.doc.description ?? "" },
    ],
  }),
  component: DocsIndex,
});

function DocsIndex() {
  const { data } = useSuspenseQuery(docPageQuery("index"));
  return <DocArticle doc={data.doc} prev={data.prev} next={data.next} />;
}
