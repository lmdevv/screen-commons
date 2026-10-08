import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { browserTools, catalogTools } from "@screen-commons/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig, parseArgs } from "../src/config";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
let home: string;

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "screen-commons-mcp-home-"));
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
    expect(first.bridge.tokenPath).toBe(join(home, "cfg", "screen-commons", "bridge-token"));
    expect((await readFile(first.bridge.tokenPath, "utf8")).trim()).toBe(first.bridge.token);
    expect((await stat(first.bridge.tokenPath)).mode & 0o777).toBe(0o600);

    const second = await loadConfig({ env, argv: [], home });
    expect(second.bridge.token).toBe(first.bridge.token);
    expect(second.bridge.tokenSource).toBe("file");

    const custom = await loadConfig({
      env: {
        ...env,
        SCREEN_COMMONS_URL: "https://ui.example.com/",
        SCREEN_COMMONS_API_KEY: "sc_abc",
        SCREEN_COMMONS_BRIDGE_PORT: "8123",
        SCREEN_COMMONS_BRIDGE_TOKEN: "from-env-token-123",
        SCREEN_COMMONS_HEADLESS: "false",
        CHROME_PATH: "/opt/chrome",
      },
      argv: ["--api-key", "sc_arg"],
      home,
    });
    expect(custom).toMatchObject({
      url: "https://ui.example.com",
      apiKey: "sc_arg",
      headless: false,
      chromePath: "/opt/chrome",
      bridge: { port: 8123, token: "from-env-token-123", tokenSource: "env" },
    });
  });
});

describe("environment configuration", () => {
  it("reads SCREEN_COMMONS_* variables and lets CLI flags override them", async () => {
    const env = {
      XDG_CONFIG_HOME: join(home, "env"),
      SCREEN_COMMONS_URL: "https://new.example.com/",
      SCREEN_COMMONS_API_KEY: "sc_new",
      SCREEN_COMMONS_BRIDGE_PORT: "9000",
      SCREEN_COMMONS_BRIDGE_TOKEN: "new-pairing-token",
      SCREEN_COMMONS_HEADLESS: "false",
      SCREEN_COMMONS_OUTPUT_DIR: join(home, "new-output"),
      SCREEN_COMMONS_BRIDGE: "true",
    };
    const fromEnv = await loadConfig({ env, argv: [], home });
    expect(fromEnv).toMatchObject({
      url: "https://new.example.com",
      apiKey: "sc_new",
      headless: false,
      outputDir: join(home, "new-output"),
      bridge: { enabled: true, port: 9000, token: "new-pairing-token" },
    });
    const cli = await loadConfig({
      env,
      argv: ["--url", "https://cli.example.com", "--api-key", "sc_cli", "--no-bridge"],
      home,
    });
    expect(cli).toMatchObject({
      url: "https://cli.example.com",
      apiKey: "sc_cli",
      bridge: { enabled: false },
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
        SCREEN_COMMONS_BRIDGE_PORT: "0",
      },
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
    const client = new Client({ name: "stdio-test", version: "1.0.0" });
    await client.connect(transport);
    try {
      expect(client.getServerVersion()).toMatchObject({ name: "screen-commons-mcp" });
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
