# apps/web server layer

Everything server-side for the Open UI web app. Runs inside the Cloudflare Worker (workerd in
dev via `@cloudflare/vite-plugin`).

```
src/server/
  env.ts           cloudflare:workers env, getDb() (Drizzle over D1), getMedia() (R2), appOrigin()
  auth.ts          Better Auth (email+password, GitHub when env set, first user → admin)
  keys.ts          API keys: oui_ + 32 random bytes, SHA-256 at rest, throttled last_used_at
  principal.ts     getPrincipal(request): bearer key OR session cookie (same-origin only)
  errors.ts        ServiceError(code, message) + zod → bad_request mapping
  ids.ts           time-ordered ids, sha256Hex, base64url
  services/        plain async functions returning exact @open-ui/core API shapes
    catalog.ts     listApps, getApp, listScreens, getScreen, listFlows, getFlow, search, getTaxonomy
    ingest.ts      captures, createScreen, createFlow, uploadScreenFromTool (MCP)
    collections.ts listCollections, getCollection, create/rename/deleteCollection, save, unsave
    review.ts      reviewQueue, review
    shared.ts      visibility rules, cursor pagination, row → API mapping
  http/
    api.ts         REST API (Hono) mounted at /api/v1/* (src/routes/api/v1/$.ts)
    media.ts       /media/<key> R2 streaming (src/routes/media/$.ts)
    mcp.ts         remote MCP at /mcp (src/routes/mcp.ts)
  functions.ts     TanStack Start server functions for the UI (below)
```

## Rules the services enforce

- **Visibility.** Detail reads (`getScreen`, `getFlow`, `getApp`): `published`, or contributed by
  the viewer, or viewer is admin. List reads/search/counts: `published` plus the viewer's own
  `pending` items. Admins see other people's pending items via `getReviewQueue`.
- **Status on write.** Admin contributions → `published`; member contributions → `pending`.
  Approving a screen publishes its app; approving a flow publishes its app and pending screens.
- **Pagination.** `{ items, nextCursor }`; pass `nextCursor` back as `cursor`. Cursors are opaque
  and tied to the sort (`latest` | `popular`). Popular = `save_count * 4 + view_count` (apps also
  add their published screens' scores).
- **Media.** `imageUrl` / `thumbUrl` / `logoUrl` are relative `/media/<kind>/<sha256>.<ext>` paths
  (public, immutable). Previews use the thumbnail's own `width`/`height`.
- **Views/saves.** `getScreen`, `getFlow`, `getApp` increment `view_count`. Saving increments
  `save_count`. `saved` on screens/flows means "in any of my collections".

## Server functions (`src/server/functions.ts`)

Call them as `fn({ data })` (or `fn()` when there's no input). All require a signed-in session
except `getCurrentUser` / `getAuthOptions`. Errors: not signed in → throws a router `redirect` to
`/sign-in`; missing or hidden item → throws `notFound()`; anything else → `Error(message)`.
Types come from `@open-ui/core`. Query option factories for all reads live in
`src/lib/queries.ts` (`queries.apps(...)`, `queries.screensInfinite(...)`, …).

| Function           | Method | Input (`data`)                                                                                                          | Output                                                                        |
| ------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `getCurrentUser`   | GET    | —                                                                                                                       | `User \| null`                                                                |
| `getAuthOptions`   | GET    | —                                                                                                                       | `{ emailPassword: true, github: boolean }`                                    |
| `getTaxonomy`      | GET    | —                                                                                                                       | `Taxonomy` (platforms, categories, patterns, elements, flowTypes)             |
| `listApps`         | GET    | `ListAppsQuery` `{ platform?, category?, q?, sort?, cursor?, limit? }`                                                  | `Page<AppSummary>`                                                            |
| `getApp`           | GET    | `{ slug, platform? }` (slug or id)                                                                                      | `AppDetail`                                                                   |
| `listScreens`      | GET    | `ListScreensQuery` `{ app?, platform?, pattern?, element?, version?, q?, sort?, cursor?, limit? }` (`app` = slug or id) | `Page<Screen>`                                                                |
| `getScreen`        | GET    | `{ id }`                                                                                                                | `ScreenDetail` (+ `previousId`/`nextId` in app grid order, `flows`)           |
| `listFlows`        | GET    | `ListFlowsQuery` `{ app?, platform?, type?, q?, cursor?, limit? }`                                                      | `Page<FlowSummary>`                                                           |
| `getFlow`          | GET    | `{ id }`                                                                                                                | `FlowDetail` (steps ordered by position, each with a full `Screen`)           |
| `search`           | GET    | `SearchQuery` `{ q, platform?, limit? }`                                                                                | `SearchResult` `{ apps, screens, flows, terms }` (relevance ranked)           |
| `createScreen`     | POST   | `FormData`: `image` File, `thumbnail` File, `meta` JSON `CreateScreenInput`                                             | `{ screen: Screen }`                                                          |
| `submitCaptures`   | POST   | `CaptureBatchInput` (base64 images, optional `logo`, optional `flow`)                                                   | `CaptureBatchResult`                                                          |
| `createFlow`       | POST   | `CreateFlowInput` `{ appId, name, type?, description?, steps: [{ screenId, label? }] }`                                 | `{ flow: FlowDetail }`                                                        |
| `listCollections`  | GET    | —                                                                                                                       | `{ items: Collection[] }` (default "Saved" first; created on demand)          |
| `getCollection`    | GET    | `{ id }`                                                                                                                | `{ collection, screens: Screen[], flows: FlowSummary[], apps: AppSummary[] }` |
| `createCollection` | POST   | `{ name }`                                                                                                              | `{ collection: Collection }`                                                  |
| `renameCollection` | POST   | `{ id, name }`                                                                                                          | `{ collection: Collection }`                                                  |
| `deleteCollection` | POST   | `{ id }` (default collection can't be deleted)                                                                          | `{ ok: true }`                                                                |
| `saveItem`         | POST   | `{ kind: "screen" \| "flow" \| "app", id, collectionId? }`                                                              | `{ saved: true }` (idempotent; default collection when omitted)               |
| `unsaveItem`       | POST   | `{ kind, id, collectionId? }` (omit `collectionId` → remove everywhere)                                                 | `{ saved: false }`                                                            |
| `listKeys`         | GET    | —                                                                                                                       | `{ items: ApiKey[] }` (active keys only)                                      |
| `createKey`        | POST   | `{ name }`                                                                                                              | `{ key: ApiKey, token: string }` — token shown once                           |
| `revokeKey`        | POST   | `{ id }`                                                                                                                | `{ ok: true }`                                                                |
| `getReviewQueue`   | GET    | — (admin)                                                                                                               | `ReviewQueue` `{ screens: Screen[], flows: FlowSummary[] }` (oldest first)    |
| `reviewItem`       | POST   | `{ kind: "screen" \| "flow", id, decision: "approve" \| "reject", reason? }` (admin)                                    | `{ ok: true }`                                                                |

Client-side auth (sign in/up/out, GitHub) uses Better Auth's React client: `src/lib/auth-client.ts`.
After signing in/out, invalidate the `["session"]` query and call `router.invalidate()`.
The root route puts `user` (`User | null`) in router context; the `_app` layout guarantees it.

## REST API (`/api/v1`)

Matches `packages/core/src/client.ts` exactly (use `createOpenUiClient`). Auth: session cookie
(same-origin only) or `Authorization: Bearer oui_…` (any origin, `Access-Control-Allow-Origin: *`,
never credentials). `/taxonomy` is public. Extra aliases from the spec:
`POST/DELETE /collections/:id/items`, `GET /apps/:slug?platform=`. Errors are
`{ error: { code, message } }` with HTTP status per code.

## MCP (`/mcp`)

Stateless Streamable HTTP (JSON responses), bearer API key required, `POST` only. Registers every
tool in `catalogTools` (core) verbatim. `get_screen` returns the thumbnail (or full image with
`full: true`) as MCP image content; `get_flow` with `includeImages: true` returns step thumbnails.
URLs in tool output are absolute.
