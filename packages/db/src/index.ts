import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export * from "./schema";
export { schema };

/** Minimal structural type of a D1 binding, so this package doesn't need workers-types. */
export type D1Like = Parameters<typeof drizzle>[0];

export function createDb(d1: D1Like) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;

/** Full-text tables maintained by triggers (see migrations/0001_fts.sql). */
export const FTS_TABLES = {
  screen: "screen_fts",
  app: "app_fts",
  flow: "flow_fts",
} as const;

/**
 * `column IN (SELECT value FROM json_each(?))` — one bound parameter regardless of list length
 * (D1 caps bound parameters per statement at 100).
 */
export function inJsonArray(column: SQLWrapper, values: readonly string[]): SQL {
  return sql`${column} IN (SELECT value FROM json_each(${JSON.stringify(values)}))`;
}

/** `EXISTS (SELECT 1 FROM json_each(column) WHERE value = ?)` for JSON array text columns. */
export function jsonArrayContains(column: SQLWrapper, value: string): SQL {
  return sql`EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ${value})`;
}

/**
 * Turn free text into a safe FTS5 MATCH expression with prefix matching on every term:
 * `pricing tab` → `"pricing"* "tab"*` (implicit AND). Returns null when nothing is searchable.
 */
export function ftsQuery(text: string): string | null {
  const terms = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 12);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"*`).join(" ");
}
