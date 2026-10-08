---
title: Browser extension
description: Install Screen Commons Capture, connect it to your account, capture screens and flows from any website, and upload them.
order: 5
section: Integrations
---

**Screen Commons Capture** is a browser extension for Chrome, Edge and Firefox. It captures the visible area, the full page or a single element of any website, collects shots in a tray, and uploads them to your Screen Commons instance as screens or a flow. It can also let a local AI agent drive your browser through the [MCP bridge](/docs/mcp#pair-the-browser-extension).

## Install from source

The extension isn't in the browser stores yet. Build it from the repository:

```bash
pnpm install
pnpm --filter @screen-commons/extension build
```

This writes two builds:

| Build                                | Browsers          |
| ------------------------------------ | ----------------- |
| `apps/extension/.output/chrome-mv3`  | Chrome 120+, Edge |
| `apps/extension/.output/firefox-mv2` | Firefox 140+      |

### Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3`.
4. Pin **Screen Commons Capture** to the toolbar.

### Edge

1. Open `edge://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3`.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `apps/extension/.output/firefox-mv2/manifest.json`.

> **Note**
> Firefox removes temporary add-ons when it restarts. Load it again after each restart. A permanent install needs a build signed by Mozilla; `pnpm --filter @screen-commons/extension zip` produces the package to submit.

### Development

`pnpm dev:extension` builds the extension in watch mode and opens Chromium with it loaded at `http://localhost:5173`. Set `CHROME_PATH` to use a specific browser binary.

## Connect your account

1. Click the extension icon, then **Connect**.
2. A tab opens at `/extension/connect` on your instance. Sign in if asked.
3. The page creates an API key named **Browser extension** and hands it to the extension. A toast confirms "Screen Commons Capture connected as …".

The popup now shows your name and server.

### Self-hosted instances

The extension points at `http://localhost:5173` by default. To use another instance:

1. Open the extension's **Settings** (gear icon in the popup).
2. Set **Server URL**, for example `https://ui.example.com`.
3. Click **Connect with Screen Commons**. The browser asks for access to that site; allow it so the connect page can talk to the extension.

If you decline, create a key in **Settings → API keys** on your instance and paste it into **API key** instead. Use **Test connection** to check it.

## Capture

| Mode          | What it captures                                   | Default shortcut |
| ------------- | -------------------------------------------------- | ---------------- |
| **Full page** | The whole scrollable page, top to bottom.          | `Alt+Shift+S`    |
| **Visible**   | What's currently in the viewport.                  | `Alt+Shift+V`    |
| **Element**   | One element. Hover to highlight, click to capture. | `Alt+Shift+E`    |

On macOS the shortcuts show as `⌥⇧S`, `⌥⇧V` and `⌥⇧E`. Change them at `chrome://extensions/shortcuts` (Chrome and Edge) or **Manage Extension Shortcuts** in `about:addons` (Firefox).

While picking an element: `↑` selects the parent, `↓` the first child, `Enter` captures the highlighted element, and `Esc` cancels.

Full-page captures scroll through the page first so lazy-loaded images appear. Very long pages are trimmed to 16,384 px tall; the popup tells you when that happens.

Browser pages such as `chrome://` and extension stores can't be captured.

## The tray

Every capture lands in the tray. Open it from the popup with **Open tray**. The toolbar badge shows how many shots are waiting.

In the tray you can:

- Edit the **app**: name, website, platform and category. The first capture prefills the name and website from the page.
- Edit each shot's **title** and **patterns**. Patterns are suggested from the page URL and title, for example `/pricing` suggests Pricing.
- **Reorder** shots by dragging, or with **Move earlier** and **Move later**.
- **Delete** shots, or **Clear** the whole tray.

The tray is stored locally in the extension and survives browser restarts.

## Record a flow

1. Turn on **Record flow** in the popup. The badge shows `REC`.
2. Walk through the flow and capture each step.
3. In the tray, check the order, then fill in **Save as flow**: a name and a flow type.

Each shot's title becomes its step label. A flow needs at least 2 and at most 60 screens.

## Upload

Click **Upload** in the tray. The extension:

1. Converts and, if needed, shrinks images to fit the [upload limits](/docs/contributing#image-requirements).
2. Sends them in one or more batches to `POST /api/v1/captures`, with the site's favicon as the app logo.
3. Creates the flow, if you turned on **Save as flow**.

When it finishes, the tray links to the app and flow on your instance. Uploaded shots are removed from the tray. If an upload fails midway, shots that already made it are removed so a retry doesn't create duplicates.

Admin uploads publish immediately; member uploads wait for [review](/docs/contributing#review).

## Settings

| Setting                 | Default                 | Purpose                                                                                                                                                                                                        |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server URL              | `http://localhost:5173` | The Screen Commons instance to upload to.                                                                                                                                                                      |
| API key                 | empty                   | Filled by **Connect**, or paste an `sc_…` key.                                                                                                                                                                 |
| Enable MCP bridge       | on                      | Lets a local `screen-commons-mcp` server drive this browser.                                                                                                                                                   |
| Port                    | `7457`                  | Bridge port on `127.0.0.1`.                                                                                                                                                                                    |
| Pairing token           | empty                   | Printed by `screen-commons-mcp` on start. The bridge stays off until you set it.                                                                                                                               |
| Full-page method        | Automatic               | **Automatic** renders the page once (DevTools Protocol in Chrome and Edge, native full-page capture in Firefox). **Scroll and stitch** combines viewport captures; slower, but try it if a page renders oddly. |
| Load lazy content first | on                      | Scroll through the page before full-page captures.                                                                                                                                                             |

## Permissions

| Permission                        | Why                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access to all websites            | Capture any page you choose, read its title, favicon and visible text, and reach your Screen Commons server. Firefox requires it for full-page capture.                         |
| `activeTab`, `tabs`               | Find the tab you're capturing and its URL and title.                                                                                                                            |
| `scripting`                       | Measure the page, scroll it for full-page captures, run the element picker and read metadata.                                                                                   |
| `debugger` (Chrome and Edge only) | Full-page and element capture through the DevTools Protocol, and mobile emulation for the MCP bridge. Chrome shows a "started debugging this browser" bar while a capture runs. |
| `storage`, `unlimitedStorage`     | Keep settings and the tray (full-size images) on your device.                                                                                                                   |
| `alarms`                          | Reconnect to the MCP bridge once a minute if it drops.                                                                                                                          |

## Privacy

- Nothing leaves your browser until you click **Upload**, or a local agent you started asks for a page through the bridge.
- Uploads go only to the server in **Settings**, authenticated with your API key.
- Each shot includes the page URL, title and the page's visible text, which makes it searchable. Review the tray before uploading.
- The MCP bridge connects only to `127.0.0.1` and requires the pairing token.
- The extension has no analytics or telemetry.
