import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/me")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: ({ context }) => Response.json(services.me(requireUser(context.principal))),
      ANY: noSuchEndpoint,
    },
  },
});
