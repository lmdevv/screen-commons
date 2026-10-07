import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { browserTools, catalogTools } from "@open-ui/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig, parseArgs } from "../src/config";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
let home: string;

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "open-ui-mcp-home-"));
});
afterAll(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("config", () => {
  it("parses flags", () => {
    expect(
      parseArgs(["--url", "https://x.dev", "--no-bridge", "--bridge-port=9000", "--headful"]),
    ).toEqual({
      url: "https://x.dev",
      bridge: false,
      "bridge-port": "9000",
      headful: true,
    });
  });

  it("defaults, env overrides and a persisted generated token", async () => {
    const env = { XDG_CONFIG_HOME: join(home, "cfg") };
    const first = await loadConfig({ env, argv: [], home });
    expect(first.url).toBe("http://localhost:5173");
    expect(first.bridge.port).toBe(7457);
    expect(first.headless).toBe(true);
    expect(first.bridge.tokenSource).toBe("generated");
    expect(first.bridge.token).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.bridge.tokenPath).toBe(join(home, "cfg", "open-ui", "bridge-token"));
    expect((await readFile(first.bridge.tokenPath, "utf8")).trim()).toBe(first.bridge.token);
    expect((await stat(first.bridge.tokenPath)).mode & 0o777).toBe(0o600);

    const second = await loadConfig({ env, argv: [], home });
    expect(second.bridge.token).toBe(first.bridge.token);
    expect(second.bridge.tokenSource).toBe("file");

    const custom = await loadConfig({
      env: {
        ...env,
        OPEN_UI_URL: "https://ui.example.com/",
        OPEN_UI_API_KEY: "oui_abc",
        OPEN_UI_BRIDGE_PORT: "8123",
        OPEN_UI_BRIDGE_TOKEN: "from-env-token-123",
        OPEN_UI_HEADLESS: "false",
        CHROME_PATH: "/opt/chrome",
      },
      argv: ["--api-key", "oui_arg"],
      home,
    });
    expect(custom).toMatchObject({
      url: "https://ui.example.com",
      apiKey: "oui_arg",
      headless: false,
      chromePath: "/opt/chrome",
      bridge: { port: 8123, token: "from-env-token-123", tokenSource: "env" },
    });
  });
});

describe("built stdio server", () => {
  beforeAll(() => {
    execFileSync(join(packageDir, "node_modules", ".bin", "tsup"), [], {
      cwd: packageDir,
      stdio: "ignore",
    });
  });

  it("completes the MCP handshake over stdio and lists tools", async () => {
    const entry = join(packageDir, "dist", "index.js");
    expect(existsSync(entry)).toBe(true);
    const stderr: string[] = [];
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: home,
        XDG_CONFIG_HOME: join(home, "cfg-stdio"),
        OPEN_UI_BRIDGE_PORT: "0",
      },
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
    const client = new Client({ name: "stdio-test", version: "1.0.0" });
    await client.connect(transport);
    try {
      expect(client.getServerVersion()).toMatchObject({ name: "open-ui-mcp" });
      const { tools } = await client.listTools();
      expect(tools.length).toBe(
        Object.keys(catalogTools).length + Object.keys(browserTools).length,
      );
      const result = (await client.callTool({ name: "get_taxonomy", arguments: {} })) as {
        content: { text: string }[];
      };
      expect(result.content[0]?.text).toContain("signing-up");
      await new Promise((resolve) => setTimeout(resolve, 100));
      const log = stderr.join("");
      expect(log).toContain("pairing token");
      expect(log).toContain("API key MISSING");
    } finally {
      await client.close();
    }
  });
});
