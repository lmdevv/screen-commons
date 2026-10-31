#!/usr/bin/env node
/**
 * Writes the package npm receives to `.publish/`, from the already built `dist/`. The workspace
 * package stays private, so nothing in development can publish it by accident; production runs
 * `npm publish .publish`, which only this script makes possible.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Both can be overridden, for checking the package without touching this checkout's build.
const dist = resolve(process.argv[2] ?? join(packageDir, "dist"));
const out = resolve(process.argv[3] ?? join(packageDir, ".publish"));
const source = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));

if (!existsSync(join(dist, "index.js"))) {
  throw new Error("Build first: pnpm --filter @screen-commons/mcp build");
}
const server = readFileSync(join(packageDir, "src/server.ts"), "utf8");
if (!server.includes(`version: "${source.version}"`)) {
  throw new Error(`SERVER_INFO in src/server.ts doesn't say version ${source.version}`);
}

// What pnpm's `catalog:` and ranges resolved to here, since npm can't read either protocol.
const dependencies = Object.fromEntries(
  Object.keys(source.dependencies).map((name) => {
    const manifest = join(packageDir, "node_modules", name, "package.json");
    return [name, `^${JSON.parse(readFileSync(manifest, "utf8")).version}`];
  }),
);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, join(out, "dist"), {
  recursive: true,
  filter: (path) => !path.endsWith(".map"),
});
cpSync(join(packageDir, "README.md"), join(out, "README.md"));
cpSync(resolve(packageDir, "../../LICENSE"), join(out, "LICENSE"));
writeFileSync(
  join(out, "package.json"),
  `${JSON.stringify(
    {
      name: "screen-commons-mcp",
      version: source.version,
      description: source.description,
      license: source.license,
      repository: {
        type: "git",
        url: "git+https://github.com/lmdevv/screen-commons.git",
        directory: "packages/mcp",
      },
      type: "module",
      bin: { "screen-commons-mcp": "dist/index.js" },
      files: ["dist"],
      engines: { node: ">=20.9" },
      dependencies,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`${out}\n`);
