import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createScreenCommonsClient } from "@screen-commons/core";

import { BridgeServer } from "./bridge";
import { registerBrowserTools } from "./browser-tools";
import { registerCatalogTools } from "./catalog";
import type { McpConfig } from "./config";
import { DriverManager, HeadlessDriver } from "./drivers";
import { registerPrompts } from "./prompts";

export { BridgeServer, isAllowedOrigin } from "./bridge";
export { loadConfig, loadOrCreateToken, parseArgs, type McpConfig } from "./config";
export { DriverManager, ExtensionDriver, HeadlessDriver, type CaptureDriver } from "./drivers";

export const SERVER_INFO = { name: "screen-commons-mcp", version: "0.1.0" } as const;

const INSTRUCTIONS = `Screen Commons is a UI reference library of real product screens and flows.
- Catalog tools (search_screens, search_flows, list_apps, get_app, get_screen, get_flow, get_taxonomy) browse it for design inspiration; get_screen returns the screenshot as an image.
- Browser tools capture new references: site_crawl a site, then capture_pages the canonical pages (home, pricing, login, signup, docs, blog, changelog, about) with upload=true to publish them as one app, optionally as a flow.
- browser_status tells you whether captures run in the user's real browser (extension) or headless Chromium.`;

export interface CreateServerOptions {
  config: McpConfig;
  /** Started bridge (or null when disabled/unavailable). */
  bridge?: BridgeServer | null;
  /** Override the headless driver (tests). */
  headless?: HeadlessDriver;
  fetch?: typeof fetch;
  log?: (message: string) => void;
}

export interface ScreenCommonsMcp {
  server: McpServer;
  drivers: DriverManager;
  close: () => Promise<void>;
}

/** Build the MCP server with all catalog + browser tools, prompts and resources registered. */
export function createScreenCommonsMcpServer(options: CreateServerOptions): ScreenCommonsMcp {
  const { config } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const client = createScreenCommonsClient({
    baseUrl: config.url,
    apiKey: config.apiKey,
    fetch: doFetch,
    headers: { "x-screen-commons-client": `${SERVER_INFO.name}/${SERVER_INFO.version}` },
  });
  const bridge = options.bridge ?? null;
  const headless =
    options.headless ??
    new HeadlessDriver({
      executablePath: config.chromePath,
      headless: config.headless,
      log: options.log,
    });
  const drivers = new DriverManager(bridge, headless);

  const server = new McpServer(SERVER_INFO, {
    instructions: INSTRUCTIONS,
    capabilities: { tools: {}, prompts: {}, resources: {} },
  });
  registerCatalogTools(server, {
    baseUrl: config.url,
    apiKey: config.apiKey,
    client,
    fetch: doFetch,
  });
  registerBrowserTools(server, {
    baseUrl: config.url,
    apiKey: config.apiKey,
    client,
    drivers,
    outputDir: config.outputDir,
    bridge: {
      port: bridge?.port ?? (config.bridge.enabled ? config.bridge.port : null),
      enabled: Boolean(bridge),
    },
  });
  registerPrompts(server);

  return {
    server,
    drivers,
    close: async () => {
      await drivers.close();
      await server.close().catch(() => undefined);
    },
  };
}
