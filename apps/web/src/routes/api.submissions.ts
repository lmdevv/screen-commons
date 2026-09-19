import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ENV } from "../env.server";
import { AuthorizationError, requireLocalUser } from "../server/auth";

const variantSchema = z.object({
  byteLength: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
  height: z.number().int().positive().max(10_000),
  key: z.string().max(500),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  width: z.number().int().positive().max(10_000),
});

const finalizeSchema = z.object({
  draft: z.object({
    captureDate: z.string().date(),
    flowName: z.string().trim().max(160),
    id: z.string().min(1).max(128),
    kind: z.enum(["standalone", "flow"]),
    platform: z.literal("web"),
    productName: z.string().trim().min(1).max(120),
    productVersion: z.string().trim().max(80),
    rightsConfirmed: z.literal(true),
    sourceUrl: z.union([z.literal(""), z.string().url().max(2_000)]),
  }),
  items: z
    .array(
      z.object({
        full: variantSchema,
        id: z.string().min(1).max(128),
        notes: z.string().trim().max(2_000),
        order: z.number().int().min(0).max(49),
        perceptualHash: z.string().regex(/^[a-f0-9]{16,128}$/u),
        thumbnail: variantSchema,
        title: z.string().trim().min(1).max(160),
      }),
    )
    .min(1)
    .max(50),
});

type VariantInput = z.infer<typeof variantSchema>;

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 100);

const validVariant = (variant: VariantInput) =>
  /^uploads\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/(full|thumbnail)-[a-f0-9]{64}-\d+\.webp$/u.test(
    variant.key,
  ) &&
  /^[a-f0-9]{64}$/u.test(variant.sha256) &&
  Number.isSafeInteger(variant.byteLength) &&
  variant.byteLength > 0 &&
  variant.byteLength <= 15 * 1024 * 1024 &&
  Number.isSafeInteger(variant.width) &&
  Number.isSafeInteger(variant.height) &&
  variant.width > 0 &&
  variant.height > 0 &&
  variant.width * variant.height <= 20_000_000;

export const Route = createFileRoute("/api/submissions")({
  server: {
    handlers: {
      GET: async () => {
        let user;
        try {
          user = await requireLocalUser();
        } catch (error) {
          if (error instanceof AuthorizationError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          throw error;
        }
        const result = await ENV.DB.prepare(
          `SELECT s.id, s.kind, s.state, s.flow_name AS flowName, s.created_at AS createdAt,
                  s.updated_at AS updatedAt, p.name AS productName, COUNT(si.id) AS itemCount,
                  MIN(si.title) AS firstTitle, MIN(f.id) AS publishedFlowId
             FROM submissions s
             LEFT JOIN products p ON p.id = s.product_id
             LEFT JOIN submission_items si ON si.submission_id = s.id
             LEFT JOIN flows f ON f.submission_id = s.id AND f.visibility = 'published'
            WHERE s.owner_id = ?
            GROUP BY s.id
            ORDER BY s.updated_at DESC`,
        )
          .bind(user.id)
          .all();
        return Response.json(
          { submissions: result.results },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      },
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
        const parsed = finalizeSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "Invalid contribution metadata" }, { status: 400 });
        }
        const input = parsed.data;
        const itemLimit = input.draft.kind === "standalone" ? 1 : 50;
        if (input.items.length < 1 || input.items.length > itemLimit) {
          return Response.json({ error: "Invalid number of screens" }, { status: 400 });
        }
        const positions = [...input.items]
          .map((item) => item.order)
          .sort((left, right) => left - right);
        if (positions.some((position, index) => position !== index + 1)) {
          return Response.json(
            { error: "Screen order must be contiguous and unique" },
            { status: 400 },
          );
        }
        const captureTimestamp = Date.parse(`${input.draft.captureDate}T00:00:00.000Z`);
        if (!Number.isFinite(captureTimestamp) || captureTimestamp > Date.now() + 86_400_000) {
          return Response.json({ error: "Capture date is invalid" }, { status: 400 });
        }
        if (input.draft.kind === "flow" && !input.draft.flowName.trim()) {
          return Response.json({ error: "A flow name is required" }, { status: 400 });
        }
        const productVersion = input.draft.productVersion.trim() || input.draft.captureDate;

        const bucket = ENV.ASSETS as unknown as R2Bucket;
        for (const item of input.items) {
          if (!validVariant(item.full) || !validVariant(item.thumbnail)) {
            return Response.json({ error: "Invalid processed image metadata" }, { status: 400 });
          }
          if (
            !item.full.key.startsWith(`uploads/${user.clerkUserId}/`) ||
            !item.thumbnail.key.startsWith(`uploads/${user.clerkUserId}/`)
          ) {
            return Response.json({ error: "Upload ownership mismatch" }, { status: 403 });
          }
          const [full, thumbnail] = await Promise.all([
            bucket.head(item.full.key),
            bucket.head(item.thumbnail.key),
          ]);
          if (
            !full ||
            !thumbnail ||
            full.size !== item.full.byteLength ||
            thumbnail.size !== item.thumbnail.byteLength ||
            full.customMetadata?.sha256 !== item.full.sha256 ||
            thumbnail.customMetadata?.sha256 !== item.thumbnail.sha256
          ) {
            return Response.json(
              { error: "Uploaded variants could not be verified" },
              { status: 400 },
            );
          }
        }

        const now = Date.now();
        const productSlug = slugify(input.draft.productName) || `product-${crypto.randomUUID()}`;
        const existingProduct = await ENV.DB.prepare("SELECT id FROM products WHERE slug = ?")
          .bind(productSlug)
          .first<{ id: string }>();
        const productId = existingProduct?.id ?? crypto.randomUUID();
        const existingVersion = await ENV.DB.prepare(
          "SELECT id FROM product_versions WHERE product_id = ? AND label = ?",
        )
          .bind(productId, productVersion)
          .first<{ id: string }>();
        const versionId = existingVersion?.id ?? crypto.randomUUID();
        const submissionId = crypto.randomUUID();
        const correlationId = crypto.randomUUID();
        const statements: D1PreparedStatement[] = [];
        if (!existingProduct) {
          statements.push(
            ENV.DB.prepare(
              "INSERT INTO products (id, slug, name, aliases, description, visibility, created_at, updated_at, created_by_id, updated_by_id) VALUES (?, ?, ?, '[]', ?, 'private', ?, ?, ?, ?)",
            ).bind(
              productId,
              productSlug,
              input.draft.productName.trim(),
              `Contributor supplied product: ${input.draft.productName.trim()}`,
              now,
              now,
              user.id,
              user.id,
            ),
          );
        }
        if (!existingVersion) {
          statements.push(
            ENV.DB.prepare(
              "INSERT INTO product_versions (id, product_id, label, description, captured_at, visibility, created_at, updated_at, created_by_id, updated_by_id) VALUES (?, ?, ?, ?, ?, 'private', ?, ?, ?, ?)",
            ).bind(
              versionId,
              productId,
              productVersion,
              "Contributor supplied version",
              captureTimestamp,
              now,
              now,
              user.id,
              user.id,
            ),
          );
        }
        statements.push(
          ENV.DB.prepare(
            "INSERT INTO submissions (id, owner_id, kind, state, product_id, product_version_id, flow_name, platform, rights_status, pipeline_version, correlation_id, submitted_at, created_at, updated_at, created_by_id, updated_by_id) VALUES (?, ?, ?, 'submitted', ?, ?, ?, 'web_desktop', 'contributor_attested', 'v1', ?, ?, ?, ?, ?, ?)",
          ).bind(
            submissionId,
            user.id,
            input.draft.kind === "standalone" ? "standalone_screen" : "flow",
            productId,
            versionId,
            input.draft.kind === "flow" ? input.draft.flowName.trim() : null,
            correlationId,
            now,
            now,
            now,
            user.id,
            user.id,
          ),
        );
        for (const item of [...input.items].sort((left, right) => left.order - right.order)) {
          statements.push(
            ENV.DB.prepare(
              `INSERT INTO submission_items
               (id, submission_id, position, title, description, source_url, captured_at, full_object_key,
                full_byte_size, full_width, full_height, full_sha256, thumbnail_object_key,
                thumbnail_byte_size, thumbnail_width, thumbnail_height, thumbnail_sha256,
                perceptual_hash, created_at, updated_at, created_by_id, updated_by_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(
              item.id,
              submissionId,
              item.order - 1,
              item.title.trim(),
              item.notes.trim() || null,
              input.draft.sourceUrl.trim() || null,
              captureTimestamp,
              item.full.key,
              item.full.byteLength,
              item.full.width,
              item.full.height,
              item.full.sha256,
              item.thumbnail.key,
              item.thumbnail.byteLength,
              item.thumbnail.width,
              item.thumbnail.height,
              item.thumbnail.sha256,
              item.perceptualHash,
              now,
              now,
              user.id,
              user.id,
            ),
          );
        }
        await ENV.DB.batch(statements);

        const workflow = ENV.SUBMISSION_WORKFLOW as unknown as Workflow<{
          submissionId: string;
          correlationId: string;
        }>;
        let state: "processing_failed" | "submitted" = "submitted";
        try {
          await workflow.create({ id: submissionId, params: { submissionId, correlationId } });
        } catch {
          state = "processing_failed";
          await ENV.DB.prepare(
            "UPDATE submissions SET state = 'processing_failed', updated_at = ? WHERE id = ?",
          )
            .bind(Date.now(), submissionId)
            .run();
        }
        return Response.json(
          {
            submission: {
              id: submissionId,
              kind: input.draft.kind,
              status: state,
              title:
                input.draft.kind === "flow" ? input.draft.flowName.trim() : input.items[0]?.title,
              productName: input.draft.productName.trim(),
              itemCount: input.items.length,
              createdAt: new Date(now).toISOString(),
              updatedAt: new Date(now).toISOString(),
            },
          },
          { status: 201 },
        );
      },
    },
  },
});
