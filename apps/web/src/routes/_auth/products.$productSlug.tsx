import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { LibraryShell } from "@/features/library/library-shell";
import { ProductNotFound, ProductView } from "@/features/library/product-view";
import { catalogQueryOptions } from "@/features/library/queries";

export const Route = createFileRoute("/_auth/products/$productSlug")({
  component: ProductRoute,
});

function ProductRoute() {
  const { productSlug } = Route.useParams();
  const catalogQuery = useQuery(catalogQueryOptions());
  const product = catalogQuery.data?.find((item) => item.slug === productSlug);

  return (
    <LibraryShell>
      {product ? (
        <ProductView product={product} />
      ) : catalogQuery.isPending ? (
        <RouteLoading />
      ) : (
        <ProductNotFound />
      )}
    </LibraryShell>
  );
}

function RouteLoading() {
  return (
    <div className="grid min-h-[70svh] place-items-center text-sm text-muted-foreground">
      Loading product…
    </div>
  );
}
