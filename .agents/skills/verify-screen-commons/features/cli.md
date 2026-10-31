# CLI and manifests

Agents and scripts manage a catalog with the `screen-commons` CLI, shipped in the `screen-commons-mcp` package. A capture manifest moves a whole multi-screen flow in one command, and repeating that command always ends in the same catalog.

## Sub-features

- `cli-read` lists and reads apps, screens and flows, with `--cursor` and `--limit`.
- `cli-manage` uploads a file or an https URL, and edits and deletes a contributor's own screens and flows.
- `cli-contract` prints JSON on stdout and one `code: message` line on stderr, exits with the documented codes, has `--help` at every level, and never prints the key.
- `cli-config` prefers flags to `SCREEN_COMMONS_URL` and `SCREEN_COMMONS_API_KEY`.
- `manifest-validate` checks a manifest and its local files with no key and no network.
- `manifest-publish` publishes screens and flows in order, with full images and no cropping.
- `manifest-converge` repeats with no new rows, applies an edited manifest, and recovers from a kill, a lost response and a `503`.
- `manifest-bad-item` carries on past a bad screen, fails only the flows that need it, and exits non-zero.
- `manifest-batches` splits requests at the batch limits.
- `manifest-roles` makes a member's publish pending and an admin's published, and refuses another member's delete.
- `manifest-tool` publishes the same manifest with the local server's `publish_manifest`.
- `cli-package` runs from the packed package outside the workspace, through `npx -p`.

## How to get to it (user POV)

- Run `screen-commons <command>` from a built checkout (driven).
- Run `npx -p <tarball> screen-commons` and the installed bin, from outside the workspace (driven).
- Run `npx -p screen-commons-mcp@<version> screen-commons` once a version is on npm (not scripted; check it by hand against a run after each release).
- Call `publish_manifest` on the local server (driven, with the SDK's client).
- Publish a manifest whose screens are over the 28 MiB batch limit (not scripted; the unit tests prove the split, and the journey proves the 50-screen split).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- `openssl` is on `PATH`, for the local https image host. The npm registry is reachable, because installing fetches the package's dependencies.

Run `control drive cli --run <id> --timeout 900`, which performs these steps.

- **Contract.** `--help` works at every level. No command, an unknown command and a bad flag exit 2 with `usage:`. No key exits 3 with `missing_api_key:`. `taxonomy` and `manifest validate` need no key. A flag's key beats a wrong one in the environment.
- **Publish.** A manifest of 8 screens and 2 flows sharing a screen, one repeating a screen, exits 0 as the admin with everything `published`.
- **Read back.** `flows get` returns each flow's step ids and labels in order. `screens download` writes each image, whose bytes match the row's size and whose dimensions match the source, including a 1000×3000 page kept whole.
- **Repeat.** A second publish gives an identical report. `h.sql` shows the same rows, the same flow steps and unchanged view counts, and `h.r2` the same objects.
- **Edit.** A changed title, patterns, flow name and step order are applied in place, with no new rows.
- **Kill.** SIGKILL after the second of four batches leaves 4 screens and no flows. A rerun ends with 8 screens and 2 flows and no duplicates.
- **Faults.** Through a local proxy that lets an upload land and then drops the response, answers a flow with `503` and `Retry-After: 1`, and drops a flow's response, the publish exits 0 with the right rows.
- **Bad item.** With one corrupt file the publish exits 1 with `publish_failed:`, a report naming it, the other screens up, and only the flow that needs it failed. Fixing the file and rerunning converges with the same ids.
- **Batches.** 52 screens arrive as requests of at most 50.
- **Roles.** A member's publish is `pending`, and an admin's is `published`. Another member gets `not_found` deleting the pending screen and `forbidden` once it's approved, and the rows stay. Publishing someone else's manifest id fails its flows with `bad_request`.
- **Manage.** `screens search` pages with no overlap, `apps list`, `apps get`, `flows search`, `flows create`, `flows update`, `screens update` and the owner's deletes work, with a read back each time. `upload` takes a file and an https URL, and refuses `http://`. `upload` and a manifest `url` both follow a redirect, and refuse a redirect off https, a redirect loop, an image over 15 MiB and a page that isn't an image, with the same message.
- **Tool.** `publish_manifest` returns the same ids with no new rows, and refuses a missing file.
- **Package.** The installed bin publishes from outside the workspace, and `npx -p <tarball> screen-commons` answers.
- **Secrets.** No key appears in anything any command printed.
- **Proof.** Read `test-results/verify/<run>/cli-*/result.json`, each command's saved output, and the `/flows/<id>` screenshot.

## Gotchas

- A journey run through the proxy reports URLs on the proxy's port. That's the CLI's `--url`, not a bug.
- This journey needs the network for its package step, like `mcp-package`.
- The default 300 second limit is too short; pass `--timeout 900`.
- Reading a single screen counts a view, which is why view counts are compared across the publish alone.
