import { createFileRoute } from "@tanstack/react-router";

import { noSuchEndpoint } from "../../../server/http/api";

export const Route = createFileRoute("/api/v1/$")({
  server: { handlers: { ANY: noSuchEndpoint } },
});
