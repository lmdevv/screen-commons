import { createHash } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import {
  TAXONOMY,
  captureBatchInputSchema,
  createFlowInputSchema,
  type CaptureBatchInput,
  type CliLoginStatus,
  type Contribution,
  type FlowDetail,
  type FlowSummary,
  type ReviewKind,
  type Status,
  type Screen,
  type ScreenDetail,
} from "@screen-commons/core";
import sharp from "sharp";

export const API_KEY = "sc_test_key";
export const MEMBER_KEY = "sc_member_key";
export const OTHER_KEY = "sc_other_key";

export interface MockApi {
  url: string;
  batches: ReturnType<typeof captureBatchInputSchema.parse>[];
  flows: unknown[];
  decisions: { kind: string; id: string; decision: string; reason?: string }[];
  login: { status: CliLoginStatus; hashes: string[]; revoked: string[] };
  mediaRequests: string[];
  contributionQueries: Record<string, string>[];
  close: () => Promise<void>;
}

const user = (email: string) => ({
  id: email,
  name: email,
  email,
  image: null,
  role: "admin",
  createdAt: "2026-10-01T00:00:00.000Z",
});

const app = {
  id: "app_1",
  slug: "linear",
  name: "Linear",
  platform: "web" as const,
  logoUrl: null,
  accentColor: null,
};

const screen = (id: string): Screen => ({
  id,
  app,
  title: "Pricing – Linear",
  imageUrl: `/media/${id}-full.png`,
  thumbUrl: `/media/${id}-thumb.webp`,
  width: 2880,
  height: 1800,
  bytes: 1000,
  sourceUrl: "https://linear.app/pricing",
  patterns: ["pricing"],
  elements: ["pricing-table"],
  tags: [],
  version: "Oct 2026",
  dominantColor: "#000000",
  text: null,
  status: "published",
  source: "seed",
  saved: false,
  capturedAt: "2026-10-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
});

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startMockApi(): Promise<MockApi> {
  const thumb = await sharp({
    create: { width: 640, height: 400, channels: 3, background: "#123456" },
  })
    .webp()
    .toBuffer();
  const full = await sharp({
    create: { width: 2880, height: 1800, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  const batches: MockApi["batches"] = [];
  const flows: unknown[] = [];
  const decisions: MockApi["decisions"] = [];
  const reviewItems = new Map<string, { kind: ReviewKind; status: Status }>([
    ["scr_p1", { kind: "screen", status: "pending" }],
    ["scr_p2", { kind: "screen", status: "pending" }],
    ["scr_p3", { kind: "screen", status: "pending" }],
    ["flow_p1", { kind: "flow", status: "pending" }],
  ]);
  const flowSummary = (id: string): FlowSummary => ({
    id,
    app,
    name: "Signing up",
    type: "signing-up",
    description: null,
    stepCount: 2,
    previews: [],
    status: "pending",
    saved: false,
    createdAt: "2026-10-01T00:00:00.000Z",
  });
  const login: MockApi["login"] = { status: "approved", hashes: [], revoked: [] };
  const mediaRequests: string[] = [];
  const contributionQueries: Record<string, string>[] = [];
  let counter = 0;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://mock");
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (url.pathname.startsWith("/media/")) {
      mediaRequests.push(url.pathname);
      const isThumb = url.pathname.endsWith(".webp");
      response.writeHead(200, { "content-type": isThumb ? "image/webp" : "image/png" });
      return response.end(isThumb ? thumb : full);
    }
    if (!url.pathname.startsWith("/api/v1/"))
      return json(404, { error: { code: "not_found", message: "nope" } });
    const path = url.pathname.slice("/api/v1".length);
    if (request.method === "GET" && path === "/taxonomy") return json(200, TAXONOMY);
    if (request.method === "POST" && path === "/cli-login") {
      const { hash } = JSON.parse(await readBody(request)) as { hash: string };
      login.hashes.push(hash);
      return json(201, {
        code: "BCDF-GHJK",
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/cli-login?code=BCDF-GHJK`,
        expiresAt: "2026-11-10T00:10:00.000Z",
        interval: 1,
      });
    }
    if (request.method === "POST" && path === "/cli-login/poll") {
      const { hash } = JSON.parse(await readBody(request)) as { hash: string };
      if (!login.hashes.includes(hash)) return json(200, { status: "expired" });
      return json(
        200,
        login.status === "approved"
          ? { status: "approved", keyId: hash.slice(0, 8) }
          : { status: login.status },
      );
    }
    const token = /^Bearer (.+)$/u.exec(request.headers.authorization ?? "")?.[1] ?? "";
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const email =
      token === API_KEY
        ? "admin@example.com"
        : token === OTHER_KEY
          ? "other@example.com"
          : token === MEMBER_KEY
            ? "member@example.com"
            : login.status === "approved" && login.hashes.includes(tokenHash)
              ? "login@example.com"
              : undefined;
    const member = token === MEMBER_KEY;
    if (!email) {
      return json(401, { error: { code: "unauthorized", message: "Invalid API key" } });
    }
    try {
      if (path.startsWith("/review") && member) {
        return json(403, {
          error: { code: "forbidden", message: "Only admins can review contributions" },
        });
      }
      if (request.method === "GET" && path === "/review") {
        const kind = url.searchParams.get("kind");
        if (kind !== "screen" && kind !== "flow")
          return json(400, { error: { code: "bad_request", message: "kind: Invalid option" } });
        const pending = [...reviewItems]
          .filter(([, item]) => item.kind === kind && item.status === "pending")
          .map(([id]) => id);
        const start = Number(url.searchParams.get("cursor") ?? 0);
        const end = start + Number(url.searchParams.get("limit") ?? 25);
        return json(200, {
          kind,
          items: pending
            .slice(start, end)
            .map((id) =>
              kind === "screen" ? { ...screen(id), status: "pending" } : flowSummary(id),
            ),
          nextCursor: end < pending.length ? String(end) : null,
        });
      }
      const reviewMatch = /^\/review\/(screen|flow)\/([^/]+)$/u.exec(path);
      if (reviewMatch) {
        const kind = reviewMatch[1] as ReviewKind;
        const id = reviewMatch[2]!;
        const item = reviewItems.get(id);
        if (item?.kind !== kind) {
          const noun = kind === "screen" ? "Screen" : "Flow";
          return json(404, { error: { code: "not_found", message: `${noun} not found` } });
        }
        if (request.method === "GET") return json(200, { kind, id, status: item.status });
        const body = JSON.parse(await readBody(request)) as { decision: string; reason?: string };
        decisions.push({ kind, id, ...body });
        item.status = body.decision === "approve" ? "published" : "rejected";
        response.writeHead(204);
        return response.end();
      }
      if (request.method === "GET" && path === "/me") return json(200, user(email));
      const keyMatch = /^\/keys\/([^/]+)$/u.exec(path);
      if (request.method === "DELETE" && keyMatch) {
        login.revoked.push(keyMatch[1]!);
        response.writeHead(204);
        return response.end();
      }
      if (request.method === "GET" && path === "/me/contributions") {
        contributionQueries.push(Object.fromEntries(url.searchParams));
        const items: Contribution[] = [
          {
            ...screen("scr_mine"),
            status: "rejected",
            kind: "screen",
            reviewReason: "Blurry capture",
          },
          {
            ...flowSummary("flow_mine"),
            createdAt: "2026-09-30T00:00:00.000Z",
            kind: "flow",
            reviewReason: null,
          },
        ];
        return json(200, { items, nextCursor: "c2" });
      }
      if (request.method === "GET" && path === "/screens") {
        return json(200, {
          items: [screen("scr_1"), screen("scr_2")],
          nextCursor: url.searchParams.get("q") === "more" ? "c1" : null,
        });
      }
      const screenMatch = /^\/screens\/([^/]+)$/u.exec(path);
      if (request.method === "GET" && screenMatch) {
        if (screenMatch[1] === "missing")
          return json(404, { error: { code: "not_found", message: "Screen not found" } });
        const detail: ScreenDetail = {
          ...screen(screenMatch[1]!),
          previousId: null,
          nextId: "scr_2",
          flows: [],
        };
        return json(200, detail);
      }
      if (request.method === "PATCH" && screenMatch) {
        const patch = JSON.parse(await readBody(request)) as { title?: string; text?: string };
        const detail: ScreenDetail = {
          ...screen(screenMatch[1]!),
          title: patch.title ?? null,
          text: patch.text ?? null,
          previousId: null,
          nextId: null,
          flows: [],
        };
        return json(200, detail);
      }
      if (request.method === "DELETE" && (screenMatch || /^\/flows\/[^/]+$/u.test(path))) {
        if (path.endsWith("/forbidden"))
          return json(403, { error: { code: "forbidden", message: "Only the contributor" } });
        response.writeHead(204);
        return response.end();
      }
      const flowMatch = /^\/flows\/([^/]+)$/u.exec(path);
      if (request.method === "GET" && flowMatch?.[1] === "missing")
        return json(404, { error: { code: "not_found", message: "Flow not found" } });
      if ((request.method === "GET" || request.method === "PATCH") && flowMatch) {
        const pending = flowMatch[1] === "pending";
        const step = (id: string): Screen =>
          pending ? { ...screen(id), status: "pending", owned: true } : screen(id);
        const patch =
          request.method === "PATCH"
            ? (JSON.parse(await readBody(request)) as { name?: string })
            : {};
        const flow: FlowDetail = {
          id: flowMatch[1]!,
          app,
          name: patch.name ?? "Signing up",
          type: "signing-up",
          description: null,
          stepCount: 2,
          previews: [],
          status: pending ? "pending" : "published",
          saved: false,
          createdAt: "2026-10-01T00:00:00.000Z",
          steps: [
            { position: 0, label: "Landing", screen: step("scr_1") },
            { position: 1, label: "Pricing", screen: step("scr_2") },
          ],
        };
        return json(200, flow);
      }
      if (request.method === "POST" && path === "/captures") {
        const parsed = captureBatchInputSchema.safeParse(
          JSON.parse(await readBody(request)) as CaptureBatchInput,
        );
        if (!parsed.success)
          return json(400, { error: { code: "bad_request", message: parsed.error.message } });
        batches.push(parsed.data);
        const screens = parsed.data.screens.map(() => {
          counter += 1;
          return { id: `new_${counter}`, status: "published", url: `/screens/new_${counter}` };
        });
        return json(200, {
          app: { ...app, slug: "fixture", name: parsed.data.app.name },
          screens,
          flow: parsed.data.flow
            ? { id: "flow_1", status: "published", url: "/flows/flow_1" }
            : null,
        });
      }
      if (request.method === "POST" && path === "/flows") {
        const parsed = createFlowInputSchema.parse(JSON.parse(await readBody(request)));
        flows.push(parsed);
        return json(200, {
          flow: { id: "flow_2", name: parsed.name, status: "published", steps: parsed.steps },
        });
      }
      return json(404, {
        error: { code: "not_found", message: `No route ${request.method} ${path}` },
      });
    } catch (error) {
      return json(500, { error: { code: "internal", message: String(error) } });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    batches,
    flows,
    decisions,
    login,
    mediaRequests,
    contributionQueries,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
