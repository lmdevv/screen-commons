#!/usr/bin/env node
/**
 * Verification harness for Screen Commons. Starts a disposable `vite dev` (workerd + local D1/R2)
 * with its own port, state and secrets, seeds it offline through the real upload pipeline, and
 * drives it with playwright-core. See ../SKILL.md.
 *
 *   control.mjs launch [--run <id>]            start and seed; prints the run as JSON
 *   control.mjs doctor                         read-only health check; exit 1 when unhealthy
 *   control.mjs drive <journey|path.mjs> [--timeout <seconds>]   run a journey (default limit 300 s);
 *                                              evidence goes to test-results/verify/
 *   control.mjs sql "<SELECT …>" [params…]     read-only query against the run's local D1
 *   control.mjs r2                             list the run's local R2 keys
 *   control.mjs mcp <remote|local> tools       list a server's tools with a real MCP client
 *   control.mjs mcp <remote|local> call <tool> ['<json args>']   call one tool the same way
 *   control.mjs mcp-config                     client config for the run's two MCP servers
 *   control.mjs list                           every run on this machine and whether it is alive
 *   control.mjs teardown                       stop the server, delete state, keep the evidence
 *
 * Commands other than launch and list take --run <id>, or $SC_VERIFY_RUN, or the only run there is.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(SKILL_DIR, "../../..");
const WEB = join(ROOT, "apps/web");
const RUNS = join(tmpdir(), "screen-commons-verify");
const PORTS = join(RUNS, ".ports");
const EVIDENCE = join(ROOT, "test-results/verify");
const FIRST_PORT = 5200; // the dev server holds 5173, the vitest server 5179-5198
const ADMIN = {
  name: "Verify Admin",
  // The defaults of apps/web/e2e, so `pnpm test:e2e` runs against this instance unchanged.
  email: "admin@screencommons.dev",
  password: "screencommons-admin-2026",
};
const SEED_SITES = 9;
const SEED_PATHS = ["/", "/pricing", "/login", "/signup"];

const { chromium } = createRequire(join(WEB, "package.json"))("playwright-core");

const MCP_PACKAGE = join(ROOT, "packages/mcp");
const mcpRequire = createRequire(join(MCP_PACKAGE, "package.json"));
const { Client } = mcpRequire("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = mcpRequire("@modelcontextprotocol/sdk/client/stdio.js");
const { StreamableHTTPClientTransport } = mcpRequire(
  "@modelcontextprotocol/sdk/client/streamableHttp.js",
);

const log = (message) => process.stderr.write(`${message}\n`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const output = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

function chromePath() {
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH points at nothing: ${process.env.CHROME_PATH}`);
  }
  const candidates = ["/run/current-system/sw/bin/chromium"];
  for (const name of ["chromium", "google-chrome", "chrome"]) {
    try {
      candidates.push(execFileSync("which", [name], { encoding: "utf8", stdio: "pipe" }).trim());
    } catch {
      // not installed under this name
    }
  }
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error("No Chromium found; set CHROME_PATH");
  return found;
}

const launchBrowser = () => chromium.launch({ executablePath: chromePath() });

// -------------------------------------------------------------------------------------------------
// runs
// -------------------------------------------------------------------------------------------------

const runDir = (id) => join(RUNS, id);
const readRun = (id) => JSON.parse(readFileSync(join(runDir(id), "run.json"), "utf8"));
const writeRun = (run) =>
  writeFileSync(join(runDir(run.id), "run.json"), JSON.stringify(run, null, 2));
const runIds = () =>
  existsSync(RUNS)
    ? readdirSync(RUNS).filter((id) => existsSync(join(runDir(id), "run.json")))
    : [];

/** Ids become path segments, so one can't be allowed to climb out of the scratch directory. */
function assertRunId(id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(id)) {
    throw new Error(
      `Bad run id "${id}": start with a letter or digit, then letters, digits, ".", "_" or "-", up to 64 characters`,
    );
  }
}

function resolveRun(flags) {
  const wanted = flags.run ?? process.env.SC_VERIFY_RUN;
  if (wanted !== undefined) {
    assertRunId(wanted);
    if (!existsSync(join(runDir(wanted), "run.json")))
      throw new Error(`No run "${wanted}" in ${RUNS}`);
    return readRun(wanted);
  }
  const ids = runIds();
  if (ids.length === 1) return readRun(ids[0]);
  throw new Error(
    ids.length
      ? `Several runs exist (${ids.join(", ")}); pass --run <id>`
      : "No run exists; start one with `control.mjs launch`",
  );
}

function requireHealthy(run) {
  if (!run.ready || !isAlive(run)) throw new Error(`Run ${run.id} is not healthy; run doctor`);
  return run;
}

function processStart(pid) {
  try {
    return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  } catch {
    return "";
  }
}

/** The process we spawned, not whatever has since reused its pid. */
const isAlive = (run) => Boolean(run.pid) && processStart(run.pid) === run.processStart;

function listenerPids(port) {
  try {
    const out = execFileSync("ss", ["-ltnpH", `sport = :${port}`], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return [...out.matchAll(/pid=(\d+)/gu)].map((match) => Number(match[1]));
  } catch {
    try {
      const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
        encoding: "utf8",
        stdio: "pipe",
      });
      return out.split("\n").filter(Boolean).map(Number);
    } catch {
      return [];
    }
  }
}

function processGroup(pid) {
  try {
    return Number(
      execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], {
        encoding: "utf8",
        stdio: "pipe",
      }).trim(),
    );
  } catch {
    return 0;
  }
}

/** Claims the first free port for this run; the claim file keeps concurrent launches apart. */
async function claimPort(id) {
  mkdirSync(PORTS, { recursive: true });
  for (let port = FIRST_PORT; port < FIRST_PORT + 40; port += 1) {
    const claim = join(PORTS, String(port));
    if (existsSync(claim) && !existsSync(runDir(readFileSync(claim, "utf8")))) rmSync(claim);
    try {
      writeFileSync(claim, id, { flag: "wx" });
    } catch {
      continue; // another live run holds it
    }
    const free = await new Promise((done) => {
      const server = createServer()
        .once("error", () => done(false))
        .once("listening", () => server.close(() => done(true)))
        .listen(port, "localhost");
    });
    if (free) return port;
    rmSync(claim);
  }
  throw new Error(`No free port in ${FIRST_PORT}-${FIRST_PORT + 39}`);
}

function gitInfo() {
  const git = (...args) =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: "pipe" }).trim();
  return {
    head: git("rev-parse", "--short", "HEAD"),
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    dirty: git("status", "--porcelain").length > 0,
  };
}

function safeGitInfo() {
  try {
    return gitInfo();
  } catch (error) {
    return { error: String(error.message ?? error) };
  }
}

const viteCacheDir = (id) => join(WEB, `node_modules/.vite-verify-${id}`);
// Inside the package, so its npm dependencies resolve; not dist/, which a running agent may be using.
const mcpBuildDir = (id) => join(MCP_PACKAGE, `node_modules/.verify-${id}`);

// -------------------------------------------------------------------------------------------------
// launch
// -------------------------------------------------------------------------------------------------

async function waitForServer(run, url) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (!isAlive(run)) throw new Error(`Dev server exited early:\n${logTail(run)}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`Dev server did not answer ${url}:\n${logTail(run)}`);
}

function logTail(run, lines = 40) {
  const path = join(runDir(run.id), "server.log");
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").slice(-lines).join("\n") : "";
}

async function signUpAdmin(base) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify(ADMIN),
  });
  if (!response.ok) throw new Error(`Admin sign-up: ${response.status} ${await response.text()}`);
  const { user } = await response.json();
  if (user.role !== "admin") throw new Error(`First account got role ${user.role}, expected admin`);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const key = await fetch(`${base}/api/v1/keys`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, cookie },
    body: JSON.stringify({ name: "verify-seed" }),
  });
  if (!key.ok) throw new Error(`Seed API key: ${key.status} ${await key.text()}`);
  return (await key.json()).token;
}

/** Synthetic captures in the format `pnpm seed capture` caches, so no public site is contacted. */
async function writeSeedCache(browser, cache) {
  const { SITES } = await import(pathToFileURL(join(ROOT, "scripts/seed/sites.ts")).href);
  const sites = SITES.filter((site) =>
    ["/", "/pricing"].every((path) => site.paths.includes(path)),
  ).slice(0, SEED_SITES);
  if (sites.length < SEED_SITES)
    throw new Error(`Only ${sites.length} seed sites have / and /pricing`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  for (const [siteIndex, site] of sites.entries()) {
    const dir = join(cache, site.slug);
    mkdirSync(dir, { recursive: true });
    const pages = [];
    for (const [pathIndex, path] of SEED_PATHS.filter((p) => site.paths.includes(p)).entries()) {
      const key = path === "/" ? "home" : path.slice(1);
      const text = `${site.name} ${key} page. ${path === "/pricing" ? "Plans billed yearly." : site.tagline}`;
      await page.setContent(`<body style="margin:0;font:18px system-ui;background:hsl(${siteIndex * 40} 40% 96%)">
        <header style="height:72px;display:flex;align-items:center;padding:0 48px;background:hsl(${siteIndex * 40} 60% 30%);color:#fff"><b>${site.name}</b></header>
        <main style="display:grid;place-items:center;height:828px"><div style="width:560px;padding:48px;background:#fff;border-radius:16px">
        <h1 style="margin:0 0 16px">${key}</h1><p>${text}</p><div style="height:48px;border-radius:10px;background:hsl(${pathIndex * 80} 70% 45%)"></div></div></main></body>`);
      const file = `${key}.png`;
      const png = await page.screenshot({ type: "png" });
      writeFileSync(join(dir, file), png);
      const url = new URL(path, site.websiteUrl).href;
      pages.push({
        path,
        requestedUrl: url,
        url,
        title: `${site.name} ${key}`,
        patterns: [],
        file,
        thumb: file,
        width: 1440,
        height: 900,
        bytes: png.byteLength,
        dominantColor: "#ffffff",
        text,
        status: 200,
        capturedAt: new Date().toISOString(),
        settle: null,
      });
    }
    const { paths: _paths, flows, ...app } = site;
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({
        app,
        flows,
        logo: null,
        pages,
        failures: [],
        updatedAt: new Date().toISOString(),
      }),
    );
  }
  await context.close();
  const seeded = (site) => SEED_PATHS.filter((path) => site.paths.includes(path));
  return {
    slugs: sites.map((site) => site.slug),
    expected: {
      apps: sites.length,
      screens: sites.reduce((total, site) => total + seeded(site).length, 0),
      pricing: sites.length,
      // `pnpm seed upload` skips a flow with fewer than two captured steps.
      flows: sites.reduce(
        (total, site) =>
          total +
          site.flows.filter((flow) => flow.paths.filter((p) => seeded(site).includes(p)).length > 1)
            .length,
        0,
      ),
    },
  };
}

async function seed(run, browser) {
  const cache = join(runDir(run.id), "seed-cache");
  const { slugs, expected } = await writeSeedCache(browser, cache);
  execFileSync(
    "pnpm",
    [
      "--filter",
      "@screen-commons/capture",
      "seed",
      "upload",
      "--url",
      run.base,
      "--key",
      run.adminKey,
      "--only",
      slugs.join(","),
    ],
    {
      cwd: ROOT,
      env: { ...process.env, SEED_CACHE: cache },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const get = async (path) =>
    (
      await fetch(`${run.base}/api/v1/${path}`, {
        headers: { authorization: `Bearer ${run.adminKey}` },
      })
    ).json();
  const counts = {
    apps: (await get("apps?platform=web&limit=100")).items.length,
    screens: (await get("screens?platform=web&limit=100")).items.length,
    pricing: (await get("screens?platform=web&pattern=pricing&limit=100")).items.length,
    flows: (await get("flows?platform=web&limit=100")).items.length,
  };
  if (JSON.stringify(counts) !== JSON.stringify(expected)) {
    throw new Error(
      `Seed incomplete: expected ${JSON.stringify(expected)}, got ${JSON.stringify(counts)}`,
    );
  }
  return counts;
}

/** Loads every page group once: Vite optimizes dependencies on first sight and then reloads the page. */
async function warmUp(run, browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${run.base}/sign-in?redirect=%2Fbrowse%2Fweb`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/browse\/web/u);
  for (const path of [
    "/browse/web?tab=screens",
    "/search?q=pricing",
    "/saved",
    "/contribute",
    "/review",
    "/settings",
    "/docs",
    "/",
  ]) {
    await page.goto(`${run.base}${path}`, { waitUntil: "networkidle" });
  }
  await page.goto(`${run.base}/browse/web?tab=screens`, { waitUntil: "networkidle" });
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Search" }).waitFor();
  await page.waitForLoadState("networkidle");
  await context.close();
}

async function commandLaunch(flags) {
  const id = flags.run ?? `v${Date.now().toString(36)}`;
  assertRunId(id);
  if (existsSync(runDir(id)))
    throw new Error(`Run "${id}" already exists; tear it down or pick another id`);
  // Checked before anything exists, so a missing tool leaves nothing behind.
  const revision = gitInfo();
  chromePath();
  const dir = runDir(id);
  mkdirSync(dir, { recursive: true });
  // On disk from here on, so `list` and `teardown` can always see this run.
  const run = { id, dir, admin: ADMIN, ...revision, startedAt: new Date().toISOString() };
  writeRun(run);

  let browser;
  try {
    const port = await claimPort(id);
    const base = `http://localhost:${port}`; // not 127.0.0.1: auth cookies are bound to localhost
    const state = join(dir, "state");
    const configDir = join(dir, "config");
    mkdirSync(state, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    const tmp = join(dir, "tmp");
    mkdirSync(tmp, { recursive: true });
    const { writeTestWranglerConfig } = await import(
      pathToFileURL(join(WEB, "tests/wrangler-config.ts")).href
    );
    const config = writeTestWranglerConfig(configDir, {
      devVars: { APP_URL: base, BETTER_AUTH_SECRET: randomBytes(32).toString("base64url") },
    });
    const env = {
      ...process.env,
      CI: "1",
      WRANGLER_SEND_METRICS: "false",
      TMPDIR: tmp, // so miniflare's scratch goes with the run
      PORT: String(port),
      SCREEN_COMMONS_PERSIST_DIR: state,
      SCREEN_COMMONS_WRANGLER_CONFIG: config,
      SCREEN_COMMONS_VITE_CACHE_DIR: viteCacheDir(id),
    };
    Object.assign(run, { base, port, state, config });
    writeRun(run);

    log(`[${id}] applying migrations to an empty D1`);
    execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "DB",
        "--local",
        "--config",
        config,
        "--persist-to",
        state,
      ],
      { cwd: WEB, env, stdio: "pipe" },
    );

    log(`[${id}] starting vite dev on ${base}`);
    // One at a time: workerd's inspector picks its port at start, and simultaneous starts collide.
    await withLock(join(RUNS, ".server-start.lock"), async () => {
      const logFd = openSync(join(dir, "server.log"), "a");
      // Node itself, not `pnpm exec`: pnpm moves its child to another process group, out of reach of teardown.
      const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "dev"], {
        cwd: WEB,
        env,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
      child.unref();
      run.pid = child.pid;
      run.processStart = processStart(child.pid);
      writeRun(run);
      await waitForServer(run, `${base}/api/v1/taxonomy`);
    });

    log(`[${id}] creating the admin and seeding through /api/v1/captures`);
    run.adminKey = await signUpAdmin(base);
    writeRun(run);
    browser = await launchBrowser();
    run.seeded = await seed(run, browser);

    log(`[${id}] warming up pages`);
    await warmUp(run, browser);
    run.ready = true;
    writeRun(run);
    await browser.close();
    output({ ...run, adminKey: undefined });
    log(`[${id}] ready at ${base}. export SC_VERIFY_RUN=${id}`);
  } catch (error) {
    await browser?.close().catch(() => undefined);
    log(`[${id}] launch failed; tearing down`);
    await teardown(run);
    throw error;
  }
}

// -------------------------------------------------------------------------------------------------
// doctor
// -------------------------------------------------------------------------------------------------

async function commandDoctor(flags) {
  const run = resolveRun(flags);
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

  check("launch finished", run.ready, run.ready ? run.startedAt : "launch never reached ready");
  const alive = isAlive(run);
  check("server process is ours", alive, `pid ${run.pid}`);
  const listeners = listenerPids(run.port);
  check(
    "port owned by this run",
    listeners.length > 0 && listeners.every((pid) => processGroup(pid) === run.pid),
    `port ${run.port}, listeners ${listeners.join(",") || "none"}`,
  );
  check(
    "state is disposable",
    run.state?.startsWith(RUNS) && !run.state.startsWith(WEB),
    run.state,
  );

  const get = async (path, headers) => {
    try {
      const response = await fetch(`${run.base}${path}`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    } catch (error) {
      return { status: 0, body: String(error) };
    }
  };
  const auth = { authorization: `Bearer ${run.adminKey}` };
  const taxonomy = await get("/api/v1/taxonomy");
  check("API answers", taxonomy.status === 200, `/api/v1/taxonomy ${taxonomy.status}`);
  const me = await get("/api/v1/me", auth);
  check(
    "admin key valid",
    me.status === 200 && me.body?.role === "admin",
    `/api/v1/me ${me.status} ${me.body?.email ?? ""}`,
  );
  const apps = await get("/api/v1/apps?platform=web&limit=100", auth);
  check(
    "catalog seeded",
    (apps.body?.items?.length ?? 0) >= SEED_SITES,
    `${apps.body?.items?.length ?? 0} web apps`,
  );

  const tools = await fetch(`${run.base}/mcp`, {
    method: "POST",
    headers: {
      ...auth,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const listed = (await tools?.json().catch(() => null))?.result?.tools?.map(({ name }) => name);
  check(
    "remote MCP lists its tools",
    tools?.status === 200 && listed?.includes("search_screens"),
    `/mcp tools/list ${tools?.status ?? "failed"}, ${listed?.length ?? 0} tools`,
  );
  check(
    "local MCP is buildable",
    existsSync(join(MCP_PACKAGE, "node_modules/.bin/tsup")),
    join(MCP_PACKAGE, "node_modules/.bin/tsup"),
  );

  const current = safeGitInfo();
  check(
    "serving the checked-out revision",
    current.head === run.head,
    `launched at ${run.head} on ${run.branch}, now ${current.head ?? current.error} on ${current.branch ?? "?"}${current.dirty ? " (dirty)" : ""}`,
  );
  let chrome = "";
  try {
    chrome = chromePath();
  } catch (error) {
    chrome = String(error);
  }
  check("Chromium found", existsSync(chrome), chrome);

  const healthy = checks.every((item) => item.ok);
  output({ run: run.id, base: run.base, healthy, checks });
  if (!healthy) process.exitCode = 1;
}

// -------------------------------------------------------------------------------------------------
// local D1 / R2, read-only, through the Local Explorer `vite dev` serves
// -------------------------------------------------------------------------------------------------

async function explorerResponse(run, path, init) {
  const response = await fetch(`${run.base}/cdn-cgi/local/explorer/api${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  if (!response.ok)
    throw new Error(`Local Explorer ${path}: ${response.status} ${await response.text()}`);
  const body = await response.json();
  if (!body.success) throw new Error(`Local Explorer ${path}: ${JSON.stringify(body.errors)}`);
  return body;
}

const explorer = async (run, path, init) => (await explorerResponse(run, path, init)).result;

/** Refuses anything but one read: a leading SELECT proves nothing about what follows it. */
function assertReadOnly(sql) {
  if (typeof sql !== "string") throw new Error('Usage: control.mjs sql "<SELECT …>" [params…]');
  // One pass, so a quote inside a comment can't hide code and a comment marker in a string can't
  // hide the rest of the string.
  const code = sql
    .replace(
      /'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/gu,
      (token) => (token.startsWith("--") || token.startsWith("/*") ? " " : " x "),
    )
    .replace(/;\s*$/u, "");
  if (/['"`[]/u.test(code)) throw new Error("Unterminated string or identifier in the query");
  const writes =
    /\b(insert|update|delete|drop|alter|create|attach|detach|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release)\b|\bpragma|\breplace\s+into\b/iu;
  if (!/^\s*(select|with)\b/iu.test(code) || code.includes(";") || writes.test(code)) {
    throw new Error("Only a single read-only SELECT or WITH query is allowed");
  }
}

async function selectRows(run, sql, params = []) {
  assertReadOnly(sql);
  const [database] = await explorer(run, "/d1/database");
  const [result] = await explorer(run, `/d1/database/${database.uuid}/raw`, {
    method: "POST",
    body: JSON.stringify({ batch: [{ sql, params }] }),
  });
  const { columns, rows } = result.results;
  return rows.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index]])),
  );
}

async function listObjects(run) {
  const { buckets } = await explorer(run, "/r2/buckets");
  const keys = [];
  let cursor;
  do {
    const query = `per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await explorerResponse(run, `/r2/buckets/${buckets[0].name}/objects?${query}`);
    keys.push(...page.result.map((object) => object.key));
    cursor = page.result_info?.is_truncated === "true" ? page.result_info.cursor : undefined;
  } while (cursor);
  return keys;
}

// -------------------------------------------------------------------------------------------------
// drive
// -------------------------------------------------------------------------------------------------

// -------------------------------------------------------------------------------------------------
// MCP clients: the SDK's real client, over the transports real agents use
// -------------------------------------------------------------------------------------------------

function buildLocalMcp(run) {
  execFileSync(join(MCP_PACKAGE, "node_modules/.bin/tsup"), ["--out-dir", mcpBuildDir(run.id)], {
    cwd: MCP_PACKAGE,
    stdio: "pipe",
  });
  return join(mcpBuildDir(run.id), "index.js");
}

async function connectMcp(transport) {
  const client = new Client({ name: "verify-screen-commons", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

const remoteMcpClient = (run, token = run.adminKey, onResponse) =>
  connectMcp(
    new StreamableHTTPClientTransport(new URL(`${run.base}/mcp`), {
      requestInit: { headers: token ? { authorization: `Bearer ${token}` } : {} },
      fetch: async (url, init) => {
        const response = await fetch(url, init);
        onResponse?.(response.status, init?.method ?? "GET", String(url));
        return response;
      },
    }),
  );

/**
 * The built stdio server. Its home, config and output stay in the run's scratch directory and the
 * bridge is off unless asked for, so it never reads the developer's pairing token or takes 7457.
 */
function localMcpEnv(run, { token = run.adminKey, bridgePort, pairingToken } = {}) {
  const home = join(runDir(run.id), "mcp-home");
  mkdirSync(home, { recursive: true });
  return {
    PATH: process.env.PATH ?? "",
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    CHROME_PATH: chromePath(),
    SCREEN_COMMONS_URL: run.base,
    ...(token ? { SCREEN_COMMONS_API_KEY: token } : {}),
    SCREEN_COMMONS_OUTPUT_DIR: join(home, "output"),
    SCREEN_COMMONS_BRIDGE_TOKEN: pairingToken ?? randomBytes(32).toString("hex"),
    ...(bridgePort
      ? { SCREEN_COMMONS_BRIDGE_PORT: String(bridgePort) }
      : { SCREEN_COMMONS_BRIDGE: "off" }),
  };
}

async function localMcpClient(run, entry, options, onStderr) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: localMcpEnv(run, options),
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => onStderr?.(String(chunk)));
  return connectMcp(transport);
}

/** A tool call as an agent sees it. A refusal before the handler is a failed call, not a crash. */
async function callTool(client, name, args = {}) {
  let result;
  try {
    result = await client.callTool({ name, arguments: args });
  } catch (error) {
    result = { isError: true, content: [{ type: "text", text: String(error.message ?? error) }] };
  }
  const content = result.content ?? [];
  return {
    isError: Boolean(result.isError),
    text: content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n"),
    images: content
      .filter((item) => item.type === "image")
      .map((item) => ({ mimeType: item.mimeType, bytes: Buffer.from(item.data, "base64") })),
  };
}

const describeCall = ({ isError, text, images }) => ({
  isError,
  text,
  images: images.map((image) => ({ mimeType: image.mimeType, bytes: image.bytes.byteLength })),
});

async function commandMcp(flags, [kind, action, tool, json]) {
  const run = resolveRun(flags);
  if (!["remote", "local"].includes(kind) || !["tools", "call"].includes(action)) {
    throw new Error("Usage: control.mjs mcp <remote|local> <tools|call <tool> ['<json args>']>");
  }
  requireHealthy(run);
  const client =
    kind === "remote"
      ? await remoteMcpClient(run)
      : await localMcpClient(run, buildLocalMcp(run), {}, (chunk) => process.stderr.write(chunk));
  try {
    if (action === "tools") {
      output((await client.listTools()).tools.map(({ name, title }) => ({ name, title })));
    } else {
      const result = await callTool(client, tool, json ? JSON.parse(json) : {});
      output(describeCall(result));
      if (result.isError) process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

function commandMcpConfig(flags) {
  const run = requireHealthy(resolveRun(flags));
  const { PATH: _path, ...env } = localMcpEnv(run);
  output({
    mcpServers: {
      "screen-commons-remote": {
        type: "http",
        url: `${run.base}/mcp`,
        headers: { Authorization: `Bearer ${run.adminKey}` },
      },
      "screen-commons-local": { command: "node", args: [buildLocalMcp(run)], env },
    },
  });
}

/** A small same-origin site for the browser tools, so no public site is contacted. */
async function startFixtureSite(stamp) {
  const pages = { "/": "Home", "/pricing": "Pricing", "/signup": "Sign up", "/docs": "Docs" };
  const nav = Object.entries(pages)
    .map(([path, label]) => `<a href="${path}">${label}</a>`)
    .join(" ");
  const server = createHttpServer((request, response) => {
    const { pathname } = new URL(request.url, "http://fixture");
    const label = pages[pathname];
    if (!label) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <title>${label} - Fixture ${stamp}</title><meta name="description" content="${label} of the fixture site.">
      <meta property="og:site_name" content="Fixture ${stamp}"><link rel="icon" href="data:,"></head>
      <body style="margin:0;font:18px system-ui"><header id="top" style="height:72px;background:#123"><nav style="padding:24px;color:#fff">${nav}</nav></header>
      <main style="padding:48px;height:1800px"><h1>${label}</h1><p id="words">${label} words only in the capture ${stamp}.</p></main></body></html>`);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    url: (path = "/") => `${origin}${path}`,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(done);
      }),
  };
}

const IGNORED_CONSOLE = /favicon|Failed to load resource/u;
/** A tool call the server failed on, as opposed to one it refused. */
const SERVER_FAILURE =
  /^(internal|unavailable):|API error 5\d\d|Unexpected \(non-JSON\) response|Could not reach Screen Commons|MCP error -32603|Connection closed|fetch failed/u;
const DEFAULT_DRIVE_SECONDS = 300;

/** Runs `fn` while holding `path`, taking the lock over from a holder that has died. */
async function withLock(path, fn) {
  for (;;) {
    try {
      writeFileSync(path, String(process.pid), { flag: "wx" });
      break;
    } catch {
      const holder = existsSync(path) ? Number(readFileSync(path, "utf8")) : 0;
      if (holder && !processStart(holder)) rmSync(path, { force: true });
      else await sleep(250);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(path, { force: true });
  }
}

async function commandDrive(flags, positional) {
  const run = resolveRun(flags);
  requireHealthy(run);
  const name = positional[0];
  if (!name) throw new Error("Usage: control.mjs drive <journey|path.mjs>");
  const path = name.endsWith(".mjs")
    ? isAbsolute(name)
      ? name
      : resolve(name)
    : join(SKILL_DIR, "journeys", `${name}.mjs`);
  if (!existsSync(path)) throw new Error(`No journey at ${path}`);
  const journeyName = name.replace(/^.*\//u, "").replace(/\.mjs$/u, "");

  const seconds = Number(flags.timeout ?? DEFAULT_DRIVE_SECONDS);
  if (!/^\d+$/u.test(flags.timeout ?? "1") || !(seconds > 0 && seconds <= 86_400))
    throw new Error(`Bad --timeout "${flags.timeout}": use seconds, up to 86400`);

  const browser = await launchBrowser();
  const stamp = Date.now().toString(36);
  const out = join(EVIDENCE, run.id, `${journeyName}-${stamp}`);
  mkdirSync(out, { recursive: true });
  const steps = [];
  const problems = [];
  const contexts = [];
  const mcpClients = [];
  const closers = [];
  let localEntry;
  let counter = 0;
  let finished = false;
  let abort;
  const serverLog = join(runDir(run.id), "server.log");
  const logStart = statSync(serverLog).size;
  // A rejected waiter nobody awaited anymore is a failure of this journey, not of the harness.
  const noteRejection = (reason) =>
    problems.push(`unhandled rejection: ${String(reason?.message ?? reason).split("\n")[0]}`);
  process.on("unhandledRejection", noteRejection);
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => abort?.(new Error(`Stopped by ${signal}`)));
  }
  const assertRunning = () => {
    if (finished) throw new Error("The journey is over; this step came after its time limit");
  };
  const next = (label) =>
    `${String(++counter).padStart(2, "0")}-${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "")}`;

  const noteResponse = (status, method, url) => {
    if (status >= 500) problems.push(`${status} ${method} ${url}`);
  };
  const watchPage = (page) => {
    page.setDefaultTimeout(20_000);
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error" && !IGNORED_CONSOLE.test(message.text()))
        problems.push(`console: ${message.text()}`);
    });
    page.on("response", (response) =>
      noteResponse(response.status(), response.request().method(), response.url()),
    );
    return page;
  };

  const h = {
    base: run.base,
    admin: run.admin,
    adminKey: run.adminKey,
    stamp,

    async newPage({ viewport = { width: 1440, height: 900 } } = {}) {
      const context = await browser.newContext({ viewport });
      contexts.push(context);
      return watchPage(await context.newPage());
    },
    goto: (page, path) => page.goto(`${run.base}${path}`, { waitUntil: "networkidle" }),

    async signIn(page, { email, password } = run.admin, redirect = "/browse/web") {
      await h.goto(page, `/sign-in?redirect=${encodeURIComponent(redirect)}`);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL((url) => url.pathname === redirect.split("?")[0]);
      await page.waitForLoadState("networkidle");
    },
    /** A fresh member, signed up through the form. Never the first account, so never an admin. */
    async signUpMember(page, redirect = "/browse/web", suffix = "member") {
      const member = {
        name: `${suffix} ${stamp}`,
        email: `${suffix}-${stamp}@example.com`,
        password: `${suffix}-password-${stamp}`,
      };
      await h.goto(page, `/sign-up?redirect=${encodeURIComponent(redirect)}`);
      await page.getByLabel("Name").fill(member.name);
      await page.getByLabel("Email").fill(member.email);
      await page.getByLabel("Password", { exact: true }).fill(member.password);
      await page.getByRole("button", { name: "Create account" }).click();
      await page.waitForURL((url) => url.pathname === redirect.split("?")[0]);
      await page.waitForLoadState("networkidle");
      return member;
    },

    /** Proof of one state: screenshot, accessibility tree and URL. */
    async step(label, page) {
      assertRunning();
      const file = next(label);
      await page.screenshot({ path: join(out, `${file}.png`) });
      writeFileSync(join(out, `${file}.aria.txt`), await page.locator("body").ariaSnapshot());
      steps.push({ step: label, url: page.url(), proof: `${file}.png` });
      log(`  ok ${label}`);
    },
    /** Proof of a value outside the browser: an API response or database rows. */
    record(label, data) {
      assertRunning();
      const file = `${next(label)}.json`;
      writeFileSync(join(out, file), JSON.stringify(data, null, 2));
      steps.push({ step: label, proof: file });
      log(`  ok ${label}`);
      return data;
    },
    async sql(label, sql, params) {
      return h.record(label, await selectRows(run, sql, params));
    },
    /** Every key in this instance's R2 bucket. */
    r2: () => listObjects(run),
    /** Authenticated REST call, by default as the admin's API key. */
    async api(path, { token = run.adminKey, ...init } = {}) {
      assertRunning();
      const response = await fetch(`${run.base}/api/v1/${path}`, {
        ...init,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
      });
      noteResponse(response.status, init.method ?? "GET", response.url);
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    async mcp(method, params, token = run.adminKey) {
      assertRunning();
      const response = await fetch(`${run.base}/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      noteResponse(response.status, "POST", response.url);
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    /** The real MCP client over Streamable HTTP. `token: null` sends no key. */
    async remoteMcp(token) {
      const client = await remoteMcpClient(run, token, noteResponse);
      mcpClients.push(client);
      return client;
    },
    /** The real MCP client over stdio to a fresh build of the local server. Its log is evidence. */
    async localMcp({ label = "local", ...options } = {}) {
      localEntry ??= buildLocalMcp(run);
      const logPath = join(out, `mcp-${label}.stderr.log`);
      const client = await localMcpClient(run, localEntry, options, (chunk) =>
        appendFileSync(logPath, chunk),
      );
      mcpClients.push(client);
      return client;
    },
    /**
     * The real client over stdio to what npm would serve: the production package, packed and
     * installed outside the workspace. Installing contacts the npm registry. Returns the client
     * and the package's manifest and file list.
     */
    async packagedMcp({ label = "package", ...options } = {}) {
      const scratch = join(runDir(run.id), `package-${stamp}`);
      const staged = join(scratch, "staged");
      const app = join(scratch, "app");
      mkdirSync(app, { recursive: true });
      buildLocalMcp(run);
      execFileSync(
        process.execPath,
        [join(MCP_PACKAGE, "scripts/prepare-publish.mjs"), mcpBuildDir(run.id), staged],
        { stdio: "pipe" },
      );
      const [{ filename, files }] = JSON.parse(
        execFileSync("npm", ["pack", "--json", "--pack-destination", scratch], {
          cwd: staged,
          encoding: "utf8",
          stdio: "pipe",
        }),
      );
      writeFileSync(join(app, "package.json"), "{}");
      execFileSync("npm", ["install", "--no-audit", "--no-fund", join(scratch, filename)], {
        cwd: app,
        stdio: "pipe",
      });
      const logPath = join(out, `mcp-${label}.stderr.log`);
      const client = await localMcpClient(
        run,
        join(app, "node_modules/.bin/screen-commons-mcp"),
        options,
        (chunk) => appendFileSync(logPath, chunk),
      );
      mcpClients.push(client);
      return {
        client,
        manifest: JSON.parse(readFileSync(join(staged, "package.json"), "utf8")),
        files: files.map((file) => file.path),
      };
    },
    /** Calls a tool and saves the result as proof, with each returned image next to it. */
    async call(client, label, name, args = {}) {
      assertRunning();
      const result = await callTool(client, name, args);
      if (result.isError && SERVER_FAILURE.test(result.text))
        problems.push(`${name}: ${result.text}`);
      const image = args.image?.base64 ? { ...args.image, base64: "(omitted)" } : args.image;
      h.record(label, { tool: name, arguments: { ...args, image }, ...describeCall(result) });
      const [first] = result.images;
      if (first) {
        const extension = first.mimeType.split("/")[1];
        writeFileSync(join(out, `${next(`${label} image`)}.${extension}`), first.bytes);
      }
      return result;
    },
    /** A local site with /, /pricing, /signup and /docs, linked together. */
    async fixtureSite() {
      const site = await startFixtureSite(stamp);
      closers.push(site.close);
      return site;
    },
    freePort: () =>
      new Promise((done) => {
        const server = createServer().listen(0, "127.0.0.1", () => {
          const { port } = server.address();
          server.close(() => done(port));
        });
      }),
    /** Chromium with the freshly built extension loaded, in a throwaway profile. */
    async extensionBrowser() {
      // One build path for every run: build under a lock and load this drive's own copy.
      const extension = join(runDir(run.id), `extension-${stamp}`);
      await withLock(join(RUNS, ".extension-build.lock"), () => {
        execFileSync("pnpm", ["--filter", "@screen-commons/extension", "build:chrome"], {
          cwd: ROOT,
          stdio: "pipe",
        });
        cpSync(join(ROOT, "apps/extension/.output/chrome-mv3"), extension, { recursive: true });
      });
      const context = await chromium.launchPersistentContext(join(out, ".profile"), {
        executablePath: chromePath(),
        headless: true,
        viewport: { width: 1280, height: 900 },
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      contexts.push(context);
      closers.push(async () => {
        await context.close().catch(() => undefined);
        rmSync(join(out, ".profile"), { recursive: true, force: true });
      });
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
      const options = watchPage(await context.newPage());
      await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
      return { context, worker, options };
    },
    /** 1440×900 PNG files a user could have captured, each with distinct bytes. */
    async pngs(labels) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const files = [];
      for (const [index, label] of labels.entries()) {
        await page.setContent(
          `<body style="margin:0;font:16px system-ui;background:#fafafa"><main style="display:grid;place-items:center;height:900px"><div style="width:420px;padding:40px;background:#fff;border:1px solid #eee;border-radius:16px"><h1>${label} ${stamp}</h1><div style="height:46px;border-radius:10px;background:hsl(${index * 110} 70% 45%)"></div></div></main></body>`,
        );
        files.push({
          name: `${label.toLowerCase().replace(/\s+/gu, "-")}-${stamp}.png`,
          mimeType: "image/png",
          buffer: await page.screenshot({ type: "png" }),
        });
      }
      await context.close();
      return files;
    },
  };

  log(`[${run.id}] ${journeyName}`);
  const started = Date.now();
  let limit;
  let error = null;
  try {
    await Promise.race([
      // The import is raced too: a journey can hang in its top-level code.
      import(pathToFileURL(path).href).then((journey) => journey.default(h)),
      new Promise((_, reject) => {
        abort = reject;
        limit = setTimeout(
          () => reject(new Error(`Journey still running after ${seconds} s (--timeout)`)),
          seconds * 1000,
        );
      }),
    ]);
    // A blocking journey can finish without the timer ever getting to run.
    if (Date.now() - started > seconds * 1000) {
      throw new Error(`Journey ran past its ${seconds} s limit (--timeout)`);
    }
  } catch (caught) {
    error = caught;
    finished = true;
    for (const context of contexts) {
      for (const page of context.pages()) {
        const file = next("failure");
        await page
          .screenshot({ path: join(out, `${file}.png`), timeout: 5000 })
          .catch(() => undefined);
        await page
          .locator("body")
          .ariaSnapshot({ timeout: 5000 })
          .then((tree) => writeFileSync(join(out, `${file}.aria.txt`), tree))
          .catch(() => undefined);
      }
    }
  }
  clearTimeout(limit);
  finished = true;
  // Clients first: closing stdin is what stops a local server and its Chromium.
  for (const client of mcpClients) await client.close().catch(() => undefined);
  for (const close of closers) await close().catch(() => undefined);
  await browser.close();

  // Requests no watcher saw, such as the local MCP server's own, still show up in the server's log.
  const newLog = readFileSync(serverLog).subarray(logStart).toString("utf8");
  for (const [line] of newLog.matchAll(/^.*Internal server error.*$/gmu)) {
    problems.push(`server log: ${stripVTControlCharacters(line).trim()}`);
  }

  const result = {
    journey: journeyName,
    run: run.id,
    revision: safeGitInfo(),
    passed: !error && problems.length === 0,
    error: error ? (error.stack ?? String(error)) : null,
    problems,
    seconds: Math.round((Date.now() - started) / 1000),
    steps,
  };
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2));
  output({
    journey: journeyName,
    passed: result.passed,
    error: error
      ? String(error.message ?? error)
          .split("\n")
          .slice(0, 6)
          .join("\n")
      : null,
    problems,
    seconds: result.seconds,
    evidence: out,
  });
  if (!result.passed) process.exitCode = 1;
  // A journey that timed out may still hold timers or sockets.
  setTimeout(() => process.exit(), 1000).unref();
}

// -------------------------------------------------------------------------------------------------
// teardown
// -------------------------------------------------------------------------------------------------

function groupMembers(pgid) {
  const out = execFileSync("ps", ["-eo", "pid=,pgid=,stat="], { encoding: "utf8", stdio: "pipe" });
  return out
    .split("\n")
    .map((line) => line.trim().split(/\s+/u))
    .filter(([pid, group, stat]) => pid && Number(group) === pgid && !stat.startsWith("Z"))
    .map(([pid]) => Number(pid));
}

/**
 * Stops the run's process group, including members that outlived the server. A pid can't be reused
 * while its group has members, so a different process on our pid means the group is already gone.
 */
async function stopServer(run) {
  if (!run.pid) return true;
  const start = processStart(run.pid);
  if (start && start !== run.processStart) return true;
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    try {
      process.kill(-run.pid, signal);
    } catch {
      // already gone
    }
    for (let attempt = 0; attempt < 20 && groupMembers(run.pid).length > 0; attempt += 1) {
      await sleep(250);
    }
  }
  return groupMembers(run.pid).length === 0;
}

/** Kills the process group this run started and deletes its scratch state. Evidence stays. */
async function teardown(run) {
  const stopped = await stopServer(run);
  const evidence = join(EVIDENCE, run.id);
  const serverLog = join(runDir(run.id), "server.log");
  if (existsSync(serverLog)) {
    mkdirSync(evidence, { recursive: true });
    copyFileSync(serverLog, join(evidence, "server.log"));
  }
  rmSync(runDir(run.id), { recursive: true, force: true });
  if (run.port) rmSync(join(PORTS, String(run.port)), { force: true });
  rmSync(viteCacheDir(run.id), { recursive: true, force: true });
  rmSync(mcpBuildDir(run.id), { recursive: true, force: true });
  return {
    run: run.id,
    stopped,
    portFree: !run.port || listenerPids(run.port).length === 0,
    evidence: existsSync(evidence) ? evidence : null,
  };
}

// -------------------------------------------------------------------------------------------------

function parse(argv) {
  const [command = "help", ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--run" || rest[index] === "--timeout") {
      if (rest[index + 1] === undefined) throw new Error(`${rest[index]} needs a value`);
      flags[rest[index].slice(2)] = rest[++index];
    } else if (rest[index].startsWith("--")) throw new Error(`Unknown option ${rest[index]}`);
    else positional.push(rest[index]);
  }
  return { command, flags, positional };
}

let parsed;
try {
  parsed = parse(process.argv.slice(2));
} catch (error) {
  log(error.message);
  process.exit(1);
}
const { command, flags, positional } = parsed;
const commands = {
  launch: () => commandLaunch(flags),
  doctor: () => commandDoctor(flags),
  drive: () => commandDrive(flags, positional),
  sql: async () =>
    output(await selectRows(requireHealthy(resolveRun(flags)), positional[0], positional.slice(1))),
  r2: async () => output(await listObjects(requireHealthy(resolveRun(flags)))),
  mcp: () => commandMcp(flags, positional),
  "mcp-config": async () => commandMcpConfig(flags),
  list: async () =>
    output(
      runIds().map((id) => {
        const run = readRun(id);
        return {
          id,
          base: run.base,
          ready: Boolean(run.ready),
          alive: isAlive(run),
          head: run.head,
        };
      }),
    ),
  teardown: async () => output(await teardown(resolveRun(flags))),
};

if (commands[command]) {
  await commands[command]().catch((error) => {
    log(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else {
  log(
    "Usage: control.mjs <launch|doctor|drive|sql|r2|mcp|mcp-config|list|teardown> [--run <id>]; see ../SKILL.md",
  );
  process.exitCode = 1;
}
