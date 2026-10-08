import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { readJson } from "../../../server/http/body";
import { noContent } from "../../../server/http/responses";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/review/$kind/$id")({
  caseSensitive: true,
  server: {
    handlers: {
      POST: async ({ request, params, context }) => {
        await services.review(
          requireUser(context.principal),
          params.kind,
          params.id,
          await readJson(request),
        );
        return noContent();
      },
      ANY: noSuchEndpoint,
    },
  },
});
