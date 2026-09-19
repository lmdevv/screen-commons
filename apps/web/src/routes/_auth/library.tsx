import { createFileRoute } from "@tanstack/react-router";

import { CatalogView } from "@/features/library/catalog-view";
import { LibraryShell } from "@/features/library/library-shell";

export const Route = createFileRoute("/_auth/library")({
  component: LibraryRoute,
});

function LibraryRoute() {
  return (
    <LibraryShell>
      <CatalogView />
    </LibraryShell>
  );
}
