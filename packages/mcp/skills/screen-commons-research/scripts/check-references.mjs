#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const USAGE = `Usage: node check-references.mjs <folder>... [--answer <file>]

Checks every screen and flow id in each bundle's REFERENCES.md against the catalog, and each
image against bundle.json. A folder is a bundle from "screen-commons flows bundle" or
"screens bundle", or a folder of them. --answer also fails any id the answer cites that no
checked bundle holds. Prints a JSON report. Exits 0 when all pass, 1 on a problem, 2 when it
can't check.

The catalog is read with the screen-commons CLI, at the instance and with the key it is set up
for, which must be the bundles' instance. Set SCREEN_COMMONS_CLI to the command that runs the
CLI when it isn't on PATH, such as "node /path/to/cli.js".
`;

const LINK = /(!?)\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/gu;
const URL_IN_TEXT = /https?:\/\/[^\s<>()[\]"'`]+/gu;
const CATALOG_PATH = /^\/(screens|flows)\/([^/?#]+)$/u;
const SERVER_ID_WITH_A_DIGIT = "(?=[a-z]*\\d)[0-9a-hjkmnp-tv-z]{26}";
const CONTRIBUTOR_UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const BARE_ID = new RegExp(
  `(?<![\\w/.-])(?:${SERVER_ID_WITH_A_DIGIT}|${CONTRIBUTOR_UUID})(?![\\w/-]|\\.\\w)`,
  "gu",
);
const CLI_NOT_FOUND_EXIT = 4;
const SAFE_ID = /^\w[\w-]*$/u;

class CannotCheck extends Error {}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function catalogRef(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const match = CATALOG_PATH.exec(url.pathname);
  return match ? { kind: match[1].slice(0, -1), id: match[2], origin: url.origin } : null;
}

function findBundles(paths) {
  return paths.flatMap((path) => {
    const dir = resolve(path);
    if (existsSync(join(dir, "bundle.json"))) return [dir];
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      throw new CannotCheck(`${dir} is not a folder`);
    }
    const found = entries
      .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "bundle.json")))
      .map((entry) => join(dir, entry.name))
      .sort();
    if (found.length === 0) {
      throw new CannotCheck(
        `${dir} holds no bundle.json. Write bundles with screen-commons flows bundle`,
      );
    }
    return found;
  });
}

const CLI_CANDIDATES = process.env.SCREEN_COMMONS_CLI?.trim()
  ? [process.env.SCREEN_COMMONS_CLI.trim().split(/\s+/u)]
  : [["screen-commons"], ["npx", "-y", "-p", "screen-commons-mcp", "screen-commons"]];

function spawnCli([command, ...base], args) {
  return new Promise((done) => {
    const child = spawn(command, [...base, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", (error) => done({ error }));
    child.once("close", (code) => done({ code, stdout, stderr }));
  });
}

async function cli(args) {
  while (CLI_CANDIDATES.length > 0) {
    const result = await spawnCli(CLI_CANDIDATES[0], args);
    if (result.error?.code === "ENOENT") {
      CLI_CANDIDATES.shift();
      continue;
    }
    if (result.error)
      throw new CannotCheck(`Can't run ${CLI_CANDIDATES[0].join(" ")}: ${result.error.message}`);
    return result;
  }
  throw new CannotCheck("Neither screen-commons nor npx is on PATH. Set SCREEN_COMMONS_CLI");
}

const firstLine = ({ code, stderr }) =>
  stderr.trim().split("\n")[0] || `screen-commons exited ${code}`;

let configured;
async function cliOrigin() {
  if (!configured) {
    const result = await cli(["whoami"]);
    if (result.code !== 0) throw new CannotCheck(firstLine(result));
    configured = new URL(JSON.parse(result.stdout).url).origin;
  }
  return configured;
}

async function lookUp(kind, id) {
  const result = await cli([`${kind}s`, "get", id]);
  if (result.code === 0) return JSON.parse(result.stdout);
  if (result.code === CLI_NOT_FOUND_EXIT) return null;
  throw new CannotCheck(firstLine(result));
}

function readBundle(dir, problems) {
  const problem = (message, id) =>
    problems.push({ bundle: dir, ...(id ? { id } : {}), problem: message });
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8"));
  } catch {
    problem("bundle.json is not JSON");
    return null;
  }
  const origin = URL.canParse(bundle?.instance) ? new URL(bundle.instance).origin : null;
  if (bundle?.version !== 1 || !origin || !Array.isArray(bundle.steps)) {
    problem("bundle.json is not a bundle the screen-commons CLI wrote");
    return null;
  }
  let markdown;
  try {
    markdown = readFileSync(join(dir, "REFERENCES.md"), "utf8");
  } catch {
    problem("REFERENCES.md is missing");
    return null;
  }
  const steps = new Map(bundle.steps.map((step) => [step.localPath, step]));
  const refs = { flows: new Set(), screens: new Set() };
  for (const [, image, , href] of markdown.matchAll(LINK)) {
    if (image) {
      const path = resolve(dir, href);
      const inside = relative(dir, path);
      if (inside.startsWith("..") || isAbsolute(inside)) {
        problem(`image ${href} is outside the bundle`);
      } else if (!existsSync(path)) {
        problem(`image ${href} is missing`);
      } else if (!steps.has(href)) {
        problem(`image ${href} is not in bundle.json`);
      } else if (sha256(readFileSync(path)) !== steps.get(href).sha256) {
        problem(`image ${href} changed since the bundle was written`, steps.get(href).id);
      }
      continue;
    }
    const ref = catalogRef(href);
    if (!ref) continue;
    if (ref.origin !== origin) {
      problem(`links to ${ref.origin}, not to the bundle's catalog ${origin}`, ref.id);
      continue;
    }
    refs[`${ref.kind}s`].add(ref.id);
  }
  if (refs.flows.size + refs.screens.size === 0)
    problem("REFERENCES.md links to no screen or flow");
  return { origin, refs };
}

async function checkBundle(dir, problems, verified) {
  const read = readBundle(dir, problems);
  if (!read) return { path: dir, flows: [], screens: [] };
  const { origin, refs } = read;
  const reads = await cliOrigin();
  if (origin !== reads) {
    throw new CannotCheck(
      `${dir} comes from ${origin}, but screen-commons reads ${reads}. Point it at ${origin} with SCREEN_COMMONS_URL or screen-commons login --url ${origin}`,
    );
  }
  const problem = (message, id) => problems.push({ bundle: dir, id, problem: message });
  const steps = new Map();
  for (const id of [...refs.flows, ...refs.screens].filter((id) => !SAFE_ID.test(id))) {
    problem("is not a catalog id", id);
    refs.flows.delete(id);
    refs.screens.delete(id);
  }
  for (const id of refs.flows) {
    const flow = await lookUp("flow", id);
    if (!flow) {
      problem("flow is not in the catalog", id);
      continue;
    }
    verified.add(id);
    for (const step of flow.steps) steps.set(step.screen.id, id);
  }
  for (const id of refs.screens) {
    if (steps.has(id)) {
      verified.add(id);
    } else if (refs.flows.size > 0) {
      problem(`screen is not a step of flow ${[...refs.flows].join(", ")}`, id);
    } else if (await lookUp("screen", id)) {
      verified.add(id);
    } else {
      problem("screen is not in the catalog", id);
    }
  }
  return { path: dir, flows: [...refs.flows], screens: [...refs.screens] };
}

function checkAnswer(file, problems, verified) {
  let text;
  try {
    text = readFileSync(resolve(file), "utf8");
  } catch {
    throw new CannotCheck(`Can't read the answer ${resolve(file)}`);
  }
  const cited = new Set(text.match(BARE_ID) ?? []);
  for (const [href] of text.matchAll(URL_IN_TEXT)) {
    const ref = catalogRef(href.replace(/[.,;:!?]+$/u, ""));
    if (ref) cited.add(ref.id);
  }
  for (const id of cited) {
    if (!verified.has(id)) {
      problems.push({
        answer: resolve(file),
        id,
        problem: "cited, but no checked bundle holds it",
      });
    }
  }
  return { path: resolve(file), cited: [...cited] };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      options: { answer: { type: "string" }, help: { type: "boolean", short: "h" } },
      allowPositionals: true,
    });
  } catch (error) {
    throw new CannotCheck(`${error.message.split("\n")[0]}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (positionals.length === 0 && !values.answer) throw new CannotCheck(USAGE);
  const problems = [];
  const verified = new Set();
  const bundles = [];
  for (const dir of findBundles(positionals))
    bundles.push(await checkBundle(dir, problems, verified));
  const answer = values.answer ? checkAnswer(values.answer, problems, verified) : null;
  const ok = problems.length === 0;
  process.stdout.write(`${JSON.stringify({ ok, bundles, answer, problems }, null, 2)}\n`);
  if (!ok)
    process.stderr.write(
      `${problems.length} problem${problems.length === 1 ? "" : "s"}; see "problems"\n`,
    );
  return ok ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  if (!(error instanceof CannotCheck)) throw error;
  process.stderr.write(`${error.message.trimEnd()}\n`);
  process.exitCode = 2;
}
