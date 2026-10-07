#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { BridgeServer } from "./bridge";
import { helpText, loadConfig } from "./config";
import { SERVER_INFO, createOpenUiMcpServer } from "./server";

/** stdout is the MCP channel: every diagnostic goes to stderr. */
const log = (message: string) => process.stderr.write(`[open-ui-mcp] ${message}\n`);

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stderr.write(helpText());
    return;
  }
  if (process.argv.includes("--version")) {
    process.stderr.write(`${SERVER_INFO.version}\n`);
    return;
  }
  const config = await loadConfig();

  let bridge: BridgeServer | null = null;
  if (config.bridge.enabled) {
    const candidate = new BridgeServer({
      token: config.bridge.token,
      port: config.bridge.port,
      serverInfo: SERVER_INFO,
      log,
    });
    try {
      await candidate.listen();
      bridge = candidate;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      log(
        code === "EADDRINUSE"
          ? `bridge port ${config.bridge.port} is in use (another open-ui-mcp running?); continuing with headless capture only.`
          : `bridge failed to start: ${(error as Error).message}; continuing with headless capture only.`,
      );
    }
  }

  const app = createOpenUiMcpServer({ config, bridge, log });
  const transport = new StdioServerTransport();

  let closing = false;
  const shutdown = async (reason: string) => {
    if (closing) return;
    closing = true;
    log(`shutting down (${reason})`);
    const force = setTimeout(() => process.exit(0), 5000);
    force.unref();
    await app.close().catch(() => undefined);
    await bridge?.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.stdin.on("end", () => void shutdown("stdin closed"));
  process.stdin.on("close", () => void shutdown("stdin closed"));
  transport.onclose = () => void shutdown("transport closed");

  await app.server.connect(transport);

  log(
    `v${SERVER_INFO.version} ready · Open UI ${config.url} · API key ${config.apiKey ? "set" : "MISSING (set OPEN_UI_API_KEY for catalog + upload tools)"}`,
  );
  if (bridge) {
    log(`extension bridge on ws://127.0.0.1:${bridge.port}`);
    log(
      `pairing token (${config.bridge.tokenSource === "generated" ? `new, saved to ${config.bridge.tokenPath}` : config.bridge.tokenSource === "file" ? config.bridge.tokenPath : config.bridge.tokenSource}): ${config.bridge.token}`,
    );
    log(
      "pair: Open UI extension → Options → MCP bridge → port " +
        bridge.port +
        " + paste the token above.",
    );
  }
  log(
    `headless capture: ${app.drivers.headless.executablePath ?? "no Chromium found — set CHROME_PATH"} (launched on first use)`,
  );
}

main().catch((error: unknown) => {
  log(`fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
