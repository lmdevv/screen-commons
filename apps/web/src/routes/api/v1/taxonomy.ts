import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";
import * as services from "../../../server/services";

export const Route = createFileRoute("/api/v1/taxonomy")({
  caseSensitive: true,
  server: {
    handlers: {
      GET: () => Response.json(services.getTaxonomy()),
      ANY: noSuchEndpoint,
    },
  },
});
