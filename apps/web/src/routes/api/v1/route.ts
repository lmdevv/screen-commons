import { createFileRoute } from "@tanstack/react-router";

import { apiMiddleware, noSuchEndpoint } from "../../../server/http/api";

/** REST API layout: `apiMiddleware` wraps every `/api/v1/*` endpoint (and the 404 catch-all). */
export const Route = createFileRoute("/api/v1")({
  server: { middleware: [apiMiddleware], handlers: { ANY: noSuchEndpoint } },
});
