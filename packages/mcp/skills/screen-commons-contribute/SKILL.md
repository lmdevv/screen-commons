---
name: screen-commons-contribute
description: Capture screenshots of a product's UI with the agent's own browser and publish them to Screen Commons as screens and flows with searchable text, after a scan for personal data, then report their review status. Use when the user asks to contribute, upload, capture or add an app's screens or flows to Screen Commons.
---

# Screen Commons contribute

`screen-commons` below is the CLI in the `screen-commons-mcp` npm package. If `command -v screen-commons` prints nothing, run `npx -y -p screen-commons-mcp screen-commons` wherever this skill says `screen-commons`. Every command prints JSON on stdout. A failure prints one `code: message` line on stderr.

## Rules

These stop the workflow. Explain which one applies.

- Capture public pages, or product UI signed in to a demo or test account. If the page shows a personal account, such as a real name, inbox, profile or messages, stop and ask the user for a test account.
- Publish no personal data: no real names, email addresses, phone numbers, payment details, addresses or avatars. Run the scan in step 5, and look at each image yourself.
- Never capture secrets: API keys, tokens, passwords, QR codes or invoice links.
- Follow the site's terms and `robots.txt`. Load each page once, as a person would.

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

Run `screen-commons whoami`. On `missing_api_key` or `unauthorized`, tell the user to run `screen-commons login --url <instance>` and stop. Note the `role`: an admin's contributions publish at once, and a member's wait for review.

### 2. Plan the capture

Name the app, its website and its platform, and list the steps of the flow in order. Check what the catalog has, so you add to it rather than repeat it:

```bash
screen-commons apps list "Fixture Tunes"
screen-commons flows search "create a playlist" --app <slug>
```

Get pattern, element and flow type slugs from `screen-commons taxonomy`.

### 3. Capture

Use the browser your agent drives, such as a Playwright or Chrome DevTools MCP server, or the browser tools of the local `screen-commons-mcp` server. For each step:

1. Open the page at a 1440×900 viewport for web, and wait until it settles.
2. Check it against the rules. Close banners that hide the UI.
3. Save a PNG screenshot to `capture/<app>-<flow>/<NN>-<step>.png`.
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

`id` names this contribution. Keep it, so a rerun or an edit updates what the first publish made instead of adding to it. `text` holds the words visible on the screen, up to 20,000 characters, so search finds them. A flow has 2 to 60 steps.

### 5. Validate and scan

```bash
screen-commons manifest validate capture/<app>-<flow>/manifest.json
node <this skill's folder>/scripts/scan-personal-data.mjs capture/<app>-<flow>/manifest.json
```

`validate` checks the manifest and its files without the network. The scan finds email addresses, phone numbers and card-like numbers in every text the manifest would publish.

- Scan exit 0: go on.
- Scan exit 1: stop before publishing. Tell the user each finding, its kind and where it is. Remove it from the text or title. If the image shows it too, capture again from a test account or a page without it. Scan again.

The scan can't see images. Open each screenshot and check it for names, faces, avatars and addresses.

### 6. Publish

```bash
screen-commons manifest publish capture/<app>-<flow>/manifest.json
```

Publishing is safe to repeat. If it stops for any reason, such as a crash, a network error or `unavailable`, run the same command on the same manifest. Nothing is added twice. Exit 1 means some items failed. Read the report, fix those items and run it again.

### 7. Report status

```bash
screen-commons contributions list --limit 50
```

Report each screen and flow you added with its id, catalog URL and status. `pending` waits for an admin. `published` is live. `rejected` carries the reviewer's `reviewReason`.
