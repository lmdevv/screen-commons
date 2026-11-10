import { randomBytes } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

import { BRIDGE_DEFAULT_PORT } from "@screen-commons/core";
import { z } from "zod";

export interface McpConfig {
  /** Screen Commons instance origin. */
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

const HELP = `screen-commons-mcp — Screen Commons MCP server (stdio)

Options (env var in brackets):
  --url <origin>          Screen Commons instance [SCREEN_COMMONS_URL] (default http://localhost:5173)
  --api-key <sc_…>       API key for catalog + upload tools [SCREEN_COMMONS_API_KEY]
  --profile <name>        Login saved by screen-commons login [SCREEN_COMMONS_PROFILE] (default "default")
  --bridge-port <port>    Extension bridge port on 127.0.0.1 [SCREEN_COMMONS_BRIDGE_PORT] (default 7457)
  --bridge-token <token>  Pairing token [SCREEN_COMMONS_BRIDGE_TOKEN] (default: ~/.config/screen-commons/bridge-token)
  --no-bridge             Do not start the extension bridge (headless only)
  --chrome-path <path>    Chromium/Chrome executable [CHROME_PATH] (auto-detected)
  --headful               Show the headless browser window [SCREEN_COMMONS_HEADLESS=false]
  --output-dir <dir>      Where screenshots are saved [SCREEN_COMMONS_OUTPUT_DIR] (default: $TMPDIR/screen-commons-mcp)
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

function configDir(env: NodeJS.ProcessEnv, home: string): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  return join(xdg && isAbsolute(xdg) ? xdg : join(home, ".config"), "screen-commons");
}

export function defaultTokenPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return join(configDir(env, home), "bridge-token");
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

const profileSchema = z.object({
  version: z.literal(1),
  url: z.string(),
  apiKey: z.string().regex(/^sc_[\w-]{8,}$/u),
  keyId: z.string().optional(),
  email: z.string().optional(),
});
export type Profile = z.infer<typeof profileSchema>;

const PROFILE_NAME = /^[A-Za-z0-9][\w.-]{0,63}$/u;
const PROFILE_FILE = /^([A-Za-z0-9][\w.-]{0,63})\.json$/u;

export const profilesDir = (env: NodeJS.ProcessEnv = process.env, home = homedir()) =>
  join(configDir(env, home), "profiles");

const profilePath = (dir: string, name: string) => join(dir, `${name}.json`);

async function readProfile(dir: string, name: string): Promise<Profile | undefined> {
  const path = profilePath(dir, name);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return profileSchema.parse(JSON.parse(text));
  } catch {
    throw new Error(`${path} is not a profile. Fix or delete it`);
  }
}

export async function readProfiles(dir: string): Promise<{ name: string; profile: Profile }[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const names = files.flatMap((file) => PROFILE_FILE.exec(file)?.[1] ?? []).sort();
  const found = await Promise.all(
    names.map(async (name) => ({ name, profile: await readProfile(dir, name) })),
  );
  return found.flatMap(({ name, profile }) => (profile ? [{ name, profile }] : []));
}

export async function saveProfile(dir: string, name: string, profile: Profile) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFileAtomic(profilePath(dir, name), `${JSON.stringify(profile, null, 2)}\n`, 0o600);
}

export const removeProfile = (dir: string, name: string) =>
  rm(profilePath(dir, name), { force: true });

export async function writeFileAtomic(path: string, data: string | Uint8Array, mode?: number) {
  const partial = `${path}.${process.pid}.partial`;
  try {
    await writeFile(partial, data, { mode });
    if (mode !== undefined) await chmod(partial, mode);
    await rename(partial, path);
  } finally {
    await rm(partial, { force: true });
  }
}

const present = (value: string | undefined) => value?.trim() || undefined;

export interface ProfileSelection {
  name: string;
  explicit: boolean;
  saved: Profile | undefined;
  dir: string;
}

export async function selectProfile(
  flag: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): Promise<ProfileSelection> {
  const chosen = present(flag) ?? present(env.SCREEN_COMMONS_PROFILE);
  const name = chosen ?? "default";
  if (!PROFILE_NAME.test(name)) {
    throw new Error(`Profile names are letters, digits, ".", "_" and "-", not "${name}"`);
  }
  const dir = profilesDir(env, home);
  return { name, explicit: chosen !== undefined, saved: await readProfile(dir, name), dir };
}

export type Source = "flag" | "env" | "profile" | "default";

export interface Instance {
  url: string;
  apiKey: string | undefined;
  sources: { url: Source; apiKey: Exclude<Source, "default"> | undefined };
}

function normalizeUrl(url: string): string {
  try {
    return new URL(url.trim()).href.replace(/\/+$/u, "");
  } catch {
    throw new Error(`Invalid Screen Commons URL: ${url.trim()}`);
  }
}

function first<S>(candidates: [string | undefined, S][]): [string, S] | undefined {
  return candidates.find((candidate): candidate is [string, S] => candidate[0] !== undefined);
}

const profileKeyFor = (url: string, profile: Profile | undefined) =>
  profile && normalizeUrl(profile.url) === url ? profile.apiKey : undefined;

export function resolveInstance(
  flags: { url?: string; apiKey?: string },
  env: NodeJS.ProcessEnv = process.env,
  profile?: Profile,
): Instance {
  const [raw, urlSource] = first<Source>([
    [present(flags.url), "flag"],
    [present(env.SCREEN_COMMONS_URL), "env"],
    [profile?.url, "profile"],
    ["http://localhost:5173", "default"],
  ])!;
  const url = normalizeUrl(raw);
  const key = first<Exclude<Source, "default">>([
    [present(flags.apiKey), "flag"],
    [present(env.SCREEN_COMMONS_API_KEY), "env"],
    [profileKeyFor(url, profile), "profile"],
  ]);
  return { url, apiKey: key?.[0], sources: { url: urlSource, apiKey: key?.[1] } };
}

export async function loadConfig(input: LoadConfigInput = {}): Promise<McpConfig> {
  const env = input.env ?? process.env;
  const setting = (name: string) => env[`SCREEN_COMMONS_${name}`];
  const args = parseArgs(input.argv ?? process.argv.slice(2));
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : undefined);

  const profile = await selectProfile(str("profile"), env, input.home);
  const { url, apiKey } = resolveInstance(
    { url: str("url"), apiKey: str("api-key") },
    env,
    profile.saved,
  );

  const portRaw = str("bridge-port") ?? setting("BRIDGE_PORT");
  const port = portRaw ? Number.parseInt(portRaw, 10) : BRIDGE_DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid bridge port: ${portRaw}`);
  }
  const tokenPath = defaultTokenPath(env, input.home);
  const enabled = args.bridge !== false && !/^(0|false|off)$/iu.test(setting("BRIDGE") ?? "");
  let token = str("bridge-token");
  let tokenSource: McpConfig["bridge"]["tokenSource"] = "arg";
  const envToken = setting("BRIDGE_TOKEN")?.trim();
  if (!token && envToken) {
    token = envToken;
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
        : setting("HEADLESS") === undefined
          ? true
          : truthy(setting("HEADLESS"));

  return {
    url,
    apiKey,
    bridge: { enabled, port, token, tokenSource, tokenPath },
    chromePath: (str("chrome-path") ?? env.CHROME_PATH)?.trim() || undefined,
    headless,
    outputDir: str("output-dir") ?? setting("OUTPUT_DIR") ?? join(tmpdir(), "screen-commons-mcp"),
  };
}
