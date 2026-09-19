import { createFileRoute } from "@tanstack/react-router";

import type {
  LibraryFlow,
  LibraryProduct,
  LibraryScreen,
  ProductVersion,
} from "../features/library/types";
import { ENV } from "../env.server";
import { AuthorizationError, requireLocalUser } from "../server/auth";

type CatalogRow = {
  capturedAt: number;
  contributor: string;
  description: string | null;
  flowId: string;
  flowName: string;
  flowUpdatedAt: number;
  objectKey: string | null;
  position: number;
  productDescription: string | null;
  productName: string;
  productSlug: string;
  screenDescription: string | null;
  screenId: string;
  screenTitle: string;
  sourceUrl: string | null;
  versionCapturedAt: number;
  versionId: string;
  versionLabel: string;
};

const colors = ["#ff5d42", "#6366f1", "#0f9f7f", "#d97706", "#2563eb", "#9333ea"];
const colorFor = (value: string) =>
  colors[[...value].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length]!;
const isoDate = (value: number) => new Date(value).toISOString().slice(0, 10);

function buildCatalog(rows: CatalogRow[]): LibraryProduct[] {
  const productMap = new Map<string, LibraryProduct>();
  const versionMap = new Map<string, ProductVersion>();
  const flowMap = new Map<string, LibraryFlow>();
  for (const row of rows) {
    let product = productMap.get(row.productSlug);
    if (!product) {
      product = {
        accent: colorFor(row.productSlug),
        description: row.productDescription || "Community-contributed product reference.",
        flows: [],
        industry: "Community",
        initials: row.productName
          .split(/\s+/u)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        name: row.productName,
        platforms: ["Web"],
        slug: row.productSlug,
        tags: ["Community", "Web"],
        updatedAt: isoDate(row.flowUpdatedAt),
        versions: [],
      };
      productMap.set(row.productSlug, product);
    }
    if (!versionMap.has(row.versionId)) {
      const version = {
        capturedAt: isoDate(row.versionCapturedAt),
        id: row.versionId,
        label: row.versionLabel,
        releaseNote: "Community capture",
      };
      versionMap.set(row.versionId, version);
      product.versions.push(version);
    }
    let flow = flowMap.get(row.flowId);
    if (!flow) {
      flow = {
        category: "Community",
        contributor: row.contributor,
        description: row.description || `An ordered ${row.productName} interface flow.`,
        featured: false,
        id: row.flowId,
        name: row.flowName,
        platform: "Web",
        productSlug: row.productSlug,
        screens: [],
        updatedAt: isoDate(row.flowUpdatedAt),
        versionId: row.versionId,
      };
      flowMap.set(row.flowId, flow);
      product.flows.push(flow);
    }
    const screen: LibraryScreen = {
      accent: product.accent,
      capturedAt: isoDate(row.capturedAt),
      description: row.screenDescription || "Community-contributed interface screen.",
      id: row.screenId,
      imageKey: row.objectKey ?? undefined,
      preview: "analytics",
      tags: ["Community"],
      title: row.screenTitle,
      viewport: "Web",
      visibleText: [],
    };
    flow.screens[row.position] = screen;
  }
  return [...productMap.values()].map((product) => ({
    ...product,
    flows: product.flows.map((flow) => ({ ...flow, screens: flow.screens.filter(Boolean) })),
    versions: product.versions.sort((left, right) =>
      right.capturedAt.localeCompare(left.capturedAt),
    ),
  }));
}

export const Route = createFileRoute("/api/catalog")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await requireLocalUser();
        } catch (error) {
          if (error instanceof AuthorizationError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          throw error;
        }
        const result = await ENV.DB.prepare(
          `SELECT * FROM (
           SELECT p.slug AS productSlug, p.name AS productName, p.description AS productDescription,
                  pv.id AS versionId, pv.label AS versionLabel, pv.captured_at AS versionCapturedAt,
                  f.id AS flowId, f.name AS flowName, f.description, f.updated_at AS flowUpdatedAt,
                  COALESCE(u.display_name, 'Community contributor') AS contributor,
                  fs.position, s.id AS screenId, s.title AS screenTitle,
                  s.description AS screenDescription, s.captured_at AS capturedAt, s.source_url AS sourceUrl,
                  av.object_key AS objectKey
             FROM products p
             JOIN product_versions pv ON pv.product_id = p.id AND pv.visibility = 'published'
             JOIN flows f ON f.product_version_id = pv.id AND f.visibility = 'published'
             JOIN flow_screens fs ON fs.flow_id = f.id
             JOIN screens s ON s.id = fs.screen_id AND s.visibility = 'published'
             LEFT JOIN asset_variants av ON av.screen_id = s.id AND av.kind = 'thumbnail'
             LEFT JOIN users u ON u.id = f.created_by_id
            WHERE p.visibility = 'published'
           UNION ALL
           SELECT p.slug AS productSlug, p.name AS productName, p.description AS productDescription,
                  pv.id AS versionId, pv.label AS versionLabel, pv.captured_at AS versionCapturedAt,
                  'screen:' || s.id AS flowId, s.title AS flowName,
                  COALESCE(s.description, 'Standalone interface reference') AS description,
                  s.updated_at AS flowUpdatedAt,
                  COALESCE(u.display_name, 'Community contributor') AS contributor,
                  0 AS position, s.id AS screenId, s.title AS screenTitle,
                  s.description AS screenDescription, s.captured_at AS capturedAt, s.source_url AS sourceUrl,
                  av.object_key AS objectKey
             FROM products p
             JOIN product_versions pv ON pv.product_id = p.id AND pv.visibility = 'published'
             JOIN screens s ON s.product_version_id = pv.id
                           AND s.visibility = 'published' AND s.is_standalone = 1
             LEFT JOIN asset_variants av ON av.screen_id = s.id AND av.kind = 'thumbnail'
             LEFT JOIN users u ON u.id = s.created_by_id
            WHERE p.visibility = 'published'
          ) ORDER BY productName, versionCapturedAt DESC, flowName, position`,
        ).all<CatalogRow>();
        return Response.json(
          { products: buildCatalog(result.results) },
          { headers: { "Cache-Control": "private, max-age=30" } },
        );
      },
    },
  },
});
