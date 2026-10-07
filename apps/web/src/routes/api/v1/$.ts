import { createFileRoute } from "@tanstack/react-router";

import { api } from "../../../server/http/api";

export const Route = createFileRoute("/api/v1/$")({
  server: { handlers: { ANY: ({ request }) => api.fetch(request) } },
});
