import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import * as services from "../../../server/services";
import { readJson } from "../../../server/http/body";

export const Route = createFileRoute("/api/v1/flows/$id")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ params, context }) =>
        Response.json(await services.getFlow(requireUser(context.principal), params.id)),
      PATCH: async ({ params, context, request }) =>
        Response.json(
          await services.updateFlow(
            requireUser(context.principal),
            params.id,
            await readJson(request),
          ),
        ),
      DELETE: async ({ params, context }) => {
        await services.deleteContribution(requireUser(context.principal), "flow", params.id);
        return new Response(null, { status: 204 });
      },
      ANY: noSuchEndpoint,
    },
  },
});
