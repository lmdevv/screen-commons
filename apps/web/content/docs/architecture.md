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

| Table                                        | Holds                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`, `session`, `account`, `verification` | Better Auth tables. `user.role` is `admin` or `member`.                                                                                                                                                       |
| `app`                                        | Products: slug (unique per platform), name, website and host, platform, category, logo key, status.                                                                                                           |
| `screen`                                     | One image each: display image and thumbnail keys, dimensions, retained original key, display policy version, title, source URL, patterns, elements, tags, version, visible text, status, source, contributor. |
| `flow`, `flow_step`                          | Ordered screens of one app, with a label per step.                                                                                                                                                            |
| `collection`, `collection_item`              | Users' saved screens, flows and apps. Triggers keep each item's `save_count` current.                                                                                                                         |
| `api_key`                                    | Key name, 8-character prefix, SHA-256 hash, last used and revoked timestamps.                                                                                                                                 |
| `instance_bootstrap`                         | A single row claimed by the first user, who becomes admin.                                                                                                                                                    |
| `screen_fts`, `app_fts`, `flow_fts`          | FTS5 search indexes, maintained by triggers.                                                                                                                                                                  |

D1 has no interactive transactions, so multi-statement writes use `db.batch([...])`, which runs atomically.

## Visibility

Every app, screen and flow has a status: `published`, `pending` or `rejected`.

- **Lists, search and counts** show published items plus the viewer's own pending items.
- **Single items** (by id or slug) are visible if published, contributed by the viewer, or the viewer is an admin.
- **Flows** only include steps whose screens the viewer may see.
- **Writes.** Admin contributions publish; member contributions are pending. A flow publishes only when an admin creates it and all its screens are published.
- **App metadata** changes only for admins, or for the member who created a still-pending app.

## Storage and caching

Images are stored in R2 under content-addressed keys, so retries never duplicate objects and URLs never change meaning:

| Key                              | Holds                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `img/<sha256>.<ext>`             | A display image stored as uploaded (keyed by its own bytes).                               |
| `img/<sha256>.v1.webp`           | A display image the server derived from the source with that hash, under policy version 1. |
| `thumb/<sha256>.<ext>`           | A thumbnail stored as uploaded.                                                            |
| `thumb/<sha256>.v1-desktop.webp` | A thumbnail derived from the source with that hash (`-mobile` for iOS and Android apps).   |
| `orig/<sha256>.<ext>`            | The retained source of a derived display image. Never served.                              |
| `logo/<sha256>.<ext>`            | App logos.                                                                                 |

Derivative keys carry the policy version, so changing the policy produces new URLs instead of new bytes at an old URL, and a source is never derived twice under the same version.

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

## Display images

Viewers and grids only load display images: the full image and its thumbnail. One policy, `DISPLAY_POLICY` in `packages/core/src/image-policy.ts`, defines them for every intake path:

- **Full image.** WebP within 4096 × 16,383 px (aspect kept, never upscaled, alpha kept). Encoded at q0.9, then q0.8, then q0.7 while the result is over 4 MiB, and rejected if the final attempt is still over 15 MiB. Lossless WebP is also tried when the q0.9 result is at least 0.4× a PNG source, and kept when it is smaller.
- **Thumbnail.** At most 640 px wide WebP, never upscaled and never wider than the display image (a 750 × 20,000 page displays at 614 × 16,383, so its thumbnail is 614 px wide), drawn from the source and cropped from the top to at most 16:10 (desktop) or 9:19.5 (mobile). Encoded at q0.82, then q0.7, then q0.55 while over 256 KiB, and never over 1 MiB.
- **No needless lossy passes.** WebP that is already display-ready is stored as sent. A PNG or JPEG source is kept as the display image when it needs no resize and WebP wouldn't be smaller. Both images are derived from the source, never from each other.
- **Validated, never relabelled.** Every result, client or server side, is read back from its bytes: type, dimensions and completeness (RIFF length; PNG chunks up to `IEND`; a JPEG end-of-image marker after the scan; trailing bytes are tolerated). The server rejects truncated files, animated WebP (only its first frame would display), declared types the bytes don't have, and thumbnails that aren't a top crop of their image. A display image at the 16,383 px height limit also accepts a thumbnail up to 640 px wide, since it may have been scaled from a wider source. MCP `upload_screen` is the one exception to the declared-type check: models often mislabel what they send, so its image is typed by its bytes and a mismatch is only logged.

| Intake path                                        | Encodes with                         | Notes                                                                                    |
| -------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Website uploader                                   | `<canvas>` in a Web Worker           | `@screen-commons/core/canvas`.                                                           |
| Extension                                          | `OffscreenCanvas`                    | Same module. Very tall pages are captured at a lower scale to fit 16,383 px.             |
| Seed, local MCP (`upload_screen`, `capture_pages`) | `sharp`                              | `packages/capture/src/image.ts`.                                                         |
| Remote API and MCP, other clients                  | Cloudflare Images binding (`IMAGES`) | Server-side normalization of what a client couldn't encode, within the binding's limits. |

**Browsers without a WebP encoder** (Safari's canvas returns PNG when asked for WebP) are detected on a 1 × 1 canvas before any full-size canvas is allocated. They send the source untouched when the server accepts it, or else a PNG or JPEG of the display size, plus a JPEG thumbnail. The server then derives the WebP display image and thumbnail. Clients encode the display image and the thumbnail one after the other and free each canvas when done, because iOS caps a page's total canvas memory.

**Very tall pages.** The server accepts pages up to 20,000 px tall, but WebP stops at 16,383 px, and Chromium's canvas silently crops taller canvases instead of failing. Taller pages are scaled down to 16,383 px with the aspect kept, rather than tiled (which would need a tiled viewer) or kept as multi-megabyte PNGs. A 2880 × 20,000 capture becomes 2359 × 16,383 (0.82×), which keeps 2x text readable. The extension avoids even that resample by capturing such pages at a lower device scale. Every client scales on its side, because the server can't for PNG and JPEG over 12,000 px (see below).

**The Worker never runs codecs itself.** It only parses headers, hashes and stores. Server-side derivatives come from the Images binding, which is only ever sent sources within its documented input limits (`IMAGES_BINDING_LIMITS` in the policy): at most [12,000 px on either side for formats other than WebP and AVIF, 100 MP and 20 MB](https://developers.cloudflare.com/images/get-started/limits/). The [local binding](https://developers.cloudflare.com/images/transform-images/bindings/) is a low-fidelity offline version that supports only width, height, rotate and format, ignores quality and enforces none of these limits, so the server checks them itself.

- **Display image.** When it isn't display-ready, the server stores a WebP derivative and retains the source as `orig/<sha256>.<ext>`. Without a derivative the source is displayed as uploaded (it is within the upload limits).
- **Thumbnail.** A client's WebP thumbnail is used as sent; otherwise one is derived. A client JPEG or PNG thumbnail is only a fallback when derivation fails. The full image is never displayed as a thumbnail.

When there is no derivative, `screen.display_version` and `screen.display_exception` record why:

| Case                                                                   | Full image            | Upload without a usable thumbnail                           | `display_version` | `display_exception` |
| ---------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------- | ----------------- | ------------------- |
| Binding call failed (binding or network error, quota)                  | Displayed as uploaded | `503 unavailable` with `Retry-After: 60`                    | null (retried)    | null                |
| PNG or JPEG outside the binding's limits (pages taller than 12,000 px) | Displayed as uploaded | `422 unprocessable`: send a thumbnail, or the image as WebP | current           | `binding_limits`    |
| No `IMAGES` binding (self-hosted)                                      | Displayed as uploaded | `422 unprocessable`: send a thumbnail                       | current           | `no_binding`        |
| Unusable binding output (wrong type or size, over budget at q0.7)      | Displayed as uploaded | `422 unprocessable`: send a thumbnail                       | current           | `unconvertible`     |

Only the first case is retried by the backfill. The others are documented exceptions at the current version, so it doesn't loop on them; they are re-checked when the policy version changes, and `no_binding` screens also as soon as the instance has a binding. Uploads that always include a thumbnail (website, extension, seed, `POST /captures` and `POST /screens`) never get the 503 or 422; only MCP `upload_screen` sends none.

**Duplicates.** A re-upload is recognised by the hash of its source under any key it can be stored as (as uploaded, retained original, derivative), before anything is derived or sent to the binding, so it never fails or writes copies. Two different encodings of the same screenshot are different uploads, though: a PNG sent by one client and the WebP a browser made of it don't match. Recognising them would mean trusting a client-declared source hash, so that gap is accepted.

**Backfill.** `screen.display_version` records the policy version a screen's media was checked against. `pnpm media:backfill --url … --key sc_…` (admin key; `--dry-run` lists what it would do) pages through `POST /api/v1/admin/media/backfill`. For each screen whose version is missing or older, it re-resolves the media from the retained original (or the current image) exactly like a new upload, then updates the keys, size and version. Old objects are left in place: a replaced image becomes `original_key` and is no longer served. A screen that already has a derivative keeps it when a rerun makes none, so a retained original never becomes the display image. Because published media is cached as immutable, clients that cached an old URL keep their copy, while new page loads use the new keys. Bumping `DISPLAY_POLICY.version` and rerunning the command migrates everything to the new policy.

### Measurements

These targets were chosen from all 156 seed captures (2880 × 1800, DPR 2) plus tall pages up to 2880 × 20,000, encoded with libwebp (sharp) and Chromium's canvas encoder. Quality is luma SSIM against the lossless source, reported for the worst 128 × 128 tile, which is a proxy for small text.

| Setting                 | Light          | Dark            | Text-heavy      | Photo/gradient  |
| ----------------------- | -------------- | --------------- | --------------- | --------------- |
| PNG → WebP q0.9         | 106 KiB, 0.990 | 86 KiB, 0.989   | 200 KiB, 0.997  | 432 KiB, 0.949  |
| WebP q0.8               | 70 KiB, 0.988  | 67 KiB, 0.986   | 157 KiB, 0.992  | 235 KiB, 0.902  |
| WebP q0.7               | 59 KiB, 0.979  | 58 KiB, 0.976   | 136 KiB, 0.991  | 169 KiB, 0.876  |
| Thumbnail 640×400 q0.82 | 8.7 KiB, 0.991 | 10.2 KiB, 0.985 | 21.9 KiB, 0.992 | 25.3 KiB, 0.975 |

The values are medians per category (sharp; the canvas encoder is within 2% on bytes and SSIM). Across all 156 captures, q0.9 has a median of 138 KiB and a max of 717 KiB, 0.31× the PNG. Tall pages scaled to 16,383 px are 1.0 to 3.3 MiB at q0.9 (worst-tile SSIM ≥ 0.983). Text is indistinguishable from the source at q0.9 and q0.8 at 2× zoom. q0.7 visibly softens gradients and 1x dark text, which is why it is the last resort. Re-encoding a JPEG q92 as WebP q0.9 saves 29 to 58% and costs at most 0.026 worst-tile SSIM, so JPEG sources are converted when that is smaller.

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
