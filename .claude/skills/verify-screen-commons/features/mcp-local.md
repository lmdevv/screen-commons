# Local MCP

Agents run `screen-commons-mcp` next to them over stdio. It proxies the catalog tools to an instance with an API key, and adds prompts, a taxonomy resource and browser tools that crawl, capture and upload sites.

## Sub-features

- `local-contract` exposes the same definition for each catalog tool as the remote server, plus 6 browser tools.
- `local-extras` serves the `capture_site` and `find_inspiration` prompts and the `screen-commons://taxonomy` resource.
- `local-catalog` proxies search, read, upload and flow creation to the instance, with the same results as the remote server.
- `local-status` reports the active driver and the bridge state.
- `local-browser` navigates, screenshots a viewport, an element or a full page, and extracts metadata.
- `local-crawl` discovers same-origin pages.
- `local-capture` captures pages without uploading, or uploads them as an app with a flow and searchable text.
- `local-keys` explains a missing or wrong key, and keeps a member's capture pending.

## How to get to it (user POV)

- Start `npx -y screen-commons-mcp` from an MCP client (driven in [npm package](./mcp-package.md)), or in development `node packages/mcp/dist/index.js` with `SCREEN_COMMONS_URL` and `SCREEN_COMMONS_API_KEY` (driven, with the SDK's stdio client and a per-run build of the same entry).
- Configure Claude Code or Cursor as `docs/mcp` describes (not scripted; `control mcp-config` prints a working config for manual use).
- Run with `--headful` to watch the browser (not scripted).
- Capture a mobile viewport with `viewport: "mobile"` (not scripted).
- Capture through the extension instead of headless (driven in [Extension bridge](./mcp-extension.md)).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- The journey's fixture site runs on `127.0.0.1`, so no public site is contacted.
- The bridge is off, and the server's home directory is in the run's scratch space.

Run `control drive mcp-local --run <id>`, which performs these steps.

- **Contract.** `h.localMcp()` connects to `screen-commons-mcp`. Its tools are the remote server's 9 plus the 6 browser tools. Each catalog tool's whole definition, including annotations, deep-equals the remote one.
- **Extras.** `listPrompts` returns both prompts, and `capture_site` mentions `capture_pages`. `readResource` on `screen-commons://taxonomy` includes `signing-up`.
- **Same as remote.** Each of these runs on both servers, and the text and image bytes must be identical: `search_screens` by text, with filters and with no match; `get_screen` as a thumbnail and full size; `list_apps`, `get_app`, `search_flows`, `get_flow` with images, `get_taxonomy`; and the refusals for a missing slug (`not_found: …`), a missing screen, an invalid pattern (`-32602`), bytes that aren't an image (`unsupported_media_type: …`) and a one-step flow.
- **Upload.** `upload_screen` returns the same fields from both servers, joining one app, with `status` `published`. A mislabeled image gets the same `note` from both. D1 has `source = mcp`. `create_flow` returns the same fields and steps from both.
- **Status.** `browser_status` reports `Active driver: headless` and `Extension bridge: disabled`.
- **Browser.** `browser_navigate` to the fixture's `/pricing` reports its title. `browser_screenshot` reports `2880×1800` and a saved file that exists. `selector: "#top"` reports a height of 144. `fullPage: true` is taller than 1800. `browser_extract` returns the title and at least 3 links.
- **Crawl.** `site_crawl` lists `/pricing`, `/signup` and `/docs`.
- **Capture without upload.** `capture_pages` with `upload: false` says `not uploaded` and returns 3 thumbnails. The D1 counts of screens, apps and flows, and the R2 key count, don't change.
- **Capture with upload.** `capture_pages` with `app` and `flow` says `Uploaded 3 screens`. D1 has 3 `mcp`, `published` rows. REST search finds the fixture's page text in all 3, and the flow shows on `/apps/<slug>?tab=flows`.
- **No key.** With `token: null`, `search_screens` fails naming `SCREEN_COMMONS_API_KEY`, `get_taxonomy` returns the same taxonomy from its bundled copy, and an uploading `capture_pages` fails suggesting `upload=false`.
- **Wrong key.** With a fake key, `search_screens` fails with `rejected the API key (401)`.
- **Member.** With a member's key, `capture_pages` reports `(pending)` and says an admin must approve it.
- **Proof.** Read `test-results/verify/<run>/mcp-local-*/result.json`, each tool's JSON, the saved images, and `mcp-*.stderr.log` for the server's logs.

## Gotchas

- Catalog results match the remote server exactly, except that an image too large to send inline is shrunk and explained in a `note` field. The seed never gets that large, so this exception is not scripted.
- Headless captures desktop pages at 2x, so the 1440×900 viewport reports 2880×1800. The returned image is a preview, so read the size from the text.
- The fixture is always on `127.0.0.1`, and uploads with the same domain join one app. Set a unique `app.websiteUrl`, or a capture lands in an earlier run's app under its name.
- Each client starts its own server process, which starts Chromium on first browser use. Closing the client stops both, and `drive` does this for you.
- With the bridge on, the server's stderr prints the pairing token. It's a throwaway here, so the log is safe as evidence.
