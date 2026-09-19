import { createFileRoute } from "@tanstack/react-router";

import { ENV } from "../env.server";
import { ANALYTICS_EVENTS } from "../lib/analytics";

const allowedEvents = new Set<string>(ANALYTICS_EVENTS);

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const input = (await request.json().catch(() => null)) as {
          distinctId?: unknown;
          event?: unknown;
          properties?: unknown;
        } | null;
        if (
          typeof input?.event !== "string" ||
          !allowedEvents.has(input.event) ||
          typeof input.distinctId !== "string" ||
          input.distinctId.length > 128 ||
          !input.properties ||
          typeof input.properties !== "object" ||
          Array.isArray(input.properties) ||
          JSON.stringify(input.properties).length > 4_000
        ) {
          return Response.json({ error: "Invalid analytics event" }, { status: 400 });
        }
        if (!ENV.POSTHOG_API_KEY) return new Response(null, { status: 204 });
        const response = await fetch(`${ENV.POSTHOG_HOST.replace(/\/$/u, "")}/capture/`, {
          body: JSON.stringify({
            api_key: ENV.POSTHOG_API_KEY,
            event: input.event,
            properties: {
              ...(input.properties as Record<string, unknown>),
              distinct_id: input.distinctId,
              $process_person_profile: false,
            },
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        return new Response(null, { status: response.ok ? 204 : 502 });
      },
    },
  },
});
