import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint, query } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { readJson } from "../../../server/http/body";
import { noContent } from "../../../server/http/responses";
import * as services from "../../../server/services";

/** Spec alias of `/saves` scoped to one collection. */
export const Route = createFileRoute("/api/v1/collections/$id/items")({
  caseSensitive: true,
  server: {
    handlers: {
      POST: async ({ request, params, context }) => {
        const body = (await readJson(request)) as Record<string, unknown>;
        await services.save(requireUser(context.principal), { ...body, collectionId: params.id });
        return noContent();
      },
      DELETE: async ({ request, params, context }) => {
        await services.unsave(requireUser(context.principal), {
          ...query(request),
          collectionId: params.id,
        });
        return noContent();
      },
      ANY: noSuchEndpoint,
    },
  },
});
