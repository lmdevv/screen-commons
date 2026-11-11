import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { API_KEY, startMockApi, type MockApi } from "./mock-api";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(packageDir, "skills/screen-commons-research/scripts/check-references.mjs");
const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
let api: MockApi;
let dir: string;

interface Report {
  ok: boolean;
  bundles: { path: string; flows: string[]; screens: string[] }[];
  problems: Record<string, string>[];
}

function check(args: string[]) {
  return new Promise<{ code: number | null; report: Report; stderr: string }>((done, fail) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: packageDir,
      env: {
        PATH: process.env.PATH,
        SCREEN_COMMONS_URL: api.url,
        SCREEN_COMMONS_API_KEY: API_KEY,
        SCREEN_COMMONS_CLI: `${process.execPath} --import ${tsx} ${join(packageDir, "src/cli.ts")}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.once("error", fail);
    child.once("close", (code) =>
      done({ code, report: (stdout ? JSON.parse(stdout) : null) as Report, stderr }),
    );
  });
}

async function writeBundle(
  name: string,
  {
    flow = "flow_ok" as string | null,
    screens = ["scr_1", "scr_2"],
    instance = api.url,
    extra = "",
  } = {},
) {
  const bundle = join(dir, name);
  await mkdir(join(bundle, "images"), { recursive: true });
  const steps = [];
  for (const [position, id] of screens.entries()) {
    const bytes = Buffer.from(`image of ${id}`);
    const localPath = `images/0${position}-${id}.webp`;
    await writeFile(join(bundle, localPath), bytes);
    steps.push({
      id,
      position,
      label: null,
      title: "Pricing – Linear",
      catalogUrl: `${instance}/screens/${id}`,
      imageUrl: `${instance}/media/${id}-full.png`,
      localPath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: 2880,
      height: 1800,
      sourceUrl: "https://linear.app/pricing",
      capturedAt: "2026-10-01T00:00:00.000Z",
      app: { id: "app_1", slug: "linear", name: "Linear", platform: "web" },
      contributor: { owned: false, source: "seed" },
      status: "published",
      warnings: [],
    });
  }
  const json = {
    version: 1,
    instance,
    retrievedAt: "2026-11-10T00:00:00.000Z",
    flow: flow && {
      id: flow,
      name: "Signing up",
      type: "signing-up",
      catalogUrl: `${instance}/flows/${flow}`,
      app: { id: "app_1", slug: "linear", name: "Linear", platform: "web" },
      status: "published",
      warnings: [],
    },
    steps,
  };
  const markdown = [
    flow ? "# Signing up (Linear)" : `# ${screens.length} screens`,
    "",
    flow ? `Flow [${flow}](${instance}/flows/${flow}), published, ${screens.length} steps.` : "",
    "",
    ...steps.flatMap((step) => [
      `## ${step.position}. ${step.title}`,
      "",
      `![Pricing \\– Linear](${step.localPath})`,
      "",
      `- Screen: [${step.id}](${step.catalogUrl}), Pricing – Linear`,
      `- Source URL: ${step.sourceUrl}`,
      "",
    ]),
    extra,
  ].join("\n");
  await writeFile(join(bundle, "bundle.json"), JSON.stringify(json, null, 2));
  await writeFile(join(bundle, "REFERENCES.md"), markdown);
  return bundle;
}

async function answer(text: string) {
  const path = join(dir, `answer-${Math.random().toString(36).slice(2)}.md`);
  await writeFile(path, text);
  return path;
}

beforeAll(async () => {
  api = await startMockApi();
  dir = await mkdtemp(join(tmpdir(), "screen-commons-refs-"));
});
afterAll(async () => {
  await api.close();
  await rm(dir, { recursive: true, force: true });
});

describe("check-references", () => {
  it("passes a bundle whose every id is in the catalog, and an answer that cites only those", async () => {
    const bundle = await writeBundle("valid");
    const cited = await answer(
      `Open Linear's pricing ([scr_1](${api.url}/screens/scr_1)), then scr_2, all in flow [flow_ok](${api.url}/flows/flow_ok).`,
    );
    const { code, report } = await check([bundle, "--answer", cited]);
    expect(report.problems).toEqual([]);
    expect(code).toBe(0);
    expect(report.bundles).toEqual([
      { path: bundle, flows: ["flow_ok"], screens: ["scr_1", "scr_2"] },
    ]);
  });

  it("finds bundles one folder down", async () => {
    await writeBundle("research/one");
    await writeBundle("research/two", { flow: "flow_two" });
    const { code, report } = await check([join(dir, "research")]);
    expect(code).toBe(0);
    expect(report.bundles.map((bundle) => bundle.flows)).toEqual([["flow_ok"], ["flow_two"]]);
  });

  it("names an invented screen id, in a flow bundle and on its own", async () => {
    const inFlow = await writeBundle("invented-step", {
      extra: `- Screen: [scr_invented](${api.url}/screens/scr_invented)`,
    });
    const flowResult = await check([inFlow]);
    expect(flowResult.code).toBe(1);
    expect(flowResult.report.problems).toEqual([
      { bundle: inFlow, id: "scr_invented", problem: "screen is not a step of flow flow_ok" },
    ]);

    const loose = await writeBundle("invented-screen", {
      flow: null,
      screens: ["scr_1", "missing"],
    });
    const looseResult = await check([loose]);
    expect(looseResult.code).toBe(1);
    expect(looseResult.report.problems).toEqual([
      { bundle: loose, id: "missing", problem: "screen is not in the catalog" },
    ]);
  });

  it("fails an answer that cites an id no checked bundle holds", async () => {
    const bundle = await writeBundle("for-answer");
    const invented = "01jc5zq8w3k2m4n6p7r9s0t1vx";
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const cited = await answer(
      `See ${invented} and [scr_1](${api.url}/screens/scr_1), then flow ${uuid}.`,
    );
    const { code, report } = await check([bundle, "--answer", cited]);
    expect(code).toBe(1);
    expect(report.problems).toEqual([
      { answer: cited, id: invented, problem: "cited, but no checked bundle holds it" },
      { answer: cited, id: uuid, problem: "cited, but no checked bundle holds it" },
    ]);
  });

  it("checks an answer with no bundle, as for an app the catalog doesn't have", async () => {
    const honest = await check(["--answer", await answer("The catalog has no Netflix flows.")]);
    expect(honest.code).toBe(0);
    const invented = await check([
      "--answer",
      await answer(`Netflix does it like this: ${api.url}/flows/flow_made_up`),
    ]);
    expect(invented.code).toBe(1);
    expect(invented.report.problems[0]).toMatchObject({ id: "flow_made_up" });
  });

  it("fails an image that changed after the bundle was written", async () => {
    const bundle = await writeBundle("changed-image");
    await writeFile(join(bundle, "images/01-scr_2.webp"), "something else");
    const { code, report } = await check([bundle]);
    expect(code).toBe(1);
    expect(report.problems).toEqual([
      {
        bundle,
        id: "scr_2",
        problem: "image images/01-scr_2.webp changed since the bundle was written",
      },
    ]);
  });

  it("won't check a bundle from another instance than the CLI's", async () => {
    const bundle = await writeBundle("elsewhere", { instance: "https://elsewhere.example" });
    const { code, stderr } = await check([bundle]);
    expect(code).toBe(2);
    expect(stderr).toContain("comes from https://elsewhere.example, but screen-commons reads");
  });

  it("refuses a folder that holds no bundle", async () => {
    const empty = join(dir, "empty");
    await mkdir(empty, { recursive: true });
    const { code, stderr } = await check([empty]);
    expect(code).toBe(2);
    expect(stderr).toContain("holds no bundle.json");
  });
});
