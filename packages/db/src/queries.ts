import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";

import type { Database } from "./index";
import {
  assetVariants,
  flows,
  flowScreens,
  products,
  productVersions,
  reviewStageClaims,
  screens,
  submissions,
  tags,
} from "./schema";

export async function listPublishedProducts(
  db: Database,
  options: { afterName?: string; limit?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const conditions = [eq(products.visibility, "published")];
  if (options.afterName) conditions.push(gt(products.name, options.afterName));

  return db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(asc(products.name))
    .limit(limit);
}

export async function getPublishedProductBySlug(db: Database, slug: string) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.slug, slug), eq(products.visibility, "published")),
  });
  if (!product) return null;

  const versions = await db
    .select()
    .from(productVersions)
    .where(
      and(eq(productVersions.productId, product.id), eq(productVersions.visibility, "published")),
    )
    .orderBy(desc(productVersions.capturedAt));
  const versionIds = versions.map((version) => version.id);
  if (versionIds.length === 0) return { product, versions, flows: [], standaloneScreens: [] };

  const [publishedFlows, standaloneScreens] = await Promise.all([
    db
      .select()
      .from(flows)
      .where(and(inArray(flows.productVersionId, versionIds), eq(flows.visibility, "published")))
      .orderBy(desc(flows.capturedAt)),
    db
      .select()
      .from(screens)
      .where(
        and(
          inArray(screens.productVersionId, versionIds),
          eq(screens.visibility, "published"),
          eq(screens.isStandalone, true),
        ),
      )
      .orderBy(desc(screens.capturedAt)),
  ]);

  return { product, versions, flows: publishedFlows, standaloneScreens };
}

export async function getPublishedFlow(db: Database, flowId: string) {
  const flow = await db.query.flows.findFirst({
    where: and(eq(flows.id, flowId), eq(flows.visibility, "published")),
  });
  if (!flow) return null;

  const orderedScreens = await db
    .select({ flowScreen: flowScreens, screen: screens, asset: assetVariants })
    .from(flowScreens)
    .innerJoin(
      screens,
      and(eq(flowScreens.screenId, screens.id), eq(screens.visibility, "published")),
    )
    .leftJoin(
      assetVariants,
      and(eq(assetVariants.screenId, screens.id), eq(assetVariants.kind, "thumbnail")),
    )
    .where(eq(flowScreens.flowId, flow.id))
    .orderBy(asc(flowScreens.position));

  return { flow, screens: orderedScreens };
}

export async function transitionSubmission(
  db: Database,
  input: {
    submissionId: string;
    from: typeof submissions.$inferSelect.state;
    to: typeof submissions.$inferSelect.state;
    actorId: string;
  },
) {
  const [updated] = await db
    .update(submissions)
    .set({ state: input.to, updatedAt: new Date(), updatedById: input.actorId })
    .where(and(eq(submissions.id, input.submissionId), eq(submissions.state, input.from)))
    .returning();
  return updated ?? null;
}

export async function claimReviewStage(db: Database, input: typeof reviewStageClaims.$inferInsert) {
  const [claim] = await db
    .insert(reviewStageClaims)
    .values(input)
    .onConflictDoNothing({ target: reviewStageClaims.idempotencyKey })
    .returning();
  return claim ?? null;
}

export type CatalogSearchRow = {
  entityType: "product" | "flow" | "screen";
  entityId: string;
  title: string;
  description: string | null;
  productId: string;
  productVersionId: string | null;
  rank: number;
};

/** Queries the FTS5 index created and synchronized by the initial migration. */
export async function searchCatalog(
  db: Database,
  query: string,
  options: { limit?: number; entityType?: CatalogSearchRow["entityType"] } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const rows = await db.all<CatalogSearchRow>(sql`
    SELECT entity_type AS entityType, entity_id AS entityId, title, description,
           product_id AS productId, product_version_id AS productVersionId,
           bm25(search_index, 0.0, 0.0, 10.0, 5.0, 3.0, 2.0, 2.0, 1.0, 0.0, 0.0) AS rank
    FROM search_index
    WHERE search_index MATCH ${query}
      AND (${options.entityType ?? null} IS NULL OR entity_type = ${options.entityType ?? null})
    ORDER BY rank
    LIMIT ${limit}
  `);
  return rows;
}

export async function listTags(db: Database) {
  return db.select().from(tags).orderBy(asc(tags.name));
}
