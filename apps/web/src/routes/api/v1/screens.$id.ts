import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/screens/$id")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ params, context }) =>
        Response.json(await services.getScreen(requireUser(context.principal), params.id)),
      ANY: noSuchEndpoint,
    },
  },
});
