import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint, query } from "../../../server/http/api";
import { requireUser } from "../../../server/http/auth";
import { readForm } from "../../../server/http/body";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/screens")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: async ({ request, context }) =>
        Response.json(await services.listScreens(requireUser(context.principal), query(request))),
      /** Multipart upload of one screen with a client-generated thumbnail. */
      POST: async ({ request, context }) => {
        const principal = requireUser(context.principal);
        const form = await readForm(request);
        const result = await services.createScreen(principal, {
          image: form.get("image"),
          thumbnail: form.get("thumbnail"),
          meta: form.get("meta"),
        });
        return Response.json(result, { status: 201 });
      },
      ANY: noSuchEndpoint,
    },
  },
});
