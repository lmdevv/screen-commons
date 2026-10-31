# Remote MCP

Agents connect to `/mcp` on an instance over Streamable HTTP with an API key, then search, read and contribute to the catalog as that key's owner.

## Sub-features

- `remote-auth` refuses a missing or wrong key, and keeps refusing a revoked one on an open connection.
- `remote-transport` answers `POST` only, requires the MCP `Accept` header, and caps request bodies at 40 MiB.
- `remote-contract` lists the 13 catalog tools with correct read-only and open-world hints.
- `remote-search` searches screens by text, filter and cursor, and flows by type.
- `remote-read` returns apps, screens with their image, and flows with step thumbnails.
- `remote-upload` uploads a screen and types its image by its bytes.
- `remote-upload-url` uploads an image by URL with the same checks, and serves it exactly as sent.
- `remote-flow` creates a flow from existing screens, safely repeated with a chosen id, and can repeat a screen.
- `remote-manage` edits and deletes screens and flows, only as their contributor.
- `remote-roles` keeps a member's upload pending and hidden until an admin approves it.
- `remote-errors` returns failures as tool errors an agent can read.

## How to get to it (user POV)

- Connect an MCP client to `http://localhost:<port>/mcp` with `Authorization: Bearer sc_…` (driven, with the SDK's Streamable HTTP client).
- Send JSON-RPC directly, as in the docs' `curl` test (driven, for status codes).
- Configure Claude Code or Cursor as `docs/mcp` describes (not scripted; `control mcp-config --client <agent>` prints a working config for manual use, for Claude Code, Cursor, Codex or OpenCode).
- Send an oversized body with no `Content-Length` (not scripted: the cap returned 413 when tried by hand, but the aborted stream broke the next request through the Vite dev proxy and left an error overlay on open pages).
- Reach the server through `mcp-remote` for stdio-only clients (not scripted; it downloads from npm).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy, including `remote MCP lists its tools`.
- The journey uses the seed admin's key and creates two members with their own keys.

Run `control drive mcp-remote --run <id>`, which performs these steps.

- **Refusals.** Raw `POST /mcp` returns 401 with `WWW-Authenticate: Bearer` for no key and 401 for a wrong key, 406 without `text/event-stream` in `Accept`, and 413 for a 41 MiB body. `GET` returns 405.
- **Handshake.** `h.remoteMcp()` connects. The server is named `screen-commons` with instructions mentioning `search_screens`. `listTools` returns exactly the 13 catalog tools. Only `upload_screen`, `update_screen`, `delete_screen`, `create_flow`, `update_flow` and `delete_flow` have `readOnlyHint: false`, and only `upload_screen` has `openWorldHint: true`.
- **Search.** `search_screens` with `query: "billed yearly"` finds at least 3 screens with absolute `url` and `thumbUrl`. `pattern: "pricing"` returns only pricing screens. `limit: 2` returns a `nextCursor`, and the next page has 2 screens that don't overlap. `pattern: "not-a-pattern"` fails with `-32602`.
- **Read.** `list_apps` and `get_app` return the seed. `get_app` with a missing slug returns an error starting `not_found`. `get_screen` returns WebP image content, larger with `full: true`. `search_flows` with `type: "signing-up"` finds a flow, and `get_flow` with `includeImages: true` returns one WebP per step.
- **Upload.** `upload_screen` as the admin returns `published`. D1 has the row with `source = mcp`, and the media is served. A PNG labeled `image/webp` still uploads, and its stored original ends in `.png`. Bytes that aren't an image fail with `unsupported_media_type`.
- **Flow.** `create_flow` from two uploads returns `published`, and `/flows/<id>` shows it in the web app. A one-step flow fails with `-32602`.
- **Upload by URL.** A 1920×1320 WebP on `h.imageHost` uploads through a redirect as `published`, with its `id`, `url` and no `note`. Uploading it again by URL or as base64 returns the same screen. `get_screen` with `full: true` and the full image URL both return the exact bytes, and D1 has 1920×1320 and no `source_url`. A 404, a page, a declared or actual body over the limit, a redirect loop, a redirect to another scheme, a body that never ends (after 20 seconds) and an `ftp:` URL each fail with their own code. `image.path` fails with `-32602`, and the error says it needs the local server or the CLI, and names `{ url }` and base64.
- **Retry and repeats.** `create_flow` with an `id` and `description`, called twice, returns the same flow and leaves one row. An id that isn't a UUID fails with `-32602`. A flow with steps A, B, A, C keeps all 4 in order, `get_screen` lists it once, its page has no console errors, shows 4 steps in order, the arrow keys walk all of them, and step 3 reads `3 of 4` and `Step 3`.
- **Manage.** A member edits their pending screen (still `pending`, omitted fields stay, `title: null` clears), and renames and reorders their flow. A bad pattern and a one-step flow fail with `-32602`, and a missing step screen with `bad_request`. Another member gets `not_found: Screen not found` or `not_found: Flow not found` for pending rows and `forbidden` for published ones, and an admin gets `forbidden` for others' rows. Reusing another's flow id fails with `bad_request`. `delete_screen` closes the gap in the flow's steps, and deleting twice is `not_found`. `delete_flow` removes its rows and keeps its screens.
- **Roles.** A member's `upload_screen` returns `pending`, and they can read it with `get_screen`. Their `search_screens` finds it. Another member's `get_screen` returns `not_found`, and their same search skips it. The admin approves it in `/review` with `a`, and then the other member can read it as `published` and find it in search.
- **Revoke.** Deleting the member's key makes the next call on their already-open client fail with a 401.
- **Proof.** Read `test-results/verify/<run>/mcp-remote-*/result.json`, the JSON for each tool, and the saved `.webp` images.

## Gotchas

- Results are JSON text, identical to the local server's; [Local MCP](./mcp-local.md) compares them.
- The remote server has tools only. `listPrompts` and `listResources` return `Method not found`, and its capabilities don't advertise them.
- After an approval the review pane moves to the next item, which may be another journey's. Prove the approval with the toast and a `get_screen`, not that screenshot.
- The server is stateless, so "open connection" means the client object: each call authenticates again.
- The SDK client throws on some refusals rather than returning `isError`. `h.call` turns both into `isError: true`.
- Uploads with the same website domain join the same app, so give each test app a unique `websiteUrl`.
- A local `APP_URL` allows `http` and local hosts, which `h.imageHost` needs, so the journeys can't reach the production URL policy. Unit tests cover it in `packages/core/src/image-download.test.ts`. To see it live, restart a disposable run with a public `APP_URL` in its `.dev.vars`.
- A public `https` URL from the remote server needs workerd to trust its chain. See the gotcha in [SKILL.md](../SKILL.md#gotchas) if it fails with `Could not connect`.
