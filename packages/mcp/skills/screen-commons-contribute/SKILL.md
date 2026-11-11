---
name: screen-commons-contribute
description: Capture screenshots of a product's UI with the agent's own browser and publish them to Screen Commons as screens and flows with searchable text, after a scan for personal data, then report their review status. Use when the user asks to contribute, upload, capture or add an app's screens or flows to Screen Commons.
---

# Screen Commons contribute

`screen-commons` is the CLI in the `screen-commons-mcp` npm package. If the shell says `screen-commons: command not found`, write `npx -y -p screen-commons-mcp screen-commons` in its place from then on. Commands print JSON on stdout. A failure prints one `code: message` line on stderr.

## Rules

Each rule stops the workflow when it applies. Tell the user which one.

- Capture public pages, or product UI signed in to a demo or test account. If a page shows a personal or work account, such as a real name, inbox, profile or messages, stop and ask the user for a test account.
- Publish no personal data: no real names, email addresses, phone numbers, payment details, addresses or avatars. Run the scan in step 5, and look at every image yourself.
- Never capture secrets: API keys, tokens, passwords, QR codes or invoice links.
- Follow the site's terms and `robots.txt`. Load each page once, as a person would.
- Record how you captured each screen with one tag: `public-page` when anyone can open it signed out, or `test-account` when you were signed in to a demo or test account.

The full policy is at `<instance>/docs/contributing`, under "Content policy".

## Workflow

```
- [ ] 1. Preflight
- [ ] 2. Plan the capture
- [ ] 3. Capture
- [ ] 4. Write the manifest
- [ ] 5. Validate and scan
- [ ] 6. Publish
- [ ] 7. Report status
```

### 1. Preflight

Run `screen-commons whoami`. On `missing_api_key` or `unauthorized`, tell the user to run the `screen-commons login --url <instance>` command the message names, and stop. On `network`, say the instance is unreachable. `screen-commons doctor` explains anything else.

Note the `role`. An `admin`'s contributions publish at once. A `member`'s wait for an admin's review.

### 2. Plan the capture

Name the app, its website and its platform, and list the flow's steps in order. Check what the catalog already has, so you add to it rather than repeat it:

```bash
screen-commons flows search "<app name> <task>" --limit 10
```

When `match.app` is set, the catalog has the app. Get pattern, element and flow type slugs from `screen-commons taxonomy`.

### 3. Capture

Use the browser your agent drives, such as a Playwright or Chrome DevTools MCP server, or the local `screen-commons-mcp` server's `browser_navigate` and `browser_screenshot`, which save the full-size image and print its path. With only a shell, headless Chromium works:

```bash
chromium --headless=new --hide-scrollbars --window-size=1440,900 --screenshot=capture/<app>-<flow>/01-<step>.png <url>
chromium --headless=new --dump-dom <url> | node -e 'const h=require("fs").readFileSync(0,"utf8");console.log(h.replace(/<(script|style)[\s\S]*?<\/\1>/g," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim())'
```

For each step:

1. Open the page at 1440×900 for web, and wait until it settles.
2. Check it against the rules. Close banners that hide the UI.
3. Save a PNG to `capture/<app>-<flow>/<NN>-<step>.png`.
4. Record the page URL and its visible text, such as `document.body.innerText`, with whitespace collapsed to single spaces.

### 4. Write the manifest

Write `capture/<app>-<flow>/manifest.json`. File paths are relative to it.

```json
{
  "version": 1,
  "id": "fixture-tunes-create-playlist",
  "app": { "name": "Fixture Tunes", "websiteUrl": "https://tunes.example", "platform": "web" },
  "screens": [
    {
      "localId": "library",
      "source": { "file": "01-library.png" },
      "title": "Your Library",
      "sourceUrl": "https://tunes.example/library",
      "patterns": [],
      "elements": [],
      "tags": ["test-account"],
      "text": "Your Library Playlists Artists Create playlist",
      "capturedAt": "2026-11-10T12:00:00Z"
    },
    {
      "localId": "name",
      "source": { "file": "02-name.png" },
      "title": "Name the playlist",
      "sourceUrl": "https://tunes.example/playlist/new",
      "patterns": [],
      "elements": [],
      "tags": ["test-account"],
      "text": "Give your playlist a name My Playlist #1 Cancel Create",
      "capturedAt": "2026-11-10T12:01:00Z"
    }
  ],
  "flows": [
    {
      "localId": "create-playlist",
      "name": "Creating a playlist",
      "type": "creating",
      "steps": [
        { "screen": "library", "label": "Open Your Library" },
        { "screen": "name", "label": "Name the playlist and tap Create" }
      ]
    }
  ]
}
```

`id` names this contribution. Keep it, so that a rerun or an edit updates what the first publish made instead of adding to it. `text` holds the words visible on the screen, up to 20,000 characters, so that search finds them. A flow has 2 to 60 steps.

### 5. Validate and scan

```bash
screen-commons manifest validate capture/<app>-<flow>/manifest.json && node <this skill's folder>/scripts/scan-personal-data.mjs capture/<app>-<flow>/manifest.json
```

`validate` checks the manifest and its files without the network. The scan finds email addresses, phone numbers and card-like numbers in every text the manifest would publish.

- Scan exit 0: go on.
- Scan exit 1: stop before you publish. Tell the user each finding, with its kind, its value and where it is. Remove it from the text or title. If the image shows it too, capture again from a test account or a page without it. Then scan again.

The scan can't see images. Open each screenshot and check it for names, faces, avatars and addresses.

### 6. Publish

```bash
screen-commons manifest publish capture/<app>-<flow>/manifest.json
```

Publishing is safe to repeat. If it stops for any reason, such as a crash, a kill, a network error or `unavailable`, run the same command on the same manifest. Nothing is added twice. Exit 1 means that some items failed: read the report, fix those items and run it again.

### 7. Report status

```bash
screen-commons contributions list --limit 50
```

It lists your screens and flows, newest first. Pass `nextCursor` back as `--cursor` for more, or narrow with `--kind screen` or `--status pending`. Report each screen and flow you added with its `id`, `url` and `status`. `pending` waits for an admin, `published` is live, and `rejected` carries the reviewer's `reviewReason`.
