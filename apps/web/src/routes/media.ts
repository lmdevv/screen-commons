import { createFileRoute } from "@tanstack/react-router";

import { ENV } from "../env.server";
import { verifyMediaGrant } from "../server/media-signing";

export const Route = createFileRoute("/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const key = url.searchParams.get("key") ?? "";
        const signature = url.searchParams.get("signature") ?? "";
        const expires = Number(url.searchParams.get("expires"));
        const valid = await verifyMediaGrant(
          ENV.MEDIA_SIGNING_KEY,
          { key, signature, expires },
          "read",
        );
        if (!valid) return new Response("Invalid or expired media URL", { status: 403 });

        const bucket = ENV.ASSETS as unknown as R2Bucket;
        const object = await bucket.get(key);
        if (!object) return new Response("Not found", { status: 404 });

        const headers = new Headers({
          "Cache-Control": "private, max-age=300, immutable",
          "Content-Type": object.httpMetadata?.contentType ?? "image/webp",
          ETag: object.httpEtag,
          "X-Content-Type-Options": "nosniff",
        });
        return new Response(object.body, { headers });
      },
    },
  },
});
