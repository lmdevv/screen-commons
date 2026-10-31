import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { API_KEY, startMockApi, type MockApi } from "./mock-api";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
let api: MockApi;
let dir: string;

/** Asynchronous, because the mock API answers from this process. */
function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, fail) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: packageDir,
      env: { PATH: process.env.PATH, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.once("error", fail);
    child.once("close", (code) => done({ code, stdout, stderr }));
  });
}
const withKey = () => ({ SCREEN_COMMONS_URL: api.url, SCREEN_COMMONS_API_KEY: API_KEY });

beforeAll(async () => {
  api = await startMockApi();
  dir = await mkdtemp(join(tmpdir(), "screen-commons-cli-"));
});
afterAll(async () => {
  await api.close();
  await rm(dir, { recursive: true, force: true });
});

describe("help", () => {
  it.each([
    [["--help"], "Exit codes:"],
    [["screens", "--help"], "search"],
    [["screens", "search", "--help"], "--cursor"],
    [["manifest", "publish", "-h"], "<path>"],
    [["whoami", "--help"], "--api-key"],
  ])("%j", async (args, expected) => {
    const { code, stdout } = await run(args);
    expect(code).toBe(0);
    expect(stdout).toContain(expected);
  });

  it("prints the package's version", async () => {
    const pkg = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8")) as {
      version: string;
    };
    expect((await run(["--version"])).stdout.trim()).toBe(pkg.version);
  });
});

describe("errors", () => {
  it.each([
    [[], 2, /^usage: /u],
    [["nope"], 2, /^usage: Unknown command "nope"/u],
    [["screens"], 2, /^usage: screens needs one of/u],
    [["screens", "get"], 2, /^usage: /u],
    [["screens", "get", "a", "b"], 2, /^usage: /u],
    [["screens", "search", "--nope"], 2, /^usage: /u],
    [["screens", "get", "x"], 3, /^missing_api_key: /u],
  ])("%j exits %i", async (args, code, stderr) => {
    const result = await run(args);
    expect(result.code).toBe(code);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(stderr);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
  });

  it("maps server refusals to stable codes", async () => {
    const missing = await run(["screens", "get", "missing"], withKey());
    expect(missing.code).toBe(4);
    expect(missing.stderr).toBe("not_found: Screen not found\n");
    const newApp = await run(
      ["upload", "./missing.png", "--app", "new-app", "--app-name", "New app"],
      withKey(),
    );
    expect(newApp.code).toBe(4);
    expect(newApp.stderr).toContain("pass --app-name on its own");
    const rejected = await run(["whoami"], {
      ...withKey(),
      SCREEN_COMMONS_API_KEY: "sc_wrong_key",
    });
    expect(rejected.code).toBe(3);
    expect(rejected.stderr).toMatch(/^unauthorized: /u);
  });

  it("explains an unreachable instance after retrying", async () => {
    const { code, stderr } = await run(["whoami"], {
      SCREEN_COMMONS_URL: "http://127.0.0.1:9",
      SCREEN_COMMONS_API_KEY: API_KEY,
    });
    expect(code).toBe(5);
    expect(stderr).toMatch(/^network: Could not reach Screen Commons at http:\/\/127\.0\.0\.1:9/u);
  });
});

describe("config and secrets", () => {
  it("prefers flags to the environment", async () => {
    const viaFlag = await run(["whoami", "--api-key", API_KEY, "--url", api.url], {
      SCREEN_COMMONS_URL: "http://127.0.0.1:9",
      SCREEN_COMMONS_API_KEY: "sc_wrong_key",
    });
    expect(viaFlag.code).toBe(0);
    expect(JSON.parse(viaFlag.stdout)).toMatchObject({ role: "admin", url: api.url });
  });

  it("never prints the key, even when it's echoed back", async () => {
    const secret = "sc_secret_in_a_bad_flag";
    const { stdout, stderr, code } = await run([
      "whoami",
      `--api-key=${secret}`,
      "--url",
      "not a url",
    ]);
    expect(code).toBe(2);
    expect(`${stdout}${stderr}`).not.toContain(secret);
    const echoed = await run(["screens", "get", secret], {
      SCREEN_COMMONS_URL: api.url,
      SCREEN_COMMONS_API_KEY: secret,
    });
    expect(`${echoed.stdout}${echoed.stderr}`).not.toContain(secret);
  });

  it("doesn't create a bridge token just by running", async () => {
    const home = join(dir, "home");
    const { code } = await run(["whoami"], { HOME: home, ...withKey() });
    expect(code).toBe(0);
    await expect(readFile(join(home, ".config/screen-commons/bridge-token"))).rejects.toThrow();
  });
});

describe("commands", () => {
  it("prints the same compact JSON the tools return, with paging", async () => {
    const { code, stdout } = await run(
      ["screens", "search", "more", "--limit", "2", "--pattern", "pricing"],
      withKey(),
    );
    expect(code).toBe(0);
    const page = JSON.parse(stdout) as { items: { url: string }[]; nextCursor: string };
    expect(page.nextCursor).toBe("c1");
    expect(page.items[0]!.url).toBe(`${api.url}/screens/scr_1`);
  });

  it("downloads an image, and won't overwrite without --force", async () => {
    const out = join(dir, "shot.webp");
    const first = await run(["screens", "download", "scr_1", "--thumb", "--out", out], withKey());
    expect(first.code).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ type: "image/webp", width: 640, path: out });
    const metadata = await sharp(await readFile(out)).metadata();
    expect(metadata.format).toBe("webp");
    const again = await run(["screens", "download", "scr_1", "--thumb", "--out", out], withKey());
    expect(again.code).toBe(2);
    expect(again.stderr).toMatch(/^file_exists: /u);
    const forced = await run(
      ["screens", "download", "scr_1", "--thumb", "--out", out, "--force"],
      withKey(),
    );
    expect(forced.code).toBe(0);
  });

  it("checks input before it spends a request", async () => {
    const steps = ["flows", "create", "--app", "a", "--name", "n", "--step", "one"];
    const { code, stderr } = await run(steps, withKey());
    expect(code).toBe(2);
    expect(stderr).toMatch(/^bad_request: steps/u);
    expect((await run(["screens", "update", "x"], withKey())).stderr).toMatch(
      /^usage: Nothing to update/u,
    );
    expect((await run(["screens", "update", "x", "--patch", "[]"], withKey())).code).toBe(2);
  });
});

describe("manifest validate", () => {
  it("passes a good manifest with no key and no network", async () => {
    const good = join(dir, "good.png");
    await writeFile(
      good,
      await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } })
        .png()
        .toBuffer(),
    );
    const path = join(dir, "good.json");
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        id: "t",
        app: { name: "T" },
        screens: [
          { localId: "a", source: { file: "good.png" }, patterns: [], elements: [] },
          { localId: "b", source: { url: "https://x.example/b.png" }, patterns: [], elements: [] },
        ],
        flows: [{ localId: "f", name: "F", steps: [{ screen: "a" }, { screen: "b" }] }],
      }),
    );
    const { code, stdout } = await run(["manifest", "validate", path]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, id: "t", screens: 2, issues: [] });
  });

  it("reports schema problems and unreadable files", async () => {
    const bad = join(dir, "bad.json");
    await writeFile(bad, JSON.stringify({ version: 1 }));
    const schema = await run(["manifest", "validate", bad]);
    expect(schema.code).toBe(2);
    expect(schema.stderr).toMatch(/^invalid_manifest: id: /u);

    const missing = join(dir, "missing.json");
    await writeFile(
      missing,
      JSON.stringify({
        version: 1,
        id: "t",
        app: { name: "T" },
        screens: [{ localId: "a", source: { file: "gone.png" }, patterns: [], elements: [] }],
      }),
    );
    const files = await run(["manifest", "validate", missing]);
    expect(files.code).toBe(2);
    expect(JSON.parse(files.stdout).issues[0]).toMatchObject({
      localId: "a",
      code: "source_unreadable",
    });
    expect((await run(["manifest", "validate", join(dir, "absent.json")])).code).toBe(2);
  });
});
