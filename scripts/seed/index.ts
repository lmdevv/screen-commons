/**
 * Seed tooling: capture curated marketing sites with the headless driver and upload them to an
 * Open UI instance through the real `/api/v1/captures` pipeline.
 *
 *   pnpm seed capture [--only linear,vercel] [--force] [--concurrency 3] [--timeout 90]
 *   pnpm seed upload --url http://localhost:5173 --key oui_… [--only …] [--force]
 *   pnpm seed verify [--only …]       # check which candidate paths exist
 *   pnpm seed list
 *
 * Captures are cached in `.seed-cache/<app>/` (PNG + WebP thumbnail + manifest.json) so reruns
 * skip finished pages. Override the location with SEED_CACHE.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  capturePage,
  createCaptureContext,
  fetchLogo,
  launchBrowser,
  makeThumbnail,
  prepareScreen,
  uploadCaptures,
  dominantColor,
  type Browser,
} from "../../packages/capture/src/index";
import {
  LIMITS,
  OpenUiApiError,
  captureBatchInputSchema,
  createOpenUiClient,
  labelFor,
  suggestPatterns,
  type CaptureBatchInput,
  type PatternSlug,
} from "../../packages/core/src/index";
import { SITES, type SeedSite } from "./sites";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = resolve(process.env.SEED_CACHE ?? join(ROOT, ".seed-cache"));
const DEVICE_SCALE_FACTOR = 2;

interface PageEntry {
  path: string;
  requestedUrl: string;
  url: string;
  title: string;
  patterns: PatternSlug[];
  file: string;
  thumb: string;
  width: number;
  height: number;
  bytes: number;
  dominantColor: string;
  text: string;
  status: number | null;
  capturedAt: string;
  settle: unknown;
}

interface Manifest {
  app: Omit<SeedSite, "paths" | "flows">;
  flows: SeedSite["flows"];
  logo: string | null;
  pages: PageEntry[];
  failures: { path: string; error: string; at: string }[];
  updatedAt: string;
}

const log = (message: string) => process.stderr.write(`${message}\n`);

function parseArgs(argv: string[]) {
  const [command = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2) as [string, string | undefined];
    if (inline !== undefined) flags[key] = inline;
    else if (rest[index + 1] && !rest[index + 1]!.startsWith("--")) flags[key] = rest[++index]!;
    else flags[key] = true;
  }
  return { command, flags };
}

function selectSites(flags: Record<string, string | boolean>): SeedSite[] {
  if (typeof flags.only !== "string") return SITES;
  const wanted = new Set(flags.only.split(",").map((slug) => slug.trim()));
  const selected = SITES.filter((site) => wanted.has(site.slug));
  const unknown = [...wanted].filter((slug) => !SITES.some((site) => site.slug === slug));
  if (unknown.length) throw new Error(`Unknown site(s): ${unknown.join(", ")}`);
  return selected;
}

const pageKey = (path: string) =>
  path === "/"
    ? "home"
    : path
        .replace(/^\/+|\/+$/gu, "")
        .replace(/[^a-z0-9]+/giu, "-")
        .toLowerCase();

/** Same registrable-ish domain: allow apex/www/app. subdomains (e.g. cal.com → app.cal.com). */
function sameSite(a: string, b: string): boolean {
  const base = (host: string) => host.split(".").slice(-2).join(".");
  return base(new URL(a).hostname) === base(new URL(b).hostname);
}

async function readManifest(site: SeedSite): Promise<Manifest> {
  const path = join(CACHE, site.slug, "manifest.json");
  const { paths: _paths, flows, ...app } = site;
  if (existsSync(path)) {
    const manifest = JSON.parse(await readFile(path, "utf8")) as Manifest;
    return { ...manifest, app, flows };
  }
  return { app, flows, logo: null, pages: [], failures: [], updatedAt: new Date().toISOString() };
}

async function writeManifest(site: SeedSite, manifest: Manifest) {
  manifest.updatedAt = new Date().toISOString();
  manifest.pages.sort((a, b) => site.paths.indexOf(a.path) - site.paths.indexOf(b.path));
  await writeFile(
    join(CACHE, site.slug, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]);
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------------------------------

interface Stats {
  ok: number;
  cached: number;
  failed: { site: string; path: string; error: string }[];
}

async function captureSite(
  browser: Browser,
  site: SeedSite,
  options: { force: boolean; timeoutMs: number },
  stats: Stats,
) {
  const dir = join(CACHE, site.slug);
  await mkdir(dir, { recursive: true });
  const manifest = await readManifest(site);
  manifest.failures = [];
  const context = await createCaptureContext(browser, {
    viewport: "desktop",
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  try {
    for (const path of site.paths) {
      const key = pageKey(path);
      const existing = manifest.pages.find((page) => page.path === path);
      if (existing && !options.force && existsSync(join(dir, existing.file))) {
        stats.cached += 1;
        continue;
      }
      const requestedUrl = new URL(path, site.websiteUrl).href;
      const page = await context.newPage();
      const started = Date.now();
      try {
        const result = await withTimeout(
          capturePage(page, { url: requestedUrl, viewport: "desktop" }),
          options.timeoutMs,
          requestedUrl,
        );
        if (result.status !== null && result.status >= 400)
          throw new Error(`HTTP ${result.status}`);
        if (!sameSite(result.url, site.websiteUrl))
          throw new Error(`redirected off-site to ${result.url}`);
        const thumb = await makeThumbnail(result.png, { viewport: "desktop" });
        const file = `${key}.png`;
        const thumbFile = `${key}.thumb.webp`;
        await writeFile(join(dir, file), result.png);
        await writeFile(join(dir, thumbFile), thumb.buffer);
        const entry: PageEntry = {
          path,
          requestedUrl,
          url: result.url,
          title: result.title,
          patterns: suggestPatterns(requestedUrl, result.title),
          file,
          thumb: thumbFile,
          width: result.width,
          height: result.height,
          bytes: result.png.byteLength,
          dominantColor: await dominantColor(result.png),
          text: result.text,
          status: result.status,
          capturedAt: result.capturedAt,
          settle: result.settle,
        };
        manifest.pages = manifest.pages.filter((item) => item.path !== path).concat(entry);
        if (path === "/" && (!manifest.logo || options.force)) {
          const logo = await fetchLogo(result.metadata).catch(() => undefined);
          if (logo) {
            await writeFile(join(dir, "logo.png"), Buffer.from(logo.base64, "base64"));
            manifest.logo = "logo.png";
          }
        }
        stats.ok += 1;
        log(
          `  ok   ${site.slug}${path} → ${result.width}×${result.height} "${result.title.slice(0, 60)}" (${((Date.now() - started) / 1000).toFixed(1)}s, hidden ${result.settle?.hiddenOverlays ?? 0})`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message.split("\n")[0]! : String(error);
        manifest.failures.push({ path, error: message, at: new Date().toISOString() });
        stats.failed.push({ site: site.slug, path, error: message });
        log(`  FAIL ${site.slug}${path}: ${message}`);
      } finally {
        await page.close().catch(() => undefined);
        await writeManifest(site, manifest);
      }
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function commandCapture(flags: Record<string, string | boolean>) {
  const sites = selectSites(flags);
  const concurrency = Number(flags.concurrency ?? 3);
  const timeoutMs = Number(flags.timeout ?? 90) * 1000;
  const force = flags.force === true;
  await mkdir(CACHE, { recursive: true });
  log(
    `Capturing ${sites.length} sites into ${CACHE} (concurrency ${concurrency}, ${DEVICE_SCALE_FACTOR}x, timeout ${timeoutMs / 1000}s)`,
  );
  const stats: Stats = { ok: 0, cached: 0, failed: [] };
  const started = Date.now();
  const browser = await launchBrowser({ executablePath: process.env.CHROME_PATH });
  try {
    await mapLimit(sites, concurrency, async (site) => {
      log(`→ ${site.name} (${site.websiteUrl})`);
      await captureSite(browser, site, { force, timeoutMs }, stats).catch((error: unknown) => {
        stats.failed.push({ site: site.slug, path: "*", error: String(error) });
        log(`  FAIL ${site.slug}: ${String(error)}`);
      });
    });
  } finally {
    await browser.close();
  }
  log("");
  log(
    `Done in ${((Date.now() - started) / 1000).toFixed(0)}s: ${stats.ok} captured, ${stats.cached} cached, ${stats.failed.length} failed.`,
  );
  for (const failure of stats.failed) log(`  - ${failure.site}${failure.path}: ${failure.error}`);
  log(`Cache: ${CACHE}`);
}

// ---------------------------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------------------------

async function commandUpload(flags: Record<string, string | boolean>) {
  const baseUrl = String(flags.url ?? process.env.OPEN_UI_URL ?? "http://localhost:5173").replace(
    /\/+$/u,
    "",
  );
  const apiKey = typeof flags.key === "string" ? flags.key : process.env.OPEN_UI_API_KEY;
  if (!apiKey)
    throw new Error("Missing --key oui_… (an admin API key so seed content publishes immediately)");
  const client = createOpenUiClient({
    baseUrl,
    apiKey,
    headers: { "x-open-ui-client": "open-ui-seed/0.1.0" },
  });
  const me = await client.me();
  log(
    `Uploading to ${baseUrl} as ${me.email} (${me.role})${me.role === "admin" ? "" : " — content will be pending review"}`,
  );
  const host = new URL(baseUrl).host.replace(/[^a-z0-9.-]+/giu, "_");
  let apps = 0;
  let screens = 0;
  let flows = 0;
  const failures: string[] = [];

  for (const site of selectSites(flags)) {
    const dir = join(CACHE, site.slug);
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) {
      log(`- ${site.slug}: not captured yet, skipping (run seed capture)`);
      continue;
    }
    const receiptPath = join(dir, `upload-${host}.json`);
    if (existsSync(receiptPath) && flags.force !== true) {
      log(`- ${site.slug}: already uploaded to ${baseUrl} (delete ${receiptPath} or pass --force)`);
      continue;
    }
    const manifest = await readManifest(site);
    if (manifest.pages.length === 0) continue;
    try {
      const prepared = [];
      for (const page of manifest.pages) {
        const { screen } = await prepareScreen({
          png: await readFile(join(dir, page.file)),
          sourceUrl: page.url,
          title: page.title,
          viewport: "desktop",
          patterns: page.patterns,
          text: page.text,
          capturedAt: page.capturedAt,
        });
        prepared.push(screen);
      }
      const logo = manifest.logo
        ? (await readFile(join(dir, manifest.logo))).toString("base64")
        : undefined;
      const batch: CaptureBatchInput = {
        app: {
          slug: site.slug,
          name: site.name,
          websiteUrl: site.websiteUrl,
          platform: "web",
          category: site.category,
          tagline: site.tagline,
        },
        logo: logo ? { type: "image/png", base64: logo } : undefined,
        screens: prepared.slice(0, LIMITS.maxScreensPerBatch),
        source: "seed",
      };
      captureBatchInputSchema.parse(batch);
      const result = await uploadCaptures(client, batch);
      apps += 1;
      screens += result.screens.length;
      const idByPath = new Map(
        manifest.pages.map((page, index) => [page.path, result.screens[index]?.id] as const),
      );
      const createdFlows: { name: string; id: string }[] = [];
      for (const flow of site.flows) {
        const steps = flow.paths
          .map((path) => ({ path, screenId: idByPath.get(path) }))
          .filter((step): step is { path: string; screenId: string } => Boolean(step.screenId));
        if (steps.length < 2) {
          log(`  flow "${flow.name}" skipped (${steps.length} captured steps)`);
          continue;
        }
        const { flow: created } = await client.createFlow({
          appId: result.app.id,
          name: flow.name,
          type: flow.type,
          steps: steps.map((step) => {
            const page = manifest.pages.find((entry) => entry.path === step.path);
            const pattern = page?.patterns[0];
            return {
              screenId: step.screenId,
              label: pattern ? labelFor(pattern) : page?.title.slice(0, 80),
            };
          }),
        });
        createdFlows.push({ name: flow.name, id: created.id });
        flows += 1;
      }
      await writeFile(
        receiptPath,
        `${JSON.stringify({ baseUrl, at: new Date().toISOString(), app: result.app, screens: Object.fromEntries(idByPath), flows: createdFlows }, null, 2)}\n`,
      );
      log(
        `- ${site.slug}: ${result.screens.length} screens, ${createdFlows.length} flows → ${baseUrl}/apps/${result.app.slug}`,
      );
    } catch (error) {
      const message =
        error instanceof OpenUiApiError
          ? `${error.status} ${error.code}: ${error.message}`
          : String(error);
      failures.push(`${site.slug}: ${message}`);
      log(`- ${site.slug}: FAILED ${message}`);
    }
  }
  log(
    `\nUploaded ${apps} apps, ${screens} screens, ${flows} flows.${failures.length ? ` ${failures.length} failed:\n  ${failures.join("\n  ")}` : ""}`,
  );
  if (failures.length) process.exitCode = 1;
}

// ---------------------------------------------------------------------------------------------
// verify / list
// ---------------------------------------------------------------------------------------------

async function commandVerify(flags: Record<string, string | boolean>) {
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  for (const site of selectSites(flags)) {
    const extra = typeof flags.extra === "string" ? flags.extra.split(",") : [];
    const results = await Promise.all(
      [...site.paths, ...extra].map(async (path) => {
        const url = new URL(path, site.websiteUrl).href;
        try {
          const response = await fetch(url, {
            headers: { "user-agent": ua, accept: "text/html" },
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
          });
          await response.body?.cancel();
          const final = response.url !== url ? ` → ${response.url}` : "";
          return `${response.ok ? "  ok " : "  BAD"} ${response.status} ${path}${final}`;
        } catch (error) {
          return `  ERR ${path}: ${(error as Error).message}`;
        }
      }),
    );
    log(`${site.slug}\n${results.join("\n")}`);
  }
}

function commandList() {
  for (const site of SITES) {
    log(
      `${site.slug.padEnd(14)} ${site.category.padEnd(16)} ${site.paths.length} pages, ${site.flows.length} flows  ${site.websiteUrl}`,
    );
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "capture":
      return commandCapture(flags);
    case "upload":
      return commandUpload(flags);
    case "verify":
      return commandVerify(flags);
    case "list":
      return commandList();
    default:
      log(
        "Usage: pnpm seed <capture|upload|verify|list> [--only a,b] [--force] [--url …] [--key oui_…]",
      );
  }
}

main().catch((error: unknown) => {
  log(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
