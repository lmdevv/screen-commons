import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { BRIDGE_DEFAULT_PORT } from "@open-ui/core";

export interface McpConfig {
  /** Open UI instance origin. */
  url: string;
  apiKey: string | undefined;
  bridge: {
    enabled: boolean;
    port: number;
    token: string;
    tokenSource: "env" | "arg" | "file" | "generated";
    tokenPath: string;
  };
  chromePath: string | undefined;
  headless: boolean;
  /** Where screenshots/captures are saved for the agent to reference. */
  outputDir: string;
}

const HELP = `open-ui-mcp — Open UI MCP server (stdio)

Options (env var in brackets):
  --url <origin>          Open UI instance [OPEN_UI_URL] (default http://localhost:5173)
  --api-key <oui_…>       API key for catalog + upload tools [OPEN_UI_API_KEY]
  --bridge-port <port>    Extension bridge port on 127.0.0.1 [OPEN_UI_BRIDGE_PORT] (default 7457)
  --bridge-token <token>  Pairing token [OPEN_UI_BRIDGE_TOKEN] (default: ~/.config/open-ui/bridge-token)
  --no-bridge             Do not start the extension bridge (headless only)
  --chrome-path <path>    Chromium/Chrome executable [CHROME_PATH] (auto-detected)
  --headful               Show the headless browser window [OPEN_UI_HEADLESS=false]
  --output-dir <dir>      Where screenshots are saved [OPEN_UI_OUTPUT_DIR] (default: $TMPDIR/open-ui-mcp)
  --help                  Show this help
`;

export function helpText(): string {
  return HELP;
}

/** Minimal `--key value` / `--key=value` / `--flag` / `--no-flag` parser. */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (body.startsWith("no-")) {
      out[body.slice(3)] = false;
    } else {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[body] = next;
        index += 1;
      } else {
        out[body] = true;
      }
    }
  }
  return out;
}

const truthy = (value: string | undefined) =>
  value !== undefined && !/^(0|false|no|off)$/iu.test(value.trim());

export function defaultTokenPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const base = env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  return join(base, "open-ui", "bridge-token");
}

/** Read the persisted pairing token, or generate (32 random bytes, hex) and save one (0600). */
export async function loadOrCreateToken(
  path: string,
): Promise<{ token: string; created: boolean }> {
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (existing.length >= 16) return { token: existing, created: false };
  } catch {
    // generate below
  }
  const token = randomBytes(32).toString("hex");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${token}\n`, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
  return { token, created: true };
}

export interface LoadConfigInput {
  env?: NodeJS.ProcessEnv;
  argv?: string[];
  home?: string;
}

export async function loadConfig(input: LoadConfigInput = {}): Promise<McpConfig> {
  const env = input.env ?? process.env;
  const args = parseArgs(input.argv ?? process.argv.slice(2));
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : undefined);

  const url = (str("url") ?? env.OPEN_UI_URL ?? "http://localhost:5173")
    .trim()
    .replace(/\/+$/u, "");
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid Open UI URL: ${url}`);
  }
  const apiKey = (str("api-key") ?? env.OPEN_UI_API_KEY)?.trim() || undefined;

  const portRaw = str("bridge-port") ?? env.OPEN_UI_BRIDGE_PORT;
  const port = portRaw ? Number.parseInt(portRaw, 10) : BRIDGE_DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid bridge port: ${portRaw}`);
  }
  const tokenPath = defaultTokenPath(env, input.home);
  const enabled = args.bridge !== false && !/^(0|false|off)$/iu.test(env.OPEN_UI_BRIDGE ?? "");
  let token = str("bridge-token");
  let tokenSource: McpConfig["bridge"]["tokenSource"] = "arg";
  if (!token && env.OPEN_UI_BRIDGE_TOKEN?.trim()) {
    token = env.OPEN_UI_BRIDGE_TOKEN.trim();
    tokenSource = "env";
  }
  if (!token) {
    const loaded = await loadOrCreateToken(tokenPath);
    token = loaded.token;
    tokenSource = loaded.created ? "generated" : "file";
  }

  const headless =
    args.headful === true
      ? false
      : args.headless === false
        ? false
        : env.OPEN_UI_HEADLESS === undefined
          ? true
          : truthy(env.OPEN_UI_HEADLESS);

  return {
    url,
    apiKey,
    bridge: { enabled, port, token, tokenSource, tokenPath },
    chromePath: (str("chrome-path") ?? env.CHROME_PATH)?.trim() || undefined,
    headless,
    outputDir: str("output-dir") ?? env.OPEN_UI_OUTPUT_DIR ?? join(tmpdir(), "open-ui-mcp"),
  };
}
