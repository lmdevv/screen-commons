import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint, query } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/apps/$slug")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ request, params, context }) =>
        Response.json(
          await services.getApp(
            requireUser(context.principal),
            params.slug,
            query(request).platform,
          ),
        ),
      ANY: noSuchEndpoint,
    },
  },
});
