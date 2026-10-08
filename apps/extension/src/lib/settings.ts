import { BRIDGE_DEFAULT_PORT } from "@screen-commons/core/bridge";

export const DEFAULT_SERVER_URL = "http://localhost:5173";

export type FullPageMethod = "auto" | "stitch";

export interface Settings {
  /** Screen Commons instance origin, no trailing slash. */
  serverUrl: string;
  /** `sc_…` API key (manual paste or handed over by `/extension/connect`). */
  apiKey: string;
  bridgeEnabled: boolean;
  bridgePort: number;
  /** Pairing token printed by `screen-commons-mcp` (`SCREEN_COMMONS_BRIDGE_TOKEN`). */
  bridgeToken: string;
  /** `auto`: CDP (Chromium) / captureTab (Firefox), stitching as fallback. */
  fullPageMethod: FullPageMethod;
  /** Scroll through the page before full-page captures so lazy content loads. */
  lazyLoad: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: DEFAULT_SERVER_URL,
  apiKey: "",
  bridgeEnabled: true,
  bridgePort: BRIDGE_DEFAULT_PORT,
  bridgeToken: "",
  fullPageMethod: "auto",
  lazyLoad: true,
};

/** Normalise user input into an origin-like base URL: `localhost:5173/` → `http://localhost:5173`. */
export function normalizeServerUrl(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/iu.test(value);
    value = `${local ? "http" : "https"}://${value}`;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const path = url.pathname.replace(/\/+$/u, "");
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

/** Match pattern for a content script on a server origin: `https://ui.example.com/*`. */
export function originMatchPattern(serverUrl: string): string | null {
  try {
    const url = new URL(serverUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Match patterns do not include ports; the host part matches any port.
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

export function sanitizeSettings(input: Partial<Settings> | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...input };
  return {
    serverUrl: normalizeServerUrl(merged.serverUrl) ?? DEFAULT_SERVER_URL,
    apiKey: String(merged.apiKey ?? "").trim(),
    bridgeEnabled: Boolean(merged.bridgeEnabled),
    bridgePort: isValidPort(Number(merged.bridgePort))
      ? Number(merged.bridgePort)
      : BRIDGE_DEFAULT_PORT,
    bridgeToken: String(merged.bridgeToken ?? "").trim(),
    fullPageMethod: merged.fullPageMethod === "stitch" ? "stitch" : "auto",
    lazyLoad: merged.lazyLoad !== false,
  };
}
