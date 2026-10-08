/**
 * Service layer: plain async functions returning the exact `@screen-commons/core` API shapes. Used by
 * the REST API (`/api/v1`), the remote MCP server (`/mcp`) and TanStack Start server functions.
 * Every function validates its input with the core zod schemas.
 */
export * from "./catalog";
export * from "./collections";
export * from "./ingest";
export * from "./library";
export * from "./review";
export { type Viewer } from "./shared";
export { createKey, listKeys, revokeKey } from "../keys";
export { toUser as me } from "../principal";
