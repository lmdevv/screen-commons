import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Write a copy of apps/web/wrangler.jsonc into `dir` (absolute paths, optional migrations dir)
 * plus a `.dev.vars` next to it, so test workers never read the developer's own `.dev.vars`.
 */
export function writeTestWranglerConfig(
  dir: string,
  options: { devVars?: Record<string, string>; migrationsDir?: string } = {},
): string {
  const source = readFileSync(join(webDir, "wrangler.jsonc"), "utf8");
  const config = JSON.parse(
    source.replace(/^\s*\/\/.*$/gmu, "").replace(/,(\s*[}\]])/gu, "$1"),
  ) as {
    $schema?: string;
    main: string;
    d1_databases: { migrations_dir: string }[];
  };
  delete config.$schema;
  config.main = resolve(webDir, config.main);
  for (const database of config.d1_databases) {
    database.migrations_dir = options.migrationsDir ?? resolve(webDir, database.migrations_dir);
  }
  const path = join(dir, "wrangler.jsonc");
  writeFileSync(path, JSON.stringify(config, null, 2));
  writeFileSync(
    join(dir, ".dev.vars"),
    Object.entries(options.devVars ?? {})
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
  return path;
}
