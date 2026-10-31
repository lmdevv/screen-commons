import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prepareScreen } from "@screen-commons/capture/screen";
import {
  LIMITS,
  ScreenCommonsApiError,
  captureManifestSchema,
  readImageHeader,
  thumbnailKindFor,
  type AppRef,
  type CaptureManifest,
  type CaptureScreen,
  type FlowDetail,
  type ManifestFlow,
  type ManifestScreen,
  type Screen,
  type ScreenCommonsClient,
  type Status,
  type UpdateFlowInput,
  type UpdateScreenInput,
} from "@screen-commons/core";

import { CodedError, errorInfo, type ErrorInfo } from "./errors";
import { mapLimit } from "./util";

const FLOW_ID_NAMESPACE = Buffer.from("9f1c6f0e8d3b4a57a1e2c47b6d05e3aa", "hex");
/** What a source may weigh before preparation shrinks it to `LIMITS.maxImageBytes`. */
const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
const MAX_SOURCE_REDIRECTS = 5;
const VALIDATE_CONCURRENCY = 8;

/** The flow's id for this manifest: a v5 UUID, so every publish names the same flow. */
export function flowIdFor(manifestId: string, flowLocalId: string): string {
  const name = JSON.stringify([manifestId, flowLocalId]);
  const hash = createHash("sha1").update(FLOW_ID_NAMESPACE).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseManifest(input: unknown): CaptureManifest {
  const parsed = captureManifestSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new CodedError(
    "invalid_manifest",
    parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`)
      .join("; "),
  );
}

export async function readManifest(path: string): Promise<CaptureManifest> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new CodedError(
      "invalid_manifest",
      `Can't read ${path}: ${(error as NodeJS.ErrnoException).code ?? "read failed"}`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new CodedError("invalid_manifest", `${path} isn't JSON: ${(error as Error).message}`);
  }
  return parseManifest(json);
}

async function readFileSource(baseDir: string, file: string): Promise<Buffer> {
  const path = resolve(baseDir, file);
  try {
    if ((await stat(path)).size > MAX_SOURCE_BYTES) {
      throw new CodedError("source_too_large", `${path} is over ${MAX_SOURCE_BYTES} bytes`);
    }
    return await readFile(path);
  } catch (error) {
    if (error instanceof CodedError) throw error;
    const reason = (error as NodeJS.ErrnoException).code ?? "read failed";
    throw new CodedError("source_unreadable", `Can't read ${path}: ${reason}`);
  }
}

/** Follows redirects by hand so a hop can't downgrade the https a manifest promises. */
async function fetchSource(url: string, doFetch: typeof fetch): Promise<Buffer> {
  let current = url;
  for (let hop = 0; hop <= MAX_SOURCE_REDIRECTS; hop += 1) {
    if (new URL(current).protocol !== "https:") {
      throw new CodedError("source_unreadable", `${url} redirects to non-https ${current}`);
    }
    const response = await doFetch(current, {
      redirect: "manual",
      headers: { accept: "image/*" },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined);
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CodedError("source_unreadable", `${current} answered HTTP ${response.status}`);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of response.body ?? []) {
      total += chunk.byteLength;
      if (total > MAX_SOURCE_BYTES) {
        throw new CodedError("source_too_large", `${current} is over ${MAX_SOURCE_BYTES} bytes`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new CodedError(
    "source_unreadable",
    `${url} redirects more than ${MAX_SOURCE_REDIRECTS} times`,
  );
}

async function loadSource(
  screen: ManifestScreen,
  baseDir: string,
  doFetch: typeof fetch,
): Promise<Buffer> {
  const bytes =
    "file" in screen.source
      ? await readFileSource(baseDir, screen.source.file)
      : await fetchSource(screen.source.url, doFetch).catch((error: unknown) => {
          const info = errorInfo(error);
          throw new CodedError(
            info.code === "internal" ? "source_unreadable" : info.code,
            info.message,
          );
        });
  if (!readImageHeader(bytes)) {
    throw new CodedError("invalid_image", "Not a complete, still PNG, JPEG or WebP image");
  }
  return bytes;
}

const normalizeTitle = (title: string | null | undefined) =>
  title?.replace(/\s+/gu, " ").trim().slice(0, 160) || null;

const sameSet = (left: readonly string[], right: readonly string[]) => {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((item) => b.has(item));
};

function screenPatch(
  screen: ManifestScreen,
  current: Pick<Screen, "title" | "patterns" | "elements" | "tags">,
): UpdateScreenInput | null {
  const patch: UpdateScreenInput = {};
  const title = normalizeTitle(screen.title);
  const tags = screen.tags ?? [];
  if (title !== current.title) patch.title = title;
  if (!sameSet(screen.patterns, current.patterns)) patch.patterns = screen.patterns;
  if (!sameSet(screen.elements, current.elements)) patch.elements = screen.elements;
  if (!sameSet(tags, current.tags)) patch.tags = tags;
  return Object.keys(patch).length > 0 ? patch : null;
}

type DesiredStep = { screenId: string; label?: string };

function flowPatch(
  flow: ManifestFlow,
  steps: DesiredStep[],
  current: FlowDetail,
): UpdateFlowInput | null {
  const patch: UpdateFlowInput = {};
  if (flow.name !== current.name) patch.name = flow.name;
  if ((flow.type ?? null) !== current.type) patch.type = flow.type ?? null;
  if ((flow.description ?? null) !== current.description) {
    patch.description = flow.description ?? null;
  }
  const sameSteps =
    steps.length === current.steps.length &&
    steps.every((step, index) => {
      const existing = current.steps[index]!;
      return existing.screen.id === step.screenId && existing.label === (step.label ?? null);
    });
  if (!sameSteps) patch.steps = steps;
  return Object.keys(patch).length > 0 ? patch : null;
}

export type ItemStatus = Status | "failed";

export interface ReportItem {
  localId: string;
  id: string | null;
  status: ItemStatus;
  url: string | null;
  error?: ErrorInfo;
  /** Something the catalog can't be made to match, which doesn't stop the item being usable. */
  warning?: string;
}

export interface PublishReport {
  ok: boolean;
  manifest: string;
  app: { id: string; slug: string; name: string; url: string } | null;
  screens: ReportItem[];
  flows: ReportItem[];
  /** A failure of the whole publish rather than of one item. */
  error?: ErrorInfo;
}

export interface PublishOptions {
  client: ScreenCommonsClient;
  /** What relative `source.file` paths resolve against. */
  baseDir: string;
  /** Fetches `source.url`; never given the API key. */
  fetch?: typeof fetch;
  batchSize?: number;
  maxBatchBytes?: number;
  onProgress?: (done: number, total: number, message: string) => void;
}

interface PendingScreen {
  item: ReportItem;
  prepared: CaptureScreen;
  bytes: number;
}

const fail = (item: ReportItem, error: ErrorInfo) => {
  item.status = "failed";
  item.error = error;
};

const decodedBytes = (base64: string) => Math.floor((base64.length * 3) / 4);

/** A batch refused for what's in it may hold one bad screen; send its screens one by one. */
const worthSplitting = (error: unknown) =>
  error instanceof ScreenCommonsApiError &&
  !["unauthorized", "forbidden", "rate_limited"].includes(error.code);

const stopsEverything = (error: unknown) =>
  error instanceof ScreenCommonsApiError && error.code === "unauthorized";

/**
 * Make the catalog match a manifest, from whatever is already there. Nothing is stored locally:
 * identical bytes in an app dedupe on the server and flow ids derive from the manifest, so a
 * repeat finds the same rows, and whatever differs from the manifest is then patched.
 */
export async function publishManifest(
  manifest: CaptureManifest,
  options: PublishOptions,
): Promise<PublishReport> {
  const { client, baseDir } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const batchSize = Math.min(options.batchSize ?? Infinity, LIMITS.maxScreensPerBatch);
  const maxBatchBytes = options.maxBatchBytes ?? LIMITS.maxBatchBytes;
  const viewport = thumbnailKindFor(manifest.app.platform);
  const total = manifest.screens.length + manifest.flows.length;
  const urlFor = (kind: "screens" | "flows", id: string) => `${client.baseUrl}/${kind}/${id}`;

  const report: PublishReport = {
    ok: false,
    manifest: manifest.id,
    app: null,
    screens: [],
    flows: [],
  };
  let app: AppRef | undefined;
  let fatal: ErrorInfo | undefined;
  let done = 0;
  const progress = (message: string) => options.onProgress?.(++done, total, message);

  const send = async (batch: PendingScreen[]): Promise<void> => {
    if (fatal) {
      for (const { item } of batch) fail(item, fatal);
      return;
    }
    try {
      const result = await client.captures({
        // Pinned once known, so a later batch can't resolve to a different app.
        app: app ? { ...manifest.app, slug: app.slug } : manifest.app,
        screens: batch.map((entry) => entry.prepared),
        source: "mcp",
      });
      app ??= result.app;
      for (const [index, { item }] of batch.entries()) {
        const screen = result.screens[index]!;
        item.id = screen.id;
        item.status = screen.status;
        item.url = urlFor("screens", screen.id);
      }
    } catch (error) {
      if (stopsEverything(error)) fatal = errorInfo(error, client.baseUrl);
      if (batch.length > 1 && worthSplitting(error) && !fatal) {
        for (const entry of batch) await send([entry]);
        return;
      }
      for (const { item } of batch) fail(item, errorInfo(error, client.baseUrl));
    }
  };

  let batch: PendingScreen[] = [];
  let batchBytes = 0;
  for (const screen of manifest.screens) {
    const item: ReportItem = { localId: screen.localId, id: null, status: "failed", url: null };
    report.screens.push(item);
    if (fatal) {
      fail(item, fatal);
      continue;
    }
    try {
      const bytes = await loadSource(screen, baseDir, doFetch);
      const { screen: prepared } = await prepareScreen({
        png: bytes,
        title: screen.title,
        sourceUrl: screen.sourceUrl,
        patterns: screen.patterns,
        elements: screen.elements,
        tags: screen.tags,
        capturedAt: screen.capturedAt,
        viewport,
      });
      const size = decodedBytes(prepared.image.base64) + decodedBytes(prepared.thumbnail.base64);
      if (batch.length > 0 && batchBytes + size > maxBatchBytes) {
        await send(batch);
        batch = [];
        batchBytes = 0;
      }
      batch.push({ item, prepared, bytes: size });
      batchBytes += size;
      if (batch.length >= batchSize) {
        await send(batch);
        batch = [];
        batchBytes = 0;
      }
    } catch (error) {
      fail(item, errorInfo(error));
    }
    progress(`screen ${screen.localId}`);
  }
  if (batch.length > 0) await send(batch);

  if (app) {
    report.app = {
      id: app.id,
      slug: app.slug,
      name: app.name,
      url: `${client.baseUrl}/apps/${app.slug}`,
    };
    await reconcileScreens(manifest, report, app, client, (error) => {
      fatal = error;
    });
  }

  const idOf = new Map(report.screens.map((item) => [item.localId, item]));
  for (const flow of manifest.flows) {
    const id = flowIdFor(manifest.id, flow.localId);
    const item: ReportItem = { localId: flow.localId, id, status: "failed", url: null };
    report.flows.push(item);
    const unavailable = flow.steps.filter((step) => !idOf.get(step.screen)?.id);
    if (unavailable.length > 0 || !app) {
      fail(item, {
        code: "screen_failed",
        message: `Needs screens that failed: ${[...new Set(unavailable.map((step) => step.screen))].join(", ")}`,
      });
      progress(`flow ${flow.localId}`);
      continue;
    }
    const steps = flow.steps.map((step) => ({
      screenId: idOf.get(step.screen)!.id!,
      label: step.label,
    }));
    try {
      const created = await client.createFlow({
        id,
        appId: app.id,
        name: flow.name,
        type: flow.type,
        description: flow.description,
        steps,
      });
      let current = created.flow;
      const patch = flowPatch(flow, steps, current);
      if (patch) current = await client.updateFlow(id, patch);
      item.status = current.status;
      item.url = urlFor("flows", id);
      if (current.status === "rejected") {
        fail(item, {
          code: "rejected",
          message: "A reviewer rejected this flow. Delete it or publish under a new manifest id.",
        });
      }
    } catch (error) {
      if (stopsEverything(error)) fatal = errorInfo(error, client.baseUrl);
      fail(item, errorInfo(error, client.baseUrl));
    }
    progress(`flow ${flow.localId}`);
  }

  if (fatal) report.error = fatal;
  report.ok =
    !report.error && [...report.screens, ...report.flows].every((item) => item.status !== "failed");
  return report;
}

/**
 * An upload that dedupes keeps the first upload's metadata, so an edited manifest needs a patch.
 * This reads through the list endpoint because reading one screen counts as a view, and a publish
 * shouldn't change popularity. Other people's pending screens aren't listed, and aren't editable.
 */
async function reconcileScreens(
  manifest: CaptureManifest,
  report: PublishReport,
  app: AppRef,
  client: ScreenCommonsClient,
  setFatal: (error: ErrorInfo) => void,
): Promise<void> {
  const claimed = new Map<string, ManifestScreen>();
  for (const [index, screen] of manifest.screens.entries()) {
    const item = report.screens[index]!;
    if (!item.id) continue;
    const first = claimed.get(item.id);
    if (!first) {
      claimed.set(item.id, screen);
    } else if (
      screenPatch(screen, {
        title: normalizeTitle(first.title),
        patterns: first.patterns,
        elements: first.elements,
        tags: first.tags ?? [],
      })
    ) {
      item.warning = `Same image as "${first.localId}", so its metadata applies`;
    }
  }

  const remaining = new Set(claimed.keys());
  const items = new Map(report.screens.map((item) => [item.id, item]));
  try {
    let cursor: string | undefined;
    do {
      const page = await client.listScreens({
        app: app.slug,
        limit: LIMITS.maxPageSize,
        cursor,
      });
      for (const current of page.items) {
        const screen = claimed.get(current.id);
        if (!screen) continue;
        remaining.delete(current.id);
        const item = items.get(current.id)!;
        if (screen.sourceUrl && screen.sourceUrl !== current.sourceUrl) {
          item.warning = "sourceUrl is fixed at first upload and differs from the manifest";
        }
        const patch = screenPatch(screen, current);
        if (!patch) continue;
        if (!current.owned) {
          item.warning = "Someone else contributed this image, so its metadata stays theirs";
          continue;
        }
        try {
          await client.updateScreen(current.id, patch);
        } catch (error) {
          for (const entry of report.screens) {
            if (entry.id === current.id) fail(entry, errorInfo(error, client.baseUrl));
          }
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor && remaining.size > 0);
  } catch (error) {
    setFatal(errorInfo(error, client.baseUrl));
  }
}

export interface ValidationResult {
  ok: boolean;
  id: string;
  screens: number;
  flows: { localId: string; id: string; steps: number }[];
  issues: { localId: string; code: string; message: string }[];
}

/** The manifest and its local files, without the network: URLs are only checked when published. */
export async function validateManifest(path: string): Promise<ValidationResult> {
  const manifest = await readManifest(path);
  const baseDir = dirname(resolve(path));
  const issues: ValidationResult["issues"] = [];
  await mapLimit(manifest.screens, VALIDATE_CONCURRENCY, async (screen) => {
    if (!("file" in screen.source)) return;
    try {
      await loadSource(screen, baseDir, globalThis.fetch);
    } catch (error) {
      issues.push({ localId: screen.localId, ...errorInfo(error) });
    }
  });
  return {
    ok: issues.length === 0,
    id: manifest.id,
    screens: manifest.screens.length,
    flows: manifest.flows.map((flow) => ({
      localId: flow.localId,
      id: flowIdFor(manifest.id, flow.localId),
      steps: flow.steps.length,
    })),
    issues,
  };
}

export async function publishManifestFile(
  path: string,
  options: Omit<PublishOptions, "baseDir">,
): Promise<PublishReport> {
  const manifest = await readManifest(path);
  return publishManifest(manifest, { ...options, baseDir: dirname(resolve(path)) });
}
