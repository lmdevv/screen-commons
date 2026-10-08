# apps/web server layer

Everything server-side for the Screen Commons web app. Runs inside the Cloudflare Worker (workerd in
dev via `@cloudflare/vite-plugin`).

```
src/server/
  env.ts           cloudflare:workers env, getDb() (Drizzle over D1), getMedia() (R2), appOrigin()
  display.ts       display image + thumbnail derivatives via the Images binding (display policy)
  auth.ts          Better Auth (email+password, GitHub when env set; first user → admin via DB trigger)
  keys.ts          API keys: sc_ + 32 random bytes, SHA-256 at rest, throttled last_used_at
  principal.ts     getPrincipal(request): bearer key OR session cookie (same-origin only)
  errors.ts        ServiceError(code, message) + zod → bad_request mapping
  ids.ts           time-ordered ids, sha256Hex, base64url
  services/        plain async functions returning exact @screen-commons/core API shapes
    catalog.ts     listApps, getApp, listScreens, getScreen, listFlows, getFlow, search, getTaxonomy
    ingest.ts      captures, createScreen, createFlow, uploadScreenFromTool (MCP)
    collections.ts listCollections, getCollection, create/rename/deleteCollection, save, unsave
    review.ts      reviewQueue, review
    media.ts       content-addressed storage, resolveScreenMedia (display policy), backfillDisplay
    shared.ts      visibility rules, cursor pagination, row → API mapping
  http/            framework-independent HTTP helpers + the transports built on them
    cors.ts        preflight headers/response, isCrossOrigin
    auth.ts        requestPrincipal (cookies same-origin only), requireUser
    responses.ts   errorResponse ({ error: { code, message } } envelope), noContent
    limits.ts      streamed request-body limits (also applied for every route in src/server.ts)
    body.ts        readJson / readForm, bounded by the path's body limit
    api.ts         REST middleware (src/routes/api/v1/route.ts) + noSuchEndpoint, query helpers
    media.ts       /media/<key> R2 streaming with visibility checks (src/routes/media/$.ts)
    mcp.ts         remote MCP at /mcp (src/routes/mcp.ts)
  functions.ts     TanStack Start server functions for the UI (below)
```

## Rules the services enforce

- **Visibility.** Detail reads (`getScreen`, `getFlow`, `getApp`): `published`, or contributed by
  the viewer, or viewer is admin. List reads/search/counts: `published` plus the viewer's own
  `pending` items. Admins see other people's pending items via `getReviewQueue`.
- **Flows only show visible screens.** Steps, `stepCount` and previews include only screens the
  viewer may see (same rule as `getScreen`).
- **Status on write.** Admin contributions → `published`; member contributions → `pending`. A
  flow is `published` only when an admin creates it **and** every step's screen is published;
  otherwise it is `pending` (approving it publishes its pending screens).
- **Review.** Approving a screen/flow publishes its app (and bumps the app's `updatedAt`).
  Rejecting a screen removes it from every flow (steps renumbered); a published flow left with
  fewer than 2 steps goes back to `pending`.
- **App metadata is moderated.** Uploads to an existing app only fill tagline / description /
  category / website / logo when the uploader is an admin or the app is the uploader's own
  pending app. Member uploads to a published app attach screens and never touch the app row.
- **Upload limits** (all transports: REST, server functions, MCP). Request bodies are counted as
  they stream (Content-Length isn't trusted): `LIMITS.maxRequestBytes` (40 MiB) for upload
  endpoints (`/api/v1/captures`, `/api/v1/screens`, `/mcp`, `/_serverFn/*`), 1 MiB elsewhere.
  Before decoding anything, each image is bounded by its kind (`maxImageBytes`,
  `maxThumbnailBytes`, 512 KiB logos) and the batch by `LIMITS.maxBatchBytes` (28 MiB decoded) —
  split larger batches. Images are then decoded, validated and stored one at a time.
- **Pagination.** `{ items, nextCursor }`; pass `nextCursor` back as `cursor`. Cursors are opaque
  and tied to the sort (`latest` | `popular`). Popular = `save_count * 4 + view_count` (apps also
  add their published screens' scores).
- **Search.** FTS5 with prefix matching; all terms must match (AND). When the viewer has no AND
  results under the same filters and visibility, terms are OR-ed instead.
- **Media.** Entity media URLs (`imageUrl` / `thumbUrl` / `logoUrl` on apps, screens, flows,
  collections — REST, server functions) are always relative `/media/<kind>/<sha256>[.v<n>[-kind]].<ext>` paths.
  The one exception is the `POST /api/v1/captures` response (`submitCaptures`), where every URL
  (`screens[].url`, `flow.url`, `app.logoUrl`) is absolute, as are URLs in MCP tool output.
  Keys referenced by published content are public + immutable; keys only referenced by
  pending/rejected content are served to the contributor or admins with
  `Cache-Control: private, no-store`, 404 to everyone else. Previews use the thumbnail's own
  `width`/`height`.
- **Views/saves.** `getScreen`, `getFlow`, `getApp` increment `view_count`. `save_count` is
  maintained by database triggers on `collection_item` (cascades included). `saved` on
  screens/flows means "in any of my collections".
- **Display images** (`services/media.ts`, `display.ts`; policy in `@screen-commons/core`
  `image-policy.ts`, documented in `content/docs/architecture.md#display-images`). Uploads are
  typed from their complete bytes; declared types that don't match, truncated files and
  thumbnails that aren't a top crop of their image are rejected. Display-ready WebP is stored as
  sent; anything else gets a WebP derivative from the Images binding (`IMAGES`) under
  `img/<sha>.v<policy>.webp`, with the source kept as `orig/<sha>.<ext>` (never served), unless
  WebP isn't smaller. Client WebP thumbnails are stored as sent; otherwise the server derives
  `thumb/<sha>.v<policy>-desktop|mobile.webp` (≤640px, top crop to 16:10 or 9:19.5). Binding
  failures: the full image is displayed as uploaded with `display_version` null (the backfill
  retries); a thumbnail falls back to a client PNG/JPEG one, else `503 unavailable` — never the
  full image. `POST /api/v1/admin/media/backfill` (`pnpm media:backfill`) re-resolves screens
  below the current policy version.
- **App slugs are globally unique** (routes are `/apps/$slug`). A new app whose slug is taken on
  any platform gets a platform suffix (`linear-ios`, then `linear-ios-2`). Upserts always match the
  requested platform, by `slug` or `slug-<platform>`, then website host, then name.
- **First admin.** The first account ever created is promoted by the `user_bootstrap_admin`
  trigger, which atomically claims the singleton `instance_bootstrap` row; the sign-up response
  re-reads the role so it already says `admin`.
- **Auth secret.** `BETTER_AUTH_SECRET` is required unless `APP_URL` is localhost/127.0.0.1 (then
  a public dev secret is used). Local dev sets `APP_URL` in `.dev.vars`, which overrides
  `wrangler.jsonc` vars.

## Server functions (`src/server/functions.ts`)

Call them as `fn({ data })` (or `fn()` when there's no input). All require a signed-in session
except `getCurrentUser` / `getAuthOptions`. Errors: not signed in → throws a router `redirect` to
`/sign-in`; missing or hidden item → throws `notFound()`; anything else → `Error(message)`.
Types come from `@screen-commons/core`. Query option factories for all reads live in
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

Matches `packages/core/src/client.ts` exactly (use `createScreenCommonsClient`). Auth: session cookie
(same-origin only) or `Authorization: Bearer sc_…` (any origin, `Access-Control-Allow-Origin: *`,
never credentials). `/taxonomy` is public. Extra aliases from the spec:
`POST/DELETE /collections/:id/items`, `GET /apps/:slug?platform=`. Errors are
`{ error: { code, message } }` with HTTP status per code.

Each resource is a TanStack Start server route in `src/routes/api/v1/` (`apps.ts`,
`apps.$slug.ts`, `collections.$id.items.ts`, …). The `route.ts` layout attaches `apiMiddleware`
to all of them, and handlers read `context.principal`. Every route also sets `caseSensitive: true`
and an `ANY: noSuchEndpoint` handler. Unsupported methods, unknown paths (`$.ts`) and
trailing-slash or wrong-case variants therefore all get the same JSON `404 not_found` ("No such
endpoint"). `OPTIONS` on any `/api/v1` path is a `204` preflight. `HEAD` runs the `GET` handler
without a body. Params arrive `decodeURIComponent`-ed (`%2F` included) and encoded static segments
still match, as with the old Hono router; Start answers malformed escapes (`%E0`) with an empty
`400` before routing. `tests/routes.test.ts` enumerates the route table. When adding an endpoint, add a
route file and a row there.

## MCP (`/mcp`)

Stateless Streamable HTTP (JSON responses), bearer API key required, `POST` only. Registers every
tool in `catalogTools` (core) verbatim. `get_screen` returns the thumbnail (or full image with
`full: true`) as MCP image content; `get_flow` with `includeImages: true` returns step thumbnails.
URLs in tool output are absolute.
