import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LIMITS,
  captureManifestSchema,
  createFlowInputSchema,
  createScreenCommonsClient,
  type CaptureManifestInput,
} from "@screen-commons/core";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { flowIdFor, publishManifest, type PublishOptions } from "../src/publish";
import { retryAfterMs, retryingFetch } from "../src/retry";
import { fakeCatalog, refusal } from "./fake-catalog";

let dir: string;
const names = ["a", "b", "c", "d"];

const png = (index: number, width = 800, height = 500) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: index % 256, g: (index * 7) % 256, b: Math.floor(index / 256) },
    },
  })
    .png()
    .toBuffer();

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "screen-commons-publish-"));
  for (const [index, name] of names.entries()) {
    await writeFile(join(dir, `${name}.png`), await png(index + 1));
  }
  await writeFile(join(dir, "broken.png"), "not an image");
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const manifestInput = (): CaptureManifestInput => ({
  version: 1,
  id: "acme-signup",
  app: { name: "Acme", websiteUrl: "https://acme.example.com" },
  screens: names.map((name) => ({
    localId: name,
    source: { file: `${name}.png` },
    title: `Screen ${name}`,
    patterns: ["signup"],
    elements: [],
  })),
  flows: [
    { localId: "first", name: "First", steps: [{ screen: "a", label: "Start" }, { screen: "b" }] },
    { localId: "again", name: "Again", steps: [{ screen: "b" }, { screen: "c" }, { screen: "b" }] },
  ],
});

const publish = (
  catalog: ReturnType<typeof fakeCatalog>,
  input: CaptureManifestInput,
  options: Partial<PublishOptions> = {},
) =>
  publishManifest(captureManifestSchema.parse(input), {
    client: catalog.client,
    baseDir: dir,
    ...options,
  });

describe("flowIdFor", () => {
  it("is a stable v5 UUID that createFlow accepts, unique per manifest and flow", () => {
    const id = flowIdFor("m", "f");
    expect(id).toBe(flowIdFor("m", "f"));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(createFlowInputSchema.shape.id.safeParse(id).success).toBe(true);
    expect(flowIdFor("m", "g")).not.toBe(id);
    expect(flowIdFor("a/b", "c")).not.toBe(flowIdFor("a", "b/c"));
  });
});

describe("publishManifest", () => {
  it("publishes screens and flows, and reports each", async () => {
    const catalog = fakeCatalog();
    const report = await publish(catalog, manifestInput());
    expect(report.ok).toBe(true);
    expect(report.app).toMatchObject({ slug: "acme", url: "http://catalog.test/apps/acme" });
    expect(report.screens.map((item) => item.localId)).toEqual(names);
    expect(report.screens[0]).toEqual({
      localId: "a",
      id: "scr_1",
      status: "published",
      url: "http://catalog.test/screens/scr_1",
    });
    const flow = catalog.flows.get(flowIdFor("acme-signup", "again"))!;
    expect(flow.steps.map((step) => step.screen.id)).toEqual(["scr_2", "scr_3", "scr_2"]);
    expect(report.flows[1]).toEqual({
      localId: "again",
      id: flow.id,
      status: "published",
      url: `http://catalog.test/flows/${flow.id}`,
    });
  });

  it("repeats to the same report without creating or patching anything", async () => {
    const catalog = fakeCatalog();
    const first = await publish(catalog, manifestInput());
    const second = await publish(catalog, manifestInput());
    expect(second).toEqual(first);
    expect(catalog.screens.size).toBe(4);
    expect(catalog.flows.size).toBe(2);
    expect(catalog.writes()).toEqual([]);
  });

  it("patches what an edited manifest changed, and nothing else", async () => {
    const catalog = fakeCatalog();
    await publish(catalog, manifestInput());
    const edited = manifestInput();
    edited.screens[0]!.title = "Renamed";
    edited.screens[1]!.tags = ["new"];
    edited.flows![0]!.name = "Renamed flow";
    edited.flows![1]!.steps = [{ screen: "c", label: "Reordered" }, { screen: "b" }];
    const report = await publish(catalog, edited);
    expect(report.ok).toBe(true);
    expect(catalog.writes().map(({ path, body }) => [path, body])).toEqual([
      ["/screens/scr_1", { title: "Renamed" }],
      ["/screens/scr_2", { tags: ["new"] }],
      [`/flows/${flowIdFor("acme-signup", "first")}`, { name: "Renamed flow" }],
      [
        `/flows/${flowIdFor("acme-signup", "again")}`,
        { steps: [{ screenId: "scr_3", label: "Reordered" }, { screenId: "scr_2" }] },
      ],
    ]);
    await publish(catalog, edited);
    expect(catalog.writes()).toHaveLength(4);
  });

  it("clears a flow's type and description when the manifest drops them", async () => {
    const catalog = fakeCatalog();
    const typed = manifestInput();
    typed.flows![0]!.type = "signing-up";
    typed.flows![0]!.description = "Described";
    await publish(catalog, typed);
    await publish(catalog, manifestInput());
    expect(catalog.writes().at(-1)?.body).toEqual({ type: null, description: null });
  });

  it("carries on past a bad item, and fails only the flows that need it", async () => {
    const catalog = fakeCatalog();
    const input = manifestInput();
    input.screens[1]!.source = { file: "broken.png" };
    input.screens[3]!.source = { file: "missing.png" };
    input.flows!.push({ localId: "fine", name: "Fine", steps: [{ screen: "a" }, { screen: "c" }] });
    const report = await publish(catalog, input);
    expect(report.ok).toBe(false);
    expect(report.screens.map((item) => [item.localId, item.status, item.error?.code])).toEqual([
      ["a", "published", undefined],
      ["b", "failed", "invalid_image"],
      ["c", "published", undefined],
      ["d", "failed", "source_unreadable"],
    ]);
    expect(report.flows.map((item) => [item.localId, item.status, item.error?.code])).toEqual([
      ["first", "failed", "screen_failed"],
      ["again", "failed", "screen_failed"],
      ["fine", "published", undefined],
    ]);
    expect(report.flows[0]!.error!.message).toContain("b");
  });

  it("sends a refused batch's screens one by one, so one can't sink the rest", async () => {
    const catalog = fakeCatalog();
    let seen = 0;
    catalog.setFault((method, path) => {
      if (method !== "POST" || path !== "/captures") return undefined;
      seen += 1;
      // The batch, then screens a and b; b is what the server won't take.
      return seen === 1 || seen === 3 ? refusal(422, "unprocessable") : undefined;
    });
    const report = await publish(catalog, manifestInput());
    expect(seen).toBe(5);
    expect(report.screens.map((item) => item.status)).toEqual([
      "published",
      "failed",
      "published",
      "published",
    ]);
    expect(report.screens[1]!.error).toEqual({ code: "unprocessable", message: "unprocessable" });
  });

  it("stops at a rejected key rather than repeating the refusal", async () => {
    const catalog = fakeCatalog();
    catalog.setFault(() => refusal(401, "unauthorized"));
    const report = await publish(catalog, manifestInput());
    expect(catalog.requests).toHaveLength(1);
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe("unauthorized");
    expect(report.screens.every((item) => item.error?.code === "unauthorized")).toBe(true);
  });

  it("keeps batches within the screen and byte limits", async () => {
    const catalog = fakeCatalog();
    const count = LIMITS.maxScreensPerBatch + 2;
    const many = await mkdtemp(join(dir, "many-"));
    const screens = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        await writeFile(join(many, `${index}.png`), await png(index + 10, 64, 40));
        return {
          localId: String(index),
          source: { file: join(many, `${index}.png`) },
          patterns: [],
          elements: [],
        };
      }),
    );
    const report = await publish(catalog, { ...manifestInput(), screens, flows: [] });
    expect(report.ok).toBe(true);
    expect(catalog.batches.map((batch) => batch.screens)).toEqual([LIMITS.maxScreensPerBatch, 2]);

    const small = fakeCatalog();
    const limit = 4000;
    const sized = await publish(
      small,
      { ...manifestInput(), flows: [] },
      { maxBatchBytes: limit, batchSize: 3 },
    );
    expect(sized.ok).toBe(true);
    expect(small.batches.length).toBeGreaterThan(1);
    expect(small.batches.every((batch) => batch.screens <= 3)).toBe(true);
    expect(small.batches.every((batch) => batch.screens === 1 || batch.bytes <= limit)).toBe(true);
    expect(small.batches.reduce((sum, batch) => sum + batch.screens, 0)).toBe(4);
  });

  it("gives identical images one row, and says whose metadata applies", async () => {
    const catalog = fakeCatalog();
    const input = manifestInput();
    input.screens[1]!.source = { file: "a.png" };
    const report = await publish(catalog, { ...input, flows: [] });
    expect(report.ok).toBe(true);
    expect(report.screens[1]!.id).toBe(report.screens[0]!.id);
    expect(report.screens[1]!.warning).toContain('"a"');
    expect(catalog.screens.get(report.screens[0]!.id!)!.title).toBe("Screen a");
    expect(catalog.writes()).toEqual([]);
  });

  it("leaves someone else's screen alone, with a warning", async () => {
    const catalog = fakeCatalog();
    await publish(catalog, manifestInput());
    catalog.screens.get("scr_1")!.owned = false;
    const edited = manifestInput();
    edited.screens[0]!.title = "Mine now";
    const report = await publish(catalog, edited);
    expect(report.ok).toBe(true);
    expect(report.screens[0]!.warning).toContain("Someone else");
    expect(catalog.writes()).toEqual([]);
  });

  it("fetches https sources without the key, and refuses a downgrade", async () => {
    const catalog = fakeCatalog();
    const image = await png(99);
    const seen: { url: string; headers: unknown }[] = [];
    const source: typeof fetch = async (input, init) => {
      seen.push({ url: String(input), headers: init?.headers });
      if (String(input).endsWith("/moved")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.com/a.png" },
        });
      }
      if (String(input).endsWith("/down")) {
        return new Response(null, { status: 302, headers: { location: "http://x.example.com/" } });
      }
      return new Response(image);
    };
    const input = manifestInput();
    input.screens = [
      { localId: "ok", source: { url: "https://x.example.com/moved" }, patterns: [], elements: [] },
      { localId: "no", source: { url: "https://x.example.com/down" }, patterns: [], elements: [] },
    ];
    input.flows = [];
    const report = await publish(catalog, input, { fetch: source });
    expect(report.screens[0]!.status).toBe("published");
    expect(report.screens[1]!.error?.code).toBe("source_unreadable");
    expect(seen.map((call) => call.url)).toContain("https://cdn.example.com/a.png");
    expect(JSON.stringify(seen)).not.toContain("sc_test_key");
  });

  it("converges after a retry whose first try landed", async () => {
    const catalog = fakeCatalog();
    let dropped = 0;
    const slept: number[] = [];
    const lossy: typeof fetch = async (input, init) => {
      const response = await catalog.fetch(input, init);
      const write = init?.method === "POST";
      if (write && dropped < 2) {
        dropped += 1;
        throw new TypeError("fetch failed");
      }
      return response;
    };
    const report = await publish(catalog, manifestInput(), {
      client: createScreenCommonsClient({
        baseUrl: "http://catalog.test",
        apiKey: "sc_test_key",
        fetch: retryingFetch({
          fetch: lossy,
          sleep: async (ms) => {
            slept.push(ms);
          },
        }),
      }),
    });
    expect(report.ok).toBe(true);
    expect(slept).toEqual([1000, 2000]);
    expect(catalog.screens.size).toBe(4);
  });
});

describe("retryingFetch", () => {
  const scripted = (...steps: (Response | Error)[]) => {
    const calls: (string | undefined)[] = [];
    const doFetch: typeof fetch = async (_input, init) => {
      calls.push(init?.method);
      const step = steps.shift()!;
      if (step instanceof Error) throw step;
      return step;
    };
    return { calls, doFetch };
  };
  const slept: number[] = [];
  const options = {
    sleep: async (ms: number) => {
      slept.push(ms);
    },
  };

  it("honours Retry-After over its own backoff", async () => {
    slept.length = 0;
    const { doFetch, calls } = scripted(
      new Response("", { status: 429, headers: { "retry-after": "7" } }),
      new Response("", { status: 503 }),
      new Response("ok"),
    );
    const response = await retryingFetch({ ...options, fetch: doFetch })("http://x", {});
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);
    expect(slept).toEqual([7000, 2000]);
  });

  it("gives up after its bound, handing back the last answer", async () => {
    slept.length = 0;
    const { doFetch, calls } = scripted(
      ...Array.from({ length: 5 }, () => new Response("", { status: 500 })),
    );
    const response = await retryingFetch({ ...options, fetch: doFetch })("http://x");
    expect(response.status).toBe(500);
    expect(calls).toHaveLength(5);
    expect(slept).toEqual([1000, 2000, 4000, 8000]);
  });

  it("doesn't sleep through a Retry-After past its limit", async () => {
    slept.length = 0;
    const { doFetch, calls } = scripted(
      new Response("", { status: 429, headers: { "retry-after": "3600" } }),
    );
    const response = await retryingFetch({ ...options, fetch: doFetch })("http://x");
    expect(response.status).toBe(429);
    expect(calls).toHaveLength(1);
  });

  it("leaves other refusals alone", async () => {
    const { doFetch, calls } = scripted(new Response("", { status: 404 }));
    await retryingFetch({ ...options, fetch: doFetch })("http://x");
    expect(calls).toHaveLength(1);
  });

  it("repeats a DELETE only when the server refused to start it", async () => {
    const lost = scripted(new TypeError("fetch failed"));
    await expect(
      retryingFetch({ ...options, fetch: lost.doFetch })("http://x", { method: "DELETE" }),
    ).rejects.toThrow("fetch failed");
    expect(lost.calls).toHaveLength(1);

    const failed = scripted(new Response("", { status: 500 }));
    const response = await retryingFetch({ ...options, fetch: failed.doFetch })("http://x", {
      method: "DELETE",
    });
    expect(response.status).toBe(500);

    const busy = scripted(new Response("", { status: 503 }), new Response(null, { status: 204 }));
    const retried = await retryingFetch({ ...options, fetch: busy.doFetch })("http://x", {
      method: "DELETE",
    });
    expect(retried.status).toBe(204);
  });

  it("reads Retry-After as seconds or a date", () => {
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs(null)).toBe(null);
    expect(retryAfterMs("soon")).toBe(null);
    expect(retryAfterMs(new Date(5000).toUTCString(), 2000)).toBe(3000);
  });
});
