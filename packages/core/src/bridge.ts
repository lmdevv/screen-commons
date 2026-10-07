/**
 * Protocol between the local MCP server (WebSocket server on 127.0.0.1) and the browser
 * extension (WebSocket client in the background service worker).
 *
 * 1. Extension connects to `ws://127.0.0.1:<port>` and sends `hello` with the pairing token.
 * 2. Server replies `welcome` (or closes with code 4401 on a bad token).
 * 3. Server sends `request`s; the extension answers each with a `response` carrying the same id.
 * 4. Either side may send `ping`; the other answers `pong`. The extension pings every 20s, which
 *    also keeps the MV3 service worker alive while connected.
 */

export const BRIDGE_DEFAULT_PORT = 7457;
export const BRIDGE_PROTOCOL_VERSION = 1;
export const BRIDGE_CLOSE_UNAUTHORIZED = 4401;
export const BRIDGE_CLOSE_REPLACED = 4409;

export type Viewport = "desktop" | "mobile";

export const VIEWPORTS: Record<
  Viewport,
  { width: number; height: number; deviceScaleFactor: number; mobile: boolean }
> = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
};

export interface PageMetadata {
  url: string;
  title: string;
  description: string | null;
  siteName: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  themeColor: string | null;
  lang: string | null;
  headings: string[];
  /** Absolute same-origin links, deduplicated, without hashes. */
  links: { url: string; text: string }[];
}

export interface ScreenshotResult {
  /** base64, no data: prefix */
  base64: string;
  type: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  url: string;
  title: string;
  /** Visible text of the captured area (collapsed whitespace, ≤20k chars), when available. */
  text?: string;
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
}

export interface BridgeMethods {
  navigate: {
    params: { url: string; viewport?: Viewport; newTab?: boolean };
    result: { tabId: number; url: string; title: string };
  };
  screenshot: {
    params: { fullPage?: boolean; selector?: string; tabId?: number };
    result: ScreenshotResult;
  };
  extract: {
    params: { tabId?: number };
    result: PageMetadata;
  };
  listTabs: {
    params: Record<string, never>;
    result: { tabs: TabInfo[] };
  };
}

export type BridgeMethod = keyof BridgeMethods;

export type BridgeMessage =
  | {
      type: "hello";
      token: string;
      protocol: number;
      client: { name: string; version: string; browser: string };
    }
  | { type: "welcome"; protocol: number; server: { name: string; version: string } }
  | { type: "ping"; at: number }
  | { type: "pong"; at: number }
  | {
      [M in BridgeMethod]: {
        type: "request";
        id: string;
        method: M;
        params: BridgeMethods[M]["params"];
      };
    }[BridgeMethod]
  | { type: "response"; id: string; result: unknown }
  | { type: "response"; id: string; error: { message: string; code?: string } };
