import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makePreview, prepareScreen } from "@screen-commons/capture";
import {
  TAXONOMY,
  base64ToBytes,
  catalogTools,
  compactApp,
  compactFlow,
  compactScreen,
  createdFlowResult,
  flowDetailResult,
  flowImageSteps,
  imageTypeNote,
  readImageHeader,
  screenDetailResult,
  toolErrorText,
  uploadResult,
  type CatalogToolName,
  type ScreenCommonsClient,
} from "@screen-commons/core";
import type { z } from "zod";

import {
  FriendlyError,
  absoluteUrl,
  failure,
  image,
  mapLimit,
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
const FLOW_IMAGE_CONCURRENCY = 4;

function requireKey(context: CatalogContext) {
  if (!context.apiKey) {
    throw new FriendlyError(
      `SCREEN_COMMONS_API_KEY is not set. Create an API key at ${context.baseUrl}/settings (API keys) and add it to the screen-commons-mcp server env, e.g. "env": { "SCREEN_COMMONS_API_KEY": "sc_…" }.`,
    );
  }
}

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
        annotations: { title: spec.title, readOnlyHint: spec.readOnly, openWorldHint: false },
      },
      wrap(handler) as never,
    );
  };
  const { client } = context;

  const json = (value: unknown) => ok(text(JSON.stringify(value)));
  const origin = context.baseUrl;

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
    return json({
      items: page.items.map((screen) => compactScreen(origin, screen)),
      nextCursor: page.nextCursor,
    });
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
    return json({
      items: page.items.map((flow) => compactFlow(origin, flow)),
      nextCursor: page.nextCursor,
    });
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
    return json({
      items: page.items.map((app) => compactApp(origin, app)),
      nextCursor: page.nextCursor,
    });
  });

  register("get_app", async (args) => {
    requireKey(context);
    return json(compactApp(origin, await client.getApp(args.slug)));
  });

  register("get_screen", async (args) => {
    requireKey(context);
    const screen = await client.getScreen(args.id);
    const { content, note } = await fetchImageContent(
      context,
      args.full ? screen.imageUrl : screen.thumbUrl,
    );
    return ok(
      text(JSON.stringify({ ...screenDetailResult(origin, screen), ...(note ? { note } : {}) })),
      content,
    );
  });

  register("get_flow", async (args) => {
    requireKey(context);
    const flow = await client.getFlow(args.id);
    if (!args.includeImages) return json(flowDetailResult(origin, flow));
    const steps = flowImageSteps(flow);
    const images = await mapLimit(steps, FLOW_IMAGE_CONCURRENCY, (step) =>
      fetchImageContent(context, step.screen.thumbUrl).catch(() => null),
    );
    const positions = steps.flatMap((step, index) => (images[index] ? [step.position] : []));
    return ok(
      text(JSON.stringify(flowDetailResult(origin, flow, positions))),
      ...images.flatMap((entry) => (entry ? [entry.content] : [])),
    );
  });

  register("get_taxonomy", async () => {
    // Without a key, the bundled copy of the same contract.
    const taxonomy = context.apiKey ? await client.taxonomy().catch(() => TAXONOMY) : TAXONOMY;
    return json(taxonomy);
  });

  register("upload_screen", async (args) => {
    requireKey(context);
    let bytes: Buffer;
    try {
      bytes = Buffer.from(base64ToBytes(args.image.base64.replace(/^data:[^,]+,/u, "")));
    } catch {
      throw new FriendlyError(toolErrorText("bad_request", "screens[0].image is not valid base64"));
    }
    const header = readImageHeader(bytes);
    if (!header) {
      throw new FriendlyError(
        toolErrorText(
          "unsupported_media_type",
          "screens[0].image must be a complete, still PNG, JPEG or WebP image",
        ),
      );
    }
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
    return json(uploadResult(origin, result, imageTypeNote(args.image)));
  });

  register("create_flow", async (args) => {
    requireKey(context);
    const { flow } = await client.createFlow(args);
    return json(createdFlowResult(origin, flow));
  });
}
