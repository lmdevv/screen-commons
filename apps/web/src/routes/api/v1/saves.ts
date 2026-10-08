import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint, query } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { readJson } from "../../../server/http/body";
import { noContent } from "../../../server/http/responses";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/saves")({
  caseSensitive: true,
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        await services.save(requireUser(context.principal), await readJson(request));
        return noContent();
      },
      DELETE: async ({ request, context }) => {
        await services.unsave(requireUser(context.principal), query(request));
        return noContent();
      },
      ANY: noSuchEndpoint,
    },
  },
});
