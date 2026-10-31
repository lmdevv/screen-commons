# Remote MCP

Agents connect to `/mcp` on an instance over Streamable HTTP with an API key, then search, read and contribute to the catalog as that key's owner.

## Sub-features

- `remote-auth` refuses a missing or wrong key, and keeps refusing a revoked one on an open connection.
- `remote-transport` answers `POST` only, requires the MCP `Accept` header, and caps request bodies at 40 MiB.
- `remote-contract` lists the 9 catalog tools with correct read-only hints.
- `remote-search` searches screens by text, filter and cursor, and flows by type.
- `remote-read` returns apps, screens with their image, and flows with step thumbnails.
- `remote-upload` uploads a screen and types its image by its bytes.
- `remote-flow` creates a flow from existing screens.
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
- **Handshake.** `h.remoteMcp()` connects. The server is named `screen-commons` with instructions mentioning `search_screens`. `listTools` returns exactly the 9 catalog tools, and only `upload_screen` and `create_flow` have `readOnlyHint: false`.
- **Search.** `search_screens` with `query: "billed yearly"` finds at least 3 screens with absolute `url` and `thumbUrl`. `pattern: "pricing"` returns only pricing screens. `limit: 2` returns a `nextCursor`, and the next page has 2 screens that don't overlap. `pattern: "not-a-pattern"` fails with `-32602`.
- **Read.** `list_apps` and `get_app` return the seed. `get_app` with a missing slug returns an error starting `not_found`. `get_screen` returns WebP image content, larger with `full: true`. `search_flows` with `type: "signing-up"` finds a flow, and `get_flow` with `includeImages: true` returns one WebP per step.
- **Upload.** `upload_screen` as the admin returns `published`. D1 has the row with `source = mcp`, and the media is served. A PNG labeled `image/webp` still uploads, and its stored original ends in `.png`. Bytes that aren't an image fail with `unsupported_media_type`.
- **Flow.** `create_flow` from two uploads returns `published`, and `/flows/<id>` shows it in the web app. A one-step flow fails with `-32602`.
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
