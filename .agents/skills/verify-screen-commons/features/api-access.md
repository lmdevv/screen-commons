# API access

Users create API keys in Settings and use them to call the REST API and the remote MCP server as themselves. Revoking a key cuts off both at once.

## Sub-features

- `keys-create` creates a named key and shows its token once.
- `keys-list` lists the key in Settings.
- `keys-rest` authenticates `GET /api/v1/me` with the key.
- `keys-scope` refuses key management with a key.
- `keys-mcp` lists and calls tools on `/mcp` with the key.
- `keys-revoke` revokes the key, after which REST and MCP return 401.

## How to get to it (user POV)

- Open `/settings` and choose link `API keys` (driven).
- Open `/settings?tab=keys` directly, or use the palette's settings commands (not scripted).
- Call `/api/v1/*` and `/mcp` with `Authorization: Bearer sc_…` (driven).
- Connect an MCP client with the key (driven in [Remote MCP](./mcp-remote.md) and [Local MCP](./mcp-local.md), with the SDK's client; a real agent such as Claude Code is not scripted).
- Use the typed client from `@screen-commons/core` (driven only by the seed at launch, through `pnpm seed upload`).
- Connect the browser extension from Settings (not scripted).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- The journey signs in as the seed admin and names its key `Verify key <stamp>`.

Run `control drive api-access --run <id>`, which performs these steps.

- **Open.** Sign in with redirect `/settings` and choose link `API keys`. The URL gains `tab=keys`.
- **Create.** Choose button `Create key`, fill `Name`, and choose `Create key` in the dialog. The `code` inside test id `new-token` matches `^sc_[A-Za-z0-9_-]+$`. Choose `Done`, and a row with the name appears. D1's `api_key` row has a null `revoked_at`, its `hash` is the token's SHA-256, and no column holds the token.
- **REST.** `h.api("me", { token })` returns 200 with the admin's email.
- **Scope.** `h.api("keys", { token })` returns 401 or 403.
- **MCP.** With `h.remoteMcp(token)`, `listTools` includes `search_screens` and `upload_screen`, and `search_screens` for `pricing` returns no error and at least one screen.
- **Revoke.** Choose button `Revoke <name>`, then `Revoke key` in the dialog. `Key revoked` appears and the row is gone.
- **Refused.** REST and raw MCP both return 401 with that token, the already-open client fails too, and D1's row has a `revoked_at`.
- **Proof.** Read `test-results/verify/<run>/api-access-*/result.json` and the JSON files for each status.

## Gotchas

- The token appears in this run's evidence. It belongs to a disposable instance and the journey revokes it, but don't copy evidence from a run against anything else.
- MCP needs `accept: application/json, text/event-stream`, or it refuses the call. The client and `h.mcp` both set it.
- While the revoke dialog is open the page is inert, so the row reads as gone before the revoke lands. Wait for `Key revoked` first.
- Keys act as their owner, so a member's key uploads to the review queue. This journey only covers an admin's key.
