import { createFileRoute } from "@tanstack/react-router";

import { ENV } from "../env.server";
import { verifyMediaGrant } from "../server/media-signing";

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const url = new URL(request.url);
        const key = url.searchParams.get("key") ?? "";
        const signature = url.searchParams.get("signature") ?? "";
        const expires = Number(url.searchParams.get("expires"));
        const valid = await verifyMediaGrant(
          ENV.MEDIA_SIGNING_KEY,
          { key, signature, expires },
          "write",
        );
        if (!valid)
          return Response.json({ error: "Invalid or expired upload grant" }, { status: 403 });
        if (request.headers.get("content-type") !== "image/webp") {
          return Response.json({ error: "Only image/webp is accepted" }, { status: 415 });
        }

        const expected = /-([a-f0-9]{64})-(\d+)\.webp$/u.exec(key);
        if (!expected) return Response.json({ error: "Malformed upload key" }, { status: 400 });
        const expectedSize = Number(expected[2]);
        if (Number(request.headers.get("content-length")) !== expectedSize) {
          return Response.json({ error: "Upload size does not match grant" }, { status: 400 });
        }
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength !== expectedSize || bytes.byteLength > 15 * 1024 * 1024) {
          return Response.json({ error: "Upload size does not match grant" }, { status: 400 });
        }
        const signatureBytes = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12));
        const isWebP =
          new TextDecoder().decode(signatureBytes.slice(0, 4)) === "RIFF" &&
          new TextDecoder().decode(signatureBytes.slice(8, 12)) === "WEBP";
        if (!isWebP) return Response.json({ error: "Invalid WebP signature" }, { status: 400 });

        const actualHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        if (actualHash !== expected[1]) {
          return Response.json({ error: "Upload hash does not match grant" }, { status: 400 });
        }

        const bucket = ENV.ASSETS as unknown as R2Bucket;
        await bucket.put(key, bytes, {
          httpMetadata: {
            contentType: "image/webp",
            cacheControl: "private, max-age=31536000, immutable",
          },
          customMetadata: { sha256: actualHash },
          onlyIf: { etagDoesNotMatch: "*" },
        });
        return Response.json({ key, sha256: actualHash, size: bytes.byteLength }, { status: 201 });
      },
    },
  },
});
