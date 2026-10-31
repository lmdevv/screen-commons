import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  LIMITS,
  bytesToBase64,
  catalogTools,
  compactApp,
  compactFlow,
  compactScreen,
  createdFlowResult,
  deletedResult,
  flowDetailResult,
  flowImageSteps,
  imageTypeNote,
  screenDetailResult,
  toolErrorText,
  type CatalogToolName,
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
  const handlers: { [N in CatalogToolName]: Handler<N> } = {
    search_screens: async ({ query, ...rest }) => {
      const page = await services.listScreens(principal, { ...rest, q: query });
      return json({
        items: page.items.map((screen) => compactScreen(origin, screen)),
        nextCursor: page.nextCursor,
      });
    },
    search_flows: async ({ query, ...rest }) => {
      const page = await services.listFlows(principal, { ...rest, q: query });
      return json({
        items: page.items.map((flow) => compactFlow(origin, flow)),
        nextCursor: page.nextCursor,
      });
    },
    list_apps: async ({ query, ...rest }) => {
      const page = await services.listApps(principal, { ...rest, q: query });
      return json({
        items: page.items.map((app) => compactApp(origin, app)),
        nextCursor: page.nextCursor,
      });
    },
    get_app: async ({ slug }) => {
      const app = await services.getApp(principal, slug);
      return json(compactApp(origin, app));
    },
    get_screen: async ({ id, full }) => {
      const screen = await services.getScreen(principal, id);
      const image = await imageContent(full ? screen.imageUrl : screen.thumbUrl);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(screenDetailResult(origin, screen)),
          },
          ...(image ? [image] : []),
        ],
      };
    },
    get_flow: async ({ id, includeImages }) => {
      const flow = await services.getFlow(principal, id);
      if (!includeImages) return json(flowDetailResult(origin, flow));
      const images: CallToolResult["content"] = [];
      const positions: number[] = [];
      for (const step of flowImageSteps(flow)) {
        const image = await imageContent(step.screen.thumbUrl);
        if (!image) continue;
        images.push(image);
        positions.push(step.position);
      }
      return {
        content: [
          { type: "text", text: JSON.stringify(flowDetailResult(origin, flow, positions)) },
          ...images,
        ],
      };
    },
    get_taxonomy: async () => json(services.getTaxonomy()),
    upload_screen: async (args) => {
      const result = await services.uploadScreenFromTool(principal, args, origin);
      const note = "base64" in args.image ? imageTypeNote(args.image) : undefined;
      return json({ ...result, ...(note ? { note } : {}) });
    },
    update_screen: async ({ id, ...patch }) =>
      json(screenDetailResult(origin, await services.updateScreen(principal, id, patch))),
    delete_screen: async ({ id }) => {
      await services.deleteContribution(principal, "screen", id);
      return json(deletedResult(id));
    },
    create_flow: async (args) => {
      const { flow } = await services.createFlow(principal, args);
      return json(createdFlowResult(origin, flow));
    },
    update_flow: async ({ id, ...patch }) =>
      json(flowDetailResult(origin, await services.updateFlow(principal, id, patch))),
    delete_flow: async ({ id }) => {
      await services.deleteContribution(principal, "flow", id);
      return json(deletedResult(id));
    },
  };
  return handlers;
}

function createServer(principal: Principal, origin: string): McpServer {
  const server = new McpServer(
    { name: "screen-commons", version: "0.1.0" },
    {
      instructions:
        "Screen Commons is a library of real product UI screens and flows. Use search_screens / search_flows to find references, get_screen to see an image, get_taxonomy for valid filter slugs. To contribute, upload_screen (a URL this server can reach, or base64 as a last resort; this server can't read your files, so use the local server or the screen-commons CLI for those), then create_flow; update_screen, delete_screen, update_flow and delete_flow manage what you contributed.",
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
        annotations: {
          title: spec.title,
          readOnlyHint: spec.readOnly,
          openWorldHint: spec.openWorld ?? false,
        },
      },
      (async (args: unknown): Promise<CallToolResult> => {
        try {
          return await handler(args);
        } catch (error) {
          const failure = toServiceError(error);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: toolErrorText(failure.code, failure.message, failure.retryAfter),
              },
            ],
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
