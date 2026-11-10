import { createFileRoute } from "@tanstack/react-router";

import { appOrigin } from "../../../server/env";
import { noSuchEndpoint } from "../../../server/http/api";
import { readJson } from "../../../server/http/body";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/cli-login")({
  caseSensitive: true,
  server: {
    handlers: {
      POST: async ({ request }) =>
        Response.json(await services.startCliLogin(await readJson(request), appOrigin(request)), {
          status: 201,
        }),
      ANY: noSuchEndpoint,
    },
  },
});
