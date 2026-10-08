import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import * as services from "../../../server/services";

/** Admin only (enforced by the review services). */
export const Route = createFileRoute("/api/v1/review")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ context }) =>
        Response.json(await services.reviewQueue(requireUser(context.principal))),
      ANY: noSuchEndpoint,
    },
  },
});
