import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { readJson } from "../../../server/http/body";
import { noContent } from "../../../server/http/responses";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/collections/$id")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ params, context }) =>
        Response.json(await services.getCollection(requireUser(context.principal), params.id)),
      PATCH: async ({ request, params, context }) =>
        Response.json(
          await services.renameCollection(
            requireUser(context.principal),
            params.id,
            await readJson(request),
          ),
        ),
      DELETE: async ({ params, context }) => {
        await services.deleteCollection(requireUser(context.principal), params.id);
        return noContent();
      },
      ANY: noSuchEndpoint,
    },
  },
});
