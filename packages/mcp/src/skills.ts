import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { version } from "../package.json";

export type Scope = "user" | "project";

type CopyState = "missing" | "current" | "older" | "modified" | "newer" | "foreign";
type LinkState = "missing" | "ours" | "foreign";

const COPY_RESULT = {
  missing: "installed",
  older: "updated",
  modified: "updated",
  current: "unchanged",
  newer: "kept",
  foreign: "skipped",
} as const satisfies Record<CopyState, string>;

const LINK_RESULT = {
  missing: "linked",
  ours: "unchanged",
  foreign: "skipped",
} as const satisfies Record<LinkState, string>;

const MARKER = ".screen-commons.json";
const PACKAGE = "screen-commons-mcp";

/** Codex, Cursor and OpenCode read `.agents/skills`; Claude Code reads `.claude/skills`. */
function places(scope: Scope) {
  const base = scope === "user" ? homedir() : process.cwd();
  return { skills: join(base, ".agents", "skills"), claude: join(base, ".claude", "skills") };
}

function nearestPackageSkillsDir(): string {
  for (let dir = dirname(fileURLToPath(import.meta.url)); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "skills"))) {
      return join(dir, "skills");
    }
    if (dirname(dir) === dir) throw new Error("This build of screen-commons has no skills folder");
  }
}

async function shippedSkills() {
  const root = nearestPackageSkillsDir();
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const dir = join(root, name);
      const skill = await readFile(join(dir, "SKILL.md"), "utf8");
      return {
        name,
        dir,
        description: /^description:\s*(.+)$/mu.exec(skill)?.[1]?.trim() ?? "",
        hash: await treeHash(dir),
      };
    }),
  );
}

type Shipped = Awaited<ReturnType<typeof shippedSkills>>[number];

async function treeHash(dir: string): Promise<string> {
  const hash = createHash("sha256");
  const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && !(entry.parentPath === dir && entry.name === MARKER))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split("\\").join("/"))
    .sort();
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(await readFile(join(dir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const semver = (text: string) => /^(\d+)\.(\d+)\.(\d+)/u.exec(text)?.slice(1).map(Number);

function compareVersions(a: number[], b: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return 0;
}

async function installedVersion(dir: string): Promise<number[] | undefined> {
  try {
    const marker = JSON.parse(await readFile(join(dir, MARKER), "utf8")) as {
      package?: unknown;
      version?: unknown;
    };
    return marker.package === PACKAGE && typeof marker.version === "string"
      ? semver(marker.version)
      : undefined;
  } catch {
    return undefined;
  }
}

async function copyState(target: string, skill: Shipped): Promise<CopyState> {
  const stat = await lstat(target).catch(() => null);
  if (!stat) return "missing";
  const installed = stat.isDirectory() ? await installedVersion(target) : undefined;
  if (!installed) return "foreign";
  const order = compareVersions(installed, semver(version)!);
  if (order > 0) return "newer";
  if (order < 0) return "older";
  return (await treeHash(target)) === skill.hash ? "current" : "modified";
}

async function linkState(link: string, target: string): Promise<LinkState> {
  const stat = await lstat(link).catch(() => null);
  if (!stat) return "missing";
  if (!stat.isSymbolicLink()) return "foreign";
  return resolve(dirname(link), await readlink(link)) === target ? "ours" : "foreign";
}

async function swapInFreshCopy(target: string, skill: Shipped) {
  const partial = join(dirname(target), `.${skill.name}.partial`);
  await rm(partial, { recursive: true, force: true });
  try {
    await cp(skill.dir, partial, { recursive: true });
    await writeFile(
      join(partial, MARKER),
      `${JSON.stringify({ package: PACKAGE, version }, null, 2)}\n`,
    );
    await rm(target, { recursive: true, force: true });
    await rename(partial, target);
  } finally {
    await rm(partial, { recursive: true, force: true });
  }
}

export async function installSkills(scope: Scope) {
  const where = places(scope);
  await mkdir(where.skills, { recursive: true });
  await mkdir(where.claude, { recursive: true });
  const skills = [];
  for (const skill of await shippedSkills()) {
    const target = join(where.skills, skill.name);
    const link = join(where.claude, skill.name);
    const result = COPY_RESULT[await copyState(target, skill)];
    if (result === "installed" || result === "updated") await swapInFreshCopy(target, skill);
    const linked = await linkState(link, target);
    // A junction on Windows, which needs no privilege; a relative symlink elsewhere.
    if (linked === "missing") await symlink(relative(where.claude, target), link, "junction");
    skills.push({ name: skill.name, path: target, result, link: LINK_RESULT[linked] });
  }
  return {
    scope,
    version,
    skillsDir: where.skills,
    claudeDir: where.claude,
    changed: skills.some(
      ({ result, link }) => result === "installed" || result === "updated" || link === "linked",
    ),
    skills,
  };
}

export async function listSkills() {
  const scopes = { user: places("user"), project: places("project") };
  const skills = [];
  for (const skill of await shippedSkills()) {
    const state = async (where: { skills: string; claude: string }) => {
      const target = join(where.skills, skill.name);
      return {
        copy: await copyState(target, skill),
        link: await linkState(join(where.claude, skill.name), target),
      };
    };
    skills.push({
      name: skill.name,
      description: skill.description,
      user: await state(scopes.user),
      project: await state(scopes.project),
    });
  }
  return { version, skills };
}
