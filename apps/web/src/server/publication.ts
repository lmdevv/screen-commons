import { and, asc, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import {
  assetVariants,
  createDb,
  flows,
  flowScreens,
  products,
  productVersions,
  reviewEvents,
  screens,
  submissionItems,
  submissions,
} from "@open-ui/db";

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 100);

export async function publishSubmission(
  database: D1Database,
  submissionId: string,
  actorId: string | null,
  reason: string,
): Promise<void> {
  const db = createDb({ DB: database });
  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);
  if (!submission) throw new Error("Submission not found");
  if (submission.state === "published") return;
  if (submission.state !== "automated_review" && submission.state !== "awaiting_human") {
    throw new Error(`Submission cannot be published from ${submission.state}`);
  }
  if (!submission.productId || !submission.productVersionId) {
    throw new Error("Submission is missing its product or product version");
  }

  const items = await db
    .select()
    .from(submissionItems)
    .where(eq(submissionItems.submissionId, submissionId))
    .orderBy(asc(submissionItems.position));
  if (!items.length) throw new Error("Submission has no items");

  const now = new Date();
  const ownerId = actorId ?? submission.ownerId;
  const statements: BatchItem<"sqlite">[] = [];
  const screenIdsByHash = new Map<string, string>();
  const linkedScreens: Array<{
    item: (typeof items)[number];
    screenId: string;
    reused: boolean;
  }> = [];

  for (const item of items) {
    const queuedScreenId = screenIdsByHash.get(item.fullSha256);
    const [duplicate] = queuedScreenId
      ? []
      : await db
          .select({ id: screens.id })
          .from(screens)
          .where(eq(screens.sha256, item.fullSha256))
          .limit(1);
    const screenId = queuedScreenId ?? duplicate?.id ?? crypto.randomUUID();
    const reused = Boolean(queuedScreenId || duplicate);
    linkedScreens.push({ item, screenId, reused });

    if (!reused) {
      screenIdsByHash.set(item.fullSha256, screenId);
      statements.push(
        db.insert(screens).values({
          id: screenId,
          productVersionId: submission.productVersionId,
          submissionId: submission.id,
          title: item.title,
          description: item.description,
          platform: submission.platform,
          sourceUrl: item.sourceUrl,
          capturedAt: item.capturedAt,
          visibleText: item.visibleText,
          sha256: item.fullSha256,
          perceptualHash: item.perceptualHash,
          isStandalone: submission.kind === "standalone_screen",
          rightsStatus: "contributor_attested",
          visibility: "published",
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
          createdById: ownerId,
          updatedById: ownerId,
        }),
        db.insert(assetVariants).values([
          {
            id: crypto.randomUUID(),
            screenId,
            kind: "full",
            objectKey: item.fullObjectKey,
            byteSize: item.fullByteSize,
            width: item.fullWidth,
            height: item.fullHeight,
            sha256: item.fullSha256,
            createdAt: now,
            updatedAt: now,
            createdById: ownerId,
            updatedById: ownerId,
          },
          {
            id: crypto.randomUUID(),
            screenId,
            kind: "thumbnail",
            objectKey: item.thumbnailObjectKey,
            byteSize: item.thumbnailByteSize,
            width: item.thumbnailWidth,
            height: item.thumbnailHeight,
            sha256: item.thumbnailSha256,
            createdAt: now,
            updatedAt: now,
            createdById: ownerId,
            updatedById: ownerId,
          },
        ]),
      );
    }

    statements.push(
      db
        .update(submissionItems)
        .set({ linkedScreenId: screenId, updatedAt: now, updatedById: ownerId })
        .where(eq(submissionItems.id, item.id)),
    );
  }

  if (submission.kind === "flow") {
    const flowId = crypto.randomUUID();
    const name = submission.flowName?.trim() || "Untitled flow";
    let flowSlug = slugify(name) || "flow";
    const [collision] = await db
      .select({ id: flows.id })
      .from(flows)
      .where(and(eq(flows.productVersionId, submission.productVersionId), eq(flows.slug, flowSlug)))
      .limit(1);
    if (collision) flowSlug = `${flowSlug}-${submission.id.slice(0, 8)}`;

    statements.push(
      db.insert(flows).values({
        id: flowId,
        productVersionId: submission.productVersionId,
        submissionId: submission.id,
        slug: flowSlug,
        name,
        platform: submission.platform,
        capturedAt: items[0]?.capturedAt ?? now,
        rightsStatus: "contributor_attested",
        visibility: "published",
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
        createdById: ownerId,
        updatedById: ownerId,
      }),
    );
    for (const { item, screenId } of linkedScreens) {
      statements.push(
        db.insert(flowScreens).values({
          id: crypto.randomUUID(),
          flowId,
          screenId,
          position: item.position,
          caption: item.description,
          createdAt: now,
          updatedAt: now,
          createdById: ownerId,
          updatedById: ownerId,
        }),
      );
    }
  }

  statements.push(
    db
      .update(products)
      .set({
        visibility: "published",
        publishedAt: sql`coalesce(${products.publishedAt}, (unixepoch() * 1000))`,
        updatedAt: now,
        updatedById: ownerId,
      })
      .where(eq(products.id, submission.productId)),
    db
      .update(productVersions)
      .set({
        visibility: "published",
        publishedAt: sql`coalesce(${productVersions.publishedAt}, (unixepoch() * 1000))`,
        updatedAt: now,
        updatedById: ownerId,
      })
      .where(eq(productVersions.id, submission.productVersionId)),
    db
      .update(submissions)
      .set({ state: "published", publishedAt: now, updatedAt: now, updatedById: ownerId })
      .where(eq(submissions.id, submission.id)),
    db.insert(reviewEvents).values({
      id: crypto.randomUUID(),
      submissionId: submission.id,
      actorId,
      eventType: "publication",
      fromState: submission.state,
      toState: "published",
      reason,
      detail: { reusedScreenCount: linkedScreens.filter((screen) => screen.reused).length },
      correlationId: submission.correlationId,
      createdAt: now,
    }),
  );

  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}
