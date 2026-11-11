---
name: screen-commons-enrich
description: Fill in missing screen titles, screen text, flow types and step labels in the Screen Commons catalog by looking at each screenshot, in batches of 25 with a dry-run diff before every write. Use when an admin or contributor asks to enrich, label, describe or correct the metadata of Screen Commons screens or flows, or to make them easier to search.
---

# Screen Commons enrich

Search finds screens by their title and visible text, and flows by name, type and step labels. This skill fills those fields from what each screenshot shows.

`screen-commons` below is the CLI in the `screen-commons-mcp` npm package. If `command -v screen-commons` prints nothing, run `npx -y -p screen-commons-mcp screen-commons` wherever this skill says `screen-commons`. Every command prints JSON on stdout. A failure prints one `code: message` line on stderr.

## Workflow

```
- [ ] 1. Preflight
- [ ] 2. Pick the items
- [ ] 3. Look and write a batch of 25
- [ ] 4. Dry run
- [ ] 5. Apply
- [ ] 6. Check search
- [ ] 7. Next batch
```

### 1. Preflight

Run `screen-commons whoami`. On `missing_api_key` or `unauthorized`, tell the user to run `screen-commons login --url <instance>` and stop. An `admin` can edit any screen or flow. A `member` can edit only their own, which `screen-commons contributions list` lists.

### 2. Pick the items

Work one app at a time, flow by flow:

```bash
screen-commons flows search --app <slug> --limit 100
```

Pass `nextCursor` back as `--cursor` for the next page. Flows with `type: null` need a type. Then write a bundle of each flow, which downloads its step images and lists its labels and titles:

```bash
screen-commons flows bundle <flow-id> --out enrich/<app-slug>/flows/<flow-id>
```

A step with no label, or a screen with no title, needs one. `screen-commons screens get <id>` shows a screen's `text`.

### 3. Look and write a batch of 25

Open each image before you write anything about it. Write only what you can see:

- `title`: what the screen shows, such as `Create playlist menu`. 160 characters at most.
- `text`: the words visible on the screen, in reading order, separated by single spaces. Leave out words you can't read. 20,000 characters at most.
- `type`: a flow type slug from `flowTypes` in `screen-commons taxonomy`, such as `creating`.
- `labels`: what the user does on each step, in step order, such as `Tap the plus button`. Use `null` to keep a step's label. 80 characters at most.

Leave a field out when the image doesn't settle it. Write up to 25 items to `enrich/<app-slug>/batch-<NN>.json`:

```json
{
  "items": [
    { "screen": "<screen-id>", "title": "Create playlist menu", "text": "Playlist Blend Folder" },
    {
      "flow": "<flow-id>",
      "type": "creating",
      "labels": ["Open Your Library", null, "Name the playlist"]
    }
  ]
}
```

### 4. Dry run

```bash
node <this skill's folder>/scripts/enrich-batch.mjs enrich/<app-slug>/batch-<NN>.json
```

It reads each item and prints its `changes`, each with `from` and `to`, and writes nothing. Read every change. Drop or fix any that replaces good metadata with worse, then run the dry run again. When the user asked to approve changes, show them the changes and wait.

### 5. Apply

```bash
node <this skill's folder>/scripts/enrich-batch.mjs enrich/<app-slug>/batch-<NN>.json --apply > enrich/<app-slug>/batch-<NN>.report.json
```

It reads each item again and writes only its changes, one item every 300 ms.

- `saved` or `unchanged` for every item, exit 0: go on.
- `stopped` is set: the key was refused, or the instance is out of capacity (`unavailable`, `rate_limited`). Stop the run and report it. Later, the same command continues where it stopped, because saved items come back `unchanged`.
- `failed`: fix the item in the batch file and apply again. `forbidden` means your key may not edit that item, so drop it from the batch.
- `saved-differently`: the server stored something else. Compare `now` with the batch.

### 6. Check search

For one changed screen per batch, search a distinctive word from its new text or title, and confirm it comes back:

```bash
screen-commons screens search "Blend" --app <slug>
```

For a flow, search words from a new label with `screen-commons flows search "<words>" --app <slug>`.

### 7. Next batch

Continue with the next 25 items. Keep each batch file and its report: together they record every change.
