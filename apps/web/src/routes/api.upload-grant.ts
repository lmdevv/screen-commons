import { createFileRoute } from "@tanstack/react-router";

import { ENV } from "../env.server";
import { AuthorizationError, requireLocalUser } from "../server/auth";
import { createMediaGrant } from "../server/media-signing";

const safeId = (value: string) => /^[a-zA-Z0-9_-]{1,80}$/u.test(value);

export const Route = createFileRoute("/api/upload-grant")({
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

        const input = (await request.json().catch(() => null)) as {
          submissionId?: unknown;
          itemId?: unknown;
          variant?: unknown;
          size?: unknown;
          sha256?: unknown;
        } | null;
        const submissionId = typeof input?.submissionId === "string" ? input.submissionId : "";
        const itemId = typeof input?.itemId === "string" ? input.itemId : "";
        const variant =
          input?.variant === "full" || input?.variant === "thumbnail" ? input.variant : "";
        const size = typeof input?.size === "number" ? input.size : 0;
        const sha256 = typeof input?.sha256 === "string" ? input.sha256.toLowerCase() : "";
        if (
          !safeId(submissionId) ||
          !safeId(itemId) ||
          !variant ||
          !Number.isSafeInteger(size) ||
          size < 1 ||
          size > 15 * 1024 * 1024 ||
          !/^[a-f0-9]{64}$/u.test(sha256)
        ) {
          return Response.json({ error: "Invalid upload request" }, { status: 400 });
        }

        const key = `uploads/${user.clerkUserId}/${submissionId}/${itemId}/${variant}-${sha256}-${size}.webp`;
        const grant = await createMediaGrant(ENV.MEDIA_SIGNING_KEY, key, "write");
        const url = new URL("/api/upload", request.url);
        url.searchParams.set("key", key);
        url.searchParams.set("expires", String(grant.expires));
        url.searchParams.set("signature", grant.signature);
        return Response.json(
          {
            url: url.toString(),
            key,
            expires: grant.expires,
            headers: { "Content-Type": "image/webp" },
          },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      },
    },
  },
});
