import { appOrigin } from "../env";

/** Cross-origin callers (extension, other sites, MCP web clients) get `*` and never credentials. */
export const ALLOW_ANY_ORIGIN = { "access-control-allow-origin": "*" } as const;

export const CORS_PREFLIGHT_HEADERS = {
  ...ALLOW_ANY_ORIGIN,
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version",
  "access-control-max-age": "86400",
} as const;

/** 204 answer to any CORS preflight (`/api/v1/*`, `/mcp`). */
export const preflightResponse = () =>
  new Response(null, { status: 204, headers: CORS_PREFLIGHT_HEADERS });

/** True when the request comes from another origin (extension, other site, MCP web client). */
export function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin !== new URL(request.url).origin && origin !== appOrigin(request);
}
