import {
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
let adminKey: string;
let adminApi: ScreenCommonsClient;
let batch: CaptureBatchResult;

async function expectApiError(promise: Promise<unknown>, status: number, code?: string) {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(ScreenCommonsApiError);
  expect((error as ScreenCommonsApiError).status).toBe(status);
  if (code) expect((error as ScreenCommonsApiError).code).toBe(code);
}

beforeAll(async () => {
  const credentials = inject("admin");
  admin = await Session.signIn(credentials.email, credentials.password);
});

describe("auth", () => {
  it("makes the first account admin and later sign-ups members", async () => {
    expect((await admin.client().me()).role).toBe("admin");
    member = await Session.signUp("Mia Member", `mia-${suffix}@screen-commons.test`);
    other = await Session.signUp("Oscar Other", `oscar-${suffix}@screen-commons.test`);
    expect((await member.client().me()).role).toBe("member");
    expect((await other.client().me()).role).toBe("member");
  });

  it("rejects unauthenticated requests with a JSON error", async () => {
    const response = await fetch(`${baseUrl()}/api/v1/me`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
    const missing = await admin.fetch("/api/v1/nope");
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");
  });

  it("ignores cookies on cross-origin requests and answers CORS preflights", async () => {
    const cross = await admin.fetch("/api/v1/me", { headers: { origin: "https://evil.example" } });
    expect(cross.status).toBe(401);
    expect(cross.headers.get("access-control-allow-origin")).toBe("*");
    expect(cross.headers.get("access-control-allow-credentials")).toBeNull();

    const preflight = await fetch(`${baseUrl()}/api/v1/captures`, {
      method: "OPTIONS",
      headers: {
        origin: "chrome-extension://abc",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("authorization");
  });
});

describe("api keys", () => {
  it("creates, lists, authenticates and revokes keys", async () => {
    const created = await admin.client().createKey("Test runner");
    expect(created.token).toMatch(/^sc_[\w-]{43}$/u);
    expect(created.key.prefix).toBe(created.token.slice(0, 8));
    adminKey = created.token;
    adminApi = keyClient(adminKey);

    const list = await admin.client().listKeys();
    expect(list.items.map((key) => key.id)).toContain(created.key.id);
    expect(JSON.stringify(list)).not.toContain(created.token);

    const me = await adminApi.me();
    expect(me.email).toBe(inject("admin").email);
    // bearer requests work cross-origin
    const cross = await fetch(`${baseUrl()}/api/v1/me`, {
      headers: { authorization: `Bearer ${adminKey}`, origin: "chrome-extension://abc" },
    });
    expect(cross.status).toBe(200);
    expect(cross.headers.get("access-control-allow-origin")).toBe("*");

    // key management is session-only
    await expectApiError(adminApi.listKeys(), 403, "forbidden");

    const throwaway = await admin.client().createKey("Throwaway");
    const throwawayApi = keyClient(throwaway.token);
    expect((await throwawayApi.me()).role).toBe("admin");
    expect(
      (await admin.client().listKeys()).items.find((key) => key.id === throwaway.key.id)
        ?.lastUsedAt,
    ).not.toBeNull();
    await admin.client().revokeKey(throwaway.key.id);
    await expectApiError(throwawayApi.me(), 401, "unauthorized");
    await expectApiError(keyClient("sc_not-a-real-key").me(), 401);
    expect((await admin.client().listKeys()).items.map((key) => key.id)).not.toContain(
      throwaway.key.id,
    );
  });
});

describe("captures + media", () => {
  it("uploads a batch (app upsert, logo, screens, flow) as admin → published", async () => {
    batch = await adminApi.captures({
      app: {
        name: `Acme ${suffix}`,
        websiteUrl: `https://acme-${suffix}.example.com`,
        category: "productivity",
        tagline: "Project tracking",
      },
      logo: { type: "image/png", base64: b64(makePng(64, 64, 99)) },
      source: "seed",
      flow: { name: "Sign up", type: "signing-up" },
      screens: [
        captureScreen({
          title: "Home",
          sourceUrl: `https://acme-${suffix}.example.com/`,
          patterns: ["landing"],
          elements: ["hero", "navigation-bar"],
          stepLabel: "Landing",
        }),
        captureScreen({
          title: "Pricing plans",
          sourceUrl: `https://acme-${suffix}.example.com/pricing`,
          patterns: ["pricing"],
          elements: ["pricing-table", "toggle"],
          text: "Choose the zebracorn plan that fits your team",
          stepLabel: "Pick a plan",
        }),
        captureScreen({
          title: "Create account",
          sourceUrl: `https://acme-${suffix}.example.com/signup`,
          patterns: ["signup"],
          elements: ["form", "text-field", "cta"],
          stepLabel: "Sign up",
          version: "v2",
        }),
      ],
    });
    expect(batch.app.slug).toBe(`acme-${suffix}`);
    // every URL in the captures response is absolute
    expect(batch.app.logoUrl).toMatch(
      new RegExp(`^${baseUrl()}/media/logo/[0-9a-f]{64}\\.png$`, "u"),
    );
    expect(batch.screens).toHaveLength(3);
    expect(batch.screens.every((item) => item.status === "published")).toBe(true);
    expect(batch.screens[0]!.url).toBe(`${baseUrl()}/screens/${batch.screens[0]!.id}`);
    expect(batch.flow?.status).toBe("published");
  });

  it("upserts onto the same app by website host and dedupes identical images", async () => {
    const again = await adminApi.captures({
      app: { name: "Acme (renamed)", websiteUrl: `https://www.acme-${suffix}.example.com/about` },
      screens: [captureScreen({ title: "About", patterns: ["about"] })],
    });
    expect(again.app.id).toBe(batch.app.id);
    const appDetail = await adminApi.getApp(batch.app.slug);
    expect(appDetail.screenCount).toBe(4);
  });

  it("rejects invalid images and payloads", async () => {
    await expectApiError(
      adminApi.captures({
        app: { name: "Broken" },
        screens: [
          {
            ...captureScreen(),
            image: {
              type: "image/png",
              base64: Buffer.from("definitely not an image").toString("base64"),
            },
          },
        ],
      }),
      415,
      "unsupported_media_type",
    );
    await expectApiError(
      adminApi.captures({ app: { name: "Broken" }, screens: [] } as never),
      400,
      "bad_request",
    );
    const raw = await fetch(`${baseUrl()}/api/v1/captures`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminKey}`, "content-type": "application/json" },
      body: "{not json",
    });
    expect(raw.status).toBe(400);
  });

  it("serves media with immutable caching and ETags", async () => {
    const screen = await adminApi.getScreen(batch.screens[0]!.id);
    expect(screen.thumbUrl).toMatch(/^\/media\/thumb\/[0-9a-f]{64}\.webp$/u);
    // PNG uploads are displayed as a versioned WebP derivative (display policy)
    expect(screen.imageUrl).toMatch(/^\/media\/img\/[0-9a-f]{64}\.v1\.webp$/u);

    const response = await fetch(`${baseUrl()}${screen.thumbUrl}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const etag = response.headers.get("etag");
    expect(etag).toBeTruthy();
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(body.subarray(8, 12).toString("ascii")).toBe("WEBP");

    const cached = await fetch(`${baseUrl()}${screen.thumbUrl}`, {
      headers: { "if-none-match": etag! },
    });
    expect(cached.status).toBe(304);

    const full = await fetch(`${baseUrl()}${screen.imageUrl}`, { method: "HEAD" });
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/webp");
    expect(Number(full.headers.get("content-length"))).toBe(screen.bytes);

    expect((await fetch(`${baseUrl()}/media/img/${"0".repeat(64)}.png`)).status).toBe(404);
    expect((await fetch(`${baseUrl()}/media/../../etc/passwd`)).status).toBe(404);
  });
});

describe("catalog reads", () => {
  it("lists apps with counts and previews", async () => {
    const page = await member.client().listApps({ platform: "web", category: "productivity" });
    const acme = page.items.find((item) => item.id === batch.app.id);
    expect(acme).toMatchObject({
      slug: batch.app.slug,
      screenCount: 4,
      flowCount: 1,
      category: "productivity",
      tagline: "Project tracking",
      status: "published",
    });
    expect(acme!.previews).toHaveLength(3);
    expect(acme!.previews[0]!.thumbUrl).toMatch(/^\/media\/thumb\//u);
    expect(
      (await member.client().listApps({ platform: "ios" })).items.find(
        (item) => item.id === batch.app.id,
      ),
    ).toBeUndefined();
    expect(
      (await member.client().listApps({ q: `acme ${suffix}` })).items.map((item) => item.id),
    ).toContain(batch.app.id);
  });

  it("returns app detail with versions, patterns and elements", async () => {
    const detail = await member.client().getApp(batch.app.slug);
    expect(detail.id).toBe(batch.app.id);
    expect(detail.versions).toContain("v2");
    expect(detail.patterns).toEqual(expect.arrayContaining([{ slug: "pricing", count: 1 }]));
    expect(detail.elements).toEqual(expect.arrayContaining([{ slug: "toggle", count: 1 }]));
    await expectApiError(member.client().getApp("does-not-exist"), 404, "not_found");
  });

  it("filters screens by app, pattern, element and version", async () => {
    const client = member.client();
    const all = await client.listScreens({ app: batch.app.slug });
    expect(all.items).toHaveLength(4);
    expect(all.items[0]!.app).toMatchObject({ id: batch.app.id, slug: batch.app.slug });
    expect(
      (await client.listScreens({ app: batch.app.slug, pattern: "pricing" })).items.map(
        (item) => item.title,
      ),
    ).toEqual(["Pricing plans"]);
    expect(
      (await client.listScreens({ app: batch.app.slug, element: "form" })).items.map(
        (item) => item.title,
      ),
    ).toEqual(["Create account"]);
    expect((await client.listScreens({ app: batch.app.slug, version: "v2" })).items).toHaveLength(
      1,
    );
    expect((await client.listScreens({ app: batch.app.id, platform: "web" })).items).toHaveLength(
      4,
    );
    await expectApiError(client.listScreens({ pattern: "nope" as never }), 400, "bad_request");
  });

  it("paginates with opaque cursors", async () => {
    const client = member.client();
    const first = await client.listScreens({ app: batch.app.slug, limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await client.listScreens({
      app: batch.app.slug,
      limit: 3,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(4);
    await expectApiError(client.listScreens({ cursor: "garbage" }), 400, "bad_request");
    await expectApiError(
      client.listScreens({ app: batch.app.slug, sort: "popular", cursor: first.nextCursor! }),
      400,
    );
  });

  it("returns screen detail with neighbours and flows", async () => {
    const middle = await member.client().getScreen(batch.screens[1]!.id);
    expect(middle.title).toBe("Pricing plans");
    expect(middle.patterns).toEqual(["pricing"]);
    expect(middle.flows).toEqual([{ id: batch.flow!.id, name: "Sign up", position: 1 }]);
    expect(middle.previousId).toBe(batch.screens[2]!.id);
    expect(middle.nextId).toBe(batch.screens[0]!.id);
    expect(middle.width).toBe(320);
    expect(middle.version).toMatch(/^[A-Z][a-z]{2} \d{4}$/u);
  });

  it("searches with prefix matching, screen text and taxonomy terms", async () => {
    const client = member.client();
    const prefix = await client.search({ q: `acm`, limit: 30 });
    expect(prefix.apps.map((item) => item.id)).toContain(batch.app.id);

    const text = await client.search({ q: "zebracorn" });
    expect(text.screens.map((item) => item.id)).toEqual([batch.screens[1]!.id]);

    const pricing = await client.search({ q: "pricing table" });
    expect(pricing.terms).toEqual(
      expect.arrayContaining([
        { kind: "pattern", slug: "pricing", label: "Pricing" },
        { kind: "element", slug: "pricing-table", label: "Pricing Table" },
      ]),
    );
    expect(pricing.screens.map((item) => item.id)).toContain(batch.screens[1]!.id);

    const flows = await client.search({ q: "signing up" });
    expect(flows.flows.map((item) => item.id)).toContain(batch.flow!.id);
    expect(flows.terms).toEqual(
      expect.arrayContaining([{ kind: "flowType", slug: "signing-up", label: "Signing Up" }]),
    );

    const none = await client.search({ q: "qwxzv" });
    expect(none).toEqual({ apps: [], screens: [], flows: [], terms: [] });
    expect((await client.listScreens({ q: "zebracorn" })).items).toHaveLength(1);
    await expectApiError(client.search({ q: "" }), 400);
  });

  it("returns taxonomy without auth", async () => {
    const response = await fetch(`${baseUrl()}/api/v1/taxonomy`);
    const taxonomy = await response.json();
    expect(taxonomy.patterns.map((term: { slug: string }) => term.slug)).toContain("pricing");
    expect(taxonomy.flowTypes.length).toBeGreaterThan(5);
  });
});

describe("flows", () => {
  it("lists and fetches flows with ordered steps", async () => {
    const page = await member.client().listFlows({ app: batch.app.slug });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ name: "Sign up", type: "signing-up", stepCount: 3 });
    expect(page.items[0]!.previews).toHaveLength(3);
    expect(
      (await member.client().listFlows({ type: "checkout", app: batch.app.slug })).items,
    ).toHaveLength(0);

    const flow = await member.client().getFlow(batch.flow!.id);
    expect(flow.steps.map((step) => step.label)).toEqual(["Landing", "Pick a plan", "Sign up"]);
    expect(flow.steps.map((step) => step.screen.id)).toEqual(batch.screens.map((item) => item.id));
  });

  it("creates a flow from existing screens", async () => {
    const { flow } = await adminApi.createFlow({
      appId: batch.app.id,
      name: "Upgrade",
      type: "upgrading",
      steps: [
        { screenId: batch.screens[1]!.id, label: "Plans" },
        { screenId: batch.screens[2]!.id },
      ],
    });
    expect(flow.status).toBe("published");
    expect(flow.steps.map((step) => step.position)).toEqual([0, 1]);
    expect(flow.steps[1]!.label).toBeNull();
    await expectApiError(
      adminApi.createFlow({
        appId: batch.app.id,
        name: "Bad",
        steps: [{ screenId: batch.screens[0]!.id }, { screenId: "missing" }],
      }),
      400,
    );
  });
});

describe("visibility + review", () => {
  it("keeps member uploads pending until an admin approves them", async () => {
    const meta = {
      app: { slug: batch.app.slug, name: "Acme" },
      title: "Member settings screen",
      patterns: ["settings" as const],
      width: 300,
      height: 200,
    };
    const { screen } = await member.client().createScreen({
      image: new Blob([new Uint8Array(makePng(300, 200, 7))], { type: "image/png" }),
      thumbnail: new Blob([new Uint8Array(makeWebp(150, 100))], { type: "image/webp" }),
      meta,
    });
    expect(screen.status).toBe("pending");
    expect(screen.source).toBe("upload");
    expect(screen.app.id).toBe(batch.app.id);

    // contributor sees it; other members and lists don't
    expect((await member.client().getScreen(screen.id)).status).toBe("pending");
    await expectApiError(other.client().getScreen(screen.id), 404);
    expect(
      (await other.client().listScreens({ app: batch.app.slug })).items.map((item) => item.id),
    ).not.toContain(screen.id);
    expect(
      (await member.client().listScreens({ app: batch.app.slug })).items.map((item) => item.id),
    ).toContain(screen.id);

    // only admins review
    await expectApiError(member.client().reviewQueue(), 403);
    await expectApiError(member.client().review("screen", screen.id, "approve"), 403);
    const queue = await admin.client().reviewQueue();
    expect(queue.screens.map((item) => item.id)).toContain(screen.id);

    await admin.client().review("screen", screen.id, "approve");
    expect((await other.client().getScreen(screen.id)).status).toBe("published");
    expect((await admin.client().reviewQueue()).screens.map((item) => item.id)).not.toContain(
      screen.id,
    );
  });

  it("hides a member's new app until approval, and rejected items stay hidden", async () => {
    const result = await keyClient((await member.client().createKey("cli")).token).captures({
      app: { name: `Member App ${suffix}`, websiteUrl: `https://member-${suffix}.example.org` },
      flow: { name: "Onboarding", type: "onboarding" },
      screens: [captureScreen({ title: "Welcome" }), captureScreen({ title: "Step two" })],
    });
    expect(result.screens.every((item) => item.status === "pending")).toBe(true);
    expect(result.flow?.status).toBe("pending");

    const otherApps = await other.client().listApps({ q: `member app ${suffix}` });
    expect(otherApps.items.map((item) => item.id)).not.toContain(result.app.id);
    await expectApiError(other.client().getApp(result.app.slug), 404);
    expect((await member.client().getApp(result.app.slug)).status).toBe("pending");

    const queue = await admin.client().reviewQueue();
    expect(queue.flows.map((item) => item.id)).toContain(result.flow!.id);

    // approving the flow publishes its screens and the app
    await admin.client().review("flow", result.flow!.id, "approve");
    expect((await other.client().getApp(result.app.slug)).status).toBe("published");
    expect((await other.client().getFlow(result.flow!.id)).steps).toHaveLength(2);

    const rejected = await member.client().captures({
      app: { slug: result.app.slug, name: "Member App" },
      screens: [captureScreen({ title: "Rejected one" })],
    });
    await admin.client().review("screen", rejected.screens[0]!.id, "reject", "Duplicate");
    await expectApiError(other.client().getScreen(rejected.screens[0]!.id), 404);
    expect((await member.client().getScreen(rejected.screens[0]!.id)).status).toBe("rejected");
  });
});

describe("collections + saves", () => {
  it("saves and unsaves items in the default collection", async () => {
    const client = other.client();
    const screenId = batch.screens[2]!.id;
    await client.save("screen", screenId);
    await client.save("screen", screenId); // idempotent
    expect((await client.getScreen(screenId)).saved).toBe(true);
    expect((await member.client().getScreen(screenId)).saved).toBe(false);

    const { items } = await client.listCollections();
    const saved = items.find((item) => item.isDefault)!;
    expect(saved).toMatchObject({ name: "Saved", itemCount: 1 });
    expect(saved.previews[0]!.thumbUrl).toMatch(/^\/media\/thumb\//u);

    const popular = await client.listScreens({ app: batch.app.slug, sort: "popular", limit: 1 });
    expect(popular.items[0]!.id).toBe(screenId);

    await client.unsave("screen", screenId);
    expect((await client.getScreen(screenId)).saved).toBe(false);
  });

  it("manages custom collections", async () => {
    const client = other.client();
    const { collection } = await client.createCollection("Ideas");
    expect(collection).toMatchObject({ name: "Ideas", isDefault: false, itemCount: 0 });

    await client.save("flow", batch.flow!.id, collection.id);
    await client.save("app", batch.app.id, collection.id);
    await client.save("screen", batch.screens[0]!.id, collection.id);
    const detail = await client.getCollection(collection.id);
    expect(detail.collection.itemCount).toBe(3);
    expect(detail.flows.map((item) => item.id)).toEqual([batch.flow!.id]);
    expect(detail.flows[0]!.saved).toBe(true);
    expect(detail.apps.map((item) => item.id)).toEqual([batch.app.id]);
    expect(detail.screens.map((item) => item.id)).toEqual([batch.screens[0]!.id]);

    const renamed = await client.renameCollection(collection.id, "Inspiration");
    expect(renamed.collection.name).toBe("Inspiration");

    // spec alias routes
    const alias = await other.fetch(
      `/api/v1/collections/${collection.id}/items?kind=screen&id=${batch.screens[0]!.id}`,
      {
        method: "DELETE",
      },
    );
    expect(alias.status).toBe(204);
    expect((await client.getCollection(collection.id)).screens).toHaveLength(0);

    // not someone else's
    await expectApiError(member.client().getCollection(collection.id), 404);
    await expectApiError(member.client().save("screen", batch.screens[0]!.id, collection.id), 404);

    const defaultId = (await client.listCollections()).items.find((item) => item.isDefault)!.id;
    await expectApiError(client.deleteCollection(defaultId), 400);
    await client.deleteCollection(collection.id);
    await expectApiError(client.getCollection(collection.id), 404);
    expect((await client.getFlow(batch.flow!.id)).saved).toBe(false);
  });
});
