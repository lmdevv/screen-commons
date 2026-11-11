---
name: screen-commons-research
description: Answer "how does <app> do <task>?" from real product screenshots in the Screen Commons catalog, and save a sourced reference bundle of the flow. Use when the user asks how an app handles a flow such as signing up, onboarding, creating a playlist or checking out, wants UI references or inspiration from real apps, or mentions Screen Commons.
---

# Screen Commons research

Answer from the catalog's screenshots, never from memory. Describe a screen only after you open its image. Cite only ids from a bundle that `scripts/check-references.mjs` passed.

`screen-commons` below is the CLI in the `screen-commons-mcp` npm package. If `command -v screen-commons` prints nothing, run `npx -y -p screen-commons-mcp screen-commons` wherever this skill says `screen-commons`. Every command prints JSON on stdout. A failure prints one `code: message` line on stderr.

## Budget

Use at most 3 flows and 20 images, or the budget the user names. This is a ceiling. One flow that answers the question beats three that circle it.

## Workflow

Copy this checklist and tick it off:

```
- [ ] 1. Preflight
- [ ] 2. Find the app and its flows
- [ ] 3. Write a bundle per flow
- [ ] 4. Look at the images
- [ ] 5. Write ANSWER.md
- [ ] 6. Check references
- [ ] 7. Answer
```

### 1. Preflight

Run `screen-commons whoami`.

- It prints an account: go on.
- `missing_api_key` or `unauthorized`: tell the user to run `screen-commons login --url <instance>`, or to set `SCREEN_COMMONS_URL` and `SCREEN_COMMONS_API_KEY`. Stop. Answer nothing from memory.
- `network`: say the instance is unreachable, name its URL, and stop.

When the cause isn't clear, `screen-commons doctor` prints one line per check with its fix.

### 2. Find the app and its flows

Search with the user's question as it was asked:

```bash
screen-commons flows search "How does Spotify let users create a playlist?" --limit 10
```

Read `match` before the items.

- `match.appNotFound` is set: the catalog has no app by that name. Say so. Never offer another app's flow as the answer. Skip to step 5 with no bundle.
- `match.app` is set: every item is from that app.
- `match.mode` is `relaxed`: items match only some words. Judge each by its name. `match.unmatchedTerms` lists the words no item has. Try one search with a synonym, such as "editing" for "rename".
- No `match` (an older instance), or the question names an app that `match.app` missed: find its slug with `screen-commons apps list "<app name>"`. No app means the catalog doesn't have it, as above. Then search `screen-commons flows search "<task words>" --app <slug>`.

Pick the flows whose names answer the question, best first, within the budget. If none fits, say the catalog has the app but no flow for this task, and name the closest flows as what it does have.

For a single screen rather than a flow, use `screen-commons screens search "<words>" --app <slug>` and `screens bundle` in step 3.

### 3. Write a bundle per flow

Keep everything for one question in one folder, `references/<app-slug>-<topic>/`, with one bundle per flow inside it:

```bash
screen-commons flows bundle <flow-id> --out references/spotify-create-playlist/<flow-id>
```

Each bundle holds `bundle.json`, `REFERENCES.md` and `images/`. The command prints the folder, the step count and any `warnings`. `pending_content` means only you and admins can see it, so say that when you cite it. A rerun reuses images already downloaded.

### 4. Look at the images

Read `REFERENCES.md` for step labels, titles and source URLs. Open each image you describe, with the image viewer your agent has, before you describe it. For a long flow, open the steps that carry the answer, such as the first, the last and the one where the task happens. State only what you saw, and mark anything you infer.

### 5. Write ANSWER.md

Write `references/<app-slug>-<topic>/ANSWER.md`. Cite each step as `[<screen-id>](<catalog URL>)` and each flow as `[<flow-id>](<catalog URL>)`, copied from `REFERENCES.md`. Cite ids in no other form.

```markdown
# How Spotify lets users create a playlist

<Two or three sentences that answer the question.>

## Creating a playlist ([<flow-id>](<flow catalog URL>))

1. <What the user does and sees.> [<screen-id>](<screen catalog URL>)
2. <Next step.> [<screen-id>](<screen catalog URL>)

Retrieved <date> from <instance>. Bundles and images: references/spotify-create-playlist/.
```

When the catalog lacks the app or the flow, ANSWER.md says so in one or two sentences and cites nothing.

### 6. Check references

```bash
node <this skill's folder>/scripts/check-references.mjs references/<app-slug>-<topic> --answer references/<app-slug>-<topic>/ANSWER.md
```

With no bundle, pass only `--answer`. It then fails any id the answer cites.

- Exit 0: go on.
- Exit 1: fix each entry in `problems`. Remove an id no bundle holds, or bundle the flow it belongs to. Rerun the bundle command for a changed image. Rerun the check until it passes. Never answer with a failing check.
- Exit 2: it couldn't check, for example with no key or a bundle from another instance. Answer, and say the references are unchecked and why.

### 7. Answer

Reply with the contents of ANSWER.md and the path of the folder.

## Without a shell

With only the Screen Commons MCP tools, follow the server's `research_flow` prompt: `list_apps`, `search_flows` with the app, then `get_flow` for its images. Say that the answer has no bundle, because only the CLI writes one.
