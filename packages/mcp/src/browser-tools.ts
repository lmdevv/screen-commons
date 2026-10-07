import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  crawl,
  fetchLogo,
  makePreview,
  prepareScreen,
  uploadCaptures,
  type PreparedScreen,
} from "@open-ui/capture";
import {
  appNameFromUrl,
  browserTools,
  captureBatchInputSchema,
  labelFor,
  slugify,
  type BrowserToolName,
  type CaptureBatchInput,
  type OpenUiClient,
} from "@open-ui/core";
import type { z } from "zod";

import type { DriverManager, PageCapture } from "./drivers";
import {
  FriendlyError,
  absoluteUrl,
  failure,
  image,
  mapLimit,
  ok,
  reportProgress,
  text,
  type Content,
  type ToolResult,
} from "./util";

export interface BrowserContext {
  baseUrl: string;
  apiKey: string | undefined;
  client: OpenUiClient;
  drivers: DriverManager;
  outputDir: string;
  bridge: { port: number | null; enabled: boolean };
}

type Args<K extends BrowserToolName> = z.output<(typeof browserTools)[K]["input"]>;
type Handler<T> = (args: T, extra: unknown) => Promise<ToolResult>;

const extensionFor = (type: string) =>
  type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";

async function saveImage(dir: string, url: string, bytes: Buffer, type: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  let stem = "capture";
  try {
    const parsed = new URL(url);
    stem =
      slugify(`${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`) || "capture";
  } catch {
    // keep default
  }
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const path = join(dir, `${stem}-${stamp}.${extensionFor(type)}`);
  await writeFile(path, bytes);
  return path;
}

export function registerBrowserTools(server: McpServer, context: BrowserContext) {
  const register = <K extends BrowserToolName>(name: K, handler: Handler<Args<K>>) => {
    const spec = browserTools[name];
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.input,
        annotations: { title: spec.title, readOnlyHint: spec.readOnly, openWorldHint: true },
      },
      (async (args: Args<K>, extra: unknown) => {
        try {
          return await handler(args, extra);
        } catch (error) {
          return failure(error, { url: context.baseUrl });
        }
      }) as never,
    );
  };
  const { drivers } = context;

  register("browser_status", async () => {
    const driver = drivers.active();
    const info = drivers.bridge?.clientInfo ?? null;
    const lines = [
      `Active driver: ${driver.kind}${driver.kind === "extension" ? " (the user's real browser)" : " (local headless Chromium)"}`,
      context.bridge.enabled
        ? `Extension bridge: ws://127.0.0.1:${context.bridge.port ?? "?"} · ${info ? `connected (${info.name} ${info.version}, ${info.browser}, since ${info.connectedAt})` : "no extension connected"}`
        : "Extension bridge: disabled",
      `Headless: ${drivers.headless.launched ? "running" : "not started (launches on first use)"} · executable ${drivers.headless.executablePath ?? "not found — set CHROME_PATH"}`,
      `Open UI: ${context.baseUrl} · API key ${context.apiKey ? "set" : "missing (catalog + upload tools need OPEN_UI_API_KEY)"}`,
    ];
    if (driver.kind === "extension" || drivers.headless.launched) {
      const tabs = await driver.listTabs().catch(() => []);
      if (tabs.length) {
        lines.push(
          "Tabs:",
          ...tabs.map(
            (tab) =>
              `- ${tab.active ? "* " : ""}[${tab.id}] ${tab.title || "(untitled)"} — ${tab.url}`,
          ),
        );
      }
    }
    return ok(text(lines.join("\n")));
  });

  register("browser_navigate", async (args) => {
    const driver = drivers.active();
    const result = await driver.navigate(args.url, {
      viewport: args.viewport,
      newTab: args.newTab,
    });
    return ok(
      text(
        `Opened ${result.url} — "${result.title}" (${driver.kind}${result.tabId !== undefined ? `, tab ${result.tabId}` : ""}). Use browser_screenshot or browser_extract next.`,
      ),
    );
  });

  register("browser_screenshot", async (args) => {
    const driver = drivers.active();
    const shot = await driver.screenshot({ fullPage: args.fullPage, selector: args.selector });
    const path = await saveImage(context.outputDir, shot.url, shot.image, shot.type);
    const preview = await makePreview(shot.image);
    const notes = [
      `${shot.width}×${shot.height} ${args.selector ? `element "${args.selector}"` : args.fullPage ? "full-page" : "viewport"} screenshot of ${shot.url} ("${shot.title}") via ${driver.kind}.`,
      `Full-resolution image saved to ${path}.`,
      preview.width !== shot.width || preview.truncated
        ? `Preview scaled to ${preview.width}×${preview.height}${preview.truncated ? " (top portion of a tall page)" : ""}.`
        : "",
    ].filter(Boolean);
    return ok(image(preview.buffer, preview.type), text(notes.join(" ")));
  });

  register("browser_extract", async () => {
    const metadata = await drivers.active().extract();
    const links = metadata.links.slice(0, 200);
    const summary = { ...metadata, links, linkCount: metadata.links.length };
    return ok(text(JSON.stringify(summary, null, 2)));
  });

  register("site_crawl", async (args, extra) => {
    const driver = drivers.active();
    const visitor = driver.crawlVisitor();
    let seen = 0;
    try {
      const pages = await crawl(args.url, {
        maxPages: args.maxPages,
        maxDepth: args.maxDepth,
        include: args.include,
        exclude: args.exclude,
        visit: visitor.visit,
        fallbackVisit: visitor.fallbackVisit,
        onPage: (page) => {
          seen += 1;
          void reportProgress(extra, seen, args.maxPages, page.url);
        },
      });
      if (pages.length === 0) {
        throw new FriendlyError(
          `Could not load ${args.url} or it has no crawlable same-site links.`,
        );
      }
      const lines = pages.map(
        (page) =>
          `- ${page.url} · ${page.title || "(untitled)"} · [${page.patterns.map(labelFor).join(", ")}]`,
      );
      return ok(
        text(
          `${pages.length} pages, best capture candidates first (canonical marketing pages, then deeper links):\n${lines.join("\n")}\n\nNext: pick the canonical pages (home, pricing, login, signup, docs, blog, changelog, about…) and call capture_pages with those urls.`,
        ),
      );
    } finally {
      await visitor.release?.();
    }
  });

  register("capture_pages", async (args, extra) => {
    if (args.upload && !context.apiKey) {
      throw new FriendlyError(
        `upload=true needs OPEN_UI_API_KEY. Create a key at ${context.baseUrl}/settings, or call capture_pages with upload=false to only capture locally.`,
      );
    }
    const driver = drivers.active();
    const total = args.urls.length;
    let done = 0;
    const failures: { url: string; error: string }[] = [];
    const captured = await mapLimit(args.urls, driver.concurrency, async (url) => {
      try {
        const page: PageCapture = await driver.capture(url, {
          viewport: args.viewport,
          fullPage: args.fullPage,
        });
        const prepared = await prepareScreen({
          png: page.image,
          sourceUrl: page.url,
          title: page.title,
          viewport: args.viewport,
          text: page.text,
        });
        if (args.flow) {
          const pattern = prepared.screen.patterns?.[0];
          prepared.screen.stepLabel = (pattern ? labelFor(pattern) : page.title || "Step").slice(
            0,
            80,
          );
        }
        return { page, prepared };
      } catch (error) {
        failures.push({ url, error: error instanceof Error ? error.message : String(error) });
        return null;
      } finally {
        done += 1;
        await reportProgress(extra, done, total + (args.upload ? 1 : 0), `captured ${url}`);
      }
    });
    const results = captured.filter(
      (entry): entry is { page: PageCapture; prepared: PreparedScreen } => entry !== null,
    );
    const failureText = failures.length
      ? `\nFailed (${failures.length}):\n${failures.map((failure) => `- ${failure.url}: ${failure.error}`).join("\n")}`
      : "";
    if (results.length === 0) throw new FriendlyError(`No page could be captured.${failureText}`);

    const first = results[0]!.page;
    const firstUrl = new URL(first.url);
    const siteName = first.metadata.siteName?.trim();
    const appName = (
      args.app.name ??
      (siteName && siteName.length <= 40 ? siteName : appNameFromUrl(first.url, first.title))
    ).slice(0, 80);
    const websiteUrl = args.app.websiteUrl ?? firstUrl.origin;

    if (!args.upload) {
      const content: Content[] = [];
      const lines: string[] = [];
      for (const [index, { page, prepared }] of results.entries()) {
        const path = await saveImage(context.outputDir, page.url, page.image, page.type);
        lines.push(
          `${index + 1}. ${page.url} · "${page.title}" · [${(prepared.screen.patterns ?? []).map(labelFor).join(", ")}] · ${prepared.image.width}×${prepared.image.height} · saved ${path}`,
        );
        if (index < 12) content.push(image(prepared.thumbnail.buffer, prepared.thumbnail.type));
      }
      return ok(
        text(
          `Captured ${results.length}/${total} pages of ${appName} (${websiteUrl}) via ${driver.kind}, not uploaded:\n${lines.join("\n")}${failureText}\nThumbnails follow. Call again with upload=true to publish them.`,
        ),
        ...content,
      );
    }

    const logo = await fetchLogo(first.metadata).catch(() => undefined);
    const batch: CaptureBatchInput = {
      app: { name: appName, websiteUrl, platform: args.app.platform, category: args.app.category },
      logo: logo ? { type: logo.type, base64: logo.base64 } : undefined,
      screens: results.map((entry) => entry.prepared.screen),
      flow:
        args.flow && results.length >= 2
          ? { name: args.flow.name, type: args.flow.type }
          : undefined,
      source: "mcp",
    };
    const parsed = captureBatchInputSchema.safeParse(batch);
    if (!parsed.success) {
      throw new FriendlyError(
        `Capture batch failed validation: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
      );
    }
    const result = await uploadCaptures(context.client, batch);
    await reportProgress(extra, total + 1, total + 1, "uploaded");
    const pending = result.screens.some((screen) => screen.status === "pending");
    const lines = [
      `Uploaded ${result.screens.length} screens to ${result.app.name}: ${context.baseUrl}/apps/${result.app.slug}`,
      ...result.screens.map(
        (screen, index) =>
          `- ${results[index]?.page.url} → ${absoluteUrl(context.baseUrl, screen.url)} (${screen.status})`,
      ),
      result.flow
        ? `Flow "${args.flow?.name}": ${absoluteUrl(context.baseUrl, result.flow.url)} (${result.flow.status})`
        : "",
      args.flow && results.length < 2
        ? "Flow skipped: a flow needs at least 2 captured screens."
        : "",
      pending ? "Contributions are pending until an admin approves them in /review." : "",
    ].filter(Boolean);
    const content: Content[] = [text(`${lines.join("\n")}${failureText}`)];
    content.push(image(results[0]!.prepared.thumbnail.buffer, results[0]!.prepared.thumbnail.type));
    return ok(...content);
  });
}
