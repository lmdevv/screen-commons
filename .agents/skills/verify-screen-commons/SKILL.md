---
name: verify-screen-commons
description: Launch a disposable Screen Commons instance (TanStack Start web app on local workerd, D1 and R2), drive its MCP servers with a real MCP client and its web UI in headless Chromium, and capture proof. Use to verify any change to the remote `/mcp` server, the local `screen-commons-mcp` server and its browser tools or extension bridge, the REST API, the web UI, contribute and review flows, search or collections in the real app rather than only in tests, or when asked to run, demo or screenshot it.
---

# Verify Screen Commons

Screen Commons is a UI reference library. MCP is its main client surface, through two servers: the remote one at `/mcp` in `apps/web`, and the local stdio `screen-commons-mcp` in `packages/mcp`, which adds browser tools. Start with the `mcp-*` journeys when a change can reach either. The web app and its REST API at `/api/v1` are the other surfaces.

This skill never touches the developer's `pnpm dev` server, `apps/web/.wrangler` state, `.dev.vars`, real browser, `~/.config/screen-commons` or extension bridge port, and never deploys. Every run has its own port, state, secret and Vite cache, and its local MCP server gets a scratch home directory.

Run everything from the repository root. `control` below means `.agents/skills/verify-screen-commons/scripts/control.mjs`, which is executable. Node 24 and Chromium are required. Run `pnpm install` once if `node_modules` is missing. Chromium comes from `$CHROME_PATH`, then `/run/current-system/sw/bin/chromium`, then `PATH`.

## Agent setup

This skill works the same from Claude Code, Codex, OpenCode and Cursor. It lives in `.agents/skills/`, which Codex, OpenCode and Cursor read, and `.claude/skills/verify-screen-commons` is a symlink to it for Claude Code. Edit the files under `.agents/`.

A run needs a shell that can start a server that outlives the command, listen on and connect to local ports, and write outside the repository. Agent sandboxes commonly deny these, so run the commands below outside the sandbox. `launch` checks first and refuses with the reason.

| Agent       | How to run outside the sandbox                                                         |
| ----------- | -------------------------------------------------------------------------------------- |
| Claude Code | Allow the commands when prompted. If its sandbox is on, retry them with it turned off. |
| Codex       | `codex --sandbox danger-full-access`, or approve running outside it when asked.        |
| OpenCode    | Nothing to do. It has no sandbox by default.                                           |
| Cursor      | `cursor-agent --sandbox disabled`, or the equivalent Run Everything setting.           |

If `launch` succeeded and a later `doctor` fails `server process is ours`, the sandbox may have ended the server or hidden it from this shell. Tear the run down and launch again outside the sandbox.

## Launch

```bash
.agents/skills/verify-screen-commons/scripts/control.mjs launch --run <id>
```

`--run` is optional, and a generated id is printed otherwise. Ids start with a letter or digit, then use letters, digits, `.`, `_` and `-`, up to 64 characters. A launch takes about 35 seconds and:

1. Creates `/tmp/screen-commons-verify/<id>/` and applies all migrations to an empty D1.
2. Starts `vite dev` on the first free port from 5200, always on `http://localhost:<port>`.
3. Signs up the first account, which becomes the admin, and creates its API key.
4. Renders synthetic screenshots and uploads them with the real `pnpm seed upload` through `/api/v1/captures`. No public site is contacted.
5. Confirms the catalog over REST: 9 web apps, 28 screens, 9 pricing screens and 9 flows.
6. Loads each page group once, signed in, because Vite reloads a page the first time it finds a new dependency.

Step 5 compares the counts with what it uploaded, so a partial seed fails the launch. It is ready when it prints the run as JSON and then `ready at http://localhost:<port>` on stderr, and exits 0. A failed launch tears itself down, prints the reason and exits 1.

Admin sign-in: `admin@screencommons.dev` / `screencommons-admin-2026`. These match the defaults in `apps/web/e2e`.

Shell state does not persist between agent tool calls, so pass `--run <id>` to each command or prefix it with `SC_VERIFY_RUN=<id>`. With exactly one run on the machine, neither is needed.

To stop, see [Cleanup](#cleanup).

## Doctor

```bash
.agents/skills/verify-screen-commons/scripts/control.mjs doctor --run <id>
```

It changes nothing except the admin key's last-used time. Run it first and whenever anything looks off. It exits 1 unless all of these hold: launch finished, the server process is the one this run spawned, this run owns the port, state is disposable, the API answers, the admin key is valid, the catalog is seeded, the remote MCP server lists `search_screens`, the local MCP server's build tool is present, the checked-out revision matches the one launched, and Chromium exists.

A revision mismatch means you changed branch or committed after launching. `vite dev` serves the working tree, so file edits hot-reload on a running instance. Launch again after changing migrations, `wrangler.jsonc` or the Vite config.

`control list` shows every run and whether it is alive. Never drive anything `list` doesn't show.

## Drive

```bash
.agents/skills/verify-screen-commons/scripts/control.mjs drive <journey> --run <id>
```

Shipped journeys are in `journeys/`, one per feature in [`features/README.md`](features/README.md): `mcp-remote`, `mcp-local`, `mcp-package`, `mcp-extension`, `browse`, `search`, `collections`, `contribute`, `api-access`. Read the feature file before driving; it lists the entry points and what proves them. A journey exits 1 on any of these:

- a failed step, or a rejected promise nothing handled;
- a page error or console error on a watched page, meaning an `h.newPage` page or the extension's Options page;
- an HTTP 5xx seen by a watched page, `h.api`, `h.mcp` or `h.remoteMcp`;
- a tool error from `h.call` whose text shows a server failure (see `SERVER_FAILURE` in `control.mjs`);
- `Internal server error` in the dev server's log during the drive, which catches what the watchers can't see, such as the local MCP server's own requests. A parallel drive on the same run can trip this one, so give parallel drives their own runs.

Other failures don't all look like server failures, so assert the exact refusal you expect rather than just `isError`.

A drive that runs past its limit, 300 seconds unless you pass `--timeout <seconds>`, or that gets SIGTERM, fails with its state captured and a `result.json`. A journey stuck in a blocking loop such as `for (;;);` can't be interrupted, because it holds the only thread; stop it from outside with SIGKILL. Steps enter `result.json` when observed, before any assertion on them, so the last step of a failed run may be the one that failed.

For anything the journeys don't cover, write a journey in the scratch location of your choice and drive it by path. Keep it if it proves a mapped feature, and add it to the map.

```js
// /tmp/my-check.mjs, run with: control drive /tmp/my-check.mjs --run <id>
import assert from "node:assert/strict";

export default async function (h) {
  const page = await h.newPage();
  await h.signIn(page); // the admin; h.signUpMember(page) for a new member
  await h.goto(page, "/browse/web?tab=screens");
  await page.locator("main [data-screen-id]").first().waitFor();
  await h.step("screens are listed", page);
  const { status, body } = await h.api("screens?platform=web&limit=1");
  assert.equal(status, 200);
  h.record("the API agrees", body.items[0].title);
}
```

| Helper                                                   | What it does                                                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `h.newPage({ viewport })`                                | Page in a fresh browser context, watched for page errors, console errors and 5xx responses.                                                                            |
| `h.goto(page, path)`                                     | Navigate to a path on this instance and wait for network idle.                                                                                                         |
| `h.signIn(page, creds?, redirect?)`                      | Sign in through the form. Defaults to the admin and `/browse/web`.                                                                                                     |
| `h.signUpMember(page, redirect?, suffix?)`               | Sign up a new member through the form. Returns `{ name, email, password }`. Pass a `suffix` for each further member in one drive, because the default email repeats.   |
| `h.step(label, page)`                                    | Save a screenshot, an ARIA snapshot and the URL as proof.                                                                                                              |
| `h.record(label, data)`                                  | Save a JSON proof and return `data`.                                                                                                                                   |
| `h.sql(label, sql, params?)`                             | Read D1 with a `SELECT` or `WITH`, save the rows as proof and return them as objects.                                                                                  |
| `h.api(path, { token, ...fetchInit })`                   | REST call to `/api/v1/<path>` with the admin key. Pass `token: null` to send none.                                                                                     |
| `h.mcp(method, params, token?)`                          | Raw JSON-RPC call to `/mcp` with the admin key. Returns `{ status, body }`.                                                                                            |
| `h.remoteMcp(token?)`                                    | The SDK's MCP client connected to `/mcp` over Streamable HTTP. Defaults to the admin key.                                                                              |
| `h.localMcp({ label, token, bridgePort, pairingToken })` | The SDK's MCP client connected over stdio to a fresh build of the local server. `token: null` runs it with no key.                                                     |
| `h.packagedMcp({ label, token })`                        | The SDK\'s client over stdio to the production package, packed and installed outside the workspace. Contacts the npm registry. Returns `{ client, manifest, files }`.  |
| `h.call(client, label, tool, args?)`                     | Call a tool and save the result and first image as proof. Returns `{ isError, text, images }`.                                                                         |
| `h.fixtureSite()`                                        | A local site with `/`, `/pricing`, `/signup` and `/docs`, for the browser tools. Returns `{ origin, url(path) }`.                                                      |
| `h.extensionBrowser()`                                   | Chromium with the freshly built extension in a throwaway profile. Returns `{ context, worker, options }`, where `options` is its Options page.                         |
| `h.imageHost(files)`                                     | A local image host: `/file/<name>`, `/short/<name>` (redirects to it), and `/loop`, `/to-ftp`, `/page`, `/huge`, `/endless`, `/hang`. Returns `{ origin, url(path) }`. |
| `h.canvasImage({ width, height, type, noise })`          | A unique image from Chromium's canvas, 1920×1320 WebP by default. `noise` makes it incompressible. Returns a Buffer.                                                   |
| `h.freePort()`                                           | An unused local port, such as for the extension bridge.                                                                                                                |
| `h.r2()`                                                 | Every key in the instance's R2 bucket.                                                                                                                                 |
| `h.pngs(labels)`                                         | 1440×900 PNG files with unique bytes, for `setInputFiles`.                                                                                                             |
| `h.base`, `h.admin`, `h.adminKey`, `h.stamp`             | Instance origin, admin credentials, admin API key, and a suffix unique to this drive.                                                                                  |

Prefer the handles in the feature files. The app has ARIA names throughout, plus `data-screen-id` on tiles. Query D1 and R2 from the shell with:

```bash
.agents/skills/verify-screen-commons/scripts/control.mjs sql "SELECT status, count(*) AS n FROM screen GROUP BY status" --run <id>
.agents/skills/verify-screen-commons/scripts/control.mjs r2 --run <id>
```

`sql` and `h.sql` accept one read-only `SELECT` or `WITH` statement, and refuse multiple statements or any write keyword outside strings and comments, even as an alias. Quote an identifier that clashes, such as `"begin"`. This guards against mistakes rather than being a sandbox; the database is a throwaway either way.

Call either MCP server by hand, with the same real client the journeys use:

```bash
.agents/skills/verify-screen-commons/scripts/control.mjs mcp remote tools --run <id>
.agents/skills/verify-screen-commons/scripts/control.mjs mcp local call search_screens '{"query":"billed yearly"}' --run <id>
```

To point an actual agent at the run, `control mcp-config --client <claude|cursor|codex|opencode> --run <id>` prints both servers in that agent's own config format: JSON for all but Codex, which takes TOML for `config.toml`. It defaults to `claude`. It contains the run's admin key, which dies with the run, and scratch `HOME` and config directories. Each drive and `mcp local` rebuilds the same per-run build the config points at, so restart that agent's server if a tool misbehaves after one. Use it for exploration: the journeys are the proof.

The repo's own regression suite runs against this instance unchanged. It adds full keyboard coverage:

```bash
E2E_BASE_URL=http://localhost:<port> pnpm --filter @screen-commons/web test:e2e
```

Not covered by this skill's harness:

- The extension's own capture UI, tray and uploads (`apps/extension`). `pnpm --filter @screen-commons/extension test:e2e` loads the real extension but against a mock API and bridge. The `mcp-extension` journey does prove its bridge path against a real instance.
- Real agents such as Claude Code, Codex, OpenCode or Cursor as the MCP client. The journeys use the official MCP SDK client, so the protocol is proven but an agent's own config handling and tool selection are not.
- Deployed environments, and the package as published on npm. `mcp-package` proves the packed tarball, but a release is checked by hand with `npx -y screen-commons-mcp@<version>` against a run. Deployments are out of scope; the `cf:*` scripts change real Cloudflare resources.

## Evidence

Each drive writes to `test-results/verify/<run>/<journey>-<stamp>/` under the repo root. That path is gitignored and survives teardown. It holds numbered `*.png`, `*.aria.txt` and `*.json` files, `NN-failure.*` for every open page when a journey fails, and `result.json` with the pass or fail result, revision, every step and any problems. Teardown adds `test-results/verify/<run>/server.log`.

A proof is only good if it meets these standards:

- **Real user path.** Use the form, button or shortcut a user would. Don't call a server function, set a store or use a test-only header. `SCREEN_COMMONS_TEST_FAULTS` is deliberately off here.
- **Action and result.** Call `h.step` after each action, not only at the end. Read the screenshots; a passing step only proves the selector matched.
- **Side effects too.** Back up what's visible with a second view: a REST read, `h.sql`, or a media fetch. For example, a submitted flow needs its `pending` row, its REST status and the WebP served from R2.
- **Every mapped entry point.** A proof through one convenient path is incomplete when the feature file lists others. Report unscripted entry points as skipped.
- **Real MCP client.** Prove MCP behavior with `h.remoteMcp` or `h.localMcp`, not `h.mcp`. Use raw JSON-RPC only for what a client hides, such as HTTP status codes.
- **One format.** The remote and local servers must answer the same catalog call with the same text and images. `mcp-local` compares them, so never loosen that to parse each separately.
- **No new mocks.** The only substitutes here are the seed's synthetic images and the local fixture site for browser tools, both of which go through the real upload pipeline.
- **Attach, don't assert.** When reporting, give the journey's `result.json` path and the screenshots that show the outcome.

## Cleanup

```bash
.agents/skills/verify-screen-commons/scripts/control.mjs teardown --run <id>
```

This kills only the process group the run spawned, including any member that outlived the server, and leaves a reused pid alone. It copies `server.log` to the evidence directory, then deletes `/tmp/screen-commons-verify/<id>/`, `apps/web/node_modules/.vite-verify-<id>` and `packages/mcp/node_modules/.verify-<id>`. It prints `stopped` and `portFree`, and both should be `true`. `/tmp/screen-commons-verify/` and its `.ports` directory stay so concurrent launches can share them; a claim left by a killed launch is reclaimed by the next launch that wants the port. Evidence is kept; delete `test-results/verify/` by hand when you no longer need it. Never kill by process name, because the developer's own server may be running.

If an agent died mid-run, `control list` shows what's left, and `teardown --run <id>` cleans it up.

## Isolation

Any number of runs can sit side by side, up to the 40 ports from 5200. Each has its own D1, R2, auth secret and Vite cache, and shares only the source tree. Don't run two agents' edits against one working tree and treat either result as proof. Use a git worktree per agent, with its own `pnpm install`; its evidence then lives in that worktree, so copy it out before removing the worktree.

## Gotchas

- Use `http://localhost:<port>`, never `127.0.0.1`. Auth cookies and trusted origins are bound to `APP_URL`.
- The seeded apps have real names (Linear, Vercel and so on) but synthetic screenshots. Never treat them as real captures. A site's `/signup` page is only seeded when its catalog entry lists one.
- The first account is the admin, and launch has already created it, so every sign-up during a run is a member.
- The local MCP server is built into `packages/mcp/node_modules/.verify-<id>`, not `dist/`, so a drive never replaces your `dist/` build. Each drive rebuilds it, so edits to `packages/mcp` are picked up.
- `mcp-extension` rebuilds `apps/extension/.output/chrome-mv3`, the same path a manual `build:chrome` uses, then loads its own copy. Parallel drives take turns building. Reload the extension if you have that build loaded in your own browser.
- A dev server error shows up on every open page as a `vite-error-overlay`, which blocks clicks. If clicks start timing out on an element the log calls visible, read `server.log` and launch a fresh instance.
- On NixOS, workerd can't find the system CA bundle, so a real `https` URL fails on the remote server with `Could not connect` while `TLS peer's certificate is not trusted` goes to `server.log`. Launch with `SSL_CERT_FILE=/etc/ssl/certs/ca-bundle.crt` for a manual check. The shipped journeys only use local hosts, so they don't need it.
- The server keeps its data until teardown, and journeys don't clean up after themselves. Each one uses `h.stamp` names so they can repeat on one instance, so don't assert exact catalog totals after a writing journey has run.
