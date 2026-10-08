import {
  BRIDGE_CLOSE_REPLACED,
  BRIDGE_CLOSE_UNAUTHORIZED,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMessage,
} from "@screen-commons/core/bridge";
import { browser } from "wxt/browser";

import { backoffDelay, parseInbound, type BridgeRequest } from "../lib/bridge-protocol";
import type { Settings } from "../lib/settings";
import { setItem, type BridgeState, type BridgeStatus } from "../lib/storage";
import { CaptureError, IS_FIREFOX } from "./browser-utils";
import { handleBridgeRequest } from "./bridge-handlers";

/**
 * WebSocket client for the local `screen-commons-mcp` bridge (protocol: packages/core/src/bridge.ts).
 * Keepalive: app-level ping every 20s (WebSocket traffic resets the MV3 idle timer in Chrome
 * 116+); exponential backoff reconnect; the background's 1-minute alarm calls `ensure()` to
 * revive the connection after the worker was suspended.
 */
const PING_INTERVAL_MS = 20_000;
const HELLO_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 90_000;

let socket: WebSocket | null = null;
let settings: Settings | null = null;
let status: BridgeStatus = { state: "disabled", port: 0, since: Date.now() };
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let helloTimer: ReturnType<typeof setTimeout> | undefined;
/** After 4401/4409 we stay down until settings change or the user asks to reconnect. */
let parked = false;

function setStatus(state: BridgeState, extra: Partial<BridgeStatus> = {}) {
  status = {
    state,
    port: settings?.bridgePort ?? 0,
    server: extra.server ?? (state === "connected" ? status.server : null),
    error: extra.error ?? null,
    since: state === status.state ? status.since : Date.now(),
  };
  void setItem("bridgeStatus", status);
}

export function bridgeStatus(): BridgeStatus {
  return status;
}

function send(message: BridgeMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function clearTimers() {
  clearTimeout(reconnectTimer);
  clearTimeout(helloTimer);
  clearInterval(pingTimer);
  reconnectTimer = helloTimer = pingTimer = undefined;
}

function teardown() {
  clearTimers();
  if (socket) {
    const old = socket;
    socket = null;
    old.onopen = old.onmessage = old.onerror = old.onclose = null;
    try {
      old.close(1000, "client closing");
    } catch {
      // ignore
    }
  }
}

function scheduleReconnect() {
  if (parked || !settings?.bridgeEnabled || !settings.bridgeToken) return;
  clearTimeout(reconnectTimer);
  // Cap at 30s while we have seen a server recently, 60s otherwise (alarm also retries).
  const delay = backoffDelay(attempt, Math.random, attempt > 6 ? 60_000 : 30_000);
  attempt += 1;
  reconnectTimer = setTimeout(connect, delay);
}

function connect() {
  if (!settings) return;
  teardown();
  if (!settings.bridgeEnabled) return setStatus("disabled");
  if (!settings.bridgeToken) return setStatus("unpaired");
  setStatus("connecting");
  let ws: WebSocket;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${settings.bridgePort}`);
  } catch (error) {
    setStatus("offline", { error: error instanceof Error ? error.message : String(error) });
    return scheduleReconnect();
  }
  socket = ws;
  const token = settings.bridgeToken;

  ws.onopen = () => {
    send({
      type: "hello",
      token,
      protocol: BRIDGE_PROTOCOL_VERSION,
      client: {
        name: "screen-commons-extension",
        version: browser.runtime.getManifest().version,
        browser: IS_FIREFOX ? "firefox" : "chromium",
      },
    });
    helloTimer = setTimeout(() => {
      setStatus("offline", { error: "No welcome from the bridge server" });
      teardown();
      scheduleReconnect();
    }, HELLO_TIMEOUT_MS);
  };

  ws.onmessage = (event) => {
    const message = parseInbound(event.data);
    switch (message.type) {
      case "welcome":
        clearTimeout(helloTimer);
        attempt = 0;
        setStatus("connected", { server: message.server });
        clearInterval(pingTimer);
        pingTimer = setInterval(() => send({ type: "ping", at: Date.now() }), PING_INTERVAL_MS);
        break;
      case "ping":
        send({ type: "pong", at: message.at });
        break;
      case "pong":
        break;
      case "request":
        if (status.state !== "connected") {
          send({
            type: "response",
            id: message.request.id,
            error: { code: "unauthorized", message: "Not paired" },
          });
          break;
        }
        void respond(message.request);
        break;
      case "invalid-request":
        send({ type: "response", id: message.id, error: message.error });
        break;
      case "ignored":
        console.warn("[screen-commons] ignored bridge frame:", message.reason);
        break;
    }
  };

  ws.onerror = () => {
    // onclose follows with the details.
  };

  ws.onclose = (event) => {
    if (socket !== ws) return;
    socket = null;
    clearTimers();
    if (event.code === BRIDGE_CLOSE_UNAUTHORIZED) {
      parked = true;
      setStatus("unauthorized", { error: "The bridge rejected the pairing token" });
    } else if (event.code === BRIDGE_CLOSE_REPLACED) {
      parked = true;
      setStatus("replaced", { error: "Another browser connected to the bridge" });
    } else {
      setStatus("offline", {
        error: status.state === "connected" ? "Connection lost" : "Bridge not running",
      });
      scheduleReconnect();
    }
  };
}

async function respond(request: BridgeRequest) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      handleBridgeRequest(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new CaptureError(`${request.method} timed out`, "timeout")),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
    send({ type: "response", id: request.id, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CaptureError ? error.code : "internal";
    send({ type: "response", id: request.id, error: { message, code } });
  } finally {
    clearTimeout(timer);
  }
}

/** Apply new settings; reconnects when anything bridge-related changed. */
export function configureBridge(next: Settings) {
  const previous = settings;
  settings = next;
  const changed =
    !previous ||
    previous.bridgeEnabled !== next.bridgeEnabled ||
    previous.bridgePort !== next.bridgePort ||
    previous.bridgeToken !== next.bridgeToken;
  if (!changed) return;
  parked = false;
  attempt = 0;
  connect();
}

/** Called by the keepalive alarm and on startup: reconnect if we should be connected. */
export function ensureBridge() {
  if (!settings || parked) return;
  if (!settings.bridgeEnabled) return setStatus("disabled");
  if (!settings.bridgeToken) return setStatus("unpaired");
  const state = socket?.readyState;
  if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
  if (reconnectTimer) return;
  connect();
}

/** User-initiated reconnect (popup / options): clears parking and backoff. */
export function reconnectBridge(): BridgeStatus {
  parked = false;
  attempt = 0;
  connect();
  return status;
}
