import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { API_KEY, startMockApi, type MockApi } from "./mock-api";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const skills = join(packageDir, "skills");
const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
let api: MockApi;
let dir: string;

function node(script: string, args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, fail) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: dir,
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

async function file(name: string, content: unknown) {
  const path = join(dir, name);
  await writeFile(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

beforeAll(async () => {
  api = await startMockApi();
  dir = await mkdtemp(join(tmpdir(), "screen-commons-skill-scripts-"));
});
afterAll(async () => {
  await api.close();
  await rm(dir, { recursive: true, force: true });
});

describe("scan-personal-data", () => {
  const scan = (path: string) =>
    node(join(skills, "screen-commons-contribute/scripts/scan-personal-data.mjs"), [path]);
  const manifest = (screens: object[], flows: object[] = []) => ({
    version: 1,
    id: "scan",
    app: { name: "Fixture Tunes" },
    screens: screens.map((screen, index) => ({
      localId: `s${index}`,
      source: { file: `shots/4155550132-${index}.png` },
      patterns: [],
      elements: [],
      ...screen,
    })),
    flows,
  });

  it("passes product text with prices, dates, counts and times", async () => {
    const path = await file(
      "clean.json",
      manifest([
        {
          title: "Create playlist",
          text: "Playlist Blend Folder Premium $10.99/month 1,150 songs 2026-11-10 12:30 v1.63.0",
          sourceUrl: "https://tunes.example/playlist/37i9dQZF1DXcBWIGoYBM5M",
        },
      ]),
    );
    const { code, stdout } = await scan(path);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, findings: [] });
    expect(code).toBe(0);
  });

  it("names each email, phone and card number with where it is", async () => {
    const path = await file(
      "personal.json",
      manifest(
        [
          { text: "Signed in as jane.doe@gmail.com" },
          { title: "Call (415) 555-0132 or +44 20 7946 0958" },
        ],
        [
          {
            localId: "f",
            name: "Pay",
            steps: [
              { screen: "s0", label: "Card 4242 4242 4242 4242 12/34" },
              { screen: "s1", label: "Done" },
            ],
          },
        ],
      ),
    );
    const { code, stdout, stderr } = await scan(path);
    expect(code).toBe(1);
    expect(JSON.parse(stdout).findings).toEqual([
      { path: "screens[0].text", kind: "email", match: "jane.doe@gmail.com" },
      { path: "screens[1].title", kind: "phone", match: "(415) 555-0132" },
      { path: "screens[1].title", kind: "phone", match: "+44 20 7946 0958" },
      { path: "flows[0].steps[0].label", kind: "card", match: "4242 4242 4242 4242 12" },
    ]);
    expect(stderr).toContain("email jane.doe@gmail.com");
  });

  it("scans a text file that isn't JSON", async () => {
    const { code, stdout } = await scan(await file("text.txt", "Logged in: sam@corp.example.com"));
    expect(code).toBe(1);
    expect(JSON.parse(stdout).findings).toEqual([
      { path: "text", kind: "email", match: "sam@corp.example.com" },
    ]);
  });
});

describe("enrich-batch", () => {
  const log = () => join(dir, "cli-calls.jsonl");
  const enrich = async (batch: unknown, ...flags: string[]) => {
    const shim = await file(
      "cli-shim.mjs",
      `import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
appendFileSync(${JSON.stringify(log())}, JSON.stringify(process.argv.slice(2)) + "\\n");
const result = spawnSync(process.execPath, ["--import", ${JSON.stringify(tsx)}, ${JSON.stringify(join(packageDir, "src/cli.ts"))}, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
`,
    );
    await writeFile(log(), "");
    const result = await node(
      join(skills, "screen-commons-enrich/scripts/enrich-batch.mjs"),
      [await file("batch.json", batch), ...flags],
      {
        SCREEN_COMMONS_URL: api.url,
        SCREEN_COMMONS_API_KEY: API_KEY,
        SCREEN_COMMONS_CLI: `${process.execPath} ${shim}`,
      },
    );
    const calls = (await readFile(log(), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
    return { ...result, report: JSON.parse(result.stdout || "null"), calls };
  };
  const writes = (calls: string[][]) => calls.filter((call) => call[1] === "update");

  it("shows the diff in a dry run and writes nothing", async () => {
    const { code, report, calls } = await enrich({
      items: [
        { screen: "scr_1", title: "Choose a plan", text: "Free  Plus\nBusiness" },
        { flow: "flow_1", type: "signing-up", labels: [null, "See pricing"] },
      ],
    });
    expect(code).toBe(0);
    expect(report.items).toEqual([
      {
        kind: "screen",
        id: "scr_1",
        result: "would-change",
        changes: {
          title: { from: "Pricing – Linear", to: "Choose a plan" },
          text: { from: null, to: "Free Plus Business" },
        },
      },
      {
        kind: "flow",
        id: "flow_1",
        result: "would-change",
        changes: {
          steps: {
            from: [
              { screenId: "scr_1", label: "Landing" },
              { screenId: "scr_2", label: "Pricing" },
            ],
            to: [
              { screenId: "scr_1", label: "Landing" },
              { screenId: "scr_2", label: "See pricing" },
            ],
          },
        },
      },
    ]);
    expect(writes(calls)).toEqual([]);
  });

  it("--apply writes exactly the diff and checks what the server saved", async () => {
    const batch = {
      items: [
        { screen: "scr_1", title: "Choose a plan", text: "Free Plus Business" },
        { screen: "scr_2", title: "Pricing – Linear" },
      ],
    };
    const { code, report, calls } = await enrich(batch, "--apply");
    expect(code).toBe(0);
    expect(report.items.map((item: { result: string }) => item.result)).toEqual([
      "saved",
      "unchanged",
    ]);
    expect(writes(calls)).toEqual([
      [
        "screens",
        "update",
        "scr_1",
        "--patch",
        JSON.stringify({ title: "Choose a plan", text: "Free Plus Business" }),
      ],
    ]);
  });

  it("fails an item whose labels don't match its steps, and still does the rest", async () => {
    const { code, report } = await enrich({
      items: [
        { flow: "flow_1", labels: ["Only one"] },
        { screen: "scr_1", title: "Choose a plan" },
      ],
    });
    expect(code).toBe(1);
    expect(report.items[0]).toMatchObject({
      result: "failed",
      error: "flow flow_1 has 2 steps, but labels has 1",
    });
    expect(report.items[1]).toMatchObject({ result: "would-change" });
  });

  it("refuses a field of the wrong type or an id that looks like a flag", async () => {
    for (const item of [
      { screen: "scr_1", title: null },
      { flow: "flow_1", labels: [1, 2] },
      { screen: "--help", title: "x" },
    ]) {
      const { code, calls } = await enrich({ items: [item] });
      expect(code).toBe(2);
      expect(calls).toEqual([]);
    }
  });

  it("refuses a batch of more than 25 items before reading any", async () => {
    const items = Array.from({ length: 26 }, (_, index) => ({
      screen: `scr_${index}`,
      title: "x",
    }));
    const { code, stderr, calls } = await enrich({ items });
    expect(code).toBe(2);
    expect(stderr).toContain("split them into batches of 25");
    expect(calls).toEqual([]);
  });
});
