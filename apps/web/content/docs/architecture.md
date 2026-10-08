---
title: Architecture
description: How the monorepo is organized, how a request flows through the Worker, and how data, media, search, auth and capture fit together.
order: 10
section: Self-hosting
---

Screen Commons is a pnpm monorepo. One Cloudflare Worker serves everything on the web side; capture happens on clients (browser, extension, Node), never in the Worker.

## Monorepo

| Path               | What it is                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`         | TanStack Start app on Cloudflare Workers: UI, REST API, remote MCP, media and these docs.                                     |
| `apps/extension`   | WXT browser extension for Chrome, Edge and Firefox: capture, tray and MCP bridge client.                                      |
| `packages/core`    | The shared contract: zod schemas, taxonomy, API types, the typed API client, MCP tool specs, bridge protocol, pure utilities. |
| `packages/db`      | Drizzle schema and D1 migrations, including FTS5 search tables and triggers.                                                  |
| `packages/ui`      | Design tokens and React primitives shared by the web app and the extension.                                                   |
| `packages/capture` | Page capture and crawl engine: in-page extractors and a headless `playwright-core` driver.                                    |
| `packages/mcp`     | The `screen-commons-mcp` stdio server: catalog tools plus browser tools.                                                      |
| `packages/config`  | Shared TypeScript configuration.                                                                                              |
| `scripts/seed`     | Captures curated public sites and uploads them through the API.                                                               |
| `docs/spec.md`     | The build specification.                                                                                                      |

Tooling: Turborepo, TypeScript (strict), oxlint, oxfmt and Vitest.

## Request flow

```text
Browser · extension · script · MCP client
                    │
                    ▼
Cloudflare Worker  (apps/web/src/server.ts)
  │  counts the request body as it streams: 1 MiB, or 40 MiB for uploads
  │
  ├── /api/auth/*     Better Auth: sign up, sign in, GitHub OAuth
  ├── /api/v1/*       REST API (server routes) ┐
  ├── /mcp            remote MCP               ├─▶ principal: bearer key or session cookie
  ├── /_serverFn/*    UI server functions      ┘              │
  ├── /media/*        R2 images, visibility checked           ▼
  └── other routes    TanStack Start SSR pages      services: catalog, ingest,
                                                     collections, review
                                                              │
                                              ┌───────────────┴───────────────┐
                                              ▼                               ▼
                                         D1 (Drizzle)                  R2 bucket MEDIA
                                    tables + FTS5 indexes         content-addressed images
```

The REST API, the MCP tools and the UI's server functions call the same service functions, so visibility, limits and review rules are enforced once.

The UI calls server functions. Everything other clients call is a plain HTTP endpoint, written as a TanStack Start server route. The REST API has one route file per resource under `src/routes/api/v1/`. A shared request middleware on the `/api/v1` layout route answers CORS preflights, resolves the principal, maps errors to the JSON error envelope and marks responses `private, no-store`. CORS, authentication, error and body-limit helpers live in `src/server/http/` and don't depend on any framework, so `/mcp` and the Worker entry use the same ones.

## Data model

| Table                                        | Holds                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user`, `session`, `account`, `verification` | Better Auth tables. `user.role` is `admin` or `member`.                                                                                                |
| `app`                                        | Products: slug (unique per platform), name, website and host, platform, category, logo key, status.                                                    |
| `screen`                                     | One image each: image and thumbnail keys, dimensions, title, source URL, patterns, elements, tags, version, visible text, status, source, contributor. |
| `flow`, `flow_step`                          | Ordered screens of one app, with a label per step.                                                                                                     |
| `collection`, `collection_item`              | Users' saved screens, flows and apps. Triggers keep each item's `save_count` current.                                                                  |
| `api_key`                                    | Key name, 8-character prefix, SHA-256 hash, last used and revoked timestamps.                                                                          |
| `instance_bootstrap`                         | A single row claimed by the first user, who becomes admin.                                                                                             |
| `screen_fts`, `app_fts`, `flow_fts`          | FTS5 search indexes, maintained by triggers.                                                                                                           |

D1 has no interactive transactions, so multi-statement writes use `db.batch([...])`, which runs atomically.

## Visibility

Every app, screen and flow has a status: `published`, `pending` or `rejected`.

- **Lists, search and counts** show published items plus the viewer's own pending items.
- **Single items** (by id or slug) are visible if published, contributed by the viewer, or the viewer is an admin.
- **Flows** only include steps whose screens the viewer may see.
- **Writes.** Admin contributions publish; member contributions are pending. A flow publishes only when an admin creates it and all its screens are published.
- **App metadata** changes only for admins, or for the member who created a still-pending app.

## Storage and caching

Images are stored in R2 under content-addressed keys: `img/<sha256>.<ext>`, `thumb/<sha256>.<ext>` and `logo/<sha256>.<ext>`. The same bytes always map to the same key, so retries never duplicate objects and URLs never change meaning.

`/media/<key>` checks who may read a key with one indexed lookup:

- Referenced by published content: served to anyone with `Cache-Control: public, max-age=31536000, immutable`, an `ETag` and CORS `*`.
- Referenced only by pending or rejected content: served to the contributor and admins with `Cache-Control: private, no-store`.
- Otherwise: `404`.

API responses are `private, no-store`. Grids load thumbnails only; full images load in the viewer.

## Search

Search uses SQLite FTS5 in D1. Triggers on `app`, `screen` and `flow` keep the indexes in sync on every write path, including manual SQL.

- Screens are indexed by title, app name, patterns, elements, tags, source URL and visible text (sent by the client as `text`, from the DOM or OCR).
- Queries are tokenized, lowercased and accent-folded, and every term is a prefix match.
- All terms must match. If the viewer would see no results, terms are OR-ed instead.
- Taxonomy labels are matched separately, so `call to action` also finds screens tagged with the `cta` element.

## Auth

- **Better Auth** handles email and password accounts, plus GitHub OAuth when credentials are set. Sessions are cookies bound to `APP_URL`.
- **API keys** are `sc_` plus 32 random bytes, stored as SHA-256 hashes in Screen Commons's own `api_key` table. `last_used_at` updates at most once a minute per key.
- **Principal resolution.** A bearer key works from any origin. Session cookies only count for same-origin requests, so a third-party page can't act as a signed-in user.
- **Key management** requires a session; keys can't mint or revoke keys.
- **First admin.** A database trigger promotes the first user atomically by claiming the `instance_bootstrap` row, so two simultaneous sign-ups can't both become admin.

## Why the Worker doesn't process images

Workers have tight CPU and memory budgets, and image codecs are large. Instead, every client does the work it's already positioned to do:

| Client           | Makes thumbnails with |
| ---------------- | --------------------- |
| Website uploader | `<canvas>`            |
| Extension        | `OffscreenCanvas`     |
| Node (MCP, seed) | `sharp`               |

Each upload carries the full image and a 640 px WebP thumbnail (top-anchored crop, at most 16:10 for desktop and 9:19.5 for mobile). The server only reads file headers to check type, size and dimensions, hashes the bytes, and stores them. Byte budgets are checked before anything is decoded, and images are decoded and stored one at a time to stay within Worker memory.

## Capture: extension, bridge and MCP

```text
 AI agent (Claude Code, Cursor, …)
        │ stdio (MCP)
        ▼
 screen-commons-mcp  (packages/mcp, on your machine)
   ├── catalog tools ───── HTTPS + Bearer sc_… ─────▶ Screen Commons Worker  /api/v1/*
   │                                                    (capture_pages uploads via
   │                                                     POST /api/v1/captures)
   └── browser tools
         │ picks a driver
         ├── extension driver (preferred)
         │     ws://127.0.0.1:7457, pairing token
         │            ▼
         │     Screen Commons Capture extension (background worker)
         │            └─ drives a tab in your real browser:
         │               navigate · screenshot · extract · listTabs
         │
         └── headless driver (fallback)
               playwright-core + local Chrome/Chromium (CHROME_PATH)


 Screen Commons Capture extension, used by hand
   popup / shortcuts ─▶ capture ─▶ tray (local) ─▶ POST /api/v1/captures
                                                   with the extension's API key
```

The bridge protocol (`packages/core/src/bridge.ts`):

1. The extension connects to `ws://127.0.0.1:<port>` and sends `hello` with the pairing token.
2. The server answers `welcome`, or closes with code `4401` for a bad token. A second browser connecting replaces the first, which is closed with `4409`.
3. The server sends `request` messages (`navigate`, `screenshot`, `extract`, `listTabs`); the extension answers each with a `response` carrying the same `id`.
4. The extension pings every 20 seconds, which also keeps its Manifest V3 service worker alive. A 1-minute alarm reconnects after the worker is suspended.

The bridge binds to `127.0.0.1` only. Remote MCP at `/mcp` is a separate, stateless Streamable HTTP endpoint inside the Worker that exposes only the catalog tools.
