import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint, query } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/search")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ request, context }) =>
        Response.json(await services.search(requireUser(context.principal), query(request))),
      ANY: noSuchEndpoint,
    },
  },
});
