import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makePreview, prepareScreen } from "@screen-commons/capture";
import {
  TAXONOMY,
  base64ToBytes,
  catalogTools,
  labelFor,
  readImageHeader,
  type AppSummary,
  type CatalogToolName,
  type FlowSummary,
  type ScreenCommonsClient,
  type Screen,
} from "@screen-commons/core";
import type { z } from "zod";

import {
  FriendlyError,
  absoluteUrl,
  failure,
  image,
  ok,
  text,
  type Content,
  type ToolResult,
} from "./util";

export interface CatalogContext {
  baseUrl: string;
  apiKey: string | undefined;
  client: ScreenCommonsClient;
  fetch: typeof fetch;
}

const MAX_INLINE_IMAGE_BYTES = 3.5 * 1024 * 1024;

function requireKey(context: CatalogContext) {
  if (!context.apiKey) {
    throw new FriendlyError(
      `SCREEN_COMMONS_API_KEY is not set. Create an API key at ${context.baseUrl}/settings (API keys) and add it to the screen-commons-mcp server env, e.g. "env": { "SCREEN_COMMONS_API_KEY": "sc_…" }.`,
    );
  }
}

function screenLine(context: CatalogContext, screen: Screen): string {
  const patterns = screen.patterns.map(labelFor).join(", ") || "untagged";
  return `- ${screen.id} · ${screen.app.name} · ${screen.title ?? "(untitled)"} · [${patterns}] · ${screen.width}×${screen.height} · thumb ${absoluteUrl(context.baseUrl, screen.thumbUrl)}`;
}

function flowLine(context: CatalogContext, flow: FlowSummary): string {
  return `- ${flow.id} · ${flow.app.name} · ${flow.name}${flow.type ? ` (${labelFor(flow.type)})` : ""} · ${flow.stepCount} steps · ${context.baseUrl}/flows/${flow.id}`;
}

function appLine(context: CatalogContext, app: AppSummary): string {
  return `- ${app.slug} · ${app.name}${app.tagline ? ` — ${app.tagline}` : ""} · ${app.platform}${app.category ? ` · ${labelFor(app.category)}` : ""} · ${app.screenCount} screens, ${app.flowCount} flows · ${context.baseUrl}/apps/${app.slug}`;
}

const more = (cursor: string | null) => (cursor ? `\nMore results: pass cursor "${cursor}".` : "");

/** Download an image from the instance and return it as MCP image content (downscaled if huge). */
export async function fetchImageContent(
  context: CatalogContext,
  url: string,
): Promise<{ content: Content; note?: string }> {
  const absolute = absoluteUrl(context.baseUrl, url)!;
  const response = await context.fetch(absolute, {
    headers: context.apiKey ? { authorization: `Bearer ${context.apiKey}` } : {},
  });
  if (!response.ok)
    throw new FriendlyError(`Could not download image ${absolute} (HTTP ${response.status}).`);
  let bytes: Buffer = Buffer.from(await response.arrayBuffer());
  const header = readImageHeader(bytes);
  let type: string =
    header?.type ?? response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  let note: string | undefined;
  if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES || (header && header.height > 7800)) {
    const preview = await makePreview(bytes, { maxWidth: 1600, maxBytes: MAX_INLINE_IMAGE_BYTES });
    bytes = preview.buffer;
    type = preview.type;
    note = `Image downscaled to ${preview.width}×${preview.height}${preview.truncated ? " (top portion)" : ""} to fit the context window; original: ${absolute}`;
  }
  return { content: image(bytes, type), note };
}

type Handler<T> = (args: T, extra: unknown) => Promise<ToolResult>;
type Args<K extends CatalogToolName> = z.output<(typeof catalogTools)[K]["input"]>;

export function registerCatalogTools(server: McpServer, context: CatalogContext) {
  const wrap =
    <T>(handler: Handler<T>): Handler<T> =>
    async (args, extra) => {
      try {
        return await handler(args, extra);
      } catch (error) {
        return failure(error, { url: context.baseUrl });
      }
    };
  const register = <K extends CatalogToolName>(name: K, handler: Handler<Args<K>>) => {
    const spec = catalogTools[name];
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.input,
        annotations: { title: spec.title, readOnlyHint: spec.readOnly, openWorldHint: true },
      },
      wrap(handler) as never,
    );
  };
  const { client } = context;

  register("search_screens", async (args) => {
    requireKey(context);
    const page = await client.listScreens({
      q: args.query,
      platform: args.platform,
      pattern: args.pattern,
      element: args.element,
      app: args.app,
      limit: args.limit,
      cursor: args.cursor,
    });
    if (page.items.length === 0)
      return ok(
        text("No screens matched. Try a broader query or check get_taxonomy for valid filters."),
      );
    return ok(
      text(
        `${page.items.length} screens (use get_screen with an id to see one):\n${page.items.map((screen) => screenLine(context, screen)).join("\n")}${more(page.nextCursor)}`,
      ),
    );
  });

  register("search_flows", async (args) => {
    requireKey(context);
    const page = await client.listFlows({
      q: args.query,
      platform: args.platform,
      type: args.type,
      app: args.app,
      limit: args.limit,
      cursor: args.cursor,
    });
    if (page.items.length === 0) return ok(text("No flows matched."));
    return ok(
      text(
        `${page.items.length} flows (use get_flow for steps):\n${page.items.map((flow) => flowLine(context, flow)).join("\n")}${more(page.nextCursor)}`,
      ),
    );
  });

  register("list_apps", async (args) => {
    requireKey(context);
    const page = await client.listApps({
      q: args.query,
      platform: args.platform,
      category: args.category,
      sort: args.sort,
      limit: args.limit,
      cursor: args.cursor,
    });
    if (page.items.length === 0) return ok(text("No apps matched."));
    return ok(
      text(
        `${page.items.length} apps:\n${page.items.map((app) => appLine(context, app)).join("\n")}${more(page.nextCursor)}`,
      ),
    );
  });

  register("get_app", async (args) => {
    requireKey(context);
    const app = await client.getApp(args.slug);
    const lines = [
      `${app.name} (${app.slug}) — ${app.platform}${app.category ? `, ${labelFor(app.category)}` : ""}`,
      app.tagline ?? "",
      app.description ?? "",
      `Website: ${app.websiteUrl ?? "n/a"} · ${app.screenCount} screens · ${app.flowCount} flows · ${context.baseUrl}/apps/${app.slug}`,
      app.versions.length ? `Versions: ${app.versions.join(", ")}` : "",
      app.patterns.length
        ? `Patterns: ${app.patterns.map((entry) => `${labelFor(entry.slug)} (${entry.count})`).join(", ")}`
        : "",
      app.elements.length
        ? `Elements: ${app.elements.map((entry) => `${labelFor(entry.slug)} (${entry.count})`).join(", ")}`
        : "",
      "Use search_screens with app=" + app.slug + " to list its screens.",
    ].filter(Boolean);
    return ok(text(lines.join("\n")));
  });

  register("get_screen", async (args) => {
    requireKey(context);
    const screen = await client.getScreen(args.id);
    const { content, note } = await fetchImageContent(
      context,
      args.full ? screen.imageUrl : screen.thumbUrl,
    );
    const summary = [
      `Screen ${screen.id} · ${screen.app.name} (${screen.app.slug}) · ${screen.title ?? "(untitled)"}`,
      `Patterns: ${screen.patterns.map(labelFor).join(", ") || "none"} · Elements: ${screen.elements.map(labelFor).join(", ") || "none"}`,
      `${screen.width}×${screen.height} · version ${screen.version ?? "n/a"} · source ${screen.sourceUrl ?? "n/a"}`,
      `View: ${context.baseUrl}/screens/${screen.id} · full image: ${absoluteUrl(context.baseUrl, screen.imageUrl)}`,
      screen.flows.length
        ? `In flows: ${screen.flows.map((flow) => `${flow.name} (${flow.id}, step ${flow.position + 1})`).join(", ")}`
        : "",
      screen.previousId || screen.nextId
        ? `Neighbours: previous ${screen.previousId ?? "none"}, next ${screen.nextId ?? "none"}`
        : "",
      args.full ? "" : "Showing the thumbnail; call again with full=true for full resolution.",
      note ?? "",
    ].filter(Boolean);
    return ok(text(summary.join("\n")), content);
  });

  register("get_flow", async (args) => {
    requireKey(context);
    const flow = await client.getFlow(args.id);
    const header = `${flow.name} · ${flow.app.name}${flow.type ? ` · ${labelFor(flow.type)}` : ""} · ${flow.steps.length} steps · ${context.baseUrl}/flows/${flow.id}${flow.description ? `\n${flow.description}` : ""}`;
    const steps = flow.steps
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(
        (step, index) =>
          `${index + 1}. ${step.label ?? step.screen.title ?? "(untitled)"} — screen ${step.screen.id} [${step.screen.patterns.map(labelFor).join(", ")}]`,
      );
    const content: Content[] = [text(`${header}\n${steps.join("\n")}`)];
    if (args.includeImages) {
      const sorted = flow.steps
        .slice()
        .sort((a, b) => a.position - b.position)
        .slice(0, 20);
      const images = await Promise.all(
        sorted.map((step) => fetchImageContent(context, step.screen.thumbUrl).catch(() => null)),
      );
      sorted.forEach((step, index) => {
        const entry = images[index];
        if (!entry) return;
        content.push(
          text(`Step ${index + 1}: ${step.label ?? step.screen.title ?? step.screen.id}`),
          entry.content,
        );
      });
    }
    return ok(...content);
  });

  register("get_taxonomy", async () => {
    let taxonomy: unknown = TAXONOMY;
    let source = "built-in";
    if (context.apiKey) {
      try {
        taxonomy = await client.taxonomy();
        source = context.baseUrl;
      } catch {
        // fall back to the bundled taxonomy (same contract)
      }
    }
    return ok(
      text(
        `Screen Commons taxonomy (${source}). Use the slugs as filter values.\n${JSON.stringify(taxonomy)}`,
      ),
    );
  });

  register("upload_screen", async (args) => {
    requireKey(context);
    const bytes = Buffer.from(base64ToBytes(args.image.base64.replace(/^data:[^,]+,/u, "")));
    // Typed by its bytes: a mislabelled image.type (common from models) is noted, not fatal.
    const header = readImageHeader(bytes);
    if (!header) throw new FriendlyError("image.base64 is not a valid PNG, JPEG or WebP image.");
    const note =
      header.type === args.image.type
        ? ""
        : ` (image.type said ${args.image.type}, but the bytes are ${header.type}; uploaded as ${header.type})`;
    const viewport = args.app.platform && args.app.platform !== "web" ? "mobile" : "desktop";
    const { screen } = await prepareScreen({
      png: bytes,
      sourceUrl: args.sourceUrl,
      title: args.title,
      viewport,
      patterns: args.patterns.length ? args.patterns : undefined,
      elements: args.elements,
    });
    const result = await client.captures({ app: args.app, screens: [screen], source: "mcp" });
    const created = result.screens[0];
    return ok(
      text(
        `Uploaded to ${result.app.name}: ${absoluteUrl(context.baseUrl, created?.url)} (status ${created?.status})${note}. ${created?.status === "pending" ? "It will appear after an admin approves it." : ""}`.trim(),
      ),
    );
  });

  register("create_flow", async (args) => {
    requireKey(context);
    const { flow } = await client.createFlow(args);
    return ok(
      text(
        `Created flow "${flow.name}" with ${flow.steps.length} steps: ${context.baseUrl}/flows/${flow.id} (status ${flow.status}).`,
      ),
    );
  });
}
