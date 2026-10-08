import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { readJson } from "../../../server/http/body";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/admin/media/backfill")({
  caseSensitive: true,
  server: {
    handlers: {
      POST: async ({ request, context }) =>
        Response.json(
          await services.backfillDisplay(requireUser(context.principal), await readJson(request)),
        ),
      ANY: noSuchEndpoint,
    },
  },
});
