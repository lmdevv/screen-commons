---
title: CLI
description: Move whole multi-screen flows into Screen Commons and manage them from scripts and agents, with a repeatable manifest.
order: 6.5
section: Integrations
---

`screen-commons` is the command-line client for agents and scripts. It reads and manages the catalog, uploads images, and publishes a manifest: one file describing a whole multi-screen transfer. It never prompts.

It ships in the `screen-commons-mcp` package, so no second install is needed. Node.js 20.9 or newer is required.

```bash
export SCREEN_COMMONS_URL=https://your-instance.example.com
export SCREEN_COMMONS_API_KEY=sc_…
npx -p screen-commons-mcp screen-commons whoami
```

[Create a key](/docs/api-keys) in **Settings → API keys**. It acts as you: admins publish directly, and members' contributions wait for review.

The flags `--url` and `--api-key` override those variables. Prefer the variable for the key, because other processes can read flags. The key never appears in output.

## Commands

```text
screen-commons whoami
screen-commons taxonomy
screen-commons apps list|get
screen-commons screens search|get|update|delete|download
screen-commons flows search|get|create|update|delete
screen-commons upload <file|url>
screen-commons manifest validate|publish <path>
```

Every level has `--help`, which lists a command's flags. Lists page with `--limit` and `--cursor`, taking `nextCursor` from the previous page. `taxonomy` and `manifest validate` need no key.

```bash
screen-commons screens search "pricing table" --pattern pricing --limit 12
screen-commons screens download <id> --out pricing.webp
screen-commons upload ./home.png --app-name Acme --website-url https://acme.example.com --pattern landing
screen-commons flows create --app acme --name "Sign up" --step <id>=Start --step <id>
screen-commons flows update <id> --patch '{"description":null}'
```

You can edit and delete only what you contributed.

## Output and exit codes

Results are JSON on stdout. An error is one `code: message` line on stderr, and the code stays stable.

| Exit | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| `0`  | Success.                                                                          |
| `1`  | Failed, including a publish where any item failed. Its JSON report has the rest.  |
| `2`  | Bad input: `usage`, `invalid_manifest`, `invalid_image`, `bad_request` and so on. |
| `3`  | `missing_api_key`, `unauthorized` or `forbidden`.                                 |
| `4`  | `not_found`.                                                                      |
| `5`  | `network`, `rate_limited` or `unavailable`, after retrying. Try again later.      |

Transient failures are retried up to 5 tries with growing delays, waiting for `Retry-After` when the server sends one, up to 2 minutes.

## Manifests

A manifest describes an app, its screens and the flows through them. A screen can appear in many flows, and a flow can repeat a screen.

```json
{
  "version": 1,
  "id": "acme-signup-2026-10",
  "app": { "name": "Acme", "websiteUrl": "https://acme.example.com" },
  "screens": [
    {
      "localId": "home",
      "source": { "file": "shots/home.png" },
      "title": "Home",
      "sourceUrl": "https://acme.example.com/",
      "patterns": ["landing"],
      "elements": [],
      "tags": ["2026"],
      "capturedAt": "2026-10-01T12:00:00Z"
    },
    {
      "localId": "signup",
      "source": { "url": "https://cdn.example.com/signup.png" },
      "patterns": ["signup"],
      "elements": ["form"]
    }
  ],
  "flows": [
    {
      "localId": "sign-up",
      "name": "Sign up",
      "type": "signing-up",
      "description": "From the home page to an account.",
      "steps": [{ "screen": "home", "label": "Start" }, { "screen": "signup" }]
    }
  ]
}
```

- `id` names this transfer. Keep it when you publish again. Only you can publish flows under it.
- `app` matches an existing app the way [uploads do](/docs/contributing), or creates one.
- `source` is a `file`, relative to the manifest's folder, or an `https` `url`. Each is a PNG, JPEG or WebP.
- `patterns` and `elements` are required and may be empty. `taxonomy` lists the valid slugs.
- A flow has 2 to 60 steps.

```bash
screen-commons manifest validate manifest.json
screen-commons manifest publish manifest.json
```

`validate` checks the manifest and its local files without using the network. Agents can use the local MCP server's `publish_manifest` tool instead, which takes a `path` and returns the same report.

### Repeating a publish

Publishing is safe to repeat. After a success, a crash or an edit to the manifest, run it again and the catalog ends up the same:

- Identical image bytes in an app are one screen, so an image that's already there is matched, not duplicated.
- A flow's id derives from the manifest's `id` and the flow's `localId`, so it's always the same flow.
- Differences in a screen's `title`, `patterns`, `elements` or `tags`, or in a flow's name, type, description or steps, are applied to what's already there.

There are limits to that:

- Publish with the same package version. A new image encoder can produce different bytes from the same source, which makes a new screen.
- `sourceUrl` and `capturedAt` are fixed at first upload. A changed `sourceUrl` gets a `warning`.
- An image someone else already contributed to the app stays theirs: your flow can use it, its metadata stays, and you get a `warning`.
- Removing a screen or flow from a manifest doesn't delete it. Use `screens delete` or `flows delete`.
- An image at a URL that changes becomes a new screen.

Images are converted and scaled as the extension does, and are never cropped. Thumbnails show the top of a tall page. Uploads go in batches of at most 50 screens and 28 MiB, and `--batch-size` lowers that.

### The report

```json
{
  "ok": false,
  "manifest": "acme-signup-2026-10",
  "app": { "id": "…", "slug": "acme", "name": "Acme", "url": "https://…/apps/acme" },
  "screens": [
    { "localId": "home", "id": "…", "status": "published", "url": "https://…/screens/…" },
    {
      "localId": "signup",
      "id": null,
      "status": "failed",
      "url": null,
      "error": { "code": "source_unreadable", "message": "https://… answered HTTP 404" }
    }
  ],
  "flows": [
    {
      "localId": "sign-up",
      "id": "…",
      "status": "failed",
      "url": null,
      "error": { "code": "screen_failed", "message": "Needs screens that failed: signup" }
    }
  ]
}
```

A `status` is `published`, `pending`, or `failed` with an `error`. One bad item doesn't stop the others, but a flow needs all of its screens. Any failure makes `ok` false and the exit code 1, so fix the cause and publish again.
