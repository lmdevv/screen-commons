import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { referenceBundleSchema, type ReferenceBundle } from "@screen-commons/core";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { API_KEY, MEMBER_KEY, OTHER_KEY, startMockApi, type MockApi } from "./mock-api";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
let api: MockApi;
let dir: string;

/** Asynchronous, because the mock API answers from this process. */
function run(args: string[], env: Record<string, string> = {}, stdin = "") {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, fail) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: packageDir,
      env: { PATH: process.env.PATH, HOME: join(dir, "home"), ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end(stdin);
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
    [["contributions", "list", "--help"], "--status"],
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
    const page = JSON.parse(stdout) as {
      schemaVersion: number;
      items: { url: string }[];
      nextCursor: string;
    };
    expect(page.schemaVersion).toBe(1);
    expect(page.nextCursor).toBe("c1");
    expect(page.items[0]!.url).toBe(`${api.url}/screens/scr_1`);
  });

  it("lists your contributions, passing the filters through as the query", async () => {
    const before = api.contributionQueries.length;
    const { code, stdout } = await run(
      ["contributions", "list", "--status", "rejected", "--kind", "screen", "--limit", "5"],
      withKey(),
    );
    expect(code).toBe(0);
    expect(api.contributionQueries[before]).toEqual({
      kind: "screen",
      status: "rejected",
      limit: "5",
    });
    const page = JSON.parse(stdout) as {
      items: Record<string, unknown>[];
      nextCursor: string | null;
    };
    expect(page.nextCursor).toBe("c2");
    expect(page.items.map((item) => [item.kind, item.id, item.status, item.reviewReason])).toEqual([
      ["screen", "scr_mine", "rejected", "Blurry capture"],
      ["flow", "flow_mine", "pending", null],
    ]);
    expect(page.items[0]!.url).toBe(`${api.url}/screens/scr_mine`);
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

describe("screen text", () => {
  const shot = async () => {
    const path = join(dir, "text-shot.png");
    await writeFile(
      path,
      await sharp({ create: { width: 64, height: 40, channels: 3, background: "#654321" } })
        .png()
        .toBuffer(),
    );
    return path;
  };

  it("uploads --text and --text-file with the screen", async () => {
    const image = await shot();
    const inline = await run(
      ["upload", image, "--app-name", "Demo", "--text", "Blend Invite friends"],
      withKey(),
    );
    expect(inline.code).toBe(0);
    expect(api.batches.at(-1)!.screens[0]!.text).toBe("Blend Invite friends");

    const file = join(dir, "text.txt");
    await writeFile(file, "Playlist\nFolder\n");
    const fromFile = await run(
      ["upload", image, "--app-name", "Demo", "--text-file", file],
      withKey(),
    );
    expect(fromFile.code).toBe(0);
    expect(api.batches.at(-1)!.screens[0]!.text).toBe("Playlist Folder");
  });

  it("updates text and shows it", async () => {
    const file = join(dir, "update.txt");
    await writeFile(file, "Folder");
    for (const flag of [
      ["--text", "Folder"],
      ["--text-file", file],
    ]) {
      const { code, stdout } = await run(["screens", "update", "scr_1", ...flag], withKey());
      expect(code).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({ id: "scr_1", text: "Folder" });
    }
  });

  it("refuses text over 20,000 characters, both flags, and a missing file", async () => {
    const image = await shot();
    const long = "x".repeat(20_001);
    const batches = api.batches.length;
    const upload = await run(["upload", image, "--app-name", "Demo", "--text", long], withKey());
    expect(upload.code).toBe(2);
    expect(upload.stderr).toMatch(/^invalid_manifest: screens\.0\.text: /u);
    const update = await run(["screens", "update", "scr_1", "--text", long], withKey());
    expect(update.code).toBe(2);
    expect(update.stderr).toMatch(/^bad_request: text: /u);
    expect(api.batches.length).toBe(batches);

    const both = await run(
      ["screens", "update", "scr_1", "--text", "a", "--text-file", join(dir, "update.txt")],
      withKey(),
    );
    expect(both.code).toBe(2);
    expect(both.stderr).toMatch(/^usage: Pass --text or --text-file/u);
    const missing = await run(
      ["screens", "update", "scr_1", "--text-file", join(dir, "absent.txt")],
      withKey(),
    );
    expect(missing.code).toBe(2);
    expect(missing.stderr).toMatch(/^source_unreadable: /u);
  });
});

describe("review", () => {
  const lines = (stdout: string) =>
    stdout
      .trim()
      .split("\n")
      .map((line) => {
        const { schemaVersion, ...result } = JSON.parse(line) as Record<string, unknown>;
        expect(schemaVersion).toBe(1);
        return result;
      });

  it("pages one kind of the queue", async () => {
    const first = await run(["review", "list", "--kind", "screen", "--limit", "2"], withKey());
    expect(first.code).toBe(0);
    const page = JSON.parse(first.stdout) as { kind: string; items: { id: string }[] };
    expect(page).toMatchObject({ kind: "screen", nextCursor: "2" });
    expect(page.items.map((item) => item.id)).toEqual(["scr_p1", "scr_p2"]);
    const missing = await run(["review", "list"], withKey());
    expect(missing.code).toBe(2);
    expect(missing.stderr).toMatch(/^usage: Pass --kind/u);
  });

  it("approves ids from stdin once, and a rerun prints unchanged", async () => {
    const first = await run(
      ["review", "approve", "--kind", "screen"],
      withKey(),
      "scr_p1\n\nscr_p2\n",
    );
    expect(first.code).toBe(0);
    expect(lines(first.stdout)).toEqual([
      { id: "scr_p1", kind: "screen", result: "approved" },
      { id: "scr_p2", kind: "screen", result: "approved" },
    ]);
    const started = Date.now();
    const again = await run(["review", "approve", "scr_p1", "scr_p2"], withKey());
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
    expect(again.code).toBe(0);
    expect(lines(again.stdout).map((line) => line.result)).toEqual(["unchanged", "unchanged"]);
    expect(api.decisions.filter((item) => item.decision === "approve")).toHaveLength(2);
  });

  it("finds each id's kind, keeps going past a missing id, and exits 1", async () => {
    const { code, stdout, stderr } = await run(
      ["review", "reject", "flow_p1", "nope", "scr_p3", "--reason", "Blurry"],
      withKey(),
    );
    expect(code).toBe(1);
    expect(lines(stdout)).toEqual([
      { id: "flow_p1", kind: "flow", result: "rejected" },
      { id: "nope", result: "failed", error: { code: "not_found", message: expect.any(String) } },
      { id: "scr_p3", kind: "screen", result: "rejected" },
    ]);
    expect(stderr).toBe("review_failed: 1 of 3 ids failed\n");
    expect(api.decisions.at(-1)).toEqual({
      kind: "screen",
      id: "scr_p3",
      decision: "reject",
      reason: "Blurry",
    });
  });

  it("stops at the first refusal for a member", async () => {
    const member = { ...withKey(), SCREEN_COMMONS_API_KEY: MEMBER_KEY };
    const listed = await run(["review", "list", "--kind", "flow"], member);
    expect(listed.code).toBe(3);
    expect(listed.stderr).toMatch(/^forbidden: /u);
    const approved = await run(["review", "approve", "scr_p1", "scr_p2"], member);
    expect(approved.code).toBe(3);
    expect(approved.stdout).toBe("");
  });

  it("shows a screen and saves its image", async () => {
    const out = join(dir, "review.png");
    const { code, stdout } = await run(
      ["review", "show", "scr_p1", "--download", "--out", out],
      withKey(),
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      kind: "screen",
      id: "scr_p1",
      download: { path: out, type: "image/png" },
    });
    expect((await sharp(await readFile(out)).metadata()).format).toBe("png");
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

let homes = 0;
async function homeWith(profiles: Record<string, { url: string; apiKey: string }> = {}) {
  const home = join(dir, `profile-home-${(homes += 1)}`);
  await mkdir(join(home, ".config/screen-commons/profiles"), { recursive: true });
  for (const [name, profile] of Object.entries(profiles)) {
    await writeFile(profileFile(home, name), JSON.stringify({ version: 1, ...profile }));
  }
  return home;
}
const profileFile = (home: string, name = "default") =>
  join(home, `.config/screen-commons/profiles/${name}.json`);
const emailOf = (stdout: string) => (JSON.parse(stdout) as { email: string }).email;

describe("profiles", () => {
  it("takes the key from a flag, then the environment, then the profile", async () => {
    const HOME = await homeWith({ default: { url: api.url, apiKey: API_KEY } });
    expect(emailOf((await run(["whoami"], { HOME })).stdout)).toBe("admin@example.com");
    expect(
      emailOf((await run(["whoami"], { HOME, SCREEN_COMMONS_API_KEY: OTHER_KEY })).stdout),
    ).toBe("other@example.com");
    expect(
      emailOf(
        (await run(["whoami", "--api-key", API_KEY], { HOME, SCREEN_COMMONS_API_KEY: OTHER_KEY }))
          .stdout,
      ),
    ).toBe("admin@example.com");
  });

  it("takes the profile from a flag, then the environment, then default", async () => {
    const HOME = await homeWith({
      default: { url: api.url, apiKey: API_KEY },
      work: { url: api.url, apiKey: OTHER_KEY },
    });
    expect(emailOf((await run(["whoami", "--profile", "work"], { HOME })).stdout)).toBe(
      "other@example.com",
    );
    expect(emailOf((await run(["whoami"], { HOME, SCREEN_COMMONS_PROFILE: "work" })).stdout)).toBe(
      "other@example.com",
    );
    expect(
      emailOf(
        (await run(["whoami", "--profile", "default"], { HOME, SCREEN_COMMONS_PROFILE: "work" }))
          .stdout,
      ),
    ).toBe("admin@example.com");
  });

  it("sends a profile's key to its own instance however it is spelled, and nowhere else", async () => {
    const HOME = await homeWith({ default: { url: api.url, apiKey: API_KEY } });
    const shouted = await run(["whoami", "--url", `${api.url.toUpperCase()}/`], { HOME });
    expect(emailOf(shouted.stdout)).toBe("admin@example.com");
    const elsewhere = await run(["whoami", "--url", "http://127.0.0.1:9"], { HOME });
    expect(elsewhere.code).toBe(3);
    expect(elsewhere.stderr).toMatch(/^missing_api_key: No API key for http:\/\/127\.0\.0\.1:9/u);
    const missing = await run(["whoami", "--profile", "nope"], { HOME });
    expect(missing.stderr).toContain(
      "screen-commons login --url http://localhost:5173 --profile nope",
    );
  });

  it.each([
    ["not JSON", "{ not json"],
    ["an empty key", JSON.stringify({ version: 1, url: "http://x.example", apiKey: "" })],
    ["a one-letter key", JSON.stringify({ version: 1, url: "http://x.example", apiKey: "e" })],
  ])("refuses a profile with %s", async (_, text) => {
    const HOME = await homeWith();
    await writeFile(profileFile(HOME), text);
    const { code, stdout, stderr } = await run(["taxonomy", "--url", api.url], { HOME });
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/^invalid_profiles: .*profiles\/default\.json is not a profile/u);
  });

  it.each([
    ["constructor", 0],
    ["__proto__", 2],
    ["../escape", 2],
    [".hidden", 2],
  ] as const)("takes --profile %s only as a plain file name", async (name, exit) => {
    const HOME = await homeWith();
    const args = ["whoami", "--profile", name, "--api-key", API_KEY, "--url", api.url];
    const { code, stderr } = await run(args, { HOME });
    expect(code).toBe(exit);
    if (exit) expect(stderr).toMatch(/^invalid_profiles: Profile names are letters/u);
  });

  it("ignores a relative XDG_CONFIG_HOME", async () => {
    const HOME = await homeWith({ default: { url: api.url, apiKey: API_KEY } });
    const viaRelative = await run(["whoami"], { HOME, XDG_CONFIG_HOME: "cfg" });
    expect(emailOf(viaRelative.stdout)).toBe("admin@example.com");
  });
});

describe("login", () => {
  it("saves the token it made as a 0600 profile, and never prints it", async () => {
    api.login.status = "approved";
    const HOME = await homeWith();
    const { code, stdout, stderr } = await run(["login", "--url", api.url], { HOME });
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toContain(`${api.url}/cli-login?code=BCDF-GHJK`);
    expect(stdout).toContain("Approve it if the page shows BCDF-GHJK");
    expect(stdout).toMatch(/logged in as login@example\.com \(profile default\)\n$/u);

    expect((await stat(profileFile(HOME))).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(await readFile(profileFile(HOME), "utf8")) as {
      url: string;
      apiKey: string;
      keyId: string;
    };
    const hash = createHash("sha256").update(saved.apiKey).digest("hex");
    expect(api.login.hashes).toContain(hash);
    expect(saved.url).toBe(api.url);
    expect(stdout).not.toContain(saved.apiKey);

    expect(emailOf((await run(["whoami"], { HOME })).stdout)).toBe("login@example.com");
    expect((await run(["profiles"], { HOME })).stdout).toBe(
      `* default  login@example.com  ${api.url}\n`,
    );

    const out = await run(["logout"], { HOME });
    expect(out.stdout).toBe(`Logged out of ${api.url} (profile default). Its key is revoked\n`);
    expect(api.login.revoked).toContain(saved.keyId);
    await expect(stat(profileFile(HOME))).rejects.toThrow();
    const again = await run(["logout", "--json"], { HOME });
    expect(again.code).toBe(0);
    expect(JSON.parse(again.stdout)).toEqual({
      schemaVersion: 1,
      profile: "default",
      removed: false,
      revoked: false,
    });
  });

  it("keeps every profile when logins run at the same time", async () => {
    api.login.status = "approved";
    const HOME = await homeWith();
    const names = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const results = await Promise.all(
      names.map((name) => run(["login", "--url", api.url, "--profile", name, "--json"], { HOME })),
    );
    expect(results.map((result) => result.code)).toEqual(names.map(() => 0));
    const listed = JSON.parse((await run(["profiles", "--json"], { HOME })).stdout) as {
      profiles: { name: string }[];
    };
    expect(listed.profiles.map((item) => item.name)).toEqual(names);
  });

  it("prints one JSON line when it starts waiting and one when it's done", async () => {
    api.login.status = "approved";
    const HOME = await homeWith();
    const { code, stdout } = await run(["login", "--url", api.url, "--profile", "ci", "--json"], {
      HOME,
    });
    expect(code).toBe(0);
    const lines = stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as object);
    expect(lines).toEqual([
      {
        schemaVersion: 1,
        status: "pending",
        url: `${api.url}/cli-login?code=BCDF-GHJK`,
        code: "BCDF-GHJK",
        expiresAt: expect.any(String),
      },
      expect.objectContaining({
        schemaVersion: 1,
        status: "approved",
        profile: "ci",
        url: api.url,
        user: expect.objectContaining({ email: "login@example.com" }),
      }),
    ]);
  });

  it.each([
    ["denied", "login_denied"],
    ["expired", "login_expired"],
  ] as const)("exits 3 and saves nothing when %s", async (status, error) => {
    api.login.status = status;
    const HOME = await homeWith();
    const { code, stderr } = await run(["login", "--url", api.url], { HOME });
    expect(code).toBe(3);
    expect(stderr).toMatch(new RegExp(`^${error}: `, "u"));
    await expect(stat(profileFile(HOME))).rejects.toThrow();
  });
});

describe("keys", () => {
  it("revokes a key by id and needs a name to create one", async () => {
    const revoked = await run(["keys", "revoke", "key_9"], withKey());
    expect(JSON.parse(revoked.stdout)).toEqual({ schemaVersion: 1, revoked: true, id: "key_9" });
    expect(api.login.revoked).toContain("key_9");
    expect((await run(["keys", "create"], withKey())).stderr).toMatch(/^usage: Pass --name/u);
  });
});

describe("doctor", () => {
  it("passes on a good profile and names the fix for a wrong URL", async () => {
    const HOME = await homeWith({ default: { url: api.url, apiKey: API_KEY } });
    const good = await run(["doctor"], { HOME });
    expect(good.code).toBe(0);
    expect(good.stdout).toMatch(/^ok {4}instance {2}http:\/\/127\.0\.0\.1:\d+ answers$/mu);
    expect(good.stdout).toMatch(/^ok {4}profile {3}default, unknown account at /mu);
    expect(good.stdout).toMatch(/^ok {4}key {7}valid for admin@example\.com \(admin\)$/mu);
    expect(good.stdout).toMatch(/^(ok {2}|warn) {2}capture /mu);

    const bad = await run(["doctor", "--url", "http://127.0.0.1:9", "--json"], { HOME });
    expect(bad.code).toBe(1);
    expect(bad.stderr).toBe("doctor_failed: Failed: instance, profile\n");
    const report = JSON.parse(bad.stdout) as {
      schemaVersion: number;
      ok: boolean;
      checks: object[];
    };
    expect(report).toMatchObject({ schemaVersion: 1, ok: false });
    expect(report.checks.slice(0, 3)).toEqual([
      expect.objectContaining({ name: "instance", status: "fail", fix: "check --url" }),
      expect.objectContaining({
        name: "profile",
        status: "fail",
        fix: `use --url ${api.url}, or run screen-commons login --url http://127.0.0.1:9`,
      }),
      expect.objectContaining({ name: "key", status: "skip" }),
    ]);
  });

  it("names the variable when a key from the environment is rejected", async () => {
    const HOME = await homeWith({ default: { url: api.url, apiKey: API_KEY } });
    const { code, stdout } = await run(["doctor"], {
      HOME,
      SCREEN_COMMONS_API_KEY: "sc_stale_key",
    });
    expect(code).toBe(1);
    expect(stdout).toMatch(
      /^FAIL {2}key {7}.*Fix: replace or unset SCREEN_COMMONS_API_KEY, which wins over profile default$/mu,
    );
  });

  it("warns when CHROME_PATH points at nothing", async () => {
    const HOME = await homeWith({ default: { url: api.url, apiKey: API_KEY } });
    const { code, stdout } = await run(["doctor"], { HOME, CHROME_PATH: "/nonexistent/chromium" });
    expect(code).toBe(0);
    expect(stdout).toMatch(/^warn {2}capture {3}no Chromium at \/nonexistent\/chromium/mu);
  });
});

describe("bundles", () => {
  const readBundle = async (out: string): Promise<ReferenceBundle> =>
    referenceBundleSchema.parse(JSON.parse(await readFile(join(out, "bundle.json"), "utf8")));
  const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

  it("writes a valid bundle", async () => {
    const out = join(dir, "bundle-flow");
    const { code, stdout } = await run(["flows", "bundle", "flow_1", "--out", out], withKey());
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ path: out, steps: 2, downloaded: 2, warnings: [] });
    const bundle = await readBundle(out);
    expect(bundle.flow).toMatchObject({ id: "flow_1", catalogUrl: `${api.url}/flows/flow_1` });
    expect(bundle.steps.map((step) => [step.position, step.id, step.localPath])).toEqual([
      [0, "scr_1", "images/00-scr_1.png"],
      [1, "scr_2", "images/01-scr_2.png"],
    ]);
    for (const step of bundle.steps) {
      const image = await readFile(join(out, step.localPath));
      expect(sha256(image)).toBe(step.sha256);
      expect([step.width, step.height]).toEqual([2880, 1800]);
    }
    const references = await readFile(join(out, "REFERENCES.md"), "utf8");
    expect(references.indexOf("](images/00-scr_1.png)")).toBeGreaterThan(0);
    expect(references.indexOf(`(${api.url}/screens/scr_2)`)).toBeGreaterThan(
      references.indexOf("](images/00-scr_1.png)"),
    );

    const screens = join(dir, "bundle-screens");
    const loose = await run(
      ["screens", "bundle", "scr_3", "scr_1", "scr_2", "--out", screens],
      withKey(),
    );
    expect(loose.code).toBe(0);
    const looseBundle = await readBundle(screens);
    expect(looseBundle.flow).toBeNull();
    expect(looseBundle.steps.map((step) => step.id)).toEqual(["scr_3", "scr_1", "scr_2"]);
  });

  it("reruns without downloading again", async () => {
    const out = join(dir, "bundle-rerun");
    const args = ["flows", "bundle", "flow_1", "--out", out];
    expect((await run(args, withKey())).code).toBe(0);
    const before = api.mediaRequests.length;
    const again = await run(args, withKey());
    expect(again.code).toBe(0);
    expect(JSON.parse(again.stdout)).toMatchObject({ downloaded: 0, reused: 2 });
    expect(api.mediaRequests.length).toBe(before);

    await writeFile(join(out, "images/01-scr_2.png"), "damaged");
    const repaired = await run(args, withKey());
    expect(JSON.parse(repaired.stdout)).toMatchObject({ downloaded: 1, reused: 1 });
    expect(api.mediaRequests.slice(before)).toEqual(["/media/scr_2-full.png"]);
    const step = (await readBundle(out)).steps[1]!;
    expect(sha256(await readFile(join(out, step.localPath)))).toBe(step.sha256);
  });

  it("flags pending content", async () => {
    const out = join(dir, "bundle-pending");
    const { code, stdout } = await run(["flows", "bundle", "pending", "--out", out], withKey());
    expect(code).toBe(0);
    expect(JSON.parse(stdout).warnings).toEqual(["pending_content"]);
    const bundle = await readBundle(out);
    expect(bundle.flow!.warnings).toEqual(["pending_content"]);
    expect(bundle.steps.every((step) => step.warnings.includes("pending_content"))).toBe(true);
    expect(bundle.steps[0]!.contributor).toEqual({ owned: true, source: "seed" });
    expect(await readFile(join(out, "REFERENCES.md"), "utf8")).toContain("**pending_content**");
  });

  it("refuses to mix bundles, and writes nothing for a flow it can't read", async () => {
    const out = join(dir, "bundle-collision");
    expect((await run(["flows", "bundle", "flow_1", "--out", out], withKey())).code).toBe(0);
    const other = ["screens", "bundle", "scr_9", "--out", out];
    const refused = await run(other, withKey());
    expect(refused.code).toBe(2);
    expect(refused.stderr).toMatch(/^file_exists: .*the bundle of flow flow_1; pass --force/u);
    expect((await run([...other, "--force"], withKey())).code).toBe(0);
    expect(await readdir(join(out, "images"))).toEqual(["00-scr_9.png"]);

    const notes = join(dir, "bundle-notes");
    await mkdir(notes);
    await writeFile(join(notes, "REFERENCES.md"), "my notes\n");
    const overwrite = await run(["flows", "bundle", "flow_1", "--out", notes], withKey());
    expect(overwrite.stderr).toMatch(/^file_exists: .*files this CLI didn't write; pass --force/u);
    expect(await readFile(join(notes, "REFERENCES.md"), "utf8")).toBe("my notes\n");

    const file = join(notes, "REFERENCES.md");
    const notFolder = await run(["flows", "bundle", "flow_1", "--out", file], withKey());
    expect(notFolder.code).toBe(2);
    expect(notFolder.stderr).toMatch(/^usage: --out .* is not a folder/u);

    const unsafe = join(dir, "bundle-unsafe");
    const dotted = await run(["screens", "bundle", "x.y", "--out", unsafe], withKey());
    expect(dotted.stderr).toMatch(/^bad_response: Screen id "x\.y" can't name a file/u);
    await expect(access(unsafe)).rejects.toThrow();

    const missing = join(dir, "bundle-missing");
    const notFound = await run(["flows", "bundle", "missing", "--out", missing], withKey());
    expect(notFound.code).toBe(4);
    await expect(access(missing)).rejects.toThrow();
    expect((await run(["flows", "bundle", "flow_1"], withKey())).stderr).toMatch(
      /^usage: Pass --out/u,
    );
  });
});
