---
title: MCP
description: Connect AI agents to Screen Commons. Search the catalog for inspiration, and let agents crawl, capture and upload sites.
order: 6
section: Integrations
---

Screen Commons speaks the [Model Context Protocol](https://modelcontextprotocol.io), so agents such as Claude Code and Cursor can use the catalog directly. There are two servers. Both register the same catalog tools with the same names and arguments.

| Server     | Runs                                    | Transport       | Tools             | Use it to                                                             |
| ---------- | --------------------------------------- | --------------- | ----------------- | --------------------------------------------------------------------- |
| **Remote** | Inside your instance at `/mcp`          | Streamable HTTP | Catalog           | Search screens and flows, view images, upload.                        |
| **Local**  | On your machine as `screen-commons-mcp` | stdio           | Catalog + browser | Everything above, plus navigate, screenshot, crawl and capture sites. |

Pick one per client. The local server proxies the catalog tools to your instance, so you don't need both.

Both servers authenticate with an API key and act as you: they see what you can see, and member uploads wait for review. [Create a key](/docs/api-keys) in **Settings → API keys** first.

## Remote server

The endpoint is `https://<your-instance>/mcp` (`http://localhost:5173/mcp` locally). Send the key as a bearer token.

### Claude Code

```bash
claude mcp add --transport http screen-commons http://localhost:5173/mcp \
  --header "Authorization: Bearer sc_…"
```

### Cursor

Add to `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "screen-commons": {
      "url": "http://localhost:5173/mcp",
      "headers": { "Authorization": "Bearer sc_…" }
    }
  }
}
```

### Other clients

Most clients accept this shape, for example Claude Code's project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "screen-commons": {
      "type": "http",
      "url": "http://localhost:5173/mcp",
      "headers": { "Authorization": "Bearer sc_…" }
    }
  }
}
```

Clients that only support stdio can reach the remote server through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "screen-commons": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:5173/mcp",
        "--header",
        "Authorization:${SCREEN_COMMONS_AUTH}"
      ],
      "env": { "SCREEN_COMMONS_AUTH": "Bearer sc_…" }
    }
  }
}
```

### Test the endpoint

```bash
curl -s http://localhost:5173/mcp \
  -H "Authorization: Bearer sc_…" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The server is stateless and answers with plain JSON. It accepts `POST` only. Requests without a valid key get `401` with a `WWW-Authenticate: Bearer` header. Request bodies are capped at 40 MiB.

## Local server

`screen-commons-mcp` is a stdio server that runs next to your agent. It exposes the catalog tools (proxied to your instance's REST API) and browser tools that capture pages with one of two drivers:

- **Extension** (preferred). Your real browser, through the [Screen Commons Capture extension](/docs/extension) connected to the local bridge. Pages render exactly as you see them.
- **Headless** (fallback). A local Chrome or Chromium driven by `playwright-core`. Used automatically when no extension is connected.

### Build

From the repository root:

```bash
pnpm install
pnpm --filter @screen-commons/mcp build
```

Then run it with `node packages/mcp/dist/index.js`. The workspace package is currently private and unpublished; `screen-commons-mcp` is its executable name, not an available npm install.

### Configure

| Variable                      | Default                 | Purpose                                                                                                                   |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `SCREEN_COMMONS_URL`          | `http://localhost:5173` | Your Screen Commons instance.                                                                                             |
| `SCREEN_COMMONS_API_KEY`      | none                    | `sc_…` key for the catalog tools and uploads.                                                                             |
| `SCREEN_COMMONS_BRIDGE_PORT`  | `7457`                  | Port of the extension bridge on `127.0.0.1`.                                                                              |
| `SCREEN_COMMONS_BRIDGE_TOKEN` | generated               | Pairing token for the extension. If unset, one is generated, saved to `~/.config/screen-commons/bridge-token` and reused. |
| `CHROME_PATH`                 | auto-detected           | Chrome or Chromium binary for the headless driver.                                                                        |
| `SCREEN_COMMONS_HEADLESS`     | `true`                  | Set to `false` to watch the headless browser work.                                                                        |

All logs, including the pairing token, go to stderr; stdout carries only MCP messages.

### Claude Code

```bash
claude mcp add --transport stdio \
  --env SCREEN_COMMONS_URL=http://localhost:5173 \
  --env SCREEN_COMMONS_API_KEY=sc_… \
  screen-commons -- node /absolute/path/to/screen-commons/packages/mcp/dist/index.js
```

### Cursor and other clients

```json
{
  "mcpServers": {
    "screen-commons": {
      "command": "node",
      "args": ["/absolute/path/to/screen-commons/packages/mcp/dist/index.js"],
      "env": {
        "SCREEN_COMMONS_URL": "http://localhost:5173",
        "SCREEN_COMMONS_API_KEY": "sc_…"
      }
    }
  }
}
```

Use the built local file above until an npm package is published.

## Pair the browser extension

The bridge is a WebSocket server on `ws://127.0.0.1:7457` that only accepts the extension when it presents the pairing token.

1. Start your agent so it launches `screen-commons-mcp`. The token is printed to stderr and saved to `~/.config/screen-commons/bridge-token`:

   ```bash
   cat ~/.config/screen-commons/bridge-token
   ```

2. In the extension, open **Settings → MCP bridge**, paste the token into **Pairing token**, and click **Save**.
3. Click **Test bridge**. The status changes to **Connected**, and the popup shows **MCP bridge: Connected**.
4. Ask your agent to call `browser_status`. It reports the `extension` driver.

The token persists, so you pair once. To rotate it, delete the file (or set `SCREEN_COMMONS_BRIDGE_TOKEN`), restart the server and paste the new token.

| Popup status         | Meaning                                                             |
| -------------------- | ------------------------------------------------------------------- |
| **Connected**        | The agent can drive this browser.                                   |
| **Not running**      | No server on the port. The extension retries automatically.         |
| **Not paired**       | No pairing token in Settings.                                       |
| **Token rejected**   | The token doesn't match. Paste the current one and click reconnect. |
| **In use elsewhere** | Another browser connected to the same server and took over.         |
| **Off**              | The bridge is turned off in Settings.                               |

> **Note**
> The agent drives your real browser. It navigates in a tab it opens and then reuses; screenshots and extraction target that tab, or your active tab if it hasn't navigated yet. It can also list the URLs and titles of your open tabs, and pages load with your cookies and sessions. Only pair with servers you started yourself.

## Tool reference

Catalog tools are available on both servers. Browser tools are local only.

### Catalog tools

| Tool             | Purpose                                                                                               | Arguments                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_screens` | Search published screens by text and taxonomy filters. Returns ids, app, patterns and thumbnail URLs. | `query?`, `platform?`, `pattern?`, `element?`, `app?` (slug), `limit` (1–30, default 12), `cursor?`                                                             |
| `search_flows`   | Search multi-screen flows.                                                                            | `query?`, `platform?`, `type?`, `app?` (slug), `limit` (1–20, default 8), `cursor?`                                                                             |
| `list_apps`      | List apps.                                                                                            | `query?`, `platform?`, `category?`, `sort` (`latest` \| `popular`), `limit` (1–50, default 20), `cursor?`                                                       |
| `get_app`        | One app with screen and flow counts, versions, patterns and elements.                                 | `slug`                                                                                                                                                          |
| `get_screen`     | One screen's metadata plus the image as MCP image content.                                            | `id`, `full` (default `false`: thumbnail; `true`: full resolution)                                                                                              |
| `get_flow`       | A flow with its ordered steps.                                                                        | `id`, `includeImages` (default `false`; `true` adds step thumbnails as image content)                                                                           |
| `get_taxonomy`   | Valid platforms, categories, patterns, UI elements and flow types.                                    | none                                                                                                                                                            |
| `upload_screen`  | Upload one screenshot under an app, creating the app if needed.                                       | `app` (`name`, `websiteUrl?`, `platform?`, `category?`, `slug?`), `image` (`type`, `base64`), `title?`, `sourceUrl?`, `patterns?` (max 8), `elements?` (max 24) |
| `create_flow`    | Create a flow from existing screens of one app.                                                       | `appId`, `name`, `type?`, `steps` (at least 2 of `{ screenId, label? }`)                                                                                        |

Results are JSON text. URLs in tool output are absolute, and every item includes a `url` to open it on your instance.

### Browser tools (local only)

| Tool                 | Purpose                                                                                            | Arguments                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `browser_status`     | Report the active driver (`extension` or `headless`) and open tabs when available.                 | none                                                                                                                                                                                       |
| `browser_navigate`   | Open a URL and wait for it to settle.                                                              | `url`, `viewport` (`desktop` 1440×900 \| `mobile` 390×844, default `desktop`), `newTab` (default `false`)                                                                                  |
| `browser_screenshot` | Screenshot the current page and return the image.                                                  | `fullPage` (default `false`), `selector?` (CSS selector of one element)                                                                                                                    |
| `browser_extract`    | Title, description, favicon, Open Graph image, theme color, headings and same-origin links.        | none                                                                                                                                                                                       |
| `site_crawl`         | Breadth-first crawl of same-origin pages. Returns pages with titles and suggested screen patterns. | `url`, `maxPages` (1–50, default 12), `maxDepth` (0–4, default 1), `include?`, `exclude?` (path substrings)                                                                                |
| `capture_pages`      | Capture URLs, auto-tag patterns and, with `upload`, publish them as one app, optionally as a flow. | `urls` (1–50), `app` (`name?`, `websiteUrl?`, `platform`, `category?`), `flow?` (`name`, `type?`), `viewport` (default `desktop`), `fullPage` (default `false`), `upload` (default `true`) |

Valid values for `platform`, `pattern`, `element`, `type` and `category` come from `get_taxonomy`.

## Example workflows

### Capture a site into the catalog

Uses the local server. With the extension paired, capture runs in your browser; otherwise headless Chromium.

> Capture the Linear marketing site into Screen Commons: home, pricing, sign up and changelog, desktop, full page.

A typical sequence:

1. `site_crawl { "url": "https://linear.app", "maxPages": 20 }` to discover pages and their suggested patterns.
2. The agent picks the pages that match the request.
3. `capture_pages` uploads them as one app:

   ```json
   {
     "urls": [
       "https://linear.app",
       "https://linear.app/pricing",
       "https://linear.app/signup",
       "https://linear.app/changelog"
     ],
     "app": {
       "name": "Linear",
       "websiteUrl": "https://linear.app",
       "platform": "web",
       "category": "productivity"
     },
     "viewport": "desktop",
     "fullPage": true,
     "upload": true
   }
   ```

4. The agent reports the links to the new screens. As an admin they're live; as a member they wait for review.

Add `"flow": { "name": "Sign up", "type": "signing-up" }` to save the captured pages, in order, as a flow.

> **Warning**
> Only capture public pages, and respect each site's terms. See the [content policy](/docs/contributing#content-policy).

### Find inspiration for a pricing page

Works with either server.

> Find three pricing pages with a monthly/yearly toggle and summarize how they present plans.

1. `get_taxonomy` to learn the slugs (`pricing` pattern, `toggle` and `pricing-table` elements).
2. `search_screens { "pattern": "pricing", "element": "toggle", "limit": 12 }`, or with `"query": "pricing table with toggle"`.
3. `get_screen { "id": "…", "full": true }` for the most promising results, so the agent sees the actual images.
4. The agent compares layouts and links each reference with its `url`.

For multi-step references, use `search_flows { "type": "upgrading" }` and `get_flow { "id": "…", "includeImages": true }`.
