import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import * as services from "../../../server/services";
import { readJson } from "../../../server/http/body";

export const Route = createFileRoute("/api/v1/screens/$id")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ params, context }) =>
        Response.json(await services.getScreen(requireUser(context.principal), params.id)),
      PATCH: async ({ params, context, request }) =>
        Response.json(
          await services.updateScreen(
            requireUser(context.principal),
            params.id,
            await readJson(request),
          ),
        ),
      DELETE: async ({ params, context }) => {
        await services.deleteContribution(requireUser(context.principal), "screen", params.id);
        return new Response(null, { status: 204 });
      },
      ANY: noSuchEndpoint,
    },
  },
});
