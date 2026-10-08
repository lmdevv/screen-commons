import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint, query } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { readJson } from "../../../server/http/body";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/flows")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ request, context }) =>
        Response.json(await services.listFlows(requireUser(context.principal), query(request))),
      POST: async ({ request, context }) =>
        Response.json(
          await services.createFlow(requireUser(context.principal), await readJson(request)),
          { status: 201 },
        ),
      ANY: noSuchEndpoint,
    },
  },
});
