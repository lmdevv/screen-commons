import { createFileRoute } from "@tanstack/react-router";

import { appOrigin } from "../../../server/env";
import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { readJson } from "../../../server/http/body";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/captures")({
  caseSensitive: true,
  server: {
    handlers: {
      /** JSON batch upload (extension, MCP, seed). */
      POST: async ({ request, context }) => {
        const principal = requireUser(context.principal);
        const result = await services.captures(
          principal,
          await readJson(request),
          appOrigin(request),
        );
        return Response.json(result, { status: 201 });
      },
      ANY: noSuchEndpoint,
    },
  },
});
