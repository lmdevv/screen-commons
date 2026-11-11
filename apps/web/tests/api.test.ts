import { createHash, randomBytes } from "node:crypto";

import {
  ScreenCommonsApiError,
  createScreenCommonsClient,
  type CaptureBatchResult,
  type CliLoginView,
  type ScreenCommonsClient,
} from "@screen-commons/core";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { makePng, makeWebp } from "./images";
import { Session, b64, baseUrl, captureScreen, d1, keyClient, uniqueSuffix } from "./helpers";

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

async function pendingIds(kind: "screen" | "flow", limit = 50): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await admin.client().reviewQueue({ kind, cursor, limit });
    expect(page.kind).toBe(kind);
    expect(page.items.length).toBeLessThanOrEqual(limit);
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return ids;
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

describe("cli login", () => {
  const anonymous = () => createScreenCommonsClient({ baseUrl: baseUrl() });

  async function startLogin(token = `sc_${randomBytes(32).toString("base64url")}`) {
    const hash = createHash("sha256").update(token).digest("hex");
    const started = await anonymous().startCliLogin({
      hash,
      prefix: token.slice(0, 8),
      device: "test-host",
    });
    return {
      ...started,
      token,
      hash,
      poll: () => anonymous().pollCliLogin({ code: started.code, hash }),
    };
  }

  const decide = (session: Session, code: string, decision: "approve" | "deny") =>
    session.fetch("/api/v1/cli-login/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, decision }),
    });

  async function decided(session: Session, code: string, decision: "approve" | "deny") {
    const response = await decide(session, code, decision);
    expect(response.status).toBe(200);
    return (await response.json()) as CliLoginView;
  }

  async function refused(session: Session, code: string, decision: "approve" | "deny") {
    const response = await decide(session, code, decision);
    expect(response.status).toBe(409);
    return ((await response.json()) as { error: { code: string; message: string } }).error;
  }

  const expire = (code: string) =>
    d1(`UPDATE verification SET expires_at = 0 WHERE identifier = 'cli-login:${code}'`);

  it("starts pending, and one approval turns the CLI's own token into a key", async () => {
    const login = await startLogin();
    expect(login.code).toMatch(/^[B-Z]{4}-[B-Z]{4}$/u);
    expect(login.url).toBe(`${baseUrl()}/cli-login?code=${login.code}`);
    expect(login.interval).toBe(2);
    expect(Date.parse(login.expiresAt) - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(await login.poll()).toEqual({ status: "pending" });
    await expectApiError(keyClient(login.token).me(), 401, "unauthorized");

    const both = await Promise.all([
      decided(admin, login.code, "approve"),
      decided(admin, login.code, "approve"),
    ]);
    expect(both.map((result) => result.status)).toEqual(["approved", "approved"]);
    expect(both[0]).toMatchObject({ code: login.code, device: "test-host" });

    const poll = await login.poll();
    expect(poll).toEqual({ status: "approved", keyId: expect.any(String) });
    expect((await login.poll()).status).toBe("approved");
    expect((await keyClient(login.token).me()).email).toBe(inject("admin").email);

    expect((await decided(admin, login.code, "approve")).status).toBe("approved");
    const keys = (await admin.client().listKeys()).items.filter(
      (key) => key.prefix === login.token.slice(0, 8),
    );
    expect(keys).toEqual([
      expect.objectContaining({
        id: (poll as { keyId: string }).keyId,
        name: "CLI login on test-host",
      }),
    ]);

    expect((await refused(member, login.code, "approve")).message).toMatch(/already approved/u);
    expect((await refused(admin, login.code, "deny")).message).toMatch(/already approved/u);
  });

  it("lets a login key manage keys, and no other key", async () => {
    const login = await startLogin();
    await decided(member, login.code, "approve");
    const loginApi = keyClient(login.token);

    const made = await loginApi.createKey("Made from the CLI");
    expect((await loginApi.listKeys()).items.map((key) => key.id)).toContain(made.key.id);
    const madeApi = keyClient(made.token);
    expect((await madeApi.me()).role).toBe("member");
    await expectApiError(madeApi.listKeys(), 403, "forbidden");
    await expectApiError(madeApi.createKey("Nope"), 403, "forbidden");

    await loginApi.revokeKey(made.key.id);
    await expectApiError(madeApi.me(), 401, "unauthorized");
    await expectApiError(adminApi.listKeys(), 403, "forbidden");
  });

  it("denies: no key, and the decision sticks", async () => {
    const login = await startLogin();
    expect((await decided(member, login.code, "deny")).status).toBe("denied");
    expect((await decided(member, login.code, "deny")).status).toBe("denied");
    expect(await login.poll()).toEqual({ status: "denied" });
    expect((await refused(member, login.code, "approve")).message).toMatch(/already denied/u);
    await expectApiError(keyClient(login.token).me(), 401, "unauthorized");
  });

  it("expires: a poll after expiry says so, and the code no longer approves", async () => {
    const login = await startLogin();
    await expire(login.code);
    expect(await login.poll()).toEqual({ status: "expired" });
    expect((await refused(admin, login.code, "approve")).message).toMatch(/expired/u);
    await expectApiError(keyClient(login.token).me(), 401, "unauthorized");

    await d1(`DELETE FROM verification WHERE identifier = 'cli-login:${login.code}'`);
    expect(await login.poll()).toEqual({ status: "expired" });
  });

  it("still answers approved after the code's own expiry and another login's cleanup", async () => {
    const login = await startLogin();
    const shiftExpiry = (ms: number) =>
      d1(
        `UPDATE verification SET expires_at = expires_at - ${ms} WHERE identifier = 'cli-login:${login.code}'`,
      );
    // The code now expires 60 s after it started, past the 30 s test timeout.
    await shiftExpiry(9 * 60_000);
    await decided(admin, login.code, "approve");
    // As if two minutes passed: the code's own expiry is behind us, the approval's is not.
    await shiftExpiry(2 * 60_000);
    await startLogin();
    expect(await login.poll()).toEqual({ status: "approved", keyId: expect.any(String) });
    expect((await keyClient(login.token).me()).email).toBe(inject("admin").email);
  });

  it("clears expired requests when a new login starts", async () => {
    const stale = await startLogin();
    await expire(stale.code);
    await startLogin();
    expect(
      await d1(`SELECT id FROM verification WHERE identifier = 'cli-login:${stale.code}'`),
    ).toEqual([]);
  });

  it("refuses to approve a token that is already a key", async () => {
    const first = await startLogin();
    await decided(admin, first.code, "approve");
    const reused = await startLogin(first.token);
    expect((await refused(admin, reused.code, "approve")).message).toMatch(/can't be approved/u);
    expect(await reused.poll()).toEqual({ status: "pending" });
    expect((await keyClient(first.token).me()).email).toBe(inject("admin").email);
  });

  it("answers a poll only with its own hash", async () => {
    const login = await startLogin();
    const other = createHash("sha256").update("not the token").digest("hex");
    expect(await anonymous().pollCliLogin({ code: login.code, hash: other })).toEqual({
      status: "expired",
    });
    expect(await login.poll()).toEqual({ status: "pending" });
  });

  it("approves only from a signed-in browser, and checks its input", async () => {
    const login = await startLogin();
    const viaKey = await fetch(`${baseUrl()}/api/v1/cli-login/decision`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminKey}`, "content-type": "application/json" },
      body: JSON.stringify({ code: login.code, decision: "approve" }),
    });
    expect(viaKey.status).toBe(403);
    const anonymousDecision = await fetch(`${baseUrl()}/api/v1/cli-login/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: login.code, decision: "approve" }),
    });
    expect(anonymousDecision.status).toBe(401);
    expect(await login.poll()).toEqual({ status: "pending" });

    await expectApiError(
      anonymous().startCliLogin({ hash: "abc", prefix: "sc_12345", device: "x" }),
      400,
      "bad_request",
    );
    expect((await decide(admin, "not-a-code", "approve")).status).toBe(400);
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

  it("leaves the app untouched when the same batch is uploaded again", async () => {
    const upload = {
      app: { name: `Noop ${suffix}`, websiteUrl: `https://noop-${suffix}.example.com` },
      screens: [captureScreen({ title: "One" }), captureScreen({ title: "Two" })],
    };
    const first = await adminApi.captures(upload);
    const before = await adminApi.getApp(first.app.slug);
    const again = await adminApi.captures(upload);
    expect(again.screens).toEqual(first.screens);
    expect((await adminApi.getApp(first.app.slug)).updatedAt).toBe(before.updatedAt);

    await adminApi.captures({ ...upload, app: { ...upload.app, tagline: "Now with a tagline" } });
    const tagged = await adminApi.getApp(first.app.slug);
    expect(tagged.tagline).toBe("Now with a tagline");
    expect(tagged.updatedAt > before.updatedAt).toBe(true);

    await adminApi.captures({ ...upload, screens: [captureScreen({ title: "Three" })] });
    const grown = await adminApi.getApp(first.app.slug);
    expect(grown.screenCount).toBe(3);
    expect(grown.updatedAt > tagged.updatedAt).toBe(true);
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

describe("ranked search", () => {
  const riffs = `Riffs ${suffix}`;
  const playlistFlows = [
    "Creating a playlist from a song",
    "Creating a playlist",
    "Deleting a playlist",
    "Creating a playlist folder",
    "Playlist",
    "Following an artist",
  ];
  let riffsSlug: string;
  const word = `Stave${suffix}`;
  let wordSlug: string;
  const prefixed = `Lin${suffix}`;

  beforeAll(async () => {
    const upload = (name: string) =>
      adminApi.captures({
        app: { name },
        source: "seed",
        screens: [captureScreen(), captureScreen()],
      });
    const riffsBatch = await upload(riffs);
    riffsSlug = riffsBatch.app.slug;
    for (const name of playlistFlows) {
      await adminApi.createFlow({
        appId: riffsBatch.app.id,
        name,
        steps: riffsBatch.screens.map((item) => ({ screenId: item.id })),
      });
    }
    const decoy = await upload(`Decoy ${suffix}`);
    for (const name of [
      "Creating a playlist",
      "Stories",
      "Progress bar",
      "Progress ring",
      "Inviting a teammate",
      "Signing up",
      "Logging out",
      "Updating notification settings",
    ]) {
      await adminApi.createFlow({
        appId: decoy.app.id,
        name,
        steps: decoy.screens.map((item) => ({ screenId: item.id })),
      });
    }
    wordSlug = (await upload(word)).app.slug;
    const longer = await upload(`${prefixed}ar ${suffix}`);
    await adminApi.createFlow({
      appId: longer.app.id,
      name: "Creating a playlist",
      steps: longer.screens.map((item) => ({ screenId: item.id })),
    });
  });

  it("ranks the flows of the app a question names", async () => {
    const page = await member
      .client()
      .listFlows({ q: `How does ${riffs} let users create a playlist?` });
    expect(page.items.map((item) => item.name)).toEqual([
      "Creating a playlist",
      "Creating a playlist folder",
      "Creating a playlist from a song",
    ]);
    expect(page.items.every((item) => item.app.slug === riffsSlug)).toBe(true);
    expect(page.match).toEqual({
      mode: "strict",
      app: riffsSlug,
      appWithoutResults: null,
      appNotFound: null,
      matchedTerms: ["create", "playlist"],
      unmatchedTerms: [],
    });
  });

  it("fills a short strict result with partial matches, most terms first", async () => {
    const page = await member.client().listFlows({ q: `${riffs} delete playlists` });
    expect(page.items[0]!.name).toBe("Deleting a playlist");
    expect(page.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Playlist", "Creating a playlist"]),
    );
    expect(page.items.map((item) => item.name)).not.toContain("Following an artist");
    expect(page.match).toMatchObject({ mode: "relaxed", app: riffsSlug });
  });

  it("reports an app the catalog lacks and still answers from other apps", async () => {
    const missing = `Qx${suffix}`;
    const page = await member
      .client()
      .listFlows({ q: `How does ${missing} let users create a playlist?` });
    expect(page.match).toEqual({
      mode: "relaxed",
      app: null,
      appWithoutResults: null,
      appNotFound: missing,
      matchedTerms: ["create", "playlist"],
      unmatchedTerms: [missing.toLowerCase()],
    });
    expect(page.items.map((item) => item.name)).toContain("Creating a playlist");
  });

  it("pages a ranked search without repeating or skipping a flow", async () => {
    const client = member.client();
    const whole = await client.listFlows({ q: "playlist", app: riffsSlug, limit: 20 });
    expect(whole.items).toHaveLength(5);
    const paged: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listFlows({ q: "playlist", app: riffsSlug, limit: 2, cursor });
      expect(page.match.mode).toBe("strict");
      paged.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(paged).toEqual(whole.items.map((item) => item.id));
  });

  it("keeps the latest order when there is nothing to rank by", async () => {
    const latest = await member.client().listFlows({ app: riffsSlug });
    expect(latest.items).toHaveLength(playlistFlows.length);
    expect(latest.match.mode).toBe("none");
    const named = await member.client().listFlows({ q: `show me ${riffs} flows` });
    expect(named.items.map((item) => item.id)).toEqual(latest.items.map((item) => item.id));
    expect(named.match).toMatchObject({ mode: "none", app: riffsSlug });
  });

  it("keeps an app named first or last when it has no match, and says so", async () => {
    const page = await member.client().listFlows({ q: `${word} progress bar` });
    expect(page.items).toEqual([]);
    expect(page.match).toEqual({
      mode: "relaxed",
      app: wordSlug,
      appWithoutResults: null,
      appNotFound: null,
      matchedTerms: [],
      unmatchedTerms: ["progress", "bar"],
    });
  });

  it("searches every app when an app named in passing has no match", async () => {
    const client = member.client();
    const invite = await client.listFlows({ q: `how do I ${word.toLowerCase()} an invite` });
    expect(invite.items.map((item) => item.name)).toContain("Inviting a teammate");
    expect(invite.match).toMatchObject({ app: null, appWithoutResults: wordSlug });

    const q = `show me a ${word.toLowerCase()} progress bar`;
    const page = await client.listFlows({ q, limit: 1 });
    expect(page.items.map((item) => item.name)).toEqual(["Progress bar"]);
    expect(page.match).toMatchObject({
      mode: "relaxed",
      app: null,
      appWithoutResults: wordSlug,
      matchedTerms: ["progress", "bar"],
    });
    const next = await client.listFlows({ q, limit: 1, cursor: page.nextCursor! });
    expect(next.items.map((item) => item.id)).not.toContain(page.items[0]!.id);
    expect(next.match).toEqual(page.match);
  });

  it("keeps an app named in passing when it has a match", async () => {
    const page = await member.client().listFlows({ q: `create a ${riffs} playlist` });
    expect(page.items.every((item) => item.app.slug === riffsSlug)).toBe(true);
    expect(page.match).toMatchObject({ mode: "strict", app: riffsSlug, appWithoutResults: null });
  });

  it("never reads an app, or a missing one, from capitals", async () => {
    const client = member.client();
    const title = await client.listFlows({ q: "How to Create a Playlist" });
    expect(title.items[0]!.name).toBe("Creating a playlist");
    expect(title.match).toMatchObject({ mode: "strict", app: null, appNotFound: null });
    const named = await client.listFlows({ q: `${riffs} Playlist Folder` });
    expect(named.items[0]!.name).toBe("Creating a playlist folder");
    expect(named.match).toMatchObject({ app: riffsSlug, appNotFound: null });
  });

  it("reads a word the catalog contains, or a UI word, as no missing app", async () => {
    const client = member.client();
    const ring = await client.listFlows({ q: "progress on Ring" });
    expect(ring.items[0]!.name).toBe("Progress ring");
    expect(ring.match).toMatchObject({ appNotFound: null, matchedTerms: ["progress", "ring"] });
    for (const q of ["tooltip on hover", "show error on submit", "zoom in on map"]) {
      expect((await client.listFlows({ q })).match.appNotFound, q).toBeNull();
    }
  });

  it("reads a lowercase word after for, in or on as no missing app, and matches its other forms", async () => {
    for (const q of ["turn on notifications", "settings for notifications"]) {
      const page = await member.client().listFlows({ q });
      expect(
        page.items.map((item) => item.name),
        q,
      ).toContain("Updating notification settings");
      expect(page.match, q).toMatchObject({ appNotFound: null });
      expect(page.match.matchedTerms, q).toContain("notifications");
    }
  });

  it("reports a capitalized missing name that only starts a word some flow has", async () => {
    const page = await member.client().listFlows({ q: "How does Notifi let users mute alerts?" });
    expect(page.match).toMatchObject({ app: null, appNotFound: "Notifi" });
    expect(page.items.map((item) => item.name)).toContain("Updating notification settings");
  });

  it("finds every spelling of signing up and logging out", async () => {
    const client = member.client();
    for (const q of [
      `Decoy ${suffix} signup`,
      `Decoy ${suffix} sign up`,
      `Decoy ${suffix} register`,
    ]) {
      expect(
        (await client.listFlows({ q })).items.map((item) => item.name),
        q,
      ).toEqual(["Signing up"]);
    }
    for (const q of [`Decoy ${suffix} logout`, `Decoy ${suffix} log out`]) {
      expect(
        (await client.listFlows({ q })).items.map((item) => item.name),
        q,
      ).toEqual(["Logging out"]);
    }
  });

  it("reports the app a question asks about over a name it uses in passing", async () => {
    const asked = `Qz${suffix}`;
    const page = await member
      .client()
      .listFlows({ q: `How does ${asked} handle ${word.toLowerCase()} playlists?` });
    expect(page.match).toMatchObject({ app: null, appWithoutResults: null, appNotFound: asked });
  });

  it("finds a plural from the singular and the other way round", async () => {
    const client = member.client();
    for (const q of [`Decoy ${suffix} stories`, `Decoy ${suffix} story`]) {
      expect((await client.listFlows({ q })).items.map((item) => item.name)).toEqual(["Stories"]);
    }
  });

  it("reports a missing app whose name only starts another app's name", async () => {
    const page = await member
      .client()
      .listFlows({ q: `How does ${prefixed} let users create a playlist?` });
    expect(page.match).toMatchObject({ app: null, appNotFound: prefixed });
  });

  it("returns nothing for a query with no word to search for", async () => {
    for (const list of [
      member.client().listFlows({ q: "how does it work" }),
      member.client().listScreens({ q: "how does it work" }),
    ]) {
      const page = await list;
      expect(page.items).toEqual([]);
      expect(page.match).toMatchObject({ mode: "unsearchable", matchedTerms: [] });
    }
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
    await expectApiError(member.client().reviewQueue({ kind: "screen" }), 403);
    await expectApiError(member.client().review("screen", screen.id, "approve"), 403);
    expect(await pendingIds("screen")).toContain(screen.id);

    await admin.client().review("screen", screen.id, "approve");
    expect((await other.client().getScreen(screen.id)).status).toBe("published");
    expect(await pendingIds("screen")).not.toContain(screen.id);
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

    expect(await pendingIds("flow")).toContain(result.flow!.id);

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

  it("pages one kind of the queue oldest first, with a keyset cursor", async () => {
    const queued = await member.client().captures({
      app: { slug: batch.app.slug, name: "Acme" },
      screens: Array.from({ length: 5 }, (_, index) => captureScreen({ title: `Queued ${index}` })),
    });
    const mine = queued.screens.map((item) => item.id);

    const screens = await pendingIds("screen", 2);
    expect(new Set(screens).size).toBe(screens.length);
    expect(screens.filter((id) => mine.includes(id))).toEqual(mine);
    expect(await pendingIds("flow", 2)).not.toContain(mine[0]);

    const first = await admin.client().reviewQueue({ kind: "screen", limit: 1 });
    expect(first.nextCursor).toEqual(expect.any(String));
    await expectApiError(
      admin.client().reviewQueue({ kind: "flow", cursor: first.nextCursor! }),
      400,
      "bad_request",
    );
    await expectApiError(admin.client().reviewQueue({ kind: "screen", limit: 51 }), 400);
    expect((await admin.fetch("/api/v1/review")).status).toBe(400);
  });

  it("writes nothing when an item already has the decided status", async () => {
    const result = await member.client().captures({
      app: { slug: batch.app.slug, name: "Acme" },
      flow: { name: `Twice ${suffix}` },
      screens: [captureScreen({ title: "Twice one" }), captureScreen({ title: "Twice two" })],
    });
    const flowId = result.flow!.id;
    const stamps = async () =>
      d1(
        `SELECT a.updated_at AS app, f.updated_at AS flow, f.view_count AS views FROM flow f JOIN app a ON a.id = f.app_id WHERE f.id = '${flowId}'`,
      );
    await admin.client().review("flow", flowId, "approve");
    const approved = await stamps();
    await admin.client().review("flow", flowId, "approve");
    expect(await admin.client().reviewStatus("flow", flowId)).toEqual({
      kind: "flow",
      id: flowId,
      status: "published",
    });
    expect(await stamps()).toEqual(approved);
    expect((await other.client().getFlow(flowId)).status).toBe("published");

    const loose = await member.client().captures({
      app: { slug: batch.app.slug, name: "Acme" },
      screens: [captureScreen({ title: "Rejected twice" })],
    });
    const screenId = loose.screens[0]!.id;
    const row = () =>
      d1(`SELECT status, review_reason, updated_at FROM screen WHERE id = '${screenId}'`);
    await admin.client().review("screen", screenId, "reject", "First reason");
    const rejected = await row();
    expect(rejected).toEqual([expect.objectContaining({ review_reason: "First reason" })]);
    await admin.client().review("screen", screenId, "reject", "Second reason");
    expect(await row()).toEqual(rejected);
  });
});

describe("admin metadata edits", () => {
  let screenId: string;
  let flowId: string;
  let flowScreenIds: string[];
  const edits = (kind: "screen" | "flow", id: string) =>
    d1(
      `SELECT updated_by FROM contribution_edit WHERE kind = '${kind}' AND item_id = '${id}' ORDER BY id`,
    );

  beforeAll(async () => {
    const published = await member.client().captures({
      app: { slug: batch.app.slug, name: "Acme" },
      screens: [captureScreen({ title: "Member menu" })],
    });
    screenId = published.screens[0]!.id;
    await admin.client().review("screen", screenId, "approve");
    const pending = await member.client().captures({
      app: { slug: batch.app.slug, name: "Acme" },
      flow: { name: `Make a list ${suffix}` },
      screens: [captureScreen({ title: "List one" }), captureScreen({ title: "List two" })],
    });
    flowId = pending.flow!.id;
    flowScreenIds = pending.screens.map((item) => item.id);
  });

  it("an admin updates another member's screen", async () => {
    const word = `blend${suffix}`;
    const screen = await adminApi.updateScreen(screenId, {
      title: "Create playlist menu",
      text: `Playlist ${word} Folder`,
    });
    expect(screen).toMatchObject({ title: "Create playlist menu", status: "published" });
    const adminId = (await adminApi.me()).id;
    expect(await edits("screen", screenId)).toEqual([{ updated_by: adminId }]);
    const found = await other.client().search({ q: word });
    expect(found.screens.map((item) => item.id)).toEqual([screenId]);

    const flow = await adminApi.updateFlow(flowId, { type: "creating" });
    expect(flow).toMatchObject({ type: "creating", status: "pending" });
    expect(await edits("flow", flowId)).toEqual([{ updated_by: adminId }]);

    await member.client().updateScreen(screenId, { title: "Member's own title" });
    expect((await other.client().getScreen(screenId)).title).toBe("Member's own title");
    expect(await edits("screen", screenId)).toEqual([{ updated_by: adminId }]);
  });

  it("an admin only adds steps the flow's contributor can see", async () => {
    const hidden = await other.client().captures({
      app: { slug: batch.app.slug, name: "Acme" },
      screens: [captureScreen({ title: "Someone else's draft" })],
    });
    await expectApiError(
      adminApi.updateFlow(flowId, {
        steps: [{ screenId: flowScreenIds[0]! }, { screenId: hidden.screens[0]!.id }],
      }),
      400,
      "bad_request",
    );
    const reordered = await adminApi.updateFlow(flowId, {
      steps: [{ screenId: flowScreenIds[1]! }, { screenId: flowScreenIds[0]! }],
    });
    expect(reordered.steps.map((step) => step.screen.id)).toEqual(flowScreenIds.toReversed());
    const seen = await member.client().getFlow(flowId);
    expect(seen.steps.map((step) => step.screen.id)).toEqual(flowScreenIds.toReversed());
  });

  it("a member still cannot", async () => {
    await expectApiError(
      other.client().updateScreen(screenId, { title: "Hijacked" }),
      403,
      "forbidden",
    );
    expect((await other.client().getScreen(screenId)).title).not.toBe("Hijacked");
  });

  it("an admin cannot delete it", async () => {
    await expectApiError(adminApi.deleteScreen(screenId), 403, "forbidden");
    await expectApiError(adminApi.deleteFlow(flowId), 403, "forbidden");
    expect((await member.client().getScreen(screenId)).id).toBe(screenId);
    expect((await member.client().getFlow(flowId)).id).toBe(flowId);
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

describe("D1 row counter", () => {
  it("counts D1 rows when the counter is on and omits the header when off", async () => {
    const counted = await admin.fetch("/api/v1/screens?limit=5");
    expect(counted.status).toBe(200);
    expect(Number(counted.headers.get("x-sc-d1-rows"))).toBeGreaterThan(0);

    const noQueries = await fetch(new URL("/api/v1/taxonomy", baseUrl()));
    expect(noQueries.headers.get("x-sc-d1-rows")).toBe("0");

    const off = await admin.fetch("/api/v1/screens?limit=5", {
      headers: { "x-test-d1-counter": "off" },
    });
    expect(off.status).toBe(200);
    expect(off.headers.has("x-sc-d1-rows")).toBe(false);
  });
});

describe("my contributions", () => {
  let owner: ScreenCommonsClient;
  let stranger: ScreenCommonsClient;
  let uploaded: CaptureBatchResult;
  let strangers: CaptureBatchResult;

  const memberKey = async (name: string) => {
    const session = await Session.signUp(
      name,
      `${name.toLowerCase()}-${suffix}@screen-commons.test`,
    );
    return keyClient((await session.client().createKey("contributions")).token);
  };
  const everything = async (client: ScreenCommonsClient, limit: number) => {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listContributions({ limit, cursor });
      expect(page.items.length).toBeLessThanOrEqual(limit);
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return ids;
  };

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([memberKey("Cora"), memberKey("Sam")]);
    uploaded = await owner.captures({
      app: { name: `Contrib App ${suffix}`, websiteUrl: `https://contrib-${suffix}.example.org` },
      flow: { name: "Signing up", type: "signing-up" },
      screens: [
        captureScreen({ title: "Approved" }),
        captureScreen({ title: "Rejected" }),
        captureScreen({ title: "Waiting" }),
      ],
    });
    strangers = await stranger.captures({
      app: { name: `Stranger App ${suffix}`, websiteUrl: `https://stranger-${suffix}.example.org` },
      screens: [captureScreen({ title: "Not yours" })],
    });
    const review = admin.client();
    await review.review("screen", uploaded.screens[0]!.id, "approve");
    await review.review("screen", uploaded.screens[1]!.id, "reject", "Blurry capture");
  });

  it("lists only the caller's screens and flows, newest first", async () => {
    const later = await owner.captures({
      app: { slug: uploaded.app.slug, name: uploaded.app.name },
      screens: [captureScreen({ title: "Later" })],
    });
    const { items, nextCursor } = await owner.listContributions();
    expect(nextCursor).toBeNull();
    expect(items[0]!.id).toBe(later.screens[0]!.id);
    expect(items.map((item) => item.id).sort()).toEqual(
      [...uploaded.screens, ...later.screens, uploaded.flow!].map((item) => item.id).sort(),
    );
    expect(items.find((item) => item.id === uploaded.flow!.id)).toMatchObject({
      kind: "flow",
      name: "Signing up",
      status: "pending",
    });
    const created = items.map((item) => item.createdAt);
    expect(created).toEqual([...created].sort().reverse());

    const theirs = await stranger.listContributions();
    expect(theirs.items.map((item) => item.id)).toEqual([strangers.screens[0]!.id]);
  });

  it("filters by status, with the reviewer's note on rejected items", async () => {
    const ids = async (status: "pending" | "published" | "rejected") =>
      (await owner.listContributions({ status })).items.map((item) => item.id);
    expect(await ids("published")).toEqual([uploaded.screens[0]!.id]);
    const pending = await ids("pending");
    expect(pending).toEqual(expect.arrayContaining([uploaded.screens[2]!.id, uploaded.flow!.id]));
    expect(pending).not.toContain(uploaded.screens[0]!.id);
    expect(pending).not.toContain(uploaded.screens[1]!.id);

    const rejected = await owner.listContributions({ status: "rejected" });
    expect(rejected.items).toEqual([
      expect.objectContaining({
        id: uploaded.screens[1]!.id,
        kind: "screen",
        status: "rejected",
        reviewReason: "Blurry capture",
      }),
    ]);
    expect((await owner.listContributions({ status: "published" })).items[0]!.reviewReason).toBe(
      null,
    );
  });

  it("filters by kind", async () => {
    const flows = await owner.listContributions({ kind: "flow" });
    expect(flows.items.map((item) => [item.kind, item.id])).toEqual([["flow", uploaded.flow!.id]]);
    const screens = await owner.listContributions({ kind: "screen" });
    expect(screens.items.every((item) => item.kind === "screen")).toBe(true);
    expect(screens.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(uploaded.screens.map((item) => item.id)),
    );
  });

  it("pages with a cursor, with no repeats or gaps", async () => {
    const all = await everything(owner, 100);
    expect(all.length).toBeGreaterThan(2);
    expect(await everything(owner, 2)).toEqual(all);
    expect(await everything(owner, 1)).toEqual(all);
    await expectApiError(owner.listContributions({ cursor: "nope" }), 400, "bad_request");
    await expectApiError(owner.listContributions({ limit: 101 }), 400, "bad_request");
  });

  it("reads a flow page's steps without walking the member's other screens", async () => {
    const session = await Session.signUp("Fern", `fern-${suffix}@screen-commons.test`);
    const fern = keyClient((await session.client().createKey("rows")).token);
    const app = { name: `Rows App ${suffix}`, websiteUrl: `https://rows-${suffix}.example.org` };
    const { app: created } = await fern.captures({
      app,
      flow: { name: "Checking out", type: "checkout" },
      screens: [captureScreen(), captureScreen()],
    });
    const rows = async () => {
      const response = await session.fetch("/api/v1/me/contributions?kind=flow");
      expect((await response.json()).items).toHaveLength(1);
      return Number(response.headers.get("x-sc-d1-rows"));
    };
    const before = await rows();
    await fern.captures({
      app: { slug: created.slug, name: app.name },
      screens: Array.from({ length: 40 }, () => captureScreen()),
    });
    expect(await rows()).toBeLessThan(before + 10);
  });

  it("requires sign-in", async () => {
    const response = await fetch(`${baseUrl()}/api/v1/me/contributions`);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthorized");
  });

  it("drops an item once it's deleted", async () => {
    const id = uploaded.screens[2]!.id;
    await owner.deleteScreen(id);
    expect((await owner.listContributions()).items.map((item) => item.id)).not.toContain(id);
  });
});
