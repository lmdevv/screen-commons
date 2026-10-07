import { randomUUID, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";

import {
  BRIDGE_CLOSE_REPLACED,
  BRIDGE_CLOSE_UNAUTHORIZED,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMessage,
  type BridgeMethod,
  type BridgeMethods,
} from "@open-ui/core";
import { WebSocket, WebSocketServer } from "ws";

export const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension|safari-web-extension):\/\//u;

/** Browser pages must never reach the bridge; only extensions (or non-browser clients). */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return EXTENSION_ORIGIN.test(origin);
}

export class BridgeError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

export interface BridgeClientInfo {
  name: string;
  version: string;
  browser: string;
  protocol: number;
  connectedAt: string;
}

export interface BridgeServerOptions {
  token: string;
  port: number;
  host?: string;
  /** Default timeout for requests to the extension, ms. */
  requestTimeoutMs?: number;
  /** Time a new socket has to send a valid `hello`, ms. */
  helloTimeoutMs?: number;
  /** Close clients that have been silent this long, ms (they ping every 20s). */
  idleTimeoutMs?: number;
  /** Max inbound message size (screenshots can be large). */
  maxPayload?: number;
  serverInfo?: { name: string; version: string };
  log?: (message: string) => void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  socket: WebSocket;
}

/**
 * Server side of the extension bridge (`packages/core/src/bridge.ts`): a WebSocket server on
 * 127.0.0.1 that authenticates one extension client with the pairing token and forwards
 * requests to it.
 */
export class BridgeServer extends EventEmitter {
  private readonly options: Required<Omit<BridgeServerOptions, "log">> & {
    log: (message: string) => void;
  };
  private wss: WebSocketServer | undefined;
  private client: { socket: WebSocket; info: BridgeClientInfo; lastSeen: number } | undefined;
  private readonly pending = new Map<string, Pending>();
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(options: BridgeServerOptions) {
    super();
    this.options = {
      host: "127.0.0.1",
      requestTimeoutMs: 60_000,
      helloTimeoutMs: 10_000,
      idleTimeoutMs: 75_000,
      maxPayload: 64 * 1024 * 1024,
      serverInfo: { name: "open-ui-mcp", version: "0.1.0" },
      log: () => undefined,
      ...options,
    };
  }

  get connected(): boolean {
    return this.client?.socket.readyState === WebSocket.OPEN;
  }

  get clientInfo(): BridgeClientInfo | null {
    return this.connected ? this.client!.info : null;
  }

  get listening(): boolean {
    return Boolean(this.wss);
  }

  get port(): number | null {
    const address = this.wss?.address();
    return address && typeof address === "object" ? (address as AddressInfo).port : null;
  }

  /** Start listening; resolves with the bound port. Rejects (e.g. EADDRINUSE) without throwing later. */
  listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        host: this.options.host,
        port: this.options.port,
        maxPayload: this.options.maxPayload,
        perMessageDeflate: false,
        verifyClient: (info, done) => {
          const origin = info.origin || (info.req.headers.origin as string | undefined);
          if (isAllowedOrigin(origin)) return done(true);
          this.options.log(`bridge: rejected connection from origin ${origin}`);
          done(false, 403, "Forbidden origin");
        },
      });
      const onError = (error: Error) => {
        wss.close();
        reject(error);
      };
      wss.once("error", onError);
      wss.once("listening", () => {
        wss.off("error", onError);
        wss.on("error", (error) => this.options.log(`bridge: ${error.message}`));
        this.wss = wss;
        this.heartbeat = setInterval(() => this.checkIdle(), 15_000);
        this.heartbeat.unref();
        resolve((wss.address() as AddressInfo).port);
      });
      wss.on("connection", (socket) => this.onConnection(socket));
    });
  }

  private checkIdle() {
    if (!this.client) return;
    if (Date.now() - this.client.lastSeen > this.options.idleTimeoutMs) {
      this.options.log("bridge: extension went silent, closing");
      this.client.socket.terminate();
    } else if (this.client.socket.readyState === WebSocket.OPEN) {
      this.send(this.client.socket, { type: "ping", at: Date.now() });
    }
  }

  private send(socket: WebSocket, message: BridgeMessage) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  private tokenMatches(token: unknown): boolean {
    if (typeof token !== "string") return false;
    const expected = Buffer.from(this.options.token);
    const actual = Buffer.from(token);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private onConnection(socket: WebSocket) {
    let authed = false;
    const helloTimer = setTimeout(() => {
      if (!authed) socket.close(BRIDGE_CLOSE_UNAUTHORIZED, "hello timeout");
    }, this.options.helloTimeoutMs);

    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      let message: BridgeMessage;
      try {
        message = JSON.parse(data.toString()) as BridgeMessage;
      } catch {
        return;
      }
      if (!message || typeof message !== "object") return;

      if (!authed) {
        if (message.type !== "hello" || !this.tokenMatches(message.token)) {
          clearTimeout(helloTimer);
          this.options.log("bridge: rejected client with an invalid pairing token");
          socket.close(BRIDGE_CLOSE_UNAUTHORIZED, "unauthorized");
          return;
        }
        authed = true;
        clearTimeout(helloTimer);
        if (message.protocol !== BRIDGE_PROTOCOL_VERSION) {
          this.options.log(
            `bridge: client speaks protocol ${message.protocol}, server ${BRIDGE_PROTOCOL_VERSION}`,
          );
        }
        const previous = this.client;
        if (previous && previous.socket !== socket) {
          this.rejectPending(previous.socket, new BridgeError("Extension reconnected", "replaced"));
          previous.socket.close(BRIDGE_CLOSE_REPLACED, "replaced by a newer connection");
        }
        const info: BridgeClientInfo = {
          name: String(message.client?.name ?? "unknown"),
          version: String(message.client?.version ?? "0"),
          browser: String(message.client?.browser ?? "unknown"),
          protocol: message.protocol,
          connectedAt: new Date().toISOString(),
        };
        this.client = { socket, info, lastSeen: Date.now() };
        this.send(socket, {
          type: "welcome",
          protocol: BRIDGE_PROTOCOL_VERSION,
          server: this.options.serverInfo,
        });
        this.options.log(
          `bridge: extension connected (${info.name} ${info.version}, ${info.browser})`,
        );
        this.emit("connected", info);
        return;
      }

      if (this.client?.socket === socket) this.client.lastSeen = Date.now();
      switch (message.type) {
        case "ping":
          this.send(socket, { type: "pong", at: message.at });
          return;
        case "pong":
          return;
        case "response": {
          const pending = this.pending.get(message.id);
          if (!pending || pending.socket !== socket) return;
          this.pending.delete(message.id);
          clearTimeout(pending.timer);
          if ("error" in message && message.error) {
            pending.reject(
              new BridgeError(
                message.error.message || "Extension error",
                message.error.code ?? "extension_error",
              ),
            );
          } else {
            pending.resolve((message as { result: unknown }).result);
          }
          return;
        }
        default:
          return;
      }
    });

    socket.on("close", () => {
      clearTimeout(helloTimer);
      this.rejectPending(socket, new BridgeError("Extension disconnected", "disconnected"));
      if (this.client?.socket === socket) {
        this.client = undefined;
        this.options.log("bridge: extension disconnected");
        this.emit("disconnected");
      }
    });
    socket.on("error", (error) => this.options.log(`bridge socket: ${error.message}`));
  }

  private rejectPending(socket: WebSocket, error: Error) {
    for (const [id, pending] of this.pending) {
      if (pending.socket !== socket) continue;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(error);
    }
  }

  /** Send a request to the connected extension and await its response. */
  request<M extends BridgeMethod>(
    method: M,
    params: BridgeMethods[M]["params"],
    timeoutMs = this.options.requestTimeoutMs,
  ): Promise<BridgeMethods[M]["result"]> {
    const client = this.client;
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new BridgeError("The Open UI extension is not connected", "not_connected"),
      );
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new BridgeError(`Extension did not answer '${method}' within ${timeoutMs}ms`, "timeout"),
        );
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        socket: client.socket,
      });
      this.send(client.socket, { type: "request", id, method, params } as BridgeMessage);
    });
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new BridgeError("Bridge closed", "closed"));
      this.pending.delete(id);
    }
    const wss = this.wss;
    this.wss = undefined;
    if (!wss) return;
    for (const socket of wss.clients) socket.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  }
}
