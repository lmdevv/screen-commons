import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { readJson } from "../../../server/http/body";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/cli-login/poll")({
  caseSensitive: true,
  server: {
    handlers: {
      POST: async ({ request }) =>
        Response.json(await services.pollCliLogin(await readJson(request))),
      ANY: noSuchEndpoint,
    },
  },
});
