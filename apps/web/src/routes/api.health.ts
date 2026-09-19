import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { ok: true, service: "open-ui", timestamp: new Date().toISOString() },
          { headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
