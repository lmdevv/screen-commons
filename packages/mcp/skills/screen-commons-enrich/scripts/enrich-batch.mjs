#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const USAGE = `Usage: node enrich-batch.mjs <batch.json> [--apply]

Reads each item's current values, prints what would change, and writes nothing. --apply
reads again, writes only those changes, one item every 300 ms, and checks what the server
saved. Prints a JSON report. A rerun skips what's already saved, so it's safe after a stop.

batch.json holds up to 25 items:
  {"items": [
    {"screen": "<id>", "title": "Create playlist menu", "text": "Playlist Blend Folder"},
    {"flow": "<id>", "type": "creating", "labels": ["Open Your Library", null, "Name it"]}
  ]}
A screen takes title and text. A flow takes type and labels, one per step in order, where
null keeps that step's label. Leave a field out to keep it.

Exits 0 when every item is unchanged or saved, 1 when one failed or the run stopped, 2 on a
bad batch. Set SCREEN_COMMONS_CLI to the command that runs the CLI when it isn't on PATH.
`;

const MAX_ITEMS = 25;
const FIELDS = { screen: ["title", "text"], flow: ["type", "labels"] };
const SAFE_ID = /^\w[\w-]*$/u;
const EXIT = { refused: 3, unreachable: 5 };
const stops = ({ code, error }) =>
  code === EXIT.unreachable || (code === EXIT.refused && !error.startsWith("forbidden:"));

class BadBatch extends Error {}

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
    if (result.error) return { code: EXIT.unreachable, error: result.error.message };
    if (result.code === 0) return { value: JSON.parse(result.stdout) };
    return {
      code: result.code,
      error: result.stderr.trim().split("\n")[0] || `exit ${result.code}`,
    };
  }
  return {
    code: EXIT.unreachable,
    error: "Neither screen-commons nor npx is on PATH. Set SCREEN_COMMONS_CLI",
  };
}

const oneLine = (text) => text.replace(/\s+/gu, " ").trim();

function parseBatch(path) {
  let batch;
  try {
    batch = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new BadBatch(`Can't read ${resolve(path)} as JSON: ${error.message}`);
  }
  const items = batch?.items;
  if (!Array.isArray(items) || items.length === 0) throw new BadBatch('batch.json needs "items"');
  if (items.length > MAX_ITEMS) {
    throw new BadBatch(`${items.length} items; split them into batches of ${MAX_ITEMS} at most`);
  }
  return items.map((item, index) => {
    const kind = ["screen", "flow"].filter((key) => typeof item?.[key] === "string");
    if (kind.length !== 1) throw new BadBatch(`items[${index}] needs "screen" or "flow", not both`);
    const extra = Object.keys(item).filter(
      (key) => key !== kind[0] && !FIELDS[kind[0]].includes(key),
    );
    if (extra.length > 0) {
      throw new BadBatch(`items[${index}] can't set ${extra.join(", ")} on a ${kind[0]}`);
    }
    if (!SAFE_ID.test(item[kind[0]])) throw new BadBatch(`items[${index}] has a bad id`);
    for (const field of ["title", "text", "type"]) {
      if (item[field] !== undefined && typeof item[field] !== "string") {
        throw new BadBatch(`items[${index}].${field} must be text`);
      }
    }
    const label = (value) => value === null || typeof value === "string";
    if (item.labels !== undefined && !(Array.isArray(item.labels) && item.labels.every(label))) {
      throw new BadBatch(`items[${index}].labels must be a list of text or null`);
    }
    return { kind: kind[0], id: item[kind[0]], want: item };
  });
}

const stepInput = (screenId, label) => (label === null ? { screenId } : { screenId, label });

function changes({ kind, want }, current) {
  const found = {};
  const differ = (field, from, to) => {
    if (to !== undefined && JSON.stringify(from) !== JSON.stringify(to))
      found[field] = { from, to };
  };
  if (kind === "screen") {
    differ("title", current.title, want.title === undefined ? undefined : oneLine(want.title));
    differ("text", current.text, want.text === undefined ? undefined : oneLine(want.text));
    return found;
  }
  differ("type", current.type, want.type);
  if (want.labels) {
    if (want.labels.length !== current.steps.length) {
      throw new BadBatch(
        `flow ${current.id} has ${current.steps.length} steps, but labels has ${want.labels.length}`,
      );
    }
    const steps = (labels) =>
      current.steps.map((step, index) => stepInput(step.screen.id, labels[index]));
    const now = current.steps.map((step) => step.label);
    const next = want.labels.map((label, index) => (label === null ? now[index] : oneLine(label)));
    if (JSON.stringify(now) !== JSON.stringify(next))
      found.steps = { from: steps(now), to: steps(next) };
  }
  return found;
}

const patchOf = (found) =>
  Object.fromEntries(Object.entries(found).map(([field, { to }]) => [field, to]));

function saved(kind, found, value) {
  const now =
    kind === "screen"
      ? value
      : { ...value, steps: value.steps.map((step) => stepInput(step.screen.id, step.label)) };
  return Object.entries(found).every(
    ([field, { to }]) => JSON.stringify(now[field]) === JSON.stringify(to),
  );
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { apply: { type: "boolean" }, help: { type: "boolean", short: "h" } },
    allowPositionals: true,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (positionals.length !== 1) throw new BadBatch(USAGE);
  const items = parseBatch(positionals[0]);
  const report = [];
  let stopped = null;
  let wrote = false;
  for (const item of items) {
    const entry = { kind: item.kind, id: item.id };
    report.push(entry);
    if (stopped) {
      entry.result = "not-run";
      continue;
    }
    const read = await cli([`${item.kind}s`, "get", item.id]);
    if (read.error) {
      Object.assign(entry, { result: "failed", error: read.error });
      if (stops(read)) stopped = `${item.id}: ${read.error}`;
      continue;
    }
    try {
      entry.changes = changes(item, read.value);
    } catch (error) {
      if (!(error instanceof BadBatch)) throw error;
      Object.assign(entry, { result: "failed", error: error.message });
      continue;
    }
    if (Object.keys(entry.changes).length === 0) {
      entry.result = "unchanged";
      continue;
    }
    if (!values.apply) {
      entry.result = "would-change";
      continue;
    }
    if (wrote) await sleep(300);
    wrote = true;
    const write = await cli([
      `${item.kind}s`,
      "update",
      item.id,
      "--patch",
      JSON.stringify(patchOf(entry.changes)),
    ]);
    if (write.error) {
      Object.assign(entry, { result: "failed", error: write.error });
      if (stops(write)) stopped = `${item.id}: ${write.error}`;
      continue;
    }
    entry.result = saved(item.kind, entry.changes, write.value) ? "saved" : "saved-differently";
    if (entry.result === "saved-differently") entry.now = write.value;
  }
  const ok = report.every((entry) => ["unchanged", "would-change", "saved"].includes(entry.result));
  process.stdout.write(
    `${JSON.stringify({ ok, applied: values.apply === true, stopped, items: report }, null, 2)}\n`,
  );
  if (stopped)
    process.stderr.write(`Stopped at ${stopped}. Run the same command again to continue\n`);
  return ok ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  if (!(error instanceof BadBatch) && error?.code !== "ERR_PARSE_ARGS_UNKNOWN_OPTION") throw error;
  process.stderr.write(`${error.message.trimEnd()}\n`);
  process.exitCode = 2;
}
