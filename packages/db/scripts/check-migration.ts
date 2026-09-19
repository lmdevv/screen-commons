import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL as NodeUrl } from "node:url";

import { createClient } from "@libsql/client";

const migrationUrl = new NodeUrl(
  "../src/migrations/0000_spicy_matthew_murdock.sql",
  import.meta.url,
);
const migration = await readFile(fileURLToPath(migrationUrl), "utf8");
const migrationStatements = migration
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);
const client = createClient({ url: ":memory:" });

try {
  for (const statement of migrationStatements) await client.execute(statement);
  const requiredObjects = [
    "asset_variants",
    "flows",
    "flow_screens",
    "moderation_results",
    "products",
    "product_versions",
    "review_events",
    "screens",
    "search_index",
    "submissions",
    "submission_items",
    "tags",
    "users",
  ];
  const objects = await client.execute(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name",
  );
  const objectNames = new Set(objects.rows.map((row) => String(row.name)));
  for (const name of requiredObjects) assert.ok(objectNames.has(name), `Missing ${name}`);

  // A single transaction-local fixture validates the generated FTS triggers. It is never used by
  // the application and disappears when this in-memory connection closes.
  const fixtureId = "00000000-0000-4000-8000-000000000001";
  await client.execute({
    sql: "INSERT INTO products (id, slug, name, visibility) VALUES (?, 'migration-check', 'Migration Check', 'published')",
    args: [fixtureId],
  });
  const indexed = await client.execute({
    sql: "SELECT entity_id FROM search_index WHERE search_index MATCH ?",
    args: ["Migration"],
  });
  assert.equal(indexed.rows[0]?.entity_id, fixtureId, "FTS insert trigger did not run");
  await client.execute({ sql: "DELETE FROM products WHERE id = ?", args: [fixtureId] });
  const removed = await client.execute({
    sql: "SELECT count(*) AS count FROM search_index WHERE entity_id = ?",
    args: [fixtureId],
  });
  assert.equal(Number(removed.rows[0]?.count), 0, "FTS delete trigger did not run");
  process.stdout.write(
    `Verified ${migrationStatements.length} migration statements, required schema objects, and FTS triggers.\n`,
  );
} finally {
  client.close();
}
