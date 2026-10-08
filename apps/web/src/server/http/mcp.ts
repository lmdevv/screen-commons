import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  LIMITS,
  bytesToBase64,
  catalogTools,
  type CatalogToolName,
  type FlowSummary,
  type Screen,
} from "@screen-commons/core";
import type { z } from "zod";

import { appOrigin } from "../env";
import { toServiceError, unauthorized } from "../errors";
import { getPrincipal, type Principal } from "../principal";
import * as services from "../services";
import { ALLOW_ANY_ORIGIN, preflightResponse } from "./cors";
import { bodyTooLarge, declaredTooLarge } from "./limits";
import { readMedia } from "./media";
import { errorResponse } from "./responses";

type Args<N extends CatalogToolName> = z.output<(typeof catalogTools)[N]["input"]>;
type Handler<N extends CatalogToolName> = (args: Args<N>) => Promise<CallToolResult>;

const MEDIA_PREFIX = "/media/";

function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

async function imageContent(url: string): Promise<CallToolResult["content"][number] | null> {
  if (!url.startsWith(MEDIA_PREFIX)) return null;
  const media = await readMedia(url.slice(MEDIA_PREFIX.length));
  if (!media) return null;
  return { type: "image", data: bytesToBase64(media.bytes), mimeType: media.type };
}

function createHandlers(principal: Principal, origin: string) {
  const absolute = (path: string | null) => (path ? `${origin}${path}` : null);
  const compactScreen = (screen: Screen) => ({
    id: screen.id,
    title: screen.title,
    app: {
      id: screen.app.id,
      slug: screen.app.slug,
      name: screen.app.name,
      platform: screen.app.platform,
    },
    patterns: screen.patterns,
    elements: screen.elements,
    tags: screen.tags,
    sourceUrl: screen.sourceUrl,
    width: screen.width,
    height: screen.height,
    status: screen.status,
    thumbUrl: absolute(screen.thumbUrl),
    imageUrl: absolute(screen.imageUrl),
    url: `${origin}/screens/${screen.id}`,
  });
  const compactFlow = (flow: FlowSummary) => ({
    id: flow.id,
    name: flow.name,
    type: flow.type,
    description: flow.description,
    app: { id: flow.app.id, slug: flow.app.slug, name: flow.app.name, platform: flow.app.platform },
    stepCount: flow.stepCount,
    status: flow.status,
    url: `${origin}/flows/${flow.id}`,
  });

  const handlers: { [N in CatalogToolName]: Handler<N> } = {
    search_screens: async ({ query, ...rest }) => {
      const page = await services.listScreens(principal, { ...rest, q: query });
      return json({ items: page.items.map(compactScreen), nextCursor: page.nextCursor });
    },
    search_flows: async ({ query, ...rest }) => {
      const page = await services.listFlows(principal, { ...rest, q: query });
      return json({ items: page.items.map(compactFlow), nextCursor: page.nextCursor });
    },
    list_apps: async ({ query, ...rest }) => {
      const page = await services.listApps(principal, { ...rest, q: query });
      return json({
        items: page.items.map((app) => ({
          ...app,
          logoUrl: absolute(app.logoUrl),
          previews: undefined,
          url: `${origin}/apps/${app.slug}`,
        })),
        nextCursor: page.nextCursor,
      });
    },
    get_app: async ({ slug }) => {
      const app = await services.getApp(principal, slug);
      return json({
        ...app,
        logoUrl: absolute(app.logoUrl),
        previews: undefined,
        url: `${origin}/apps/${app.slug}`,
      });
    },
    get_screen: async ({ id, full }) => {
      const screen = await services.getScreen(principal, id);
      const image = await imageContent(full ? screen.imageUrl : screen.thumbUrl);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...compactScreen(screen),
              version: screen.version,
              capturedAt: screen.capturedAt,
              previousId: screen.previousId,
              nextId: screen.nextId,
              flows: screen.flows,
            }),
          },
          ...(image ? [image] : []),
        ],
      };
    },
    get_flow: async ({ id, includeImages }) => {
      const flow = await services.getFlow(principal, id);
      const content: CallToolResult["content"] = [
        {
          type: "text",
          text: JSON.stringify({
            ...compactFlow(flow),
            steps: flow.steps.map((step) => ({
              position: step.position,
              label: step.label,
              screen: compactScreen(step.screen),
            })),
          }),
        },
      ];
      if (includeImages) {
        for (const step of flow.steps) {
          const image = await imageContent(step.screen.thumbUrl);
          if (image) content.push(image);
        }
      }
      return { content };
    },
    get_taxonomy: async () => json(services.getTaxonomy()),
    upload_screen: async (args) =>
      json(await services.uploadScreenFromTool(principal, args, origin)),
    create_flow: async (args) => {
      const { flow } = await services.createFlow(principal, args);
      return json({ ...compactFlow(flow), steps: flow.steps.map((step) => step.screen.id) });
    },
  };
  return handlers;
}

function createServer(principal: Principal, origin: string): McpServer {
  const server = new McpServer(
    { name: "screen-commons", version: "0.1.0" },
    {
      instructions:
        "Screen Commons is a library of real product UI screens and flows. Use search_screens / search_flows to find references, get_screen to see an image, get_taxonomy for valid filter slugs.",
    },
  );
  const handlers = createHandlers(principal, origin);
  for (const name of Object.keys(catalogTools) as CatalogToolName[]) {
    const spec = catalogTools[name];
    const handler = handlers[name] as (args: unknown) => Promise<CallToolResult>;
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.input,
        annotations: { title: spec.title, readOnlyHint: spec.readOnly, openWorldHint: false },
      },
      (async (args: unknown): Promise<CallToolResult> => {
        try {
          return await handler(args);
        } catch (error) {
          const failure = toServiceError(error);
          const retry =
            failure.retryAfter === undefined ? "" : ` Retry in ${failure.retryAfter} seconds.`;
          return {
            isError: true,
            content: [{ type: "text", text: `${failure.code}: ${failure.message}${retry}` }],
          };
        }
      }) as never,
    );
  }
  return server;
}

/**
 * Remote MCP endpoint (Streamable HTTP, stateless, JSON responses). Requires a bearer API key; a
 * fresh server + transport is created per request.
 */
export async function handleMcp(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return preflightResponse();
  const principal = await getPrincipal(request, { allowCookies: false }).catch(() => null);
  if (!principal) {
    const response = errorResponse(
      unauthorized("Provide an API key: Authorization: Bearer sc_…"),
      ALLOW_ANY_ORIGIN,
    );
    response.headers.set("www-authenticate", 'Bearer realm="screen-commons"');
    return response;
  }
  if (declaredTooLarge(request, LIMITS.maxRequestBytes)) {
    return errorResponse(bodyTooLarge(LIMITS.maxRequestBytes), ALLOW_ANY_ORIGIN);
  }
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { allow: "POST, OPTIONS", ...ALLOW_ANY_ORIGIN },
    });
  }
  const server = createServer(principal, appOrigin(request));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    // Streamed-byte cap (413 before parsing); upload_screen carries a base64 image.
    maxRequestBodySize: LIMITS.maxRequestBytes,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    const headers = new Headers(response.headers);
    headers.set("access-control-allow-origin", "*");
    return new Response(response.body, { status: response.status, headers });
  } finally {
    await server.close();
  }
}
