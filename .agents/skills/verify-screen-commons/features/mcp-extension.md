# Extension bridge

The local MCP server prefers the user's real browser. A user pairs the Screen Commons extension with the server's token, and then the browser tools run through the extension instead of headless Chromium.

## Sub-features

- `bridge-fallback` uses headless until an extension connects.
- `bridge-reject` rejects a wrong pairing token and keeps headless as the driver.
- `bridge-pair` connects with the right token, entered in the extension's Options.
- `bridge-tools` runs navigate, screenshot, extract and crawl through the extension.
- `bridge-capture` captures and uploads pages to the instance through the extension.

## How to get to it (user POV)

- In the extension, open Options, section `MCP bridge`, fill `Port` and `Pairing token`, choose `Save`, then `Test bridge` (driven).
- Start the server on a chosen port with a chosen token (driven, through `h.localMcp({ bridgePort, pairingToken })`).
- Use the generated token from `~/.config/screen-commons/bridge-token` (not scripted; the journey never reads the real file, and `packages/mcp/test/stdio.test.ts` covers generation).
- See the bridge status in the extension's popup (not scripted).
- Pair a browser while another holds the bridge (not scripted).
- Use Firefox (not scripted).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- The journey builds the extension, loads it into headless Chromium with a throwaway profile, and uses a free port rather than 7457.

Run `control drive mcp-extension --run <id>`, which performs these steps.

- **Before pairing.** `browser_status` reports `Active driver: headless` and `no extension connected`.
- **Wrong token.** In Options, fill textbox `Port` and textbox `Pairing token`, choose `Save`, then `Test bridge`. The `status` reads `Pairing token rejected`. `browser_status` still reports headless.
- **Right token.** Fill the real token, then choose `Save` and `Test bridge`. The `status` reads `Connected`. `browser_status` reports `Active driver: extension` and `connected (screen-commons-extension`.
- **Tools.** `browser_navigate` to the fixture's `/pricing` reports `(extension`. `browser_screenshot` returns an image and says `via extension`. `browser_extract` returns the title. `site_crawl` lists `/signup`, and `browser_status` still reports the extension afterwards, because crawl results don't name their driver.
- **Capture.** `capture_pages` with `app` and `flow` says `Uploaded 2 screens`. D1 has 2 `mcp`, `published` rows with `width` 1440 (headless would give 2880), `browser_status` still reports the extension, and the flow shows on `/apps/<slug>?tab=flows`.
- **Proof.** Read `test-results/verify/<run>/mcp-extension-*/result.json`, the Options screenshots, the extension's screenshot image, and `mcp-bridge.stderr.log`.

## Gotchas

- This is a real extension over a real bridge, but in headless Chromium with an empty profile. The user's own browser, cookies and sessions are deliberately not used, so signed-in captures and the docs' note about listing real tabs stay unverified.
- Options has more than one match for `Port` and `Pairing token` by label, so use the `textbox` role.
- A lost extension falls back to headless silently, and the journey's checks exist to catch that. Keep them if you change it.
- Headless capture and extension capture go through different code, so don't count `mcp-local` as proof of this path, or the other way round.
- The journey never touches port 7457, so a developer's own paired extension can't connect to it.
