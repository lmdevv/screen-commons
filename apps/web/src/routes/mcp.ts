import { createFileRoute } from "@tanstack/react-router";

import { handleMcp } from "../server/http/mcp";

export const Route = createFileRoute("/mcp")({
  server: { handlers: { ANY: ({ request }) => handleMcp(request) } },
});
