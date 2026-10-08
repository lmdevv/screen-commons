import { createHash } from "node:crypto";

import {
  LIMITS,
  ScreenCommonsApiError,
  type CaptureBatchResult,
  type ScreenCommonsClient,
} from "@screen-commons/core";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { makePng, makeWebp } from "./images";
import { Session, b64, baseUrl, captureScreen, keyClient, uniqueSuffix } from "./helpers";

const suffix = uniqueSuffix();

let admin: Session;
let member: Session;
let other: Session;
let adminApi: ScreenCommonsClient;
let memberApi: ScreenCommonsClient;
let adminKey: string;
let memberKey: string;

async function apiError(promise: Promise<unknown>): Promise<ScreenCommonsApiError> {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(ScreenCommonsApiError);
  return error as ScreenCommonsApiError;
}

async function mcpCall(token: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl()}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  return response;
}

const sha = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

beforeAll(async () => {
  const credentials = inject("admin");
  admin = await Session.signIn(credentials.email, credentials.password);
  member = await Session.signUp("Reg Member", `reg-member-${suffix}@screen-commons.test`);
  other = await Session.signUp("Reg Other", `reg-other-${suffix}@screen-commons.test`);
  adminKey = (await admin.client().createKey("regressions")).token;
  memberKey = (await member.client().createKey("regressions")).token;
  adminApi = keyClient(adminKey);
  memberApi = keyClient(memberKey);
});

describe("1. flows never expose screens the viewer can't see", () => {
  let published: CaptureBatchResult;

  beforeAll(async () => {
    published = await adminApi.captures({
      app: { name: `Flowapp ${suffix}`, websiteUrl: `https://flowapp-${suffix}.example.com` },
      flow: { name: "Three steps", type: "onboarding" },
      screens: [
        captureScreen({ title: "Step A" }),
        captureScreen({ title: "Step B" }),
        captureScreen({ title: "Step C" }),
      ],
    });
  });

  it("an admin flow that includes a pending screen is created pending", async () => {
    const pending = await memberApi.captures({
      app: { slug: published.app.slug, name: "Flowapp" },
      screens: [captureScreen({ title: "Member pending step" })],
    });
    const { flow } = await adminApi.createFlow({
      appId: published.app.id,
      name: "Mixed",
      steps: [{ screenId: published.screens[0]!.id }, { screenId: pending.screens[0]!.id }],
    });
    expect(flow.status).toBe("pending");
    expect((await apiError(other.client().getFlow(flow.id))).status).toBe(404);
    const otherFlows = await other.client().listFlows({ app: published.app.slug });
    expect(otherFlows.items.map((item) => item.id)).not.toContain(flow.id);
  });

  it("rejecting a screen removes it from published flows (steps, previews, counts, MCP)", async () => {
    const flowId = published.flow!.id;
    const rejected = published.screens[1]!.id;
    await admin.client().review("screen", rejected, "reject", "Blurry");

    const detail = await other.client().getFlow(flowId);
    expect(detail.status).toBe("published");
    expect(detail.steps.map((step) => step.screen.id)).toEqual([
      published.screens[0]!.id,
      published.screens[2]!.id,
    ]);
    expect(detail.steps.map((step) => step.position)).toEqual([0, 1]);
    expect(detail.stepCount).toBe(2);

    const summary = (await other.client().listFlows({ app: published.app.slug })).items.find(
      (item) => item.id === flowId,
    )!;
    expect(summary.previews.map((preview) => preview.id)).not.toContain(rejected);
    expect(summary.stepCount).toBe(2);

    const mcp = await (await mcpCall(memberKey, "get_flow", { id: flowId })).json();
    const steps = JSON.parse(mcp.result.content[0].text).steps as { screen: { id: string } }[];
    expect(steps.map((step) => step.screen.id)).not.toContain(rejected);

    const screen = await other.client().getScreen(published.screens[0]!.id);
    expect(screen.flows).toEqual([{ id: flowId, name: "Three steps", position: 0 }]);
  });

  it("a published flow left with fewer than 2 steps goes back to pending", async () => {
    const flowId = published.flow!.id;
    await admin.client().review("screen", published.screens[2]!.id, "reject");
    expect((await apiError(other.client().getFlow(flowId))).status).toBe(404);
    const queue = await admin.client().reviewQueue();
    const queued = queue.flows.find((item) => item.id === flowId);
    expect(queued).toMatchObject({ status: "pending", stepCount: 1 });
  });
});

describe("2. member uploads don't modify published app metadata", () => {
  it("keeps tagline/description/category/website/logo when a member uploads", async () => {
    const adminLogo = makePng(48, 48, 501);
    const created = await adminApi.captures({
      app: { name: `Moderated ${suffix}`, tagline: "Original tagline" },
      logo: { type: "image/png", base64: b64(adminLogo) },
      screens: [captureScreen({ title: "Admin screen" })],
    });
    const before = await other.client().getApp(created.app.slug);
    expect(before.logoUrl).toBe(`/media/logo/${sha(adminLogo)}.png`);

    const memberLogo = makePng(48, 48, 502);
    const upload = await memberApi.captures({
      app: {
        slug: created.app.slug,
        name: "Moderated",
        tagline: "Hacked tagline",
        description: "Spam description",
        category: "finance",
        websiteUrl: `https://spam-${suffix}.example.com`,
      },
      logo: { type: "image/png", base64: b64(memberLogo) },
      screens: [captureScreen({ title: "Member screen" })],
    });
    expect(upload.app.id).toBe(created.app.id);
    expect(upload.screens[0]!.status).toBe("pending");

    const after = await other.client().getApp(created.app.slug);
    expect(after).toMatchObject({
      tagline: "Original tagline",
      description: null,
      category: null,
      websiteUrl: null,
      logoUrl: before.logoUrl,
      updatedAt: before.updatedAt,
    });
    // the rejected logo was never stored or served
    expect((await fetch(`${baseUrl()}/media/logo/${sha(memberLogo)}.png`)).status).toBe(404);
  });

  it("still lets a member fill in metadata on their own pending app", async () => {
    const first = await memberApi.captures({
      app: { name: `Own pending ${suffix}` },
      screens: [captureScreen()],
    });
    await memberApi.captures({
      app: { slug: first.app.slug, name: "Own", tagline: "Now with a tagline" },
      screens: [captureScreen()],
    });
    expect((await memberApi.getApp(first.app.slug)).tagline).toBe("Now with a tagline");
  });
});

describe("3. media for unpublished content is private", () => {
  it("serves pending media only to its contributor and admins, without public caching", async () => {
    const { screen } = await member.client().createScreen({
      image: new Blob([new Uint8Array(makePng(300, 200, 601))], { type: "image/png" }),
      thumbnail: new Blob([new Uint8Array(makeWebp(150, 100, [1, 2, 3, 255]))], {
        type: "image/webp",
      }),
      meta: { app: { name: `Private media ${suffix}` }, width: 300, height: 200 },
    });
    expect(screen.status).toBe("pending");

    for (const url of [screen.imageUrl, screen.thumbUrl]) {
      expect((await fetch(`${baseUrl()}${url}`)).status).toBe(404);
      expect((await other.fetch(url)).status).toBe(404);
      for (const response of [
        await member.fetch(url),
        await admin.fetch(url),
        await fetch(`${baseUrl()}${url}`, { headers: { authorization: `Bearer ${memberKey}` } }),
      ]) {
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      }
    }

    await admin.client().review("screen", screen.id, "approve");
    const published = await fetch(`${baseUrl()}${screen.imageUrl}`);
    expect(published.status).toBe(200);
    expect(published.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("hides the logo of a member's pending app", async () => {
    const logo = makePng(32, 32, 602);
    const result = await memberApi.captures({
      app: { name: `Pending logo ${suffix}` },
      logo: { type: "image/png", base64: b64(logo) },
      screens: [captureScreen()],
    });
    const url = `/media/logo/${sha(logo)}.png`;
    expect(result.app.logoUrl).toBe(`${baseUrl()}${url}`);
    expect((await fetch(`${baseUrl()}${url}`)).status).toBe(404);
    expect((await member.fetch(url)).status).toBe(200);
  });
});

describe("4. upload limits are enforced before allocation, on every transport", () => {
  const bigBase64 = (decodedBytes: number) => "A".repeat(Math.ceil(decodedBytes / 3) * 4);

  it("counts streamed bytes when there is no Content-Length (chunked)", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(0x41);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > LIMITS.maxRequestBytes + 2 * chunk.byteLength) return controller.close();
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const response = await fetch(`${baseUrl()}/api/v1/captures`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminKey}`, "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(response.headers.get("content-length")).not.toBe(String(sent));
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("payload_too_large");
  });

  it("rejects declared oversize bodies and non-upload bodies over 1 MiB", async () => {
    const huge = await fetch(`${baseUrl()}/api/v1/flows`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminKey}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(2 * 1024 * 1024) }),
    });
    expect(huge.status).toBe(413);
    expect((await huge.json()).error.code).toBe("payload_too_large");
  });

  it("bounds each base64 image before decoding it", async () => {
    const error = await apiError(
      adminApi.captures({
        app: { name: "Too big" },
        screens: [
          {
            ...captureScreen(),
            thumbnail: { type: "image/webp", base64: bigBase64(LIMITS.maxThumbnailBytes + 4096) },
          },
        ],
      }),
    );
    expect(error.status).toBe(413);
    expect(error.message).toContain("screens[0].thumbnail");
  });

  it("bounds the aggregate decoded size of a batch", async () => {
    const perImage = Math.ceil((LIMITS.maxBatchBytes + 1024 * 1024) / 3);
    const error = await apiError(
      adminApi.captures({
        app: { name: "Too big batch" },
        screens: [1, 2, 3].map(() => ({
          ...captureScreen(),
          image: { type: "image/png" as const, base64: bigBase64(perImage) },
        })),
      }),
    );
    expect(error.status).toBe(413);
    expect(error.message).toContain("Split it into smaller batches");
  });

  it("checks multipart file sizes before reading them", async () => {
    const error = await apiError(
      adminApi.createScreen({
        image: new Blob([new Uint8Array(LIMITS.maxImageBytes + 1024)], { type: "image/png" }),
        thumbnail: new Blob([new Uint8Array(makeWebp(10, 10))], { type: "image/webp" }),
        meta: { app: { name: "Multipart too big" }, width: 10, height: 10 },
      }),
    );
    expect(error.status).toBe(413);
    expect(error.message).toContain("image");
  });

  it("applies the same limits to MCP uploads and MCP bodies", async () => {
    const tool = await mcpCall(adminKey, "upload_screen", {
      app: { name: "Mcp too big" },
      image: { type: "image/png", base64: bigBase64(LIMITS.maxImageBytes + 4096) },
    });
    const result = (await tool.json()).result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("payload_too_large");

    const body = await fetch(`${baseUrl()}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${adminKey}`,
      },
      body: "x".repeat(LIMITS.maxRequestBytes + 1),
    });
    expect(body.status).toBe(413);
  });

  it("accepts MCP uploads above the SDK's default 4 MiB body cap", async () => {
    // a valid ~5 MB PNG: random-ish pixels so deflate can't shrink it much
    const width = 1600;
    const height = 1100;
    const png = makePng(width, height, 777, { noise: true });
    expect(b64(png).length).toBeGreaterThan(4 * 1024 * 1024);
    const tool = await mcpCall(adminKey, "upload_screen", {
      app: { name: `Mcp big ok ${suffix}` },
      image: { type: "image/png", base64: b64(png) },
    });
    expect(tool.status).toBe(200);
    const result = (await tool.json()).result;
    expect(result.isError).toBeUndefined();
  });
});

describe("7. hidden full-text matches don't suppress visible results", () => {
  it("falls back to OR when the viewer has no strict (AND) matches", async () => {
    const termA = `quokka${suffix}`;
    const termB = `wombat${suffix}`;
    const visible = await adminApi.captures({
      app: { name: `Fts visible ${suffix}` },
      screens: [captureScreen({ title: "Visible", text: `${termA} only` })],
    });
    const hidden = await memberApi.captures({
      app: { name: `Fts hidden ${suffix}` },
      screens: [captureScreen({ title: "Hidden", text: `${termA} ${termB}` })],
    });

    const listed = await other.client().listScreens({ q: `${termA} ${termB}` });
    expect(listed.items.map((item) => item.id)).toEqual([visible.screens[0]!.id]);

    const searched = await other.client().search({ q: `${termA} ${termB}` });
    expect(searched.screens.map((item) => item.id)).toEqual([visible.screens[0]!.id]);

    // the contributor still gets the strict match first
    const own = await member.client().listScreens({ q: `${termA} ${termB}` });
    expect(own.items.map((item) => item.id)).toEqual([hidden.screens[0]!.id]);
  });
});
