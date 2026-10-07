# Open UI — build specification

Open UI is an open-source, self-hostable UI reference library in the spirit of Mobbin: a curated
catalog of real product **screens** and ordered **flows**, grouped by **app**, searchable by
**screen pattern** (Login, Pricing, Dashboard…), **UI element** (Modal, Table, Tabs…) and **flow
type** (Onboarding, Checkout…). Content gets in through the website uploader, a WXT browser
extension, and an MCP server that lets AI agents crawl, capture and upload pages — and lets agents
browse the catalog for inspiration.

This file is the shared contract for everyone working on the codebase. `packages/core` is the
machine-readable half of it (schemas, taxonomy, API types and client).

## Monorepo

```
apps/
  web/         TanStack Start on Cloudflare Workers: UI, REST API, remote MCP, media, docs
  extension/   WXT browser extension (Chrome, Edge, Firefox): capture, tray, MCP bridge client
packages/
  core/        zod schemas, taxonomy, API types, typed API client, shared pure utils
  db/          Drizzle schema + D1 migrations
  ui/          design tokens + React primitives shared by web and extension
  capture/     page capture/crawl engine (in-page extractors + headless playwright-core driver)
  mcp/         `open-ui-mcp` stdio MCP server: catalog tools + browser tools (extension bridge or headless)
  config/      shared tsconfig
scripts/       seed + e2e helpers
docs/          this spec + architecture notes (user docs live in apps/web/content/docs)
```

Tooling: pnpm 11 workspaces + catalog, Turborepo, TypeScript (strict), oxlint, oxfmt, Vitest,
Playwright (`playwright-core` against the system Chromium at `/run/current-system/sw/bin/chromium`
or `CHROME_PATH`).

## Runtime (apps/web)

- TanStack Start + React 19 + TanStack Query/Router, Tailwind v4.
- Cloudflare Workers via `@cloudflare/vite-plugin`: `vite dev` runs inside workerd with **local**
  D1 and R2 emulation — no Cloudflare account required to develop. Production deploy with
  `wrangler deploy`.
- D1 (SQLite) through Drizzle; FTS5 virtual table for search.
- R2 bucket `MEDIA` holds images under immutable, content-addressed keys; served by `/media/$key`
  with `Cache-Control: public, max-age=31536000, immutable`.
- Better Auth (email + password; GitHub OAuth when env present), Drizzle adapter on D1.
- API keys (`oui_` prefix, SHA-256 hashed at rest) authenticate the extension, MCP and scripts.
- **Roles**: `admin` | `member`. The first account created on an instance becomes `admin`.
  Members' contributions land as `pending`; admins' contributions publish immediately. Admins
  approve/reject from `/review`.
- **No image processing in the Worker.** Every client (web uploader via canvas, extension via
  OffscreenCanvas, Node clients via sharp) sends the full image **and** a thumbnail
  (WebP, 640px wide, top-anchored crop to max 16:10 for desktop, 9:19.5 for mobile; full image kept
  intact), plus width/height. The server validates type, size and dimensions from the file headers.

## Domain model

- **app** — a product. `slug`, `name`, `tagline`, `description`, `websiteUrl`, `platform`
  (`web` | `ios` | `android`), `category` (taxonomy), `logoKey`, `accentColor`, `status`.
- **screen** — one image of an app. `appId`, `imageKey`, `thumbKey`, `width`, `height`, `bytes`,
  `title`, `sourceUrl`, `patterns[]`, `elements[]`, `tags[]`, `version` (free label, default
  capture month like `Oct 2026`), `dominantColor`, `status`, `source`
  (`upload` | `extension` | `mcp` | `seed`), `contributorId`, `capturedAt`.
- **flow** — ordered screens of one app. `name`, `type` (flow taxonomy), `description`, `status`,
  `steps[]` = `{ screenId, position, label }`.
- **collection** — a user's saved items (screens, flows, apps). Every user has a default "Saved".
- **apiKey** — `name`, `prefix` (first 8 chars, shown in UI), `hash`, `lastUsedAt`, `revokedAt`.

Statuses: `published` | `pending` | `rejected`. Only `published` content is visible in the library
and API (except to its contributor and admins).

## Website

Public: `/` landing, `/docs/*`, `/sign-in`, `/sign-up`. Everything in the library requires sign-in
(logged-out visitors are redirected to `/sign-in?redirect=…`). Signed-in visitors hitting `/` go to
`/browse/web`.

| Route                | Purpose                                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/browse/$platform`  | Discover. Tabs **Apps · Screens · UI Elements · Flows**, category/pattern chips, sort Latest / Popular. Infinite scroll.                                                                                                                                   |
| `/apps/$slug`        | App header (logo, name, tagline, platform, category, site) + tabs Screens / UI Elements / Flows, version filter.                                                                                                                                           |
| `?screen=$id`        | Screen viewer overlay on any grid: large image (scrollable when tall), ←/→ to navigate, details panel (app, patterns, elements, source URL, size, captured), Save, Download, Copy image, Esc closes. Deep-linkable; `/screens/$id` is the standalone page. |
| `?flow=$id`          | Flow viewer overlay: ordered horizontal strip with step labels. `/flows/$id` standalone.                                                                                                                                                                   |
| `/search?q=`         | Results grouped: apps, screens, flows. ⌘K opens the command palette from anywhere.                                                                                                                                                                         |
| `/saved`             | Collections.                                                                                                                                                                                                                                               |
| `/contribute`        | Upload: drop images → pick/create app → tag patterns → optionally order into a flow (drag to reorder, step labels) → submit.                                                                                                                               |
| `/review`            | Admin queue for pending screens/flows.                                                                                                                                                                                                                     |
| `/settings`          | Profile, API keys (create/revoke, copy once), extension + MCP setup snippets.                                                                                                                                                                              |
| `/extension/connect` | Signed-in page that mints a key named "Browser extension" and hands it to the extension (`window.postMessage({ type: "open-ui:connect", token, baseUrl })`, picked up by the extension content script).                                                    |
| `/docs/*`            | Introduction, Quickstart, Browsing, Contributing, Browser extension, MCP (local + remote), REST API, Self-hosting, Architecture. Markdown files in `apps/web/content/docs`.                                                                                |

## Design direction

Minimal, quiet, fast — the content is the screenshots. Mobbin-like structure, our own identity.

- Light: white background, `#0a0a0a` text, neutral greys; screenshot cards sit on a `#f4f4f5`
  rounded-2xl tile with generous inner padding. Dark mode mirrors it (near-black `#0b0b0c`, tiles
  `#161618`).
- Type: Inter (variable) or Geist; 13–14px UI text, tight headings, tabular numbers. No gradients,
  no glows, no emoji, no decorative illustrations.
- Black pill primary buttons, ghost secondary, pill chips for filters, hairline borders.
- Top bar: logo · platform switch (Web / iOS / Android) · centered search pill (⌘K) · saved ·
  contribute · avatar menu. No sidebar in the library.
- Motion: 120–180ms opacity/transform only. Respect `prefers-reduced-motion`.
- Perf budget: SSR first paint, thumbnails only in grids (lazy, explicit width/height, no CLS),
  route-level code splitting, < 120 KB JS gzip for the browse route.

## REST API (`/api/v1`)

Auth: session cookie **or** `Authorization: Bearer oui_…`. JSON errors:
`{ "error": { "code": string, "message": string } }`. Lists are cursor paginated:
`{ items: T[], nextCursor: string | null }`. Exact request/response shapes live in
`packages/core/src/api.ts`.

| Method               | Path                       | Notes                                                                                                               |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET                  | `/api/v1/me`               | current user                                                                                                        |
| GET                  | `/api/v1/taxonomy`         | categories, patterns, elements, flow types                                                                          |
| GET                  | `/api/v1/apps`             | `platform, category, q, sort, cursor, limit`                                                                        |
| GET                  | `/api/v1/apps/$slug`       | app + counts + flows summary                                                                                        |
| GET                  | `/api/v1/screens`          | `app, platform, pattern, element, q, sort, cursor, limit`                                                           |
| GET                  | `/api/v1/screens/$id`      | screen + app + neighbors                                                                                            |
| GET                  | `/api/v1/flows`            | `app, platform, type, q, cursor, limit`                                                                             |
| GET                  | `/api/v1/flows/$id`        | flow + steps (with screens)                                                                                         |
| GET                  | `/api/v1/search`           | `q, platform` → grouped apps/screens/flows                                                                          |
| POST                 | `/api/v1/screens`          | multipart: `image`, `thumbnail`, `meta` (JSON, `CreateScreenInput`)                                                 |
| POST                 | `/api/v1/captures`         | JSON batch (`CaptureBatchInput`, base64 images) → app upsert + screens + optional flow. Used by extension/MCP/seed. |
| POST                 | `/api/v1/flows`            | `CreateFlowInput` from existing screen ids                                                                          |
| GET                  | `/api/v1/collections`      | your collections (a default "Saved" always exists)                                                                  |
| POST                 | `/api/v1/collections`      | `{ name }` → create                                                                                                 |
| GET / PATCH / DELETE | `/api/v1/collections/$id`  | items (screens, flows, apps) · rename · delete (not the default)                                                    |
| POST / DELETE        | `/api/v1/saves`            | `{ kind: "screen" \| "flow" \| "app", id, collectionId? }` save / unsave (DELETE uses query params)                 |
| GET / POST           | `/api/v1/keys`             | session-only: list / create (`{ name }`, token returned once)                                                       |
| DELETE               | `/api/v1/keys/$id`         | session-only: revoke                                                                                                |
| GET                  | `/api/v1/review`           | admin: pending screens and flows                                                                                    |
| POST                 | `/api/v1/review/$kind/$id` | admin: `{ decision: "approve" \| "reject" }`                                                                        |

`/media/$key` serves R2 objects. `/mcp` is the remote MCP endpoint (Streamable HTTP, stateless,
bearer API key).

## MCP

Two servers share tool names and schemas (defined in `packages/core/src/mcp.ts`):

**Remote** (`https://<host>/mcp`): catalog only — `search_screens`, `search_flows`, `list_apps`,
`get_app`, `get_screen` (returns the image as MCP image content), `get_flow`, `get_taxonomy`,
`upload_screen`, `create_flow`.

**Local** (`npx open-ui-mcp`, stdio): the same catalog tools proxied to the API using
`OPEN_UI_URL` + `OPEN_UI_API_KEY`, plus browser tools:

- `browser_status` — which driver is active (`extension` when the extension is connected to the
  bridge on `ws://127.0.0.1:7457`, otherwise `headless` using playwright-core + system Chromium).
- `browser_navigate { url }`, `browser_screenshot { fullPage?, selector? }` (returns image),
  `browser_extract {}` (title, description, favicon, og image, theme color, same-origin links).
- `site_crawl { url, maxPages, maxDepth, include?, exclude? }` → discovered pages with suggested
  patterns.
- `capture_pages { urls[], app: { name?, websiteUrl, platform }, flow?: { name, type },
viewport?: "desktop" | "mobile", fullPage?, upload: boolean }` → captures each page, auto-tags
  patterns from URL/title, and (when `upload`) posts a `CaptureBatchInput` to `/api/v1/captures`.

Bridge protocol: JSON messages over WebSocket, `{ id, type: "request", method, params }` →
`{ id, type: "response", result | error }`; the extension authenticates with a pairing token
shown by the MCP server (`OPEN_UI_BRIDGE_TOKEN`, default printed on start and saved to
`~/.config/open-ui/bridge-token`). Methods: `hello`, `navigate`, `screenshot`, `extract`,
`listTabs`. Defined in `packages/core/src/bridge.ts`.

## Browser extension (apps/extension, WXT + React)

- Popup: account state (connected as …, server URL), MCP bridge state, actions **Capture visible**,
  **Capture full page**, **Capture element** (hover-pick), **Record flow** toggle (each capture
  appends to the tray in order). Shows tray count, opens the tray.
- Tray page (extension page): captured shots with thumbnails, editable app (prefilled from page
  title/domain), per-shot pattern tags + title, drag reorder, "save as flow" with name/type,
  upload with progress → links to the result on the website.
- Background: full-page capture via `chrome.debugger` + CDP `Page.captureScreenshot`
  (`captureBeyondViewport`), fallback scroll-and-stitch with `tabs.captureVisibleTab` (Firefox);
  thumbnail generation via OffscreenCanvas; WebSocket client to the MCP bridge with backoff
  reconnect + keepalive; content script on the Open UI origin to receive connect tokens.
- Options: server URL, API key (manual), bridge port + pairing token.

## Seed + tests

- `pnpm seed` captures a curated list of public marketing sites (home, pricing, sign in, sign up,
  docs, blog, changelog, about) at 1440×900 with the headless driver (playwright-core), tags them, builds flows, and
  uploads through `/api/v1/captures` with an admin API key — the real pipeline, end to end.
  Screenshots are generated locally and never committed.
- Unit tests (Vitest) for core, db queries, capture heuristics, MCP tools.
- E2E (Playwright): sign up → browse → open screen viewer → save → contribute a 3-screen flow →
  review/approve → create API key → call `/mcp` → extension build loads in Chromium and captures a
  page through the bridge.

## Pinned decisions (verified by research spikes, Oct 2026)

- Versions known to work together: `@tanstack/react-start` 1.168.x, `@tanstack/react-router`
  1.170.x, React 19.3, Vite 8.3, `@vitejs/plugin-react` 6.1, `@cloudflare/vite-plugin` 1.63,
  `wrangler` 4.148, `drizzle-orm` 0.45 / `drizzle-kit` 0.31, `better-auth` 1.7 (+
  `@better-auth/drizzle-adapter`), `@modelcontextprotocol/sdk` 1.32 (v1 line, used by both MCP
  servers), zod 4, Tailwind 4.3, WXT 0.21 (+ `@wxt-dev/module-react`), `playwright-core` 1.63.
- Dev server: `http://localhost:5173` (always `localhost`, never `127.0.0.1`, so auth cookies match).
- API keys use our own `api_key` table (not the Better Auth plugin, whose default rate limit is
  10 requests/day).
- D1 has no interactive transactions: use `db.batch([...])` for multi-statement writes.
- Extension capture: Chromium uses `chrome.debugger` + CDP with an explicit full-document clip;
  Firefox uses `browser.tabs.captureTab(tabId, { rect, scale })` (needs `<all_urls>`); both run a
  bounded lazy-load scroll pass first. Fallback: `captureVisibleTab` stitching at ≤2 calls/s.
- Bridge keepalive: 20s app-level ping + a 1-minute `alarms` reconnect. Server binds 127.0.0.1 only.
- All MCP stdio diagnostics go to stderr.
