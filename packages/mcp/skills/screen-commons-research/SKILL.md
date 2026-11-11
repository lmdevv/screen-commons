---
name: screen-commons-research
description: Answer "how does <app> do <task>?" from real product screenshots in the Screen Commons catalog, and save a sourced reference bundle of the flow. Use when the user asks how an app handles a flow such as signing up, onboarding, creating a playlist or checking out, wants UI references or inspiration from real apps, or mentions Screen Commons.
---

# Screen Commons research

Answer from the catalog's screenshots, never from memory. Describe a screen only after you open its image. Cite only ids that `scripts/check-references.mjs` passed.

`screen-commons` is the CLI in the `screen-commons-mcp` npm package. If the shell says `screen-commons: command not found`, write `npx -y -p screen-commons-mcp screen-commons` in its place from then on. Commands print JSON on stdout. A failure prints one `code: message` line on stderr. Run each step's commands in one shell call, as the examples do.

## Budget

Bundle one flow and open 3 of its images. Go up to 3 flows and 20 images, or the budget the user names, only when the user asks for more or the first flow doesn't answer the question.

## Workflow

```
- [ ] 1. Preflight and search
- [ ] 2. Read match and pick flows
- [ ] 3. Bundle the flows
- [ ] 4. Look at the images
- [ ] 5. Write ANSWER.md
- [ ] 6. Check references
- [ ] 7. Answer
```

### 1. Preflight and search

Search with the question as the user asked it. The search finds the app and the task words in it.

```bash
screen-commons whoami && screen-commons flows search "How does Spotify let users create a playlist?" --limit 10
```

If `whoami` fails, stop. Search nothing else and answer nothing from memory.

- `missing_api_key` or `unauthorized` (exit 3): tell the user to run the `screen-commons login --url <instance>` command the message names. It asks them to approve a key in the browser once, then saves it. Then they can ask again.
- `network` (exit 5): say that the instance at that URL is unreachable.

When the cause isn't clear, run `screen-commons doctor`. It prints one line per check with its fix.

### 2. Read match and pick flows

`match` says how the search read the question. Read it before the items.

| `match`                                 | It means                                                                   | Do                                                                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appNotFound` is set                    | The catalog has no app by that name. Every item is from another app.       | Say the catalog doesn't have it. Bundle and cite nothing. You can offer to research the task in the apps the items come from. Go to step 5.                                             |
| `app` is set, `items` is empty          | The app is in the catalog, but none of its flows has the `unmatchedTerms`. | Search once more with a synonym, such as `screen-commons flows search "edit playlist" --app <app>`. Still nothing: say the catalog has the app but no flow for this task. Go to step 5. |
| `app` is set, with items                | Every item is from that app.                                               | With `mode: "strict"`, every item has every task word. With `relaxed`, items have only some, so judge each by its name.                                                                 |
| `appWithoutResults` is set              | The app has no flow for the task. Every item is from another app.          | As for an app with no items.                                                                                                                                                            |
| `mode` is `unsearchable`                | The question has no task words, such as "how does it work".                | Ask the user which task to look for, and stop.                                                                                                                                          |
| `app` and `appNotFound` are both `null` | The question names no app the search recognized.                           | If it names one, find its slug with `screen-commons apps list "<name>"` and search again with `--app <slug>`. No app means the catalog doesn't have it, as for `appNotFound`.           |

Pick the flow whose name answers the question best. Two flows can share a name. They are separate captures, so take the one with more steps.

For single screens rather than a flow, use `screen-commons screens search "<words>" --app <slug>` and `screens bundle` in step 3.

### 3. Bundle the flows

Keep one folder per question, `references/<app-slug>-<topic>/`, with one bundle per flow. Write the bundles and print their REFERENCES.md in one call:

```bash
screen-commons flows bundle <flow-id> --out references/spotify-create-playlist/<flow-id> && cat references/spotify-create-playlist/<flow-id>/REFERENCES.md
```

For a second flow, chain another `flows bundle`. For screens, `screen-commons screens bundle <id> <id>... --out <folder>`. Each bundle holds `bundle.json`, `REFERENCES.md` and `images/`. When `warnings` holds `pending_content`, only you and admins can see that item, so say so when you cite it. A rerun reuses the images it already has.

### 4. Look at the images

REFERENCES.md lists each step with its label, title, image path and source. Open 3 images per flow with your image viewer: the first step, the step where the task happens and the last. Describe only those screens, and name the other steps by their labels. State only what you see. When an image doesn't show what its label says, say so.

### 5. Write ANSWER.md

Write `references/<app-slug>-<topic>/ANSWER.md`. Cite each flow as `[<flow-id>](<catalog URL>)` and each step as `[<screen-id>](<catalog URL>)`, copied from REFERENCES.md. Cite ids in no other form.

```markdown
# How Spotify lets users create a playlist

<Two or three sentences that answer the question.>

## Creating a playlist ([<flow-id>](<flow catalog URL>))

1. <What the user does and sees.> [<screen-id>](<screen catalog URL>)
2. <Next step.> [<screen-id>](<screen catalog URL>)

Retrieved <date> from <instance>. Bundles and images: references/spotify-create-playlist/.
```

When the catalog lacks the app or the task, ANSWER.md says so in one or two sentences and cites no id.

### 6. Check references

```bash
node <this skill's folder>/scripts/check-references.mjs references/spotify-create-playlist --answer references/spotify-create-playlist/ANSWER.md
```

With no bundle, pass only `--answer`. Every id the answer cites then fails.

- Exit 0: go on.
- Exit 1: fix each entry in `problems`. Remove an id that no bundle holds, or bundle the flow it belongs to. Rerun the check until it passes. Never answer with a failing check.
- Exit 2: it couldn't check, for example with no key. Answer, and say that the references are unchecked and why.

### 7. Answer

Reply with ANSWER.md's text and the folder's path.

## Without a shell

With only the Screen Commons MCP tools, call `search_flows` with the question, read its first line the way step 2 reads `match`, then call `get_flow` on each flow you pick to see its images. Say that the answer has no bundle and unchecked references, because only the CLI writes and checks them.

<!-- TODO(SC-07): name the servers' research_flow prompt here once it ships on both MCP servers. -->
