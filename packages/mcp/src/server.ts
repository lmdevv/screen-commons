import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createOpenUiClient } from "@open-ui/core";

import { BridgeServer } from "./bridge";
import { registerBrowserTools } from "./browser-tools";
import { registerCatalogTools } from "./catalog";
import type { McpConfig } from "./config";
import { DriverManager, HeadlessDriver } from "./drivers";
import { registerPrompts } from "./prompts";

export { BridgeServer, isAllowedOrigin } from "./bridge";
export { loadConfig, loadOrCreateToken, parseArgs, type McpConfig } from "./config";
export { DriverManager, ExtensionDriver, HeadlessDriver, type CaptureDriver } from "./drivers";

export const SERVER_INFO = { name: "open-ui-mcp", version: "0.1.0" } as const;

const INSTRUCTIONS = `Open UI is a UI reference library of real product screens and flows.
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

export interface OpenUiMcp {
  server: McpServer;
  drivers: DriverManager;
  close: () => Promise<void>;
}

/** Build the MCP server with all catalog + browser tools, prompts and resources registered. */
export function createOpenUiMcpServer(options: CreateServerOptions): OpenUiMcp {
  const { config } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const client = createOpenUiClient({
    baseUrl: config.url,
    apiKey: config.apiKey,
    fetch: doFetch,
    headers: { "x-open-ui-client": `${SERVER_INFO.name}/${SERVER_INFO.version}` },
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
