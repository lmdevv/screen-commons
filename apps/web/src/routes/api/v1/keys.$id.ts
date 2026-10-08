import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { noContent } from "../../../server/http/responses";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/keys/$id")({
  caseSensitive: true,
  server: {
    handlers: {
      DELETE: async ({ params, context }) => {
        await services.revokeKey(requireUser(context.principal), params.id);
        return noContent();
      },
      ANY: noSuchEndpoint,
    },
  },
});
