import {
  BRIDGE_CLOSE_REPLACED,
  BRIDGE_CLOSE_UNAUTHORIZED,
  type BridgeMessage,
} from "@open-ui/core";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { BridgeServer, isAllowedOrigin } from "../src/bridge";

const TOKEN = "a".repeat(64);
const servers: BridgeServer[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.on("error", () => undefined);
    if (socket.readyState !== WebSocket.CONNECTING) socket.terminate();
  }
  for (const server of servers.splice(0)) await server.close();
});

async function startServer(options: Partial<ConstructorParameters<typeof BridgeServer>[0]> = {}) {
  const server = new BridgeServer({ token: TOKEN, port: 0, ...options });
  servers.push(server);
  const port = await server.listen();
  return { server, port };
}

function connect(port: number, origin?: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : {});
  sockets.push(socket);
  const messages: BridgeMessage[] = [];
  const waiters: ((message: BridgeMessage) => void)[] = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString()) as BridgeMessage;
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else messages.push(message);
  });
  return {
    socket,
    open: () =>
      new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve());
        socket.once("error", reject);
      }),
    next: () =>
      new Promise<BridgeMessage>((resolve) => {
        const queued = messages.shift();
        if (queued) resolve(queued);
        else waiters.push(resolve);
      }),
    closed: () =>
      new Promise<{ code: number; reason: string }>((resolve) =>
        socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })),
      ),
    send: (message: unknown) => socket.send(JSON.stringify(message)),
    hello: (token = TOKEN) =>
      socket.send(
        JSON.stringify({
          type: "hello",
          token,
          protocol: 1,
          client: { name: "test-ext", version: "1.0.0", browser: "chromium" },
        }),
      ),
  };
}

describe("origin policy", () => {
  it("allows extensions and non-browser clients only", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("chrome-extension://abcdef")).toBe(true);
    expect(isAllowedOrigin("moz-extension://1234")).toBe(true);
    expect(isAllowedOrigin("safari-web-extension://x")).toBe(true);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(false);
    expect(isAllowedOrigin("null")).toBe(false);
  });
});

describe("BridgeServer", () => {
  it("binds to 127.0.0.1 only", async () => {
    const { server } = await startServer();
    expect(server.listening).toBe(true);
    const address = (
      server as unknown as { wss: { address(): { address: string } } }
    ).wss.address();
    expect(address.address).toBe("127.0.0.1");
  });

  it("rejects web origins at the handshake", async () => {
    const { port } = await startServer();
    const client = connect(port, "https://evil.example");
    const status = await new Promise<number>((resolve) =>
      client.socket.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0)),
    );
    expect(status).toBe(403);
  });

  it("closes with 4401 on a bad token", async () => {
    const { server, port } = await startServer();
    const client = connect(port, "chrome-extension://abc");
    await client.open();
    const closed = client.closed();
    client.hello("wrong");
    expect((await closed).code).toBe(BRIDGE_CLOSE_UNAUTHORIZED);
    expect(server.connected).toBe(false);
  });

  it("closes with 4401 when no hello arrives in time", async () => {
    const { port } = await startServer({ helloTimeoutMs: 100 });
    const client = connect(port);
    await client.open();
    expect((await client.closed()).code).toBe(BRIDGE_CLOSE_UNAUTHORIZED);
  });

  it("welcomes a valid client, answers pings and routes responses by id", async () => {
    const { server, port } = await startServer();
    const client = connect(port, "chrome-extension://abc");
    await client.open();
    const connected = new Promise((resolve) => server.once("connected", resolve));
    client.hello();
    const welcome = await client.next();
    expect(welcome).toMatchObject({
      type: "welcome",
      protocol: 1,
      server: { name: "open-ui-mcp" },
    });
    await connected;
    expect(server.connected).toBe(true);
    expect(server.clientInfo).toMatchObject({ name: "test-ext", browser: "chromium" });

    client.send({ type: "ping", at: 42 });
    expect(await client.next()).toEqual({ type: "pong", at: 42 });

    const first = server.request("navigate", { url: "https://a.example" });
    const second = server.request("listTabs", {});
    const requestA = await client.next();
    const requestB = await client.next();
    expect(requestA).toMatchObject({
      type: "request",
      method: "navigate",
      params: { url: "https://a.example" },
    });
    expect(requestB).toMatchObject({ type: "request", method: "listTabs" });
    const idA = (requestA as { id: string }).id;
    const idB = (requestB as { id: string }).id;
    expect(idA).not.toBe(idB);
    // answer out of order
    client.send({ type: "response", id: idB, result: { tabs: [] } });
    client.send({
      type: "response",
      id: idA,
      result: { tabId: 7, url: "https://a.example/", title: "A" },
    });
    expect(await second).toEqual({ tabs: [] });
    expect(await first).toEqual({ tabId: 7, url: "https://a.example/", title: "A" });

    const failing = server.request("extract", {});
    failing.catch(() => undefined);
    const requestC = (await client.next()) as { id: string };
    client.send({
      type: "response",
      id: requestC.id,
      error: { message: "no tab", code: "no_tab" },
    });
    await expect(failing).rejects.toMatchObject({ code: "no_tab", message: "no tab" });
  });

  it("times out unanswered requests", async () => {
    const { server, port } = await startServer();
    const client = connect(port);
    await client.open();
    client.hello();
    await client.next();
    await expect(server.request("listTabs", {}, 100)).rejects.toMatchObject({ code: "timeout" });
  });

  it("rejects requests when no extension is connected", async () => {
    const { server } = await startServer();
    await expect(server.request("listTabs", {})).rejects.toMatchObject({ code: "not_connected" });
  });

  it("replaces an older client with 4409 and fails its pending requests", async () => {
    const { server, port } = await startServer();
    const older = connect(port);
    await older.open();
    older.hello();
    await older.next();
    const pending = server.request("listTabs", {});
    pending.catch(() => undefined);
    await older.next();

    const newer = connect(port);
    await newer.open();
    const olderClosed = older.closed();
    newer.hello();
    expect((await newer.next()).type).toBe("welcome");
    expect((await olderClosed).code).toBe(BRIDGE_CLOSE_REPLACED);
    await expect(pending).rejects.toMatchObject({ code: "replaced" });
    expect(server.connected).toBe(true);

    // requests now go to the newer client
    const next = server.request("listTabs", {});
    const request = (await newer.next()) as { id: string };
    newer.send({
      type: "response",
      id: request.id,
      result: { tabs: [{ id: 1, url: "u", title: "t", active: true }] },
    });
    expect((await next).tabs).toHaveLength(1);
  });

  it("fails pending requests when the client disconnects", async () => {
    const { server, port } = await startServer();
    const client = connect(port);
    await client.open();
    client.hello();
    await client.next();
    const pending = server.request("listTabs", {});
    pending.catch(() => undefined);
    await client.next();
    client.socket.close();
    await expect(pending).rejects.toMatchObject({ code: "disconnected" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.connected).toBe(false);
  });

  it("accepts large messages", async () => {
    const { server, port } = await startServer();
    const client = connect(port);
    await client.open();
    client.hello();
    await client.next();
    const pending = server.request("screenshot", {});
    const request = (await client.next()) as { id: string };
    const base64 = "A".repeat(20 * 1024 * 1024);
    client.send({
      type: "response",
      id: request.id,
      result: { base64, type: "image/png", width: 1, height: 1, url: "u", title: "t" },
    });
    expect((await pending).base64.length).toBe(base64.length);
  });
});
