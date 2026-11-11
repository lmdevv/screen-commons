import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { readJson } from "../../../server/http/body";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/keys")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ context }) =>
        Response.json(await services.listKeys(requireUser(context.principal))),
      POST: async ({ request, context }) =>
        Response.json(
          await services.createKey(requireUser(context.principal), await readJson(request)),
          { status: 201 },
        ),
      ANY: noSuchEndpoint,
    },
  },
});
