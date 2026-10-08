import {
  Button,
  CollectionCard,
  Container,
  EmptyState,
  PageHeader,
  ScreenGrid,
  ScreenGridItem,
  ScreenGridSkeleton,
} from "@screen-commons/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bookmark, Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { queries } from "../../lib/queries";

const CollectionNameDialog = lazy(() => import("../../components/library/collection-name-dialog"));

export const Route = createFileRoute("/_app/saved/")({
  loader: async ({ context: { queryClient } }) => {
    const work = queryClient.prefetchQuery(queries.collections());
    if (typeof window === "undefined") await work;
  },
  head: () => ({ meta: [{ title: "Saved — Screen Commons" }] }),
  component: SavedPage,
});

function SavedPage() {
  const collections = useQuery(queries.collections());
  const [creating, setCreating] = useState<{ open: boolean } | null>(null);
  const items = collections.data?.items ?? [];
  const nothingSaved = items.length > 0 && items.every((collection) => collection.itemCount === 0);

  return (
    <Container className="pt-10 pb-24 sm:pt-12">
      <PageHeader
        title="Saved"
        description="Your collections of screens, flows and apps."
        actions={
          <Button variant="outline" onClick={() => setCreating({ open: true })}>
            <Plus />
            New collection
          </Button>
        }
      />
      <div className="mt-10">
        {collections.isPending ? (
          <ScreenGridSkeleton columns="apps-mobile" count={5} withMeta />
        ) : (
          <ScreenGrid columns="apps-mobile">
            {items.map((collection) => (
              <ScreenGridItem key={collection.id}>
                <CollectionCard
                  collection={collection}
                  linkRender={<Link to="/saved/$id" params={{ id: collection.id }} />}
                />
              </ScreenGridItem>
            ))}
          </ScreenGrid>
        )}
        {nothingSaved ? (
          <EmptyState
            className="mt-10"
            tone="tile"
            icon={<Bookmark />}
            title="Nothing saved yet"
            description="Save screens, flows and apps with the bookmark button — or press S in the screen viewer."
            actions={
              <Button render={<Link to="/browse/$platform" params={{ platform: "web" }} />}>
                Browse the library
              </Button>
            }
          />
        ) : null}
      </div>
      {creating ? (
        <Suspense fallback={null}>
          <CollectionNameDialog
            mode="create"
            open={creating.open}
            onOpenChange={(open) => setCreating({ open })}
          />
        </Suspense>
      ) : null}
    </Container>
  );
}
