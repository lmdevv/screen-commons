import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  BRIDGE_CLOSE_UNAUTHORIZED,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMethod,
  type BridgeMethods,
} from "@open-ui/core/bridge";
import { captureBatchInputSchema, type CaptureBatchInput } from "@open-ui/core/schemas";
import { WebSocketServer, type WebSocket } from "ws";

export const FIXTURE = {
  headerHeight: 64,
  sections: [900, 900, 900, 500],
  /** Total document height in CSS px. */
  get height() {
    return this.sections.reduce((a, b) => a + b, 0);
  },
  card: { top: 1400, left: 120, width: 320, height: 180, color: [37, 99, 235] as const },
  lazyColor: [225, 29, 72] as const,
  headerColor: [17, 17, 17] as const,
};

function listen(server: Server, host?: string): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, host, () => resolve((server.address() as AddressInfo).port)),
  );
}

const svg = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="${fill}"/></svg>`;

/** Static site: taller than the viewport, sticky header, lazy images, an IntersectionObserver section. */
export async function startFixtureSite() {
  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Pricing – Fixture App</title>
  <meta name="description" content="Plans for teams of every size." />
  <meta property="og:site_name" content="Fixture App" />
  <meta property="og:image" content="/og.png" />
  <meta name="theme-color" content="#111111" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
  <style>
    html, body { margin: 0; padding: 0; }
    body { font: 16px/1.4 sans-serif; background: #ffffff; }
    header { position: sticky; top: 0; height: ${FIXTURE.headerHeight}px; background: rgb(${FIXTURE.headerColor}); color: #fff; z-index: 10; display: flex; align-items: center; padding: 0 24px; box-sizing: border-box; }
    section { position: relative; box-sizing: border-box; padding: 24px; }
    #s0 { height: ${FIXTURE.sections[0]! - FIXTURE.headerHeight}px; background: #f8fafc; }
    #s1 { height: ${FIXTURE.sections[1]}px; background: #ecfeff; }
    #s2 { height: ${FIXTURE.sections[2]}px; background: #f0fdf4; }
    #lazy { height: ${FIXTURE.sections[3]}px; background: #ffffff; }
    #lazy.loaded { background: rgb(${FIXTURE.lazyColor}); }
    #card { position: absolute; top: ${FIXTURE.card.top - FIXTURE.sections[0]!}px; left: ${FIXTURE.card.left}px; width: ${FIXTURE.card.width}px; height: ${FIXTURE.card.height}px; background: rgb(${FIXTURE.card.color}); color: #fff; }
    img { display: block; width: 400px; height: 200px; }
  </style>
</head>
<body>
  <header><nav><a href="/">Home</a> <a href="/pricing#teams">Teams</a> <a href="https://elsewhere.example.com/">Elsewhere</a></nav></header>
  <section id="s0"><h1>Simple pricing</h1><p>Start free, upgrade when you grow.</p><img src="/img/a.svg" alt="" /></section>
  <section id="s1"><h2>Compare plans</h2><div id="card">Pro plan card</div></section>
  <section id="s2"><h2>Frequently asked</h2><img loading="lazy" src="/img/b.svg?delay=300" alt="" /><a href="/docs">Docs</a> <a href="/docs">Docs again</a></section>
  <section id="lazy"><h3>Loaded late</h3></section>
  <script>
    window.lazyTriggered = false;
    new IntersectionObserver((entries, observer) => {
      if (entries.some((e) => e.isIntersecting)) {
        window.lazyTriggered = true;
        document.getElementById("lazy").classList.add("loaded");
        observer.disconnect();
      }
    }).observe(document.getElementById("lazy"));
  </script>
</body>
</html>`;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname.startsWith("/img/")) {
      const delay = Number(url.searchParams.get("delay") ?? 0);
      setTimeout(() => {
        res.writeHead(200, { "content-type": "image/svg+xml" });
        res.end(svg(url.pathname.includes("b") ? "#a855f7" : "#f59e0b"));
      }, delay);
      return;
    }
    if (url.pathname === "/favicon.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      res.end(svg("#111"));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
  });
  const port = await listen(server, "127.0.0.1");
  return {
    url: `http://127.0.0.1:${port}/pricing`,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** Server half of packages/core/src/bridge.ts. */
export async function startMockBridge(token: string) {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const port = (wss.address() as AddressInfo).port;
  let client: WebSocket | null = null;
  let hello: unknown = null;
  let pings = 0;
  const rejected: number[] = [];
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let seq = 0;
  let onAuth: (() => void) | null = null;

  wss.on("connection", (ws) => {
    let authed = false;
    ws.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as {
        type: string;
        token?: string;
        id?: string;
        at?: number;
        result?: unknown;
        error?: { message: string; code?: string };
      };
      if (!authed) {
        if (message.type !== "hello" || message.token !== token) {
          rejected.push(Date.now());
          ws.close(BRIDGE_CLOSE_UNAUTHORIZED, "bad token");
          return;
        }
        authed = true;
        hello = message;
        client = ws;
        ws.send(
          JSON.stringify({
            type: "welcome",
            protocol: BRIDGE_PROTOCOL_VERSION,
            server: { name: "mock-bridge", version: "0.0.1" },
          }),
        );
        onAuth?.();
        return;
      }
      if (message.type === "ping") {
        pings += 1;
        ws.send(JSON.stringify({ type: "pong", at: message.at }));
      } else if (message.type === "response" && message.id) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (!entry) return;
        if (message.error)
          entry.reject(
            Object.assign(new Error(message.error.message), { code: message.error.code }),
          );
        else entry.resolve(message.result);
      }
    });
    ws.on("close", () => {
      if (client === ws) client = null;
    });
  });

  function sendRaw(payload: unknown, id: string, timeoutMs = 60_000): Promise<unknown> {
    if (!client) return Promise.reject(new Error("extension not connected"));
    const ws = client;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${id}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      ws.send(JSON.stringify(payload));
    });
  }

  return {
    port,
    get hello() {
      return hello;
    },
    get pings() {
      return pings;
    },
    rejected,
    waitForAuth(timeoutMs = 20_000): Promise<void> {
      if (client) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("extension never authenticated")),
          timeoutMs,
        );
        onAuth = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    },
    request<M extends BridgeMethod>(
      method: M,
      params: BridgeMethods[M]["params"],
    ): Promise<BridgeMethods[M]["result"]> {
      const id = `r${++seq}`;
      return sendRaw({ type: "request", id, method, params }, id) as Promise<
        BridgeMethods[M]["result"]
      >;
    },
    /** Send an arbitrary (possibly invalid) request frame. */
    raw(payload: Record<string, unknown>): Promise<unknown> {
      const id = `x${++seq}`;
      return sendRaw({ ...payload, type: "request", id }, id);
    },
    close: () =>
      new Promise<void>((r) => {
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => r());
      }),
  };
}

/** Minimal Open UI API: /api/v1/me, /api/v1/captures (validated), /extension/connect. */
export async function startMockApi(keys: string[]) {
  const batches: CaptureBatchInput[] = [];
  const errors: string[] = [];
  const valid = new Set(keys);
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/extension/connect") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><title>Connect</title><p id="status">waiting</p><script>
        window.addEventListener("message", (e) => {
          if (e.source !== window) return;
          if (e.data?.type === "open-ui:extension-ready") window.postMessage({ type: "open-ui:connect", token: "oui_connected_key_123456", baseUrl: location.origin }, location.origin);
          if (e.data?.type === "open-ui:connect:result") document.getElementById("status").textContent = e.data.ok ? "connected:" + e.data.userName : "error:" + e.data.error;
        });
      </script>`);
      return;
    }
    const token = (req.headers.authorization ?? "").replace(/^Bearer /u, "");
    if (!valid.has(token))
      return json(res, 401, { error: { code: "unauthorized", message: "bad key" } });
    if (url.pathname === "/api/v1/me" && req.method === "GET") {
      return json(res, 200, {
        id: "u1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        image: null,
        role: "admin",
        createdAt: new Date().toISOString(),
      });
    }
    if (url.pathname === "/api/v1/captures" && req.method === "POST") {
      const parsed = captureBatchInputSchema.safeParse(JSON.parse(await readBody(req)));
      if (!parsed.success) {
        errors.push(parsed.error.message);
        return json(res, 400, { error: { code: "bad_request", message: parsed.error.message } });
      }
      batches.push(parsed.data);
      const n = batches.length;
      return json(res, 200, {
        app: {
          id: "app1",
          slug: "fixture-app",
          name: parsed.data.app.name,
          platform: "web",
          logoUrl: null,
          accentColor: null,
        },
        screens: parsed.data.screens.map((_, i) => ({
          id: `s${n}-${i}`,
          status: "published",
          url: `/screens/s${n}-${i}`,
        })),
        flow: parsed.data.flow ? { id: "f1", status: "published", url: "/flows/f1" } : null,
      });
    }
    json(res, 404, { error: { code: "not_found", message: "nope" } });
  });
  const port = await listen(server);
  return {
    port,
    origin: `http://localhost:${port}`,
    batches,
    errors,
    addKey: (key: string) => valid.add(key),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export function pngSize(buffer: Buffer): { width: number; height: number } {
  expectPng(buffer);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function expectPng(buffer: Buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
}
