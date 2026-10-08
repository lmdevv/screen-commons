import type { Screen } from "@screen-commons/core";
import {
  Badge,
  Button,
  Container,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  PageHeader,
  SectionHeader,
  cn,
  pluralize,
  textLinkClassName,
} from "@screen-commons/ui";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, Pencil, Trash2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { AppResults } from "../../components/library/app-results";
import { FlowResults } from "../../components/library/flow-results";
import { ScreenResults } from "../../components/library/screen-results";
import { invalidateSaves } from "../../components/library/saving";
import { queries } from "../../lib/queries";
import { errorMessage, notify } from "../../lib/toast";
import { deleteCollection, unsaveItem } from "../../server/functions";

const CollectionNameDialog = lazy(() => import("../../components/library/collection-name-dialog"));

export const Route = createFileRoute("/_app/saved/$id")({
  loader: async ({ context: { queryClient }, params }) => {
    const { collection } = await queryClient.ensureQueryData(queries.collection(params.id));
    return { title: collection.name };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.title} — Screen Commons` : "Saved — Screen Commons" },
    ],
  }),
  component: CollectionPage,
});

function CollectionPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(queries.collection(id));
  const { collection, screens, flows, apps } = data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<{ open: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const platform = screens[0]?.app.platform ?? "web";
  const empty = screens.length + flows.length + apps.length === 0;

  /** Unsave from THIS collection (optimistically removed from the grid). */
  async function removeScreen(screen: Screen) {
    const key = queries.collection(id).queryKey;
    const previous = queryClient.getQueryData(key);
    queryClient.setQueryData(key, (current) =>
      current
        ? { ...current, screens: current.screens.filter((s) => s.id !== screen.id) }
        : current,
    );
    try {
      await unsaveItem({ data: { kind: "screen", id: screen.id, collectionId: id } });
      notify.message(`Removed from ${collection.name}`);
    } catch (error) {
      queryClient.setQueryData(key, previous);
      notify.error(errorMessage(error));
    } finally {
      invalidateSaves(queryClient, [{ kind: "screen", id: screen.id }]);
      void queryClient.invalidateQueries({ queryKey: ["screens"] });
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await deleteCollection({ data: { id } });
      queryClient.setQueryData(queries.collections().queryKey, (current) =>
        current ? { items: current.items.filter((item) => item.id !== id) } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      notify.message(`Deleted ${collection.name}`);
      void navigate({ to: "/saved" });
    } catch (error) {
      notify.error(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <Container className="pt-8 pb-24 sm:pt-10">
      <Link
        to="/saved"
        className={cn(textLinkClassName, "inline-flex items-center gap-1.5 no-underline")}
      >
        <ArrowLeft className="size-4" />
        Saved
      </Link>
      <PageHeader
        className="mt-8"
        title={
          <span className="inline-flex items-center gap-3">
            {collection.name}
            {collection.isDefault ? <Badge className="translate-y-0.5">Default</Badge> : null}
          </span>
        }
        description={pluralize(collection.itemCount, "item")}
        actions={
          <>
            <Button variant="outline" onClick={() => setRenaming({ open: true })}>
              <Pencil />
              Rename
            </Button>
            {collection.isDefault ? null : (
              <Button
                variant="ghost"
                icon
                aria-label="Delete collection"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
              </Button>
            )}
          </>
        }
      />

      {empty ? (
        <EmptyState
          className="mt-10"
          tone="tile"
          icon={<Bookmark />}
          title="This collection is empty"
          description="Save screens, flows and apps into it from the bookmark button, the viewer (S) or the selection bar."
          actions={
            <Button render={<Link to="/browse/$platform" params={{ platform: "web" }} />}>
              Browse the library
            </Button>
          }
        />
      ) : null}

      {screens.length > 0 ? (
        <section className="mt-12">
          <SectionHeader title="Screens" description={pluralize(screens.length, "screen")} />
          <div className="mt-6">
            <ScreenResults
              listKey={`collection:${id}`}
              screens={screens}
              platform={platform}
              showApp
              downloadName={collection.name}
              onSaveToggle={(screen, saved) => {
                if (!saved) void removeScreen(screen);
              }}
            />
          </div>
        </section>
      ) : null}
      {flows.length > 0 ? (
        <section className="mt-16">
          <SectionHeader title="Flows" description={pluralize(flows.length, "flow")} />
          <div className="mt-6">
            <FlowResults flows={flows} priority={false} />
          </div>
        </section>
      ) : null}
      {apps.length > 0 ? (
        <section className="mt-16">
          <SectionHeader title="Apps" description={pluralize(apps.length, "app")} />
          <div className="mt-6">
            <AppResults apps={apps} platform={apps[0]!.platform} priority={false} />
          </div>
        </section>
      ) : null}

      {renaming ? (
        <Suspense fallback={null}>
          <CollectionNameDialog
            mode="rename"
            collection={collection}
            open={renaming.open}
            onOpenChange={(open) => setRenaming({ open })}
          />
        </Suspense>
      ) : null}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete “{collection.name}”?</DialogTitle>
            <DialogDescription>
              The collection is removed. The screens, flows and apps in it stay in the library.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-6">
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>
              Delete collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
