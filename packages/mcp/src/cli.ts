#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs, type ParseArgsConfig } from "node:util";

import {
  API_KEY_PREFIX,
  IMAGE_EXTENSIONS,
  bundleApp,
  bundleImagePath,
  bundleSubject,
  compactApp,
  compactFlow,
  compactScreen,
  createFlowInputSchema,
  createScreenCommonsClient,
  createdFlowResult,
  flowDetailResult,
  readImageHeader,
  referenceBundleSchema,
  referenceMarkdown,
  screenDetailResult,
  statusWarnings,
  suggestPatterns,
  updateFlowInputSchema,
  updateScreenInputSchema,
  type BundleStep,
  type FlowDetail,
  type ListAppsQuery,
  type ListFlowsQuery,
  type ListScreensQuery,
  type ReferenceBundle,
  type ReviewKind,
  type ReviewQueueQuery,
  type Screen,
  type ScreenCommonsClient,
  ScreenCommonsApiError,
} from "@screen-commons/core";
import type { z } from "zod";

import { version } from "../package.json";
import {
  readProfiles,
  removeProfile,
  resolveInstance,
  saveProfile,
  selectProfile,
  writeFileAtomic,
  type Instance,
  type Profile,
  type ProfileSelection,
} from "./config";
import { CodedError, errorInfo } from "./errors";
import { imageFetchFor } from "./public-fetch";
import { retryingFetch } from "./retry";

/** Every JSON document on stdout carries it. Bump it when a field changes meaning or goes away. */
const SCHEMA_VERSION = 1;

const EXIT_CODES: Record<string, number> = {
  usage: 2,
  invalid_profiles: 2,
  invalid_manifest: 2,
  bad_request: 2,
  conflict: 2,
  payload_too_large: 2,
  unsupported_media_type: 2,
  unprocessable: 2,
  invalid_image: 2,
  source_unreadable: 2,
  source_too_large: 2,
  file_exists: 2,
  missing_api_key: 3,
  unauthorized: 3,
  forbidden: 3,
  login_denied: 3,
  login_expired: 3,
  not_found: 4,
  network: 5,
  rate_limited: 5,
  unavailable: 5,
};

const usage = (message: string) => new CodedError("usage", message);

type Options = NonNullable<ParseArgsConfig["options"]>;
type Values = Record<string, string | string[] | boolean | undefined>;

interface Context {
  values: Values;
  positionals: string[];
  /** A client with the API key, or refusal when there's no key. */
  client: () => ScreenCommonsClient;
  anonymousClient: () => ScreenCommonsClient;
  connect: (url: string, apiKey?: string) => ScreenCommonsClient;
  origin: string;
  /** Media from this instance. */
  download: typeof fetch;
  /** A screen's own source URL, anywhere on the web. */
  sourceFetch: typeof fetch;
  apiKey: string | undefined;
  instance: Instance;
  profile: ProfileSelection;
  /** Prints a line before the result; from then on, `--json` prints the result as one line too. */
  printLine: (line: object) => void;
  addSecret: (secret: string) => void;
}

/** A result for a person: printed as `text`, or as `json` with `--json`. */
class Readable {
  constructor(
    readonly json: object,
    readonly text: string,
  ) {}
}

interface Command {
  summary: string;
  /** Arguments as shown in `--help`, e.g. `<id>`; their count is enforced. */
  args?: string[];
  optionalArgs?: string[];
  flags?: Record<string, { help: string; multiple?: boolean; boolean?: boolean }>;
  run: (context: Context) => Promise<object | void>;
}

type Tree = Record<string, Command | Record<string, Command>>;

const isCommand = (node: Command | Record<string, Command>): node is Command =>
  typeof (node as Command).run === "function";

const paging = {
  limit: { help: "Items per page, up to 100" },
  cursor: { help: "`nextCursor` from the previous page" },
};
const query = { query: { help: "Free text; the same as the positional" } };

const str = (values: Values, name: string) => values[name] as string | undefined;
const list = (values: Values, name: string) => values[name] as string[] | undefined;

/** Parse flag input through the same schema the server applies, for a clean local refusal. */
function validated<S extends z.ZodType>(schema: S, input: unknown): z.input<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return input as z.input<S>;
  throw new CodedError(
    "bad_request",
    parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; "),
  );
}

const queryText = ({ positionals, values }: Context) =>
  positionals.join(" ") || str(values, "query");

/** Query flags pass through as text: the server validates them against its one schema. */
const flagsOf = (values: Values, names: string[]) =>
  defined(Object.fromEntries(names.map((name) => [name, str(values, name)])));

function jsonPatch(values: Values): Record<string, unknown> {
  const text = str(values, "patch");
  if (text === undefined) return {};
  try {
    const patch: unknown = JSON.parse(text);
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      return patch as Record<string, unknown>;
    }
  } catch {
    // reported below
  }
  throw usage("--patch must be a JSON object");
}

const defined = (input: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

function requireChanges(patch: Record<string, unknown>) {
  if (Object.keys(patch).length === 0) throw usage("Nothing to update; pass a flag or --patch");
  return patch;
}

async function screenText(values: Values): Promise<string | undefined> {
  const text = str(values, "text");
  const file = str(values, "text-file");
  if (file === undefined) return text;
  if (text !== undefined) throw usage("Pass --text or --text-file, not both");
  try {
    return await readFile(resolve(file), "utf8");
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code ?? "read failed";
    throw new CodedError("source_unreadable", `Can't read ${resolve(file)}: ${reason}`);
  }
}

const textFlags = {
  text: {
    help: "Words visible in the screenshot, so search finds them. 20,000 characters at most",
  },
  "text-file": { help: "Read --text from this UTF-8 file" },
};

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

const parseSteps = (values: Values) =>
  list(values, "step")?.map((step) => {
    const split = step.indexOf("=");
    return split < 0
      ? { screenId: step }
      : { screenId: step.slice(0, split), label: step.slice(split + 1) };
  });

const keyOnlyForOwnOrigin = (context: Context, url: URL): Record<string, string> =>
  context.apiKey && url.origin === new URL(context.origin).origin
    ? { authorization: `Bearer ${context.apiKey}` }
    : {};

async function fetchImage(context: Context, path: string) {
  const url = new URL(path, `${context.origin}/`);
  const response = await context.download(url, { headers: keyOnlyForOwnOrigin(context, url) });
  if (!response.ok) {
    throw new CodedError(
      response.status === 404 ? "not_found" : "network",
      `Could not download ${url.href} (HTTP ${response.status})`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const header = readImageHeader(bytes);
  if (!header) throw new CodedError("bad_response", `${url.href} is not an image`);
  return { url, bytes, header };
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function downloadScreen(context: Context) {
  return saveImage(context, await context.client().getScreen(context.positionals[0]!));
}

async function saveImage(context: Context, screen: Screen) {
  const { values } = context;
  const { id } = screen;
  const { url, bytes, header } = await fetchImage(
    context,
    values.thumb ? screen.thumbUrl : screen.imageUrl,
  );
  const path = resolve(
    str(values, "out") ?? `${id}${values.thumb ? "-thumb" : ""}.${IMAGE_EXTENSIONS[header.type]}`,
  );
  if (!values.force && (await exists(path))) {
    throw new CodedError("file_exists", `${path} exists; pass --force to replace it`);
  }
  await writeFileAtomic(path, bytes);
  return {
    id,
    path,
    url: url.href,
    bytes: bytes.byteLength,
    type: header.type,
    width: header.width,
    height: header.height,
  };
}

interface BundleItem {
  position: number;
  label: string | null;
  screen: Screen;
}

async function previousBundle(dir: string): Promise<ReferenceBundle | "foreign" | null> {
  let text;
  try {
    text = await readFile(join(dir, "bundle.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return referenceBundleSchema.parse(JSON.parse(text));
  } catch {
    return "foreign";
  }
}

async function writeBundle(context: Context, flow: FlowDetail | null, items: BundleItem[]) {
  const { origin, values } = context;
  const dir = resolve(str(values, "out")!);
  const unsafe = items.find(({ screen }) => !/^[\w-]{1,64}$/u.test(screen.id));
  if (unsafe) {
    throw new CodedError(
      "bad_response",
      `Screen id ${JSON.stringify(unsafe.screen.id)} can't name a file`,
    );
  }
  const subject = bundleSubject({ flow, steps: items.map(({ screen }) => screen) });
  const found = await previousBundle(dir);
  if (found && !values.force) {
    const theirs = found === "foreign" ? "foreign" : bundleSubject(found);
    if (theirs !== subject) {
      throw new CodedError(
        "file_exists",
        `${dir} holds ${theirs === "foreign" ? "a bundle.json this CLI can't read" : `the bundle of ${theirs}`}; pass --force to replace it`,
      );
    }
  }
  const previous = found === "foreign" ? null : found;
  const recorded = new Map(previous?.steps.map((step) => [step.imageUrl, step] as const));
  const listedByPrevious = new Set(previous?.steps.map((step) => step.localPath));
  const bundleJson = join(dir, "bundle.json");
  await mkdir(join(dir, "images"), { recursive: true });
  let downloaded = 0;
  const steps: BundleStep[] = [];
  for (const { position, label, screen } of items) {
    const imageUrl = new URL(screen.imageUrl, `${origin}/`).href;
    const prior = recorded.get(imageUrl);
    const kept = prior && (await readFile(join(dir, prior.localPath)).catch(() => null));
    const reused = kept && sha256(kept) === prior.sha256 ? kept : null;
    const bytes = reused ?? (await fetchImage(context, imageUrl)).bytes;
    if (!reused) downloaded += 1;
    const header = readImageHeader(bytes)!;
    const localPath = bundleImagePath(position, screen.id, header.type);
    if (!reused || prior?.localPath !== localPath) {
      if (listedByPrevious.has(localPath)) await rm(bundleJson, { force: true });
      await writeFileAtomic(join(dir, localPath), bytes);
    }
    steps.push({
      id: screen.id,
      position,
      label,
      title: screen.title,
      catalogUrl: `${origin}/screens/${screen.id}`,
      imageUrl,
      localPath,
      sha256: sha256(bytes),
      width: header.width,
      height: header.height,
      sourceUrl: screen.sourceUrl,
      capturedAt: screen.capturedAt,
      app: bundleApp(screen.app),
      contributor: { owned: screen.owned === true, source: screen.source },
      status: screen.status,
      warnings: statusWarnings(screen.status),
    });
  }
  const bundle: ReferenceBundle = {
    version: 1,
    instance: origin,
    retrievedAt: new Date().toISOString(),
    flow: flow && {
      id: flow.id,
      name: flow.name,
      type: flow.type,
      catalogUrl: `${origin}/flows/${flow.id}`,
      app: bundleApp(flow.app),
      status: flow.status,
      warnings: statusWarnings(flow.status),
    },
    steps,
  };
  const references = join(dir, "REFERENCES.md");
  await writeFileAtomic(references, referenceMarkdown(bundle));
  await writeFileAtomic(bundleJson, `${JSON.stringify(bundle, null, 2)}\n`);
  const current = new Set(steps.map((step) => step.localPath));
  for (const step of previous?.steps ?? []) {
    if (!current.has(step.localPath)) await rm(join(dir, step.localPath), { force: true });
  }
  return {
    path: dir,
    references,
    steps: steps.length,
    downloaded,
    reused: steps.length - downloaded,
    warnings: [
      ...new Set([...(bundle.flow?.warnings ?? []), ...steps.flatMap((step) => step.warnings)]),
    ],
  };
}

const bundleFlags = {
  out: { help: "Folder to write (required). A rerun into it reuses unchanged images" },
  force: { help: "Replace a bundle of something else already in --out", boolean: true },
};

const requireOut = (values: Values) => {
  if (!str(values, "out")) throw usage("Pass --out <dir>");
};

async function upload(context: Context) {
  const { values } = context;
  const target = context.positionals[0]!;
  if (/^http:\/\//iu.test(target)) throw usage("Only https URLs can be uploaded");
  const slug = str(values, "app");
  const name = str(values, "app-name");
  if (!slug && !name) throw usage("Pass --app <slug> or --app-name <name>");
  const client = context.client();
  const existing = slug
    ? await client.getApp(slug).catch((error: unknown) => {
        if (error instanceof ScreenCommonsApiError && error.code === "not_found") {
          throw new CodedError(
            "not_found",
            `App ${slug} not found. --app only names an app that exists; pass --app-name on its own to create one.`,
          );
        }
        throw error;
      })
    : undefined;
  const title = str(values, "title");
  const sourceUrl = str(values, "source-url");
  const { parseManifest, publishManifest } = await import("./publish");
  const manifest = parseManifest({
    version: 1,
    id: `upload-${randomUUID()}`,
    app: defined({
      slug,
      name: existing?.name ?? name,
      platform: existing?.platform ?? str(values, "platform"),
      category: str(values, "category"),
      websiteUrl: str(values, "website-url"),
    }),
    screens: [
      defined({
        localId: "upload",
        source: /^https:\/\//iu.test(target) ? { url: target } : { file: target },
        title,
        sourceUrl,
        patterns: list(values, "pattern") ?? suggestPatterns(sourceUrl ?? "", title),
        elements: list(values, "element") ?? [],
        tags: list(values, "tag"),
        text: await screenText(values),
        capturedAt: str(values, "captured-at"),
      }),
    ],
    flows: [],
  });
  const report = await publishManifest(manifest, {
    client,
    baseDir: process.cwd(),
    fetch: context.sourceFetch,
  });
  const item = report.screens[0]!;
  if (report.error ?? item.error) {
    const { code, message } = (report.error ?? item.error)!;
    throw new CodedError(code, message);
  }
  return { id: item.id, status: item.status, url: item.url, app: report.app };
}

async function publish(context: Context) {
  const raw = str(context.values, "batch-size");
  const batchSize = raw === undefined ? undefined : Number(raw);
  if (batchSize !== undefined && !(Number.isInteger(batchSize) && batchSize >= 1)) {
    throw usage("--batch-size must be a positive whole number");
  }
  const { publishManifestFile } = await import("./publish");
  const report = await publishManifestFile(context.positionals[0]!, {
    client: context.client(),
    fetch: context.sourceFetch,
    batchSize,
  });
  if (report.ok) return report;
  const count = (items: { status: string }[]) =>
    items.filter((item) => item.status === "failed").length;
  throw new PartialFailure(
    report,
    "publish_failed",
    report.error
      ? `${report.error.code}: ${report.error.message}`
      : `${count(report.screens)} screens and ${count(report.flows)} flows failed`,
  );
}

const REVIEW_INTERVAL_MS = 300;
const DECISIONS = {
  approve: { status: "published", result: "approved" },
  reject: { status: "rejected", result: "rejected" },
} as const;
/** Every later id would fail the same way, so stop; a rerun resumes. */
const STOPS_REVIEW = new Set([
  "missing_api_key",
  "unauthorized",
  "forbidden",
  "network",
  "rate_limited",
  "unavailable",
]);

function kindFlag(values: Values): ReviewKind | undefined {
  const kind = str(values, "kind");
  if (kind === undefined || kind === "screen" || kind === "flow") return kind;
  throw usage("--kind must be screen or flow");
}

const isNotFound = (error: unknown) =>
  error instanceof ScreenCommonsApiError && error.code === "not_found";

/** Calls with the kind given, or finds it. Server ids never repeat across screens and flows. */
async function withKind<T>(
  kind: ReviewKind | undefined,
  id: string,
  call: (kind: ReviewKind) => Promise<T>,
): Promise<T> {
  if (kind) return call(kind);
  try {
    return await call("screen");
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    return await call("flow");
  } catch (error) {
    if (isNotFound(error)) throw new CodedError("not_found", `No screen or flow has id ${id}`);
    throw error;
  }
}

async function stdinLines(): Promise<string[]> {
  if (process.stdin.isTTY) return [];
  let text = "";
  for await (const chunk of process.stdin) text += String(chunk);
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function decide(context: Context, decision: keyof typeof DECISIONS) {
  const kind = kindFlag(context.values);
  const reason = str(context.values, "reason");
  const ids = context.positionals.length > 0 ? context.positionals : await stdinLines();
  if (ids.length === 0) throw usage("Pass ids as arguments or one per line on stdin");
  const client = context.client();
  let failed = 0;
  let next = 0;
  for (const id of ids) {
    await sleep(Math.max(0, next - Date.now()));
    next = Date.now() + REVIEW_INTERVAL_MS;
    try {
      const item = await withKind(kind, id, (found) => client.reviewStatus(found, id));
      if (item.status === DECISIONS[decision].status) {
        context.printLine({ id, kind: item.kind, result: "unchanged" });
        continue;
      }
      await client.review(item.kind, id, decision, reason);
      context.printLine({ id, kind: item.kind, result: DECISIONS[decision].result });
    } catch (error) {
      const { code, message } = errorInfo(error, context.origin);
      if (STOPS_REVIEW.has(code)) throw error;
      failed += 1;
      context.printLine({ id, result: "failed", error: { code, message } });
    }
  }
  if (failed > 0) throw new CodedError("review_failed", `${failed} of ${ids.length} ids failed`);
}

const reviewKind = { kind: { help: "screen or flow. Found from each id if omitted" } };

/** A failure that still has a JSON answer for stdout. */
class PartialFailure extends CodedError {
  readonly report: object;

  constructor(report: object, code: string, message: string) {
    super(code, message);
    this.report = report;
  }
}

const forProfile = ({ explicit, name }: ProfileSelection) => (explicit ? ` --profile ${name}` : "");

async function login(context: Context) {
  const { origin, profile } = context;
  const token = API_KEY_PREFIX + randomBytes(32).toString("base64url");
  context.addSecret(token);
  const hash = createHash("sha256").update(token).digest("hex");
  const api = context.anonymousClient();
  const started = await api.startCliLogin({
    hash,
    prefix: token.slice(0, 8),
    device: hostname().slice(0, 40) || "unknown host",
  });
  context.printLine(
    new Readable(
      { status: "pending", url: started.url, code: started.code, expiresAt: started.expiresAt },
      `Open this link in a browser where you're signed in to Screen Commons:\n\n  ${started.url}\n\nApprove it if the page shows ${started.code}. Waiting...\n`,
    ),
  );
  for (;;) {
    await sleep(Math.max(1, started.interval) * 1000);
    const poll = await api.pollCliLogin({ code: started.code, hash });
    if (poll.status === "approved") {
      const user = await context.connect(origin, token).me();
      await saveProfile(profile.dir, profile.name, {
        version: 1,
        url: origin,
        apiKey: token,
        keyId: poll.keyId,
        email: user.email,
      });
      return new Readable(
        { status: "approved", profile: profile.name, url: origin, user },
        `logged in as ${user.email} (profile ${profile.name})\n`,
      );
    }
    if (poll.status === "denied") {
      throw new CodedError(
        "login_denied",
        "The login was denied in the browser. Nothing was saved",
      );
    }
    if (poll.status === "expired") {
      throw new CodedError(
        "login_expired",
        "The code expired before anyone approved it. Run screen-commons login again",
      );
    }
  }
}

const isAlreadyRevoked = (error: unknown) =>
  error instanceof ScreenCommonsApiError &&
  (error.code === "unauthorized" || error.code === "not_found");

async function revokeSaved(context: Context, saved: Profile): Promise<boolean> {
  if (!saved.keyId) return false;
  try {
    await context.connect(saved.url, saved.apiKey).revokeKey(saved.keyId);
    return true;
  } catch (error) {
    return isAlreadyRevoked(error);
  }
}

async function logout(context: Context) {
  const { name, saved, dir } = context.profile;
  if (!saved) {
    return new Readable(
      { profile: name, removed: false, revoked: false },
      `Profile ${name} isn't logged in. Nothing to do\n`,
    );
  }
  const revoked = await revokeSaved(context, saved);
  await removeProfile(dir, name);
  return new Readable(
    { profile: name, url: saved.url, removed: true, revoked },
    `Logged out of ${saved.url} (profile ${name}). ${
      revoked
        ? "Its key is revoked\n"
        : "Its key couldn't be revoked: revoke it under Settings, API keys\n"
    }`,
  );
}

async function listProfiles({ profile }: Context) {
  const profiles = (await readProfiles(profile.dir)).map(
    ({ name, profile: { url, email, apiKey } }) => ({
      name,
      url,
      email: email ?? null,
      keyPrefix: apiKey.slice(0, 8),
    }),
  );
  const width = Math.max(0, ...profiles.map((item) => item.name.length));
  return new Readable(
    { active: profile.name, profiles },
    profiles.length === 0
      ? "No profiles. Run screen-commons login --url <instance>\n"
      : profiles
          .map(
            (item) =>
              `${item.name === profile.name ? "*" : " "} ${item.name.padEnd(width)}  ${item.email ?? "?"}  ${item.url}\n`,
          )
          .join(""),
  );
}

type CheckStatus = "ok" | "warn" | "fail" | "skip";
interface Check {
  name: "instance" | "profile" | "key" | "capture";
  status: CheckStatus;
  detail: string;
  fix?: string;
}

async function doctor(context: Context) {
  const { origin, instance, profile, apiKey } = context;
  const quick = (key?: string) =>
    createScreenCommonsClient({
      baseUrl: origin,
      apiKey: key,
      fetch: retryingFetch({ attempts: 1, timeoutMs: 10_000, readBody: true }),
    });
  const relogin = `run screen-commons login --url ${origin}${forProfile(profile)}`;
  const checks: Check[] = [];

  let reachable = true;
  try {
    await quick().taxonomy();
    checks.push({ name: "instance", status: "ok", detail: `${origin} answers` });
  } catch (error) {
    reachable = false;
    checks.push({
      name: "instance",
      status: "fail",
      detail: errorInfo(error, origin).message,
      fix: {
        flag: "check --url",
        env: "check SCREEN_COMMONS_URL",
        profile: `check the URL in profile ${profile.name}, or log in again`,
        default: "pass --url <instance> or set SCREEN_COMMONS_URL",
      }[instance.sources.url],
    });
  }

  const { saved } = profile;
  if (instance.sources.apiKey === "profile") {
    checks.push({
      name: "profile",
      status: "ok",
      detail: `${profile.name}, ${saved!.email ?? "unknown account"} at ${saved!.url}`,
    });
  } else if (apiKey) {
    checks.push({
      name: "profile",
      status: "ok",
      detail: `not used; the key comes from ${instance.sources.apiKey === "flag" ? "--api-key" : "SCREEN_COMMONS_API_KEY"}`,
    });
  } else {
    checks.push(
      saved
        ? {
            name: "profile",
            status: "fail",
            detail: `profile ${profile.name} is for ${saved.url}, so its key isn't sent to ${origin}`,
            fix: `use --url ${saved.url}, or ${relogin}`,
          }
        : {
            name: "profile",
            status: "fail",
            detail: `no profile ${profile.name} and no API key`,
            fix: relogin,
          },
    );
  }

  if (!reachable || !apiKey) {
    checks.push({
      name: "key",
      status: "skip",
      detail: reachable ? "no key to check" : "the instance didn't answer",
    });
  } else {
    try {
      const user = await quick(apiKey).me();
      checks.push({ name: "key", status: "ok", detail: `valid for ${user.email} (${user.role})` });
    } catch (error) {
      const { code, message } = errorInfo(error, origin);
      checks.push({
        name: "key",
        status: "fail",
        detail: message,
        fix:
          code !== "unauthorized"
            ? undefined
            : {
                flag: "check --api-key",
                env: `replace or unset SCREEN_COMMONS_API_KEY, which wins over profile ${profile.name}`,
                profile: relogin,
              }[instance.sources.apiKey!],
      });
    }
  }

  const { findChrome } = await import("@screen-commons/capture");
  const chrome = findChrome();
  checks.push(
    chrome && existsSync(chrome)
      ? { name: "capture", status: "ok", detail: `Chromium at ${chrome}` }
      : {
          name: "capture",
          status: "warn",
          detail: chrome
            ? `no Chromium at ${chrome}, so screen-commons-mcp can't capture headless`
            : "no Chromium found, so screen-commons-mcp can't capture headless",
          fix: "install Chromium or Chrome, or set CHROME_PATH",
        },
  );

  const ok = !checks.some((check) => check.status === "fail");
  const report = new Readable(
    { ok, url: origin, checks },
    checks
      .map(
        ({ status, name, detail, fix }) =>
          `${CHECK_LABEL[status]}  ${name.padEnd(8)}  ${detail}${fix ? `. Fix: ${fix}` : ""}\n`,
      )
      .join(""),
  );
  if (ok) return report;
  const failed = checks.filter((check) => check.status === "fail").map((check) => check.name);
  throw new PartialFailure(report, "doctor_failed", `Failed: ${failed.join(", ")}`);
}

const CHECK_LABEL: Record<CheckStatus, string> = {
  ok: "ok  ",
  warn: "warn",
  fail: "FAIL",
  skip: "skip",
};

const COMMANDS: Tree = {
  login: {
    summary: "Get a key with one approval in the browser, and save it as a profile",
    run: login,
  },
  logout: {
    summary: "Revoke the profile's key and forget it",
    run: logout,
  },
  profiles: {
    summary: "List saved logins. * marks the one in use",
    run: listProfiles,
  },
  doctor: {
    summary: "Check the instance, profile, key and capture setup. One line per check",
    run: doctor,
  },
  keys: {
    list: {
      summary: "List your API keys. Needs a key from screen-commons login",
      run: ({ client }) => client().listKeys(),
    },
    create: {
      summary: "Create an API key and print its token, shown only this once",
      flags: { name: { help: "What the key is for (required)" } },
      run: ({ client, values }) => {
        const name = str(values, "name");
        if (!name) throw usage("Pass --name <name>");
        return client().createKey(name);
      },
    },
    revoke: {
      summary: "Revoke an API key. It stops working at once",
      args: ["id"],
      run: async ({ client, positionals }) => {
        await client().revokeKey(positionals[0]!);
        return { revoked: true, id: positionals[0] };
      },
    },
  },
  whoami: {
    summary: "Show who the API key belongs to",
    run: async ({ client, origin }) => ({ ...(await client().me()), url: origin }),
  },
  taxonomy: {
    summary: "List the patterns, elements, flow types and categories. Needs no key",
    run: ({ anonymousClient }) => anonymousClient().taxonomy(),
  },
  apps: {
    list: {
      summary: "List apps",
      optionalArgs: ["query"],
      flags: {
        ...query,
        platform: { help: "web, ios or android" },
        category: { help: "Category slug" },
        sort: { help: "latest or popular" },
        ...paging,
      },
      run: async (context) => {
        const { values, client, origin } = context;
        const page = await client().listApps({
          q: queryText(context),
          ...flagsOf(values, ["platform", "category", "sort", "limit", "cursor"]),
        } as ListAppsQuery);
        return {
          items: page.items.map((app) => compactApp(origin, app)),
          nextCursor: page.nextCursor,
        };
      },
    },
    get: {
      summary: "Show one app",
      args: ["slug"],
      run: async ({ client, origin, positionals }) =>
        compactApp(origin, await client().getApp(positionals[0]!)),
    },
  },
  screens: {
    search: {
      summary: "Search screens",
      optionalArgs: ["query"],
      flags: {
        ...query,
        platform: { help: "web, ios or android" },
        pattern: { help: "Pattern slug" },
        element: { help: "Element slug" },
        app: { help: "App slug" },
        ...paging,
      },
      run: async (context) => {
        const { values, client, origin } = context;
        const page = await client().listScreens({
          q: queryText(context),
          ...flagsOf(values, ["platform", "pattern", "element", "app", "limit", "cursor"]),
        } as ListScreensQuery);
        return {
          items: page.items.map((screen) => compactScreen(origin, screen)),
          nextCursor: page.nextCursor,
        };
      },
    },
    get: {
      summary: "Show one screen and the flows it's in",
      args: ["id"],
      run: async ({ client, origin, positionals }) =>
        screenDetailResult(origin, await client().getScreen(positionals[0]!)),
    },
    update: {
      summary: "Edit a screen you contributed. Repeated flags replace the whole list",
      args: ["id"],
      flags: {
        title: { help: "New title" },
        pattern: { help: "Pattern slug", multiple: true },
        element: { help: "Element slug", multiple: true },
        tag: { help: "Tag", multiple: true },
        ...textFlags,
        patch: { help: 'JSON patch, for nulls and empty lists: {"title":null,"tags":[]}' },
      },
      run: async ({ client, origin, positionals, values }) => {
        const patch = requireChanges({
          ...jsonPatch(values),
          ...defined({
            title: str(values, "title"),
            patterns: list(values, "pattern"),
            elements: list(values, "element"),
            tags: list(values, "tag"),
            text: await screenText(values),
          }),
        });
        const screen = await client().updateScreen(
          positionals[0]!,
          validated(updateScreenInputSchema, patch),
        );
        return screenDetailResult(origin, screen);
      },
    },
    delete: {
      summary: "Delete a screen you contributed. It leaves any flow it was in",
      args: ["id"],
      run: async ({ client, positionals }) => {
        await client().deleteScreen(positionals[0]!);
        return { deleted: true, id: positionals[0] };
      },
    },
    download: {
      summary: "Save a screen's image to a file. Prints where it went",
      args: ["id"],
      flags: {
        out: { help: "File to write. Default <id>.<ext> in this folder" },
        thumb: { help: "Get the thumbnail, not the full image", boolean: true },
        force: { help: "Replace an existing file", boolean: true },
      },
      run: downloadScreen,
    },
    bundle: {
      summary: "Save screens, their images and REFERENCES.md to a folder, in the order given",
      args: ["id"],
      optionalArgs: ["id..."],
      flags: bundleFlags,
      run: async (context) => {
        requireOut(context.values);
        const api = context.client();
        const items: BundleItem[] = [];
        for (const [position, id] of context.positionals.entries()) {
          items.push({ position, label: null, screen: await api.getScreen(id) });
        }
        return writeBundle(context, null, items);
      },
    },
  },
  flows: {
    search: {
      summary: "Search flows",
      optionalArgs: ["query"],
      flags: {
        ...query,
        platform: { help: "web, ios or android" },
        type: { help: "Flow type slug" },
        app: { help: "App slug" },
        ...paging,
      },
      run: async (context) => {
        const { values, client, origin } = context;
        const page = await client().listFlows({
          q: queryText(context),
          ...flagsOf(values, ["platform", "type", "app", "limit", "cursor"]),
        } as ListFlowsQuery);
        return {
          items: page.items.map((flow) => compactFlow(origin, flow)),
          nextCursor: page.nextCursor,
        };
      },
    },
    get: {
      summary: "Show one flow and its steps in order",
      args: ["id"],
      run: async ({ client, origin, positionals }) =>
        flowDetailResult(origin, await client().getFlow(positionals[0]!)),
    },
    bundle: {
      summary: "Save a flow, its step images and REFERENCES.md to a folder",
      args: ["id"],
      flags: bundleFlags,
      run: async (context) => {
        requireOut(context.values);
        const flow = await context.client().getFlow(context.positionals[0]!);
        const steps = flow.steps.slice().sort((a, b) => a.position - b.position);
        return writeBundle(context, flow, steps);
      },
    },
    create: {
      summary: "Create a flow from existing screens of one app",
      flags: {
        app: { help: "App slug (required)" },
        name: { help: "Flow name (required)" },
        type: { help: "Flow type slug" },
        description: { help: "Description" },
        step: {
          help: "<screenId> or <screenId>=<label>, at least twice, in order",
          multiple: true,
        },
        id: { help: "A UUID of your own, so repeating this command can't make a second flow" },
      },
      run: async ({ client, origin, values }) => {
        const slug = str(values, "app");
        if (!slug) throw usage("Pass --app <slug>");
        const api = client();
        // Generated here rather than left to the server, so an internal retry stays one flow.
        const input = validated(createFlowInputSchema.omit({ appId: true }), {
          id: str(values, "id") ?? randomUUID(),
          name: str(values, "name") ?? "",
          type: str(values, "type"),
          description: str(values, "description"),
          steps: parseSteps(values) ?? [],
        });
        const app = await api.getApp(slug);
        const { flow } = await api.createFlow({ ...input, appId: app.id });
        return createdFlowResult(origin, flow);
      },
    },
    update: {
      summary: "Edit a flow you contributed. --step replaces all of its steps",
      args: ["id"],
      flags: {
        name: { help: "New name" },
        type: { help: "Flow type slug" },
        description: { help: "New description" },
        step: { help: "<screenId> or <screenId>=<label>, in order", multiple: true },
        patch: { help: 'JSON patch, for nulls: {"type":null,"description":null}' },
      },
      run: async ({ client, origin, positionals, values }) => {
        const patch = requireChanges({
          ...jsonPatch(values),
          ...defined({
            name: str(values, "name"),
            type: str(values, "type"),
            description: str(values, "description"),
            steps: parseSteps(values),
          }),
        });
        const flow = await client().updateFlow(
          positionals[0]!,
          validated(updateFlowInputSchema, patch),
        );
        return flowDetailResult(origin, flow);
      },
    },
    delete: {
      summary: "Delete a flow you contributed. Its screens stay",
      args: ["id"],
      run: async ({ client, positionals }) => {
        await client().deleteFlow(positionals[0]!);
        return { deleted: true, id: positionals[0] };
      },
    },
  },
  upload: {
    summary: "Upload one image file or https URL as a screen",
    args: ["file|url"],
    flags: {
      app: { help: "Slug of an existing app" },
      "app-name": { help: "Name of the app, created if it's new" },
      "website-url": { help: "The app's website" },
      platform: { help: "web, ios or android. Default web" },
      category: { help: "Category slug" },
      title: { help: "Screen title" },
      "source-url": { help: "Page the screen shows" },
      pattern: {
        help: "Pattern slug. Suggested from the URL and title if omitted",
        multiple: true,
      },
      element: { help: "Element slug", multiple: true },
      tag: { help: "Tag", multiple: true },
      ...textFlags,
      "captured-at": { help: "When it was captured, ISO 8601" },
    },
    run: upload,
  },
  review: {
    list: {
      summary: "List pending screens or flows, oldest first. Admin only",
      flags: {
        kind: { help: "screen or flow (required)" },
        limit: { help: "Items per page, up to 50. Default 25" },
        cursor: paging.cursor,
      },
      run: async ({ values, client, origin }) => {
        const kind = kindFlag(values);
        if (!kind) throw usage("Pass --kind screen or --kind flow");
        const page = await client().reviewQueue({
          kind,
          ...flagsOf(values, ["limit", "cursor"]),
        } as ReviewQueueQuery & { kind: ReviewKind });
        return {
          kind: page.kind,
          items:
            page.kind === "screen"
              ? page.items.map((screen) => compactScreen(origin, screen))
              : page.items.map((flow) => compactFlow(origin, flow)),
          nextCursor: page.nextCursor,
        };
      },
    },
    show: {
      summary: "Show a screen or flow with its status. Admin only for others' pending items",
      args: ["id"],
      flags: {
        ...reviewKind,
        download: { help: "Also save the screen's image, as screens download does", boolean: true },
        out: { help: "File to write. Default <id>.<ext> in this folder" },
        force: { help: "Replace an existing file", boolean: true },
      },
      run: async (context) => {
        const { values, origin } = context;
        const id = context.positionals[0]!;
        const client = context.client();
        const found = await withKind(kindFlag(values), id, async (kind) =>
          kind === "screen"
            ? { kind, screen: await client.getScreen(id) }
            : { kind, flow: await client.getFlow(id) },
        );
        if (found.kind === "flow") {
          if (values.download) throw usage("--download saves a screen's image; a flow has none");
          return { kind: found.kind, ...flowDetailResult(origin, found.flow) };
        }
        return {
          kind: found.kind,
          ...screenDetailResult(origin, found.screen),
          ...(values.download ? { download: await saveImage(context, found.screen) } : {}),
        };
      },
    },
    approve: {
      summary:
        "Publish ids given as arguments or one per line on stdin. Safe to repeat. Admin only",
      optionalArgs: ["id..."],
      flags: reviewKind,
      run: (context) => decide(context, "approve"),
    },
    reject: {
      summary: "Reject ids given as arguments or one per line on stdin. Safe to repeat. Admin only",
      optionalArgs: ["id..."],
      flags: {
        ...reviewKind,
        reason: { help: "Why, kept with each item. Up to 500 characters" },
      },
      run: (context) => decide(context, "reject"),
    },
  },
  manifest: {
    validate: {
      summary: "Check a manifest and its local files, without the network. Needs no key",
      args: ["path"],
      run: async ({ positionals }) => {
        const { validateManifest } = await import("./publish");
        const result = await validateManifest(positionals[0]!);
        if (result.ok) return result;
        throw new PartialFailure(
          result,
          "invalid_manifest",
          result.issues.map((issue) => `${issue.localId}: ${issue.message}`).join("; "),
        );
      },
    },
    publish: {
      summary: "Publish a manifest. Safe to repeat, also after a crash or an edit",
      args: ["path"],
      flags: { "batch-size": { help: "Screens per request, up to 50. Default as many as fit" } },
      run: publish,
    },
  },
};

const GLOBAL_FLAGS = `Global flags:
  --url <origin>     Screen Commons instance [SCREEN_COMMONS_URL] (default: the profile's, then http://localhost:5173)
  --api-key <sc_…>   API key [SCREEN_COMMONS_API_KEY]. Prefer the variable: flags show up in ps
  --profile <name>   Login saved by screen-commons login [SCREEN_COMMONS_PROFILE] (default "default")
  --json             JSON from login, logout, profiles and doctor too
  --help             Show help for any command
A flag wins over its variable, and both over the profile. A profile's key only goes to its own URL.
`;

const EXIT_HELP = `Exit codes:
  0  Success
  1  Failed, including a publish or review where any item failed (see its JSON output) or a failed doctor check
  2  Bad input: usage, manifest, image, profiles file or a request the server refuses as invalid
  3  No API key, a rejected one, not allowed, or a login that was denied or expired
  4  Not found
  5  Unreachable or rate limited; retried already, so try again later
`;

const OUTPUT_HELP = `Output: JSON on stdout, with "schemaVersion": ${SCHEMA_VERSION}. login, logout, profiles and doctor
print text unless --json; login --json prints one line when it starts waiting and one when it's
done. Errors are one "code: message" line on stderr.
review approve and review reject print one JSON line per id as they go, one id per 300 ms.
A result of unchanged means the item already had that decision.
`;

function commandHelp(path: string[], command: Command): string {
  const args = [
    ...(command.args ?? []).map((arg) => `<${arg}>`),
    ...(command.optionalArgs ?? []).map((arg) => `[${arg}]`),
  ];
  const flags = Object.entries(command.flags ?? {});
  const width = Math.max(0, ...flags.map(([name]) => name.length));
  return [
    `${command.summary}\n`,
    `Usage: screen-commons ${[...path, ...args].join(" ")}${flags.length ? " [flags]" : ""}\n`,
    ...(flags.length
      ? [
          "Flags:",
          ...flags.map(
            ([name, flag]) =>
              `  --${name.padEnd(width)}  ${flag.help}${flag.multiple ? " (repeatable)" : ""}`,
          ),
          "",
        ]
      : []),
    GLOBAL_FLAGS,
  ].join("\n");
}

function groupHelp(name: string, group: Record<string, Command>): string {
  const width = Math.max(...Object.keys(group).map((item) => item.length));
  return [
    `Usage: screen-commons ${name} <command>\n`,
    "Commands:",
    ...Object.entries(group).map(
      ([item, command]) => `  ${item.padEnd(width)}  ${command.summary}`,
    ),
    `\nRun "screen-commons ${name} <command> --help" for its flags.\n`,
  ].join("\n");
}

function rootHelp(): string {
  const entries = Object.entries(COMMANDS).flatMap(([name, node]) =>
    isCommand(node)
      ? [[name, node.summary] as const]
      : Object.entries(node).map(
          ([item, command]) => [`${name} ${item}`, command.summary] as const,
        ),
  );
  const width = Math.max(...entries.map(([name]) => name.length));
  return [
    `screen-commons ${version}: manage a Screen Commons catalog from scripts and agents. Never prompts.\n`,
    "Usage: screen-commons <command> [flags]\n",
    "Commands:",
    ...entries.map(([name, summary]) => `  ${name.padEnd(width)}  ${summary}`),
    "",
    GLOBAL_FLAGS,
    OUTPUT_HELP,
    EXIT_HELP,
  ].join("\n");
}

const GLOBAL_OPTIONS = {
  url: { type: "string" },
  "api-key": { type: "string" },
  profile: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} satisfies Options;
const GLOBAL_VALUE_FLAGS = ["--url", "--api-key", "--profile"];
const GLOBAL_SWITCHES = ["--help", "-h", "--version", "--json"];

/** Finds the command words, which may have global flags before or between them. */
function locate(argv: string[]) {
  const rest: string[] = [];
  const path: string[] = [];
  let node: Command | Record<string, Command> | Tree | undefined = COMMANDS;
  let index = 0;
  for (; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (GLOBAL_VALUE_FLAGS.includes(arg)) {
      rest.push(arg, argv[(index += 1)] ?? "");
    } else if (GLOBAL_VALUE_FLAGS.some((flag) => arg.startsWith(`${flag}=`))) {
      rest.push(arg);
    } else if (GLOBAL_SWITCHES.includes(arg)) {
      rest.push(arg);
    } else if (arg.startsWith("-") || !node || isCommand(node as Command)) {
      break;
    } else {
      const child: Command | Record<string, Command> | undefined = (
        node as Record<string, Command | Record<string, Command>>
      )[arg];
      if (!child) {
        throw usage(`Unknown command "${[...path, arg].join(" ")}"; see screen-commons --help`);
      }
      path.push(arg);
      node = child;
    }
  }
  return { path, node, argv: [...rest, ...argv.slice(index)] };
}

function secretsIn(argv: string[]): string[] {
  return argv.flatMap((arg, index) => {
    if (arg === "--api-key") return argv[index + 1] ? [argv[index + 1]!] : [];
    return arg.startsWith("--api-key=") ? [arg.slice("--api-key=".length)] : [];
  });
}

async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const secrets = [...secretsIn(argv), env.SCREEN_COMMONS_API_KEY]
    .map((secret) => secret?.trim())
    .filter((secret): secret is string => Boolean(secret));
  const redact = (value: string) =>
    secrets
      .filter((secret) => secret.length >= 8)
      .reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value);
  const print = (text: string) => process.stdout.write(redact(text));
  let wantsJson = false;
  let jsonLines = false;
  const json = (value: object) =>
    `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...value }, null, jsonLines ? undefined : 2)}\n`;
  const show = (result: object) =>
    print(
      !(result instanceof Readable) ? json(result) : wantsJson ? json(result.json) : result.text,
    );

  let origin: string | undefined;
  try {
    const { path, node, argv: rest } = locate(argv);
    if (rest.includes("--version")) {
      print(`${version}\n`);
      return 0;
    }
    const wantsHelp = rest.includes("--help") || rest.includes("-h");
    if (path.length === 0) {
      if (wantsHelp) {
        print(rootHelp());
        return 0;
      }
      throw usage("Missing command; see screen-commons --help");
    }
    if (!isCommand(node as Command)) {
      const group = node as Record<string, Command>;
      if (wantsHelp) {
        print(groupHelp(path[0]!, group));
        return 0;
      }
      throw usage(`${path[0]} needs one of: ${Object.keys(group).join(", ")}`);
    }
    const command = node as Command;
    if (wantsHelp) {
      print(commandHelp(path, command));
      return 0;
    }

    const options: Options = { ...GLOBAL_OPTIONS };
    for (const [name, flag] of Object.entries(command.flags ?? {})) {
      options[name] = {
        type: flag.boolean ? "boolean" : "string",
        ...(flag.multiple ? { multiple: true } : {}),
      };
    }
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options, allowPositionals: true, strict: true });
    } catch (error) {
      throw usage(`${(error as Error).message.split("\n")[0]}`);
    }
    const { values, positionals } = parsed;
    const required = command.args?.length ?? 0;
    const allowed = command.optionalArgs ? Infinity : required;
    if (positionals.length < required || positionals.length > allowed) {
      throw usage(
        `Usage: screen-commons ${path.join(" ")} ${(command.args ?? []).map((arg) => `<${arg}>`).join(" ")}`.trim(),
      );
    }

    let profile: ProfileSelection;
    try {
      profile = await selectProfile(values.profile as string | undefined, env);
    } catch (error) {
      throw new CodedError("invalid_profiles", (error as Error).message);
    }
    if (profile.saved) secrets.push(profile.saved.apiKey);
    let instance: Instance;
    try {
      instance = resolveInstance(
        { url: values.url as string | undefined, apiKey: values["api-key"] as string | undefined },
        env,
        profile.saved,
      );
    } catch (error) {
      throw usage((error as Error).message);
    }
    if (instance.apiKey) secrets.push(instance.apiKey);
    origin = instance.url;

    wantsJson = values.json === true;
    const doFetch = retryingFetch({ readBody: true });
    const headers = { "x-screen-commons-client": `screen-commons-cli/${version}` };
    const connect = (url: string, apiKey?: string) =>
      createScreenCommonsClient({ baseUrl: url, apiKey, fetch: doFetch, headers });
    const context: Context = {
      values: values as Values,
      positionals,
      origin: instance.url,
      apiKey: instance.apiKey,
      instance,
      profile,
      download: doFetch,
      sourceFetch: retryingFetch({ fetch: imageFetchFor(instance.url) }),
      connect,
      anonymousClient: () => connect(instance.url),
      client: () => {
        if (!instance.apiKey) {
          throw new CodedError(
            "missing_api_key",
            `No API key for ${instance.url}. Run screen-commons login --url ${instance.url}${forProfile(profile)}, or set SCREEN_COMMONS_API_KEY`,
          );
        }
        return connect(instance.url, instance.apiKey);
      },
      printLine: (line) => {
        jsonLines = true;
        show(line);
      },
      addSecret: (secret) => secrets.push(secret),
    };
    const result = await command.run(context);
    if (result !== undefined) show(result);
    return 0;
  } catch (error) {
    if (error instanceof PartialFailure) show(error.report);
    const { code, message } = errorInfo(error, origin);
    process.stderr.write(redact(`${code}: ${message.replace(/\s*\n\s*/gu, " ")}\n`));
    return EXIT_CODES[code] ?? 1;
  }
}

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  // A reader such as `head` that has seen enough isn't a failure.
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

// Set rather than exiting, so a large report on a pipe still flushes.
process.exitCode = await main(process.argv.slice(2));
