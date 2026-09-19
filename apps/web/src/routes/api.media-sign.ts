import { createFileRoute } from "@tanstack/react-router";

import { ENV } from "../env.server";
import { AuthorizationError, requireLocalUser } from "../server/auth";
import { createMediaGrant, mediaGrantUrl } from "../server/media-signing";

export const Route = createFileRoute("/api/media-sign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let user;
        try {
          user = await requireLocalUser();
        } catch (error) {
          if (error instanceof AuthorizationError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          throw error;
        }

        const input = (await request.json().catch(() => null)) as { key?: unknown } | null;
        if (typeof input?.key !== "string") {
          return Response.json({ error: "A media key is required" }, { status: 400 });
        }

        const ownsStagedUpload = input.key.startsWith(`uploads/${user.clerkUserId}/`);
        const mayReviewPrivateMedia = user.role === "reviewer" || user.role === "administrator";
        if (!ownsStagedUpload && !mayReviewPrivateMedia) {
          const publishedAsset = await ENV.DB.prepare(
            `SELECT av.id
               FROM asset_variants av
               JOIN screens s ON s.id = av.screen_id
              WHERE av.object_key = ? AND s.visibility = 'published'
              LIMIT 1`,
          )
            .bind(input.key)
            .first<{ id: string }>();

          if (!publishedAsset) {
            return Response.json({ error: "Media access denied" }, { status: 403 });
          }
        }

        const grant = await createMediaGrant(ENV.MEDIA_SIGNING_KEY, input.key, "read");
        return Response.json(
          { url: mediaGrantUrl(new URL(request.url).origin, grant), expires: grant.expires },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      },
    },
  },
});
