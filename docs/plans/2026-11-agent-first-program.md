# Agent-first Screen Commons plan

This program makes MCP, the CLI, and installable skills the complete way to use Screen Commons. A fresh agent answers "How does Spotify let users create a playlist?" from the published catalog, inspects the real images, and writes a sourced reference bundle. The same agent can log in, contribute with searchable text, track its contributions, and moderate if it is an admin, with one browser approval at most. Cloudflare stays the only backend, on the free plan. Every new call has bounded D1 reads and a measured row count.
PR ids in order are SC-01 to SC-16. SC-15 is the product's main deliverable. The others are the parts it relies on.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-full.md`. The operator granted merges on 2026-11-10. Owners build every PR to green at its head, an independent verifier proves it, and then the root merges it. A merge to `main` deploys production through `.github/workflows/ci.yml`, so each merge waits for that deploy to pass before the next one. SC-12, SC-14, and SC-15 post their screenshots and video to the operator in chat, and do not wait for a reply.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [x] State the protocol and this plan to the operator. The operator gave the go on 2026-11-10.
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:.agents/skills/verify-screen-commons/SKILL.md`
  - [ ] `git show origin/main:apps/web/content/docs/contributing.md`
  - [ ] `/home/zxcv/.claude/plugins/cache/cursor-plugins/pstack/0.15.36/skills/poteto-mode/playbooks/autopilot-stack.md` and the `autopilot-full.md` it extends
  - [ ] `/home/zxcv/.claude/plugins/cache/cursor-plugins/pstack/0.15.36/skills/swarm/SKILL.md`
  - [ ] `/home/zxcv/.claude/plugins/marketplaces/cursor-plugins/cursor-team-kit/skills/control-cli/SKILL.md` and `control-ui/SKILL.md`
  - [ ] `/home/zxcv/.claude/plugins/cache/cursor-plugins/pstack/0.15.36/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] The leaf skills this program cites in Appendix D.
- [ ] Publish the pending Spotify content the operator approved on 2026-11-09. The operator approved this production write on 2026-11-09 and 2026-11-10. It needs an admin key from the operator.
  - [ ] Write a throwaway lever in the session scratchpad. For each of the 317 flow ids in `/tmp/sc-evidence/prod-spotify/publish1.json`, it reads the flow as admin and posts `{"decision":"approve"}` to `/api/v1/review/flow/<id>` only when the status is `pending`. It throttles to one call per 300 ms, retries 5xx with backoff, stops on `unavailable`, and appends each result to a log so a rerun skips finished ids.
  - [ ] Read the admin key from `~/.config/screen-commons/prod-secrets.json` into an environment variable without printing it.
  - [ ] Run the same lever over the 1,150 screen ids. Expect zero writes, because approving a flow publishes its screens.
  - [ ] Check with a key that did not contribute. `GET /api/v1/apps/spotify` reports 317 flows and 1,150 screens, and `search_flows {"app":"spotify","query":"playlist"}` returns published flows. Save the JSON to the evidence folder.
  - [ ] Comment on ADS-387 with the decision, counts, call count, and evidence path. Move ADS-387 to Done. Remove ADS-381 and ADS-382 as its blockers and note that both stay open as SC-01 and SC-14.
- [ ] Reconcile Linear before the first owner starts.
  - [ ] Create the ADR document from Appendix E under project 47d9d858. Append a section to roadmap document e92fb97d that links it and this program's order.
  - [ ] Create the new issues named in Appendix F. Comment the narrowed scope on each existing issue Appendix F maps. Change no other status. Keep ADS-380 Canceled.
- [ ] On the operator's go, arm the audit tick as `/loop 1h` with the tick prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names. Use `subagent_type: "pstack:poteto-agent"`. Give SC-04, SC-12, and SC-15 to `opus` at `xhigh`. Give the rest to `opus` at `high`.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] SC-01, SC-02, SC-06, SC-08, SC-09, SC-10, SC-12, SC-13, and SC-14 are independent and first. All branch from `main`.
  - [ ] SC-03 after SC-02.
  - [ ] SC-04 after SC-03.
  - [ ] SC-05 and SC-07 after SC-04.
  - [ ] SC-11 after SC-08.
  - [ ] SC-15 after SC-04, SC-05, SC-06, SC-07, SC-08, SC-09, SC-11, and SC-12.
  - [ ] SC-16 after SC-12 and SC-15.
- [ ] Hold the file boundaries.
  - [ ] SC-04 and SC-05 own `apps/web/src/server/services/catalog.ts` and `packages/db/src/index.ts`. Nobody else edits them.
  - [ ] SC-08 and SC-11 own `packages/core/src/schemas.ts` update schemas and `apps/web/src/server/services/contributions.ts`.
  - [ ] SC-12 owns `apps/web/src/server/keys.ts`, `apps/web/src/server/principal.ts`, and `packages/mcp/src/config.ts`.
  - [ ] Every PR that adds a migration takes the next free number at rebase time under `packages/db/migrations/`.
  - [ ] Only SC-15 and SC-16 edit `apps/web/content/docs/*.md` and `packages/mcp/README.md`.
- [ ] Post the screenshots and video of SC-12, SC-14, and SC-15 to the operator in chat at merge. The operator waived the wait on 2026-11-10.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**. Use `gh pr create --base <base-branch>`. A stack child targets its parent branch.
- [ ] Run `pnpm check` once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`. Skipped in Claude Code when the PR has no Bugbot check.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, on a CI failure that comes from a change on trunk, or when a known concurrent change to the same files lands.
- [ ] End every commit message with the attribution line from the session's system reminder.

### Verdict and merge, for every PR

- [ ] A full swarm runs once, at the code-ready head. Another full swarm runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head, and a wording-only change gets none. Run each full swarm per `pstack/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. Two or more audit lanes, each with its own focus, that read the diff and the receipts and distrust the PR body. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Judge every finding by the execution playbook's blocking rule. The verdict is clean when none blocks. A failure on trunk behavior in a lane marked `Regression lane against trunk.` is recorded against trunk and does not block the PR. A new head gets a fresh verdict, except for results that stay valid under the patch-id rule in `playbooks/shipping.md`.
- [ ] Merge each PR once it is verified and green, in dependency order. A restack that leaves a PR's `git patch-id` unchanged keeps its verdict. Any other new head gets a fresh verdict.

### Boot recipe, for every live lane

Each live lane runs in its own git worktree at the PR head, because Claude Code has no cloud VMs. Drive the CLI through `control-cli`, the web UI through `control-ui`, and MCP through `control mcp`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Run `pnpm install`, then `.agents/skills/verify-screen-commons/scripts/control.mjs launch --run <pr-id>-w<n>`. Wait for `ready at http://localhost:<port>`. From SC-03 on, also run `control seed spotify-shape --run <pr-id>-w<n>`.
- [ ] Deliver input only through `control-cli`, `control-ui`, `control mcp`, and `control agent` (from SC-02). Read-only diagnostics are `control doctor`, `control sql`, `control r2`, and the D1 row counter from SC-02.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report. Tear the run down with `control teardown --run <pr-id>-w<n>`.

## Hide SQL and stack traces from public error responses (SC-01)

**Depends on.** None.

**Files.**

- [ ] Edit `apps/web/src/server/errors.ts`.
- [ ] Edit the root error boundary in `apps/web/src/routes/__root.tsx`.
- [ ] Edit `apps/web/tests/regressions.test.ts`.

**Build.**

- [ ] Map every non-`ApiError` thrown in a server function, server route, or SSR loader to a generic `internal` response. Log the full error server side with a request id and return only that id.

**You see.**

- [ ] With D1 broken, an anonymous `GET /` and `GET /api/v1/apps` return a body that contains `internal` and a request id. The body contains no `SELECT`, no SQL parameter, and no stack frame. The server log holds the full error under the same id.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `regressions.test.ts` gains "a database failure returns a generic error with no SQL", which drops a table and asserts the HTML, the serialized SSR payload, and the JSON body. Run `pnpm --filter web test -- regressions`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Rename table `user` with `control sql`, then load `/` anonymously at trunk and at head. Save `home-error.png`. Pass when trunk shows SQL and head shows only the generic message and request id.
- [ ] Lane 2. Rename table `screen` and call `GET /api/v1/screens` with a key. Save `api-error.png`. Pass when the JSON has code `internal`, a request id, and no SQL.
- [ ] Lane 3. Rename table `flow` and call `search_flows` through `control mcp remote`. Save `mcp-error.png`. Pass when the tool error text has no SQL.
- [ ] Lane 4. Break D1 and load `/sign-in`. Save `signin-error.png`. Pass when the page renders the generic error without the user-count query.
- [ ] Lane 5. Read the server log for the lane 2 request id. Save `log.png`. Pass when the log line holds the SQL and the same id.
- [ ] Lane 6. Request a missing screen id with a healthy D1. Save `not-found.png`. Pass when the response is still `not_found` with its normal message.
- [ ] Lane 7. Send an invalid body to `POST /api/v1/screens`. Save `bad-request.png`. Pass when validation details still appear.
- [ ] Lane 8. Run `screen-commons screens list` through `control-cli` against the broken instance. Save `cli-error.png`. Pass when the CLI exits 5 and prints no SQL.
- [ ] Lane 9. View the page source of the lane 1 head response in `control-ui`. Save `ssr-payload.png`. Pass when the dehydrated payload has no SQL or stack.
- [ ] Lane 10. Restore the tables and run the `search` journey. Save `healthy.png`. Pass when the journey exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Median latency of a healthy anonymous `GET /` and a healthy `GET /api/v1/apps`, over 50 requests each.
- [ ] Probe. Alternate trunk and head instances request by request with `curl -w %{time_total}`.
- [ ] Baseline. Record the trunk medians first.
- [ ] Rule. Fail when a head median exceeds trunk by more than 10 percent.

**Review gate.** None. SC-01 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-01. Close ADS-381 with the lane 1 screenshots.

## Add a real-agent journey and a D1 row counter to the verify skill (SC-02)

**Depends on.** None.

**Files.**

- [ ] Edit `.agents/skills/verify-screen-commons/scripts/control.mjs`.
- [ ] Edit `.agents/skills/verify-screen-commons/SKILL.md`.
- [ ] Edit `apps/web/src/server/env.ts`.
- [ ] Create `.agents/skills/verify-screen-commons/journeys/agent.mjs`.

**Build.**

- [ ] Add `control agent --client claude|codex --prompt <text> --run <id>`. It writes the client's MCP config from `commandMcpConfig` into a scratch HOME, runs `claude -p` or `codex exec` with only Screen Commons tools allowed, and saves the transcript, every tool call, and the final answer to the run folder.
- [ ] Wrap the D1 binding in `getDb` so that, when `SC_D1_COUNTER=1` is set in the disposable instance only, each response carries `x-sc-d1-rows` with the sum of `meta.rows_read` and `meta.rows_written`. Production never sets the variable.

**You see.**

- [ ] `control agent --client claude --prompt "How does Fixture Tunes let users create a playlist?"` prints the transcript path. The transcript shows the agent calling `search_flows`, then `get_flow`. Every API response on the instance carries `x-sc-d1-rows`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/web/tests/api.test.ts` gains "counts D1 rows when the counter is on and omits the header when off". Run `pnpm --filter web test -- api`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no `control agent`. Record that, then run `drive cli` and `drive mcp-remote` at head. Save `journeys.png`. Pass when both exit 0 at head.
- [ ] Lane 2. Run `control agent --client claude` with the playlist question. Save `claude-transcript.png`. Pass when the transcript shows `search_flows` and `get_flow` calls made by the agent.
- [ ] Lane 3. Run `control agent --client codex` with the same prompt. Save `codex-transcript.png`. Pass when the same two calls appear.
- [ ] Lane 4. Run `control agent` with no agent binary on PATH. Save `missing-agent.png`. Pass when it exits 1 with the install hint.
- [ ] Lane 5. Call `GET /api/v1/screens?limit=5` with the counter on. Save `counter-header.png`. Pass when `x-sc-d1-rows` is present and positive.
- [ ] Lane 6. Run the same SQL through `wrangler d1 execute --local --json` and compare. Save `counter-truth.png`. Pass when the header equals the reported rows.
- [ ] Lane 7. Start the instance without `SC_D1_COUNTER`. Save `counter-off.png`. Pass when no response has the header.
- [ ] Lane 8. Check that the scratch HOME holds the MCP config and the real HOME is unchanged. Save `home-isolation.png`. Pass when `~/.claude.json` and `~/.codex` hashes match before and after.
- [ ] Lane 9. Kill the agent mid-run. Save `agent-killed.png`. Pass when `result.json` records the partial transcript and exit status.
- [ ] Lane 10. Run `control doctor`. Save `doctor.png`. Pass when every check passes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Median latency of `GET /api/v1/screens?limit=12` with the counter on and off. Trunk lacks the counter, so also budget the head with the counter on.
- [ ] Probe. Alternate 50 requests between trunk, head with the counter off, and head with it on.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Fail when head with the counter off exceeds trunk by more than 5 percent, or when the counter on adds more than 5 ms per request.

**Review gate.** None. SC-02 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-02.

## Add a judged search eval that records the current baseline (SC-03)

**Depends on.** SC-02.

**Files.**

- [ ] Create `.agents/skills/verify-screen-commons/fixtures/spotify-shape.json` with the 317 production flow names and step counts from `/tmp/sc-evidence/prod-spotify/manifest.json`, plus the Fixture Tunes, Vercel, Linear, and Stripe decoys from the prototype.
- [ ] Create `.agents/skills/verify-screen-commons/eval/search-cases.json` with the 34 prototype queries split into tuning and holdout sets.
- [ ] Create `.agents/skills/verify-screen-commons/journeys/search-eval.mjs`.
- [ ] Edit `.agents/skills/verify-screen-commons/scripts/control.mjs` to add `control seed spotify-shape`.

**Build.**

- [ ] `control seed spotify-shape` uploads the fixture with synthetic images through `screen-commons manifest publish`, then approves it as admin.
- [ ] `control drive search-eval` runs each case through REST `search_flows` and `search_screens` and scores hit at 1, hit at 3, correct app-not-found, and wrong-app answers. It also records `x-sc-d1-rows` per call and writes `eval.json` plus a table.

**You see.**

- [ ] At trunk the eval prints the current baseline, for example 1 hit at 1 out of 17 tuning queries with 13 wrong-app answers. The command exits 0, because SC-03 records the baseline and gates nothing.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `.agents/skills/verify-screen-commons/eval/score.test.mjs` checks the scorer on hand-written result lists. Run `node --test .agents/skills/verify-screen-commons/eval`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no eval. Record that, then run `drive search` at head. Save `search-journey.png`. Pass when it exits 0.
- [ ] Lane 2. Run `control seed spotify-shape`. Save `seed.png`. Pass when `control sql` counts 317 published Spotify flows.
- [ ] Lane 3. Run `drive search-eval`. Save `eval-table.png`. Pass when it writes `eval.json` with every case scored.
- [ ] Lane 4. Run the eval twice. Save `eval-repeat.png`. Pass when both runs score the same.
- [ ] Lane 5. Run the seed twice. Save `seed-repeat.png`. Pass when the counts are unchanged.
- [ ] Lane 6. Compare the eval's literal-question result with the prototype's CURRENT variant. Save `proto-parity.png`. Pass when the top results match.
- [ ] Lane 7. Check `eval.json` for row counts. Save `rows.png`. Pass when every call has a row count.
- [ ] Lane 8. Run the eval without `SC_D1_COUNTER`. Save `no-counter.png`. Pass when it scores and marks rows as unavailable.
- [ ] Lane 9. Run the holdout split only. Save `holdout.png`. Pass when it reports the holdout separately.
- [ ] Lane 10. Run `control doctor` after seeding. Save `doctor.png`. Pass when every check passes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `control seed spotify-shape` and of the full eval. Trunk lacks both, so these are absolute budgets.
- [ ] Probe. Run each three times on a fresh instance and take the median.
- [ ] Baseline. Record the trunk wall time of `control launch` first, so the seed time is read against the existing launch cost.
- [ ] Rule. Fail when the seed takes more than 120 seconds or the eval takes more than 60 seconds.

**Review gate.** None. SC-03 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-03. Attach the baseline `eval.json` to ADS-241.

## Rank and normalize screen and flow search, and report app matches (SC-04)

**Depends on.** SC-03.

**Files.**

- [ ] Create `packages/core/src/search-query.ts` with the pure query planner.
- [ ] Edit `packages/db/src/index.ts` (`ftsQuery`).
- [ ] Edit `apps/web/src/server/services/catalog.ts` (`ftsModes`, `withFtsFallback`, `listScreens`, `listFlows`).
- [ ] Edit `packages/core/src/api.ts` and `packages/core/src/mcp.ts` for the `match` field.
- [ ] Edit `apps/web/src/server/http/mcp.ts` and `packages/mcp/src/catalog.ts` to render `match` in tool text.
- [ ] Edit `.agents/skills/verify-screen-commons/eval/thresholds.json` to turn the eval into a gate.

**Build.**

- [ ] `planSearchQuery(text)` returns typed terms. Each term holds its prefix stem after the stopword list and suffix rule from Appendix A, plus app candidates found by the capitalization and "does X let" patterns.
- [ ] With a query, `listScreens` and `listFlows` order by `bm25` (flow name 10, type 3, description 0, app name 0) and page by a (rank, id) cursor. Without a query they keep the latest and popular order.
- [ ] An app candidate that matches a visible app name or host label becomes a required `app_id` filter. A candidate that matches no app and no indexed word returns its results with `match.appNotFound`.
- [ ] Relaxation keeps the app filter and fills under three strict results with partial matches ordered by matched terms, then rank.
- [ ] Every page carries `match = { mode, app, appNotFound, matchedTerms, unmatchedTerms }` on REST, in MCP structured content, as one line of MCP text, and in CLI JSON.

**You see.**

- [ ] `search_flows {"query":"How does Spotify let users create a playlist?"}` on the spotify-shape fixture returns "Creating a playlist" from Spotify first, with `match.mode` `strict` and `match.app` `spotify`. The same question about Netflix returns `match.appNotFound` `Netflix` and no Spotify or Fixture Tunes flow above it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/search-query.test.ts` covers stopwords, stems, and app candidates from the prototype's detect probes. `apps/web/tests/api.test.ts` gains rank order, app filter, app-not-found, and cursor stability across two pages. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `drive search-eval` at trunk and head. Save `eval-compare.png`. Pass when head reaches at least 12 hit-at-1 or correct app-not-found answers on the 17 tuning queries and at least 10 on the holdout, with no wrong-app top result.
- [ ] Lane 2. Ask the literal Spotify question through `control mcp remote call search_flows`. Save `spotify-literal.png`. Pass when "Creating a playlist" is first.
- [ ] Lane 3. Ask the Netflix question. Save `netflix.png`. Pass when `match.appNotFound` is `Netflix`.
- [ ] Lane 4. Search `create playlist` with no app. Save `short-query.png`. Pass when results are ordered by rank and both apps' playlist flows appear.
- [ ] Lane 5. Page through `search_flows {"query":"playlist","limit":5}` to the end. Save `paging.png`. Pass when no id repeats or goes missing compared with one large page.
- [ ] Lane 6. Search with no query and `sort=latest`. Save `no-query.png`. Pass when the order equals trunk's.
- [ ] Lane 7. Run `screen-commons flows search "How does Spotify let users create a playlist?"` through `control-cli`. Save `cli.png`. Pass when the JSON has `match` and the same first result.
- [ ] Lane 8. Run the same query on local stdio MCP. Save `local-mcp.png`. Pass when the text equals the remote text.
- [ ] Lane 9. Search `search_screens {"query":"pricing toggle"}` on the default seed. Save `screens.png`. Pass when the pricing screens rank above the others.
- [ ] Lane 10. Run `control agent --client claude` with the literal question. Save `agent.png`. Pass when the agent's final answer cites the Spotify flow id and no Fixture Tunes id.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. D1 rows read per search call from `x-sc-d1-rows`, and median latency, over the 34 eval queries.
- [ ] Probe. Run the eval on trunk and head instances seeded identically, alternating query by query.
- [ ] Baseline. Record trunk's median and 95th percentile rows per call first.
- [ ] Rule. Fail when head's median rows per call exceeds trunk's, or head's 95th percentile exceeds twice trunk's, or median latency rises by more than 20 percent.

**Review gate.** None. SC-04 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-04.

## Index flow step labels and screen titles in flow search (SC-05)

**Depends on.** SC-04.

**Files.**

- [ ] Create `packages/db/migrations/0006_flow_fts_steps.sql`.
- [ ] Edit `apps/web/src/server/services/catalog.ts` bm25 weights.
- [ ] Edit `apps/web/tests/api.test.ts`.

**Build.**

- [ ] Rebuild `flow_fts` with a `steps` column that holds every step label and step screen title in order. Triggers on `flow_step` insert, update, and delete, and on `screen` title update, keep it current. The migration backfills existing flows.
- [ ] Weight `steps` at 5 in `bm25`.

**You see.**

- [ ] On the default seed, `search_flows {"query":"plus button"}` returns the Fixture Tunes playlist flow, whose only match is the step label "Tap the plus button".

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `api.test.ts` gains "finds a flow by a step label", "reindexes after a step edit", and "drops a removed step from the index". Run `pnpm --filter web test -- api`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Search `plus button` at trunk and head. Save `step-label.png`. Pass when trunk returns nothing and head returns the flow.
- [ ] Lane 2. Apply migrations to a copy of a trunk-seeded D1. Save `migrate.png`. Pass when `flow_fts` row count equals the flow count.
- [ ] Lane 3. Edit a step label with `screen-commons flows update --step`. Save `label-edit.png`. Pass when the new label finds the flow and the old one does not.
- [ ] Lane 4. Retitle a step screen with `screens update --title`. Save `title-edit.png`. Pass when the new title finds the flow.
- [ ] Lane 5. Delete a screen that is a step. Save `step-delete.png`. Pass when its title no longer finds the flow.
- [ ] Lane 6. Rerun `drive search-eval`. Save `eval.png`. Pass when no tuning or holdout score drops below SC-04's.
- [ ] Lane 7. Publish a manifest with labeled steps twice. Save `replay.png`. Pass when `flow_fts` has one row per flow.
- [ ] Lane 8. Search a Spotify flow by its name. Save `name-still-wins.png`. Pass when a name match outranks a label-only match.
- [ ] Lane 9. Run `drive mcp-remote`. Save `mcp-journey.png`. Pass when it exits 0.
- [ ] Lane 10. Run `drive cli`. Save `cli-journey.png`. Pass when it exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. D1 rows written while publishing the spotify-shape manifest, and rows read per eval query.
- [ ] Probe. Publish the fixture and run the eval on trunk-plus-SC-04 and head, alternating.
- [ ] Baseline. Record SC-04's rows written and rows read first.
- [ ] Rule. Fail when publish rows written rise by more than 25 percent or median rows read per query rise by more than 10 percent.

**Review gate.** None. SC-05 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-05.

## Write reference bundles from the CLI (SC-06)

**Depends on.** None.

**Files.**

- [ ] Create `packages/core/src/bundle.ts` with `referenceBundleSchema`.
- [ ] Edit `packages/mcp/src/cli.ts` to add `flows bundle` and `screens bundle`.
- [ ] Edit `packages/mcp/test/cli.test.ts`.

**Build.**

- [ ] `screen-commons flows bundle <id> --out <dir>` reads the flow once and downloads each step image. It writes `bundle.json`, `REFERENCES.md`, and `images/<position>-<screenId>.webp`. `screens bundle <id>...` does the same for loose screens.
- [ ] Each step records id, position, label, title, catalog URL, image URL, local path, sha256, width, height, source URL, captured time, app, and contributor. Pending items carry a `pending_content` warning.
- [ ] A rerun skips images whose sha256 already matches and writes through a temp path and rename.

**You see.**

- [ ] `screen-commons flows bundle <fixture-tunes-flow> --out /tmp/b` prints the bundle path. `REFERENCES.md` lists four steps in order, each with a local image and a catalog link.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `cli.test.ts` gains "writes a valid bundle", "reruns without downloading again", and "flags pending content". Run `pnpm --filter screen-commons-mcp test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no bundle command. Record that, then compare head's bundle with the assessment's hand-built bundle in `/tmp/screen-commons-agent-assessment-20261109/reference-bundle-fixture-tunes-create-playlist/`. Save `bundle-vs-hand.png`. Pass when every step id and image hash matches.
- [ ] Lane 2. Bundle a flow through `control-cli`. Save `bundle.png`. Pass when `bundle.json` parses with `referenceBundleSchema`.
- [ ] Lane 3. Rerun the same bundle. Save `rerun.png`. Pass when no image downloads again.
- [ ] Lane 4. Kill the command after two images, then rerun. Save `resume.png`. Pass when the result equals a clean run.
- [ ] Lane 5. Bundle a pending flow as its contributor. Save `pending.png`. Pass when the warning is present.
- [ ] Lane 6. Bundle a flow you cannot see. Save `forbidden.png`. Pass when the CLI exits 4 and writes nothing.
- [ ] Lane 7. Bundle three screens. Save `screens.png`. Pass when all three images and links are present.
- [ ] Lane 8. Open `REFERENCES.md` in `control-ui`. Save `references.png`. Pass when every image renders from its local path.
- [ ] Lane 9. Bundle into a folder that holds another bundle. Save `collision.png`. Pass when the CLI refuses without `--force`.
- [ ] Lane 10. Ask `control agent --client claude` to save references for the playlist flow. Save `agent.png`. Pass when the agent runs `flows bundle` and cites the folder.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. D1 rows read and wall time per bundle of a 5-step flow. Trunk lacks the command, so compare with the assessment's manual sequence of `flows get` plus five `screens download` calls.
- [ ] Probe. Alternate the manual sequence and `flows bundle` ten times each on one instance.
- [ ] Baseline. Record the manual sequence's rows and time first.
- [ ] Rule. Fail when the bundle reads more rows than the manual sequence or takes more than 10 seconds.

**Review gate.** None. SC-06 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-06.

## Serve the research prompts from both MCP servers (SC-07)

**Depends on.** SC-04.

**Files.**

- [ ] Create `packages/core/src/prompts.ts` with `PromptSpec` entries for `find_inspiration` and `research_flow`.
- [ ] Edit `packages/mcp/src/prompts.ts` to register the shared specs and keep `capture_site` local.
- [ ] Edit `apps/web/src/server/http/mcp.ts` (`createServer`) to call `registerPrompt` for the shared specs.
- [ ] Edit `apps/web/tests/mcp.test.ts`.

**Build.**

- [ ] `research_flow {question}` tells the agent to resolve the app with `list_apps`, read `match.appNotFound`, call `search_flows` with the app, open images with `get_flow`, and cite ids. It never offers another app as the answer.

**You see.**

- [ ] `control mcp remote prompts` lists `find_inspiration` and `research_flow`. Local stdio lists those two plus `capture_site`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `mcp.test.ts` gains "lists the shared prompts" and "renders research_flow with its question". Run `pnpm --filter web test -- mcp`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. List remote prompts at trunk and head. Save `prompts.png`. Pass when trunk lists none and head lists two.
- [ ] Lane 2. Get `research_flow` remotely and locally. Save `parity.png`. Pass when both texts are equal.
- [ ] Lane 3. Run `capture_site` locally. Save `capture-local.png`. Pass when it still renders.
- [ ] Lane 4. Check that remote does not list `capture_site`. Save `no-capture.png`. Pass when it is absent.
- [ ] Lane 5. Run `control agent --client claude` with the `research_flow` prompt for Spotify. Save `agent-spotify.png`. Pass when the answer cites the Spotify flow.
- [ ] Lane 6. Run the prompt for Netflix. Save `agent-netflix.png`. Pass when the agent says Netflix is not in the catalog and names no other app's flow as the answer.
- [ ] Lane 7. Call every catalog tool remotely after the change. Save `tools.png`. Pass when the tool list equals trunk's.
- [ ] Lane 8. Get the prompt with no question. Save `missing-arg.png`. Pass when the server returns an argument error.
- [ ] Lane 9. Run `drive mcp-remote`. Save `mcp-remote.png`. Pass when it exits 0.
- [ ] Lane 10. Run `drive mcp-local`. Save `mcp-local.png`. Pass when it exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Median latency of a remote `initialize` plus `tools/list` round trip, which the stateless server repeats per request.
- [ ] Probe. Alternate 50 round trips between trunk and head.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Fail when head exceeds trunk by more than 10 percent.

**Review gate.** None. SC-07 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-07.

## Carry screen text through manifests, uploads, and updates (SC-08)

**Depends on.** None.

**Files.**

- [ ] Edit `packages/core/src/manifest.ts` (`manifestScreenSchema`).
- [ ] Edit `packages/core/src/schemas.ts` (`updateScreenInputSchema`).
- [ ] Edit `packages/core/src/mcp.ts` (`upload_screen`, `update_screen`).
- [ ] Edit `packages/mcp/src/publish.ts` (`publishManifest`, `screenPatch`).
- [ ] Edit `packages/mcp/src/cli.ts` (`upload`, `screens update`).
- [ ] Edit `packages/core/src/manifest.test.ts`, `packages/mcp/test/publish.test.ts`, and `packages/mcp/test/cli.test.ts`.

**Build.**

- [ ] Add optional `text` (20,000 characters at most) to manifest screens, `upload_screen`, `update_screen`, `screens update --text`, and `upload --text` or `--text-file`. Keep manifest `version` 1, because the field is optional and old manifests stay valid.
- [ ] A manifest republish patches `text` the way it patches `title` today.

**You see.**

- [ ] `screen-commons upload shot.png --app demo --text "Blend Invite friends"` returns a screen that `search_screens {"query":"Blend"}` finds for the contributor.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Manifest, publish, and CLI tests gain the text cases, including a republish that changes only text. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Publish a manifest whose screen has `text` at trunk and head. Save `manifest-text.png`. Pass when trunk rejects it and head publishes it.
- [ ] Lane 2. Search the in-image phrase as the contributor. Save `search-text.png`. Pass when the screen is found.
- [ ] Lane 3. Republish with changed text. Save `republish.png`. Pass when the new phrase matches and the old one does not, with the same screen id.
- [ ] Lane 4. Run `upload --text-file` through `control-cli`. Save `cli-upload.png`. Pass when the text is stored.
- [ ] Lane 5. Call `upload_screen` by URL with `text` on remote MCP. Save `mcp-upload.png`. Pass when the text is stored.
- [ ] Lane 6. Run `screens update --text` on a screen you own. Save `update.png`. Pass when the search result changes.
- [ ] Lane 7. Send 20,001 characters. Save `too-long.png`. Pass when the CLI exits 2 with a validation message.
- [ ] Lane 8. Publish the old assessment manifest with no text. Save `old-manifest.png`. Pass when it publishes unchanged.
- [ ] Lane 9. Search the phrase as another member before review. Save `pending-hidden.png`. Pass when nothing is returned.
- [ ] Lane 10. Run `drive cli`. Save `cli-journey.png`. Pass when it exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time and D1 rows written to publish a 50-screen manifest without text.
- [ ] Probe. Alternate three publishes on fresh trunk and head instances.
- [ ] Baseline. Record trunk's median first.
- [ ] Rule. Fail when head exceeds trunk by more than 10 percent on either number.

**Review gate.** None. SC-08 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-08.

## List your own contributions from REST, MCP, and the CLI (SC-09)

**Depends on.** None.

**Files.**

- [ ] Create `apps/web/src/routes/api/v1/me.contributions.ts`.
- [ ] Edit `apps/web/src/server/services/contributions.ts` with `listContributions`.
- [ ] Edit `packages/core/src/api.ts`, `packages/core/src/client.ts`, and `packages/core/src/mcp.ts` to add `list_my_contributions`.
- [ ] Edit `packages/mcp/src/cli.ts` to add `contributions list`.
- [ ] Edit `apps/web/tests/api.test.ts` and `apps/web/tests/mcp.test.ts`.

**Build.**

- [ ] `GET /api/v1/me/contributions?kind=screen|flow&status=pending|published|rejected&cursor&limit` returns the caller's items newest first, with `reviewReason` for rejected items. It reads by the existing `contributor_id` column with a keyset cursor and a limit of 100 at most.

**You see.**

- [ ] After a member uploads two screens and an admin rejects one, `screen-commons contributions list --status rejected` prints that screen with its reason.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `api.test.ts` gains status filters, the reason on rejected items, only-mine scoping, and cursor paging. `mcp.test.ts` gains the tool. Run `pnpm --filter web test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no listing. Record that a rejected screen is visible only by id at trunk, then list it at head. Save `rejected.png`. Pass when head lists it with the reason.
- [ ] Lane 2. List pending items after a manifest publish. Save `pending.png`. Pass when every published item appears once.
- [ ] Lane 3. Page with `--limit 5` across 23 items. Save `paging.png`. Pass when no id repeats or goes missing.
- [ ] Lane 4. List as a second member. Save `scoping.png`. Pass when none of the first member's items appear.
- [ ] Lane 5. Call `list_my_contributions` on remote MCP. Save `mcp-remote.png`. Pass when it matches REST.
- [ ] Lane 6. Call it on local MCP. Save `mcp-local.png`. Pass when it matches REST.
- [ ] Lane 7. Call it without a key. Save `no-key.png`. Pass when it returns `unauthorized`.
- [ ] Lane 8. Approve an item, then filter by `published`. Save `published.png`. Pass when it moved.
- [ ] Lane 9. Delete an item, then list. Save `deleted.png`. Pass when it is gone.
- [ ] Lane 10. Ask `control agent --client claude` what happened to its uploads. Save `agent.png`. Pass when it calls the tool and reports the rejected reason.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. D1 rows read per page of 25 for a contributor with 1,150 screens. Trunk lacks the call, so this is an absolute budget.
- [ ] Probe. Seed the spotify-shape fixture as one member and read every page, three times.
- [ ] Baseline. Record trunk's rows for `GET /api/v1/screens?limit=25` as that member first.
- [ ] Rule. Fail when a head page reads more than 3 times the page size plus the trunk list cost.

**Review gate.** None. SC-09 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-09.

## Page the review queue, make review idempotent, and add CLI review commands (SC-10)

**Depends on.** None.

**Files.**

- [ ] Edit `apps/web/src/server/services/review.ts` (`reviewQueue`, `review`).
- [ ] Edit `apps/web/src/routes/api/v1/review.ts`.
- [ ] Edit `packages/core/src/api.ts` and `packages/core/src/client.ts`.
- [ ] Edit `packages/mcp/src/cli.ts` to add `review list`, `review show`, `review approve`, and `review reject`.
- [ ] Edit `apps/web/src/routes/_app/review.tsx` to read the paged queue.
- [ ] Edit `apps/web/tests/api.test.ts`.

**Build.**

- [ ] `GET /api/v1/review?kind&cursor&limit` returns one kind, oldest first, with a keyset cursor and a limit of 50 at most.
- [ ] `review` reads the current status first. Approving a published item and rejecting a rejected item write nothing and return 204.
- [ ] `review approve` and `review reject` take ids as arguments or one per line on stdin, throttle to one call per 300 ms, and print one JSON line per id.

**You see.**

- [ ] `screen-commons review list --kind flow --limit 25` prints 25 pending flows and a `nextCursor`. Piping the ids into `review approve` publishes them. Running it again prints `unchanged` for each.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `api.test.ts` gains queue paging, approve twice with no `updatedAt` change, and reject twice with no write. Run `pnpm --filter web test -- api`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Approve the same flow twice at trunk and head and read `app.updated_at` with `control sql`. Save `approve-twice.png`. Pass when trunk changes it on the second call and head does not.
- [ ] Lane 2. Publish the spotify-shape fixture as a member and page the flow queue. Save `queue-paging.png`. Pass when all 317 flows appear once.
- [ ] Lane 3. Pipe 50 flow ids into `review approve`. Save `bulk-approve.png`. Pass when 50 flows and their screens are published.
- [ ] Lane 4. Kill the bulk approve halfway and rerun. Save `bulk-resume.png`. Pass when the end state equals a clean run.
- [ ] Lane 5. Reject a screen with `--reason`. Save `reject.png`. Pass when the reason is stored and its flows renumber.
- [ ] Lane 6. Run `review list` as a member. Save `member-forbidden.png`. Pass when the CLI exits 3.
- [ ] Lane 7. Run `review show <id> --download` for a screen. Save `show.png`. Pass when the image file is written.
- [ ] Lane 8. Open `/review` in `control-ui`. Save `review-page.png`. Pass when the page shows the first page and loads more on demand.
- [ ] Lane 9. Approve from the web page. Save `web-approve.png`. Pass when the item leaves the queue.
- [ ] Lane 10. Run `drive contribute`. Save `contribute.png`. Pass when it exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. D1 rows read for one queue request with 317 pending flows and 1,150 pending screens.
- [ ] Probe. Alternate 10 queue reads on trunk and head instances seeded identically.
- [ ] Baseline. Record trunk's rows for its single 100-plus-100 response first.
- [ ] Rule. Fail when one head page of 25 reads more than half of trunk's rows.

**Review gate.** None. SC-10 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-10.

## Let admins correct metadata on any contribution (SC-11)

**Depends on.** SC-08.

**Files.**

- [ ] Edit `apps/web/src/server/services/contributions.ts` (`requireOwner`, `updateScreen`, `updateFlow`).
- [ ] Edit `apps/web/tests/api.test.ts`.

**Build.**

- [ ] `updateScreen` and `updateFlow` accept an admin as well as the owner. Delete stays owner-only, because admins remove content by rejecting it. Every update records the editor's id in a new `updated_by` column.

**You see.**

- [ ] An admin runs `screen-commons screens update <spotify-screen> --title "Create playlist menu" --text "Playlist Blend Folder"`. The member's search for `Blend` now finds that screen.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `api.test.ts` gains "an admin updates another member's screen", "a member still cannot", and "an admin cannot delete it". Run `pnpm --filter web test -- api`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Update another member's screen title as admin at trunk and head. Save `admin-update.png`. Pass when trunk returns 403 and head returns the updated screen.
- [ ] Lane 2. Try the same as a second member. Save `member-forbidden.png`. Pass when head returns 403.
- [ ] Lane 3. Set a flow's `type` to `creating` as admin. Save `flow-type.png`. Pass when `search_flows {"type":"creating"}` returns it.
- [ ] Lane 4. Set step labels as admin. Save `labels.png`. Pass when a label search finds the flow.
- [ ] Lane 5. Delete another member's screen as admin. Save `admin-delete.png`. Pass when head returns 403.
- [ ] Lane 6. Read `updated_by` with `control sql`. Save `audit.png`. Pass when it holds the admin's id.
- [ ] Lane 7. Update through remote `update_screen` as admin. Save `mcp-update.png`. Pass when it succeeds.
- [ ] Lane 8. Update a pending item as admin. Save `pending-update.png`. Pass when it stays pending.
- [ ] Lane 9. The owner updates after the admin. Save `owner-after.png`. Pass when the owner's change wins.
- [ ] Lane 10. Run `drive cli`. Save `cli-journey.png`. Pass when it exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. D1 rows read and written per owner update.
- [ ] Probe. Alternate 20 owner updates on trunk and head.
- [ ] Baseline. Record trunk's rows first.
- [ ] Rule. Fail when head reads or writes more rows per owner update than trunk.

**Review gate.** None. SC-11 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-11.

## Log in from the CLI with one browser approval (SC-12)

**Depends on.** None.

**Files.**

- [ ] Create `apps/web/src/server/cli-login.ts` with the login statechart.
- [ ] Create `apps/web/src/routes/api/v1/cli-login.ts` and `apps/web/src/routes/cli-login.tsx`.
- [ ] Edit `apps/web/src/server/keys.ts` to insert a key from a supplied hash.
- [ ] Edit `packages/mcp/src/config.ts` for named profiles.
- [ ] Edit `packages/mcp/src/cli.ts` to add `login`, `logout`, `keys list`, `keys create`, `keys revoke`, `profiles`, and `doctor`, and `--json` output with a `schemaVersion`.
- [ ] Edit `apps/web/tests/api.test.ts` and `packages/mcp/test/cli.test.ts`.

**Build.**

- [ ] The CLI generates an `sc_` token locally and sends only its sha256 and prefix to `POST /api/v1/cli-login`. The server stores a `verification` row in state `pending` with a short user code and a 10-minute expiry.
- [ ] `/cli-login?code=` shows the user code and the device name to the signed-in user. Approving moves the row to `approved` and inserts the API key with the supplied hash.
- [ ] The CLI polls `POST /api/v1/cli-login/poll` until it sees `approved`, `denied`, or `expired`. It then saves the token it already holds to a profile in `~/.config/screen-commons/profiles.json` with mode 0600. The token never crosses the network.
- [ ] `keys list`, `keys create`, and `keys revoke` accept a key whose owner signed in through this flow. Key management stays forbidden for keys created any other way.
- [ ] `doctor` checks the instance URL, the profile, the key, and capture prerequisites, and prints one line per check.

**You see.**

- [ ] On a clean HOME, `screen-commons login --url <instance>` prints a URL and code. After approval in `control-ui`, it prints `logged in as <email>`, and `screen-commons whoami` works.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `api.test.ts` gains every login transition, expiry, denial, a replayed approval, and a poll after expiry. `cli.test.ts` gains profile precedence (flag, then environment, then profile). Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. From a clean HOME, try to get a key with only the CLI at trunk and head. Save `login.png`. Pass when trunk has no path and head reaches `whoami` after one browser approval.
- [ ] Lane 2. Approve in `control-ui`. Save `approve-page.png`. Pass when the page shows the same user code as the terminal.
- [ ] Lane 3. Deny instead. Save `deny.png`. Pass when the CLI exits 3 and saves nothing.
- [ ] Lane 4. Wait past expiry. Save `expired.png`. Pass when the CLI reports expiry and the code no longer approves.
- [ ] Lane 5. Approve the same code twice. Save `double-approve.png`. Pass when one key exists.
- [ ] Lane 6. Run `keys list`, `keys create`, and `keys revoke` with the login key. Save `keys.png`. Pass when a revoked key gets `unauthorized`.
- [ ] Lane 7. Check the profile file mode and the terminal output. Save `secrets.png`. Pass when the mode is 0600 and no full token was printed.
- [ ] Lane 8. Use two profiles against two instances. Save `profiles.png`. Pass when each `whoami` names the right account.
- [ ] Lane 9. Run `doctor` with a wrong URL and then a good one. Save `doctor.png`. Pass when the bad check names the remedy and the good run passes.
- [ ] Lane 10. Publish a manifest after login, approve it with `review approve` from SC-10 if merged, else by REST, and search as another member. Save `end-to-end.png`. Pass when the other member finds it.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. D1 rows read per poll and the time from approval to `logged in`. Trunk lacks the flow, so these are absolute budgets.
- [ ] Probe. Run ten logins with a 2-second poll interval and read `x-sc-d1-rows` on each poll.
- [ ] Baseline. Record trunk's rows for `GET /api/v1/me` with a key first.
- [ ] Rule. Fail when a poll reads more than trunk's `me` cost plus 2 rows, or approval takes more than 3 seconds to reach the CLI.

**Review gate.** Evidence only. The operator waived the wait on 2026-11-10.

- [ ] Copy lane 1 and lane 2 screenshots into `docs/plans/media/SC-12-review-login.png` and `docs/plans/media/SC-12-review-approve.png`.
- [ ] Record a 30 to 60 second video of the terminal and browser approval. Save it as `docs/plans/media/SC-12-review.mp4`.
- [ ] Post the screenshots and the video to the operator in chat at merge. Do not wait for a reply.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-12. Close the ADS-225 profile and doctor items with the lane 8 and lane 9 evidence.

## Keep app updatedAt unchanged on a no-op manifest publish (SC-13)

**Depends on.** None.

**Files.**

- [ ] Edit `apps/web/src/server/services/ingest.ts`.
- [ ] Edit `packages/mcp/test/publish.test.ts`.

**Build.**

- [ ] Compare the incoming app fields with the stored row and skip the app update when nothing changed.

**You see.**

- [ ] Publishing the same manifest twice leaves `app.updated_at` equal after the second run.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `publish.test.ts` gains "a repeat publish leaves the app untouched". Run `pnpm --filter screen-commons-mcp test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Publish the same manifest twice at trunk and head and read `app.updated_at`. Save `noop.png`. Pass when trunk changes it and head does not.
- [ ] Lane 2. Change the app tagline and republish. Save `real-change.png`. Pass when `updated_at` changes.
- [ ] Lane 3. Add one screen and republish. Save `new-screen.png`. Pass when the screen is added.
- [ ] Lane 4. Check the latest sort on `list_apps`. Save `latest-order.png`. Pass when the no-op app does not move up.
- [ ] Lane 5. Republish after an interrupted run. Save `resume.png`. Pass when counts match a clean run.
- [ ] Lane 6. Upload one screen to an existing app with `upload`. Save `upload.png`. Pass when behavior equals trunk.
- [ ] Lane 7. Republish as admin. Save `admin.png`. Pass when the app is untouched.
- [ ] Lane 8. Republish the spotify-shape fixture. Save `large.png`. Pass when no row changes.
- [ ] Lane 9. Run `drive cli`. Save `cli-journey.png`. Pass when it exits 0.
- [ ] Lane 10. Run `drive contribute`. Save `contribute.png`. Pass when it exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. D1 rows written by a no-op republish of the spotify-shape fixture.
- [ ] Probe. Alternate three no-op republishes on trunk and head.
- [ ] Baseline. Record trunk's rows written first.
- [ ] Rule. Fail when head writes any app row or writes more rows than trunk.

**Review gate.** None. SC-13 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-13. Close ADS-385.

## Show complete flow thumbnails on the website (SC-14)

**Depends on.** None.

**Files.**

- [ ] Edit the flow strip and grid components under `apps/web/src/components/`.
- [ ] Edit the display variant logic in `apps/web/src/server/services/ingest.ts` only if a variant crops at ingest.
- [ ] Edit `apps/web/e2e/` with a flow thumbnail test.

**Build.**

- [ ] Fit each flow thumbnail to its box without cropping, at a source resolution that covers the rendered size at 2x density. Keep full-size bytes, step order, repeated steps, and tall-image scrolling unchanged.

**You see.**

- [ ] A 1920 by 1320 Spotify-shaped step shows its bottom bar in the strip and grid, and the text is sharp at 2x.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The e2e test gains "shows the bottom 10 percent of a landscape step" and "keeps a tall step scrollable". Run `pnpm --filter web test:e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open a landscape fixture flow in `control-ui` at trunk and head. Save `strip.png`. Pass when trunk crops the bottom bar and head shows it.
- [ ] Lane 2. Open the grid view. Save `grid.png`. Pass when every thumbnail is complete.
- [ ] Lane 3. Open a tall step. Save `tall.png`. Pass when it scrolls as on trunk.
- [ ] Lane 4. Open the full-size overlay. Save `overlay.png`. Pass when it equals trunk's.
- [ ] Lane 5. Open a flow with a repeated step. Save `repeated.png`. Pass when navigation equals trunk's.
- [ ] Lane 6. Check rendering at a 2x device scale. Save `retina.png`. Pass when step text is legible.
- [ ] Lane 7. Check a narrow mobile width. Save `mobile.png`. Pass when nothing overflows.
- [ ] Lane 8. Check dark mode. Save `dark.png`. Pass when letterbox bars match the theme.
- [ ] Lane 9. Compare full-image bytes by hash. Save `bytes.png`. Pass when hashes equal trunk's.
- [ ] Lane 10. Run `drive browse`. Save `browse.png`. Pass when it exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total image bytes and largest contentful paint for a 5-step flow page.
- [ ] Probe. Alternate five cold loads on trunk and head with `control-ui` performance tracing.
- [ ] Baseline. Record trunk's bytes and paint time first.
- [ ] Rule. Fail when head's bytes rise by more than 50 percent or paint time rises by more than 20 percent.

**Review gate.** Evidence only. The operator waived the wait on 2026-11-10.

- [ ] Copy lane 1 and lane 2 screenshots into `docs/plans/media/SC-14-review-strip.png` and `docs/plans/media/SC-14-review-grid.png`.
- [ ] Record a 30 to 60 second video of the flow page. Save it as `docs/plans/media/SC-14-review.mp4`.
- [ ] Post the screenshots and the video to the operator in chat at merge. Do not wait for a reply.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-14. Close ADS-382.

## Ship the research, contribute, and enrich skills in the npm package (SC-15)

**Depends on.** SC-04, SC-05, SC-06, SC-07, SC-08, SC-09, SC-11, SC-12.

**Files.**

- [ ] Create `packages/mcp/skills/screen-commons-research/SKILL.md`.
- [ ] Create `packages/mcp/skills/screen-commons-contribute/SKILL.md`.
- [ ] Create `packages/mcp/skills/screen-commons-enrich/SKILL.md`.
- [ ] Create `packages/mcp/skills/check-references.mjs`, which checks every id in a bundle's `REFERENCES.md` against the catalog.
- [ ] Edit `packages/mcp/package.json` `files` to ship `skills/`.
- [ ] Edit `packages/mcp/src/cli.ts` to add `skills install` and `skills list`.
- [ ] Edit `apps/web/content/docs/contributing.md` for the test-account policy.

**Build.**

- [ ] `screen-commons skills install` copies the skills to `~/.agents/skills/<name>` and symlinks each into `~/.claude/skills/<name>`. `--project` installs into `.agents/skills` and `.claude/skills` instead. A rerun replaces older versions and leaves newer ones alone.
- [ ] Research runs the steps in Appendix E. It runs a preflight of `whoami` or `doctor`, resolves the app, reads `match`, inspects images before claims, writes a bundle with `flows bundle`, and runs `check-references.mjs` before answering.
- [ ] Contribute takes screenshots from the agent's own browser, writes a manifest with `text`, scans text for emails, phone numbers, and card-like numbers, refuses personal-account captures, publishes, and reports state with `contributions list`.
- [ ] Enrich lets an admin or owner fill titles, text, flow types, and step labels by viewing images. It works in batches of 25 with a dry-run diff before every write.
- [ ] The contributing policy allows logged-in product UI from demo or test accounts, forbids personal data, and asks contributors to follow site terms.

**You see.**

- [ ] On a clean HOME, `npx screen-commons-mcp skills install` followed by `claude -p "How does Spotify let users create a playlist?"` on the spotify-shape instance produces a bundle folder and an answer whose every step id passes `check-references.mjs`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/mcp/test/cli.test.ts` gains install, rerun, and `--project` cases. `packages/mcp/test/check-references.test.ts` covers a valid bundle and an invented id. Run `pnpm --filter screen-commons-mcp test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `control agent --client claude` with the literal Spotify question at trunk and head. Save `agent-compare.png`. Pass when head's answer cites the Spotify flow, writes a bundle, and passes `check-references.mjs`. Trunk's result is recorded as it is.
- [ ] Lane 2. Repeat with `--client codex`. Save `codex.png`. Pass when the same holds.
- [ ] Lane 3. Ask about Netflix. Save `netflix.png`. Pass when the agent says Netflix is not in the catalog and invents no reference.
- [ ] Lane 4. Ask for references for an onboarding flow with a budget of 2 flows. Save `budget.png`. Pass when the bundle holds 2 flows at most.
- [ ] Lane 5. Run the contribute skill on a local test page with an email in its text. Save `pii.png`. Pass when the skill stops before publishing and names the email.
- [ ] Lane 6. Run the contribute skill on a clean page, kill it mid-publish, and rerun. Save `contribute-resume.png`. Pass when `contributions list` shows each screen once.
- [ ] Lane 7. Run the enrich skill as admin on 10 fixture screens in dry-run, then apply. Save `enrich.png`. Pass when the diff matches the writes and the new text is searchable.
- [ ] Lane 8. Run `skills install` twice, then with `--project`. Save `install.png`. Pass when the files and symlinks exist and the second run reports no change.
- [ ] Lane 9. Start the research skill with no profile. Save `preflight.png`. Pass when it prints the `screen-commons login` remedy and stops.
- [ ] Lane 10. Open the bundle's `REFERENCES.md` in `control-ui`. Save `bundle-view.png`. Pass when every step image renders with its link and source.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Tool calls, wall time, and D1 rows for the agent to answer the literal Spotify question.
- [ ] Probe. Run `control agent --client claude` five times at trunk and five at head, alternating, on identical instances.
- [ ] Baseline. Record trunk's median tool calls, time, and rows first.
- [ ] Rule. Fail when head's median exceeds 12 tool calls, 180 seconds, or trunk's rows plus the bundle's step count.

**Review gate.** Evidence only. The operator waived the wait on 2026-11-10.

- [ ] Copy lane 1 and lane 10 screenshots into `docs/plans/media/SC-15-review-agent.png` and `docs/plans/media/SC-15-review-bundle.png`.
- [ ] Record a 30 to 60 second video of the agent answering the Spotify question. Save it as `docs/plans/media/SC-15-review.mp4`.
- [ ] Post the screenshots and the video to the operator in chat at merge. Do not wait for a reply.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-15. Comment the lane evidence on ADS-237, ADS-238, and ADS-240.

## Correct the CLI runtime floor and agent docs (SC-16)

**Depends on.** SC-12, SC-15.

**Files.**

- [ ] Edit `packages/mcp/package.json` `engines`.
- [ ] Edit `packages/mcp/README.md`.
- [ ] Edit `apps/web/content/docs/cli.md`, `apps/web/content/docs/mcp.md`, and `apps/web/content/docs/api-keys.md`.
- [ ] Edit `.github/workflows/ci.yml` to test the CLI on the floor Node version.

**Build.**

- [ ] Find the lowest Node version that runs the packed CLI and its `undici` dependency. Set `engines` to it and test it in CI. Document `login`, profiles, `doctor`, `skills install`, bundles, contributions, review, the API-key settings tab, and why REST media URLs are relative while CLI and MCP URLs are absolute.

**You see.**

- [ ] The CI job runs `npx screen-commons --version` and `doctor` on the floor version. Every command in the docs runs as written.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] A docs check script extracts each fenced `screen-commons` command from the docs and runs `--help` on its subcommand. Run `node scripts/check-cli-docs.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the packed CLI on the documented floor at trunk and head. Save `floor.png`. Pass when head's floor runs and trunk's documented floor is recorded as tested or failing.
- [ ] Lane 2. Run the CLI one minor version below the floor. Save `below-floor.png`. Pass when npm warns about `engines`.
- [ ] Lane 3. Follow the README quickstart on a clean HOME. Save `quickstart.png`. Pass when every step succeeds.
- [ ] Lane 4. Follow `cli.md` login and profiles. Save `cli-doc.png`. Pass when every step succeeds.
- [ ] Lane 5. Follow `mcp.md` for Claude Code. Save `mcp-claude.png`. Pass when the agent lists Screen Commons tools.
- [ ] Lane 6. Follow `mcp.md` for Codex. Save `mcp-codex.png`. Pass when the agent lists the tools.
- [ ] Lane 7. Follow `api-keys.md` in `control-ui`. Save `api-keys.png`. Pass when the named tab exists.
- [ ] Lane 8. Compare a REST media URL with the CLI's. Save `urls.png`. Pass when the docs describe both correctly.
- [ ] Lane 9. Render `/docs/cli` in `control-ui`. Save `docs-page.png`. Pass when it renders without broken links.
- [ ] Lane 10. Run `drive mcp-package`. Save `package.png`. Pass when it exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Cold start time of `npx screen-commons --version` from a packed tarball.
- [ ] Probe. Alternate ten cold starts of trunk's and head's tarballs on the same Node.
- [ ] Baseline. Record trunk's median first.
- [ ] Rule. Fail when head's median exceeds trunk's by more than 10 percent.

**Review gate.** None. SC-16 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root merges SC-16. Close ADS-386.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] After SC-11 and SC-15 merge, enrich the production Spotify catalog. Set flow types from flow names with the verb table in Appendix A, then run the enrich skill on the 50 most-searched flows in batches of 25. Record D1 rows per batch and stop on `unavailable`.
- [ ] Run one bounded production session with a key that did not contribute. A real Claude Code agent answers "How does Spotify let users create a playlist?" in 10 tool calls or fewer and writes a bundle. Save the transcript, the bundle, the rows read, and any stall over 5 seconds, and comment them on ADS-383.
- [ ] Comment the final state on ADS-219, ADS-221, and ADS-222, and update the ADR document with the measured numbers.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

**Lexical search is enough for the target question.** The prototype loads the 317 production Spotify flow names into SQLite FTS5 with the repo's tokenizer, plus four decoy apps. It compares the current search with the proposed one. No branch or SHA exists, because it is a throwaway script outside the repo.

- Script. `/tmp/claude-1000/-home-zxcv-Projects-screen-commons/10391aad-9f97-421c-91d5-090095255a3a/scratchpad/search-proto/proto.py`. Results are in `run.txt`, `holdout.txt`, `robustness.txt`, and `detect.txt` beside it.
- The current search answered 1 of 17 tuning queries at rank 1, and gave another app's flow for 13 of them, including all three missing-app questions. The cause is the OR fallback over `"a"*` plus newest-first order.
- The proposed search answered 12 at rank 1, 1 at rank 3, all 3 missing-app questions correctly, and missed 1. On a holdout written before running, it scored 12 of 17 against the current 1 at rank 1.
- The proposed tallies held with the decoys reordered and with no decoys.
- Stopwords. Function words, question words, pronouns, the words user, users, people, customer, let, lets, allow, enable, show, find, get, see, use, and catalog words such as app, flow, screen, step, and feature. The words like, new, and make stay searchable.
- Stemming. Strip the first of `ations, ation, ings, ing, ies, ied, es, ed, s, e` while 3 or more characters remain, map `ies` to `y`, undouble a final consonant, and search the result as a prefix. Index-side Porter stemming scored worse.
- Flow descriptions in the import all read `Source: Mobbin` with a URL, so description weight is 0.
- Still unproven. Synonyms such as "rename" for "Editing playlist details", compound words such as "signup", and dictionary-word app names such as "linear progress bar". Screen search on `screen_fts` was not prototyped.
- Verb table for flow types, inferred and not yet run. Creating maps to `creating`, Editing and Renaming to `editing`, Deleting and Removing to `deleting`, Sharing and Inviting to `sharing`, Onboarding and Signing up to `onboarding`, and Searching to `searching`. SC-11 lane 3 checks the mechanism.

**A one-time code on the existing verification table gives the CLI a key with no migration.** The facts run executed Better Auth 1.7.7's device-authorization plugin against local D1 at `/tmp/claude-1000/-home-zxcv-Projects-screen-commons/10391aad-9f97-421c-91d5-090095255a3a/scratchpad/facts/device.mjs`. The plugin works, but it needs a new table and a page, returns a session token that `principal.ts:76-81` rejects, and accepts JSON only on its token route. The custom path reuses the `verification` table and `keys.ts` insert logic. Its own run is still unproven and is SC-12's first unit.

**Skill locations.** Codex, Cursor, and OpenCode read `~/.agents/skills`. Claude Code reads `~/.claude/skills`. One copy plus a symlink covers all four. This was read from the installed binaries and the repo's own `.claude/skills` symlink, not run.

**Review facts.** Approving an already-published item still writes, rejecting a flow leaves its screens alone, and admins cannot edit others' metadata (`apps/web/src/server/services/review.ts:60-100`, `apps/web/src/server/services/contributions.ts:14-26`).

## Appendix B. Alternatives rejected

- Removing the website. The operator chose to keep it as a secondary client. It still owns sign-up, the login approval page, key settings, extension connect, docs, and visual review.
- Semantic search first. The prototype fixed the target question without it, and the free plan limits inference. It waits for SC-03's baseline under ADS-242.
- The Better Auth device plugin. It costs a table, a migration, and a page, and still needs a key-minting step. The custom code reuses what exists.
- A server-minted key returned on poll. A lost poll response would strand a live key. A client-generated token sent as a hash makes the poll safe to repeat.
- A publish receipt file and durable server jobs for ADS-227. Manifest replay already converges, and `contributions list` reads the real state, so a receipt would duplicate it. Durable jobs stay open in ADS-227 until a remote-only bulk case appears.
- Manifest version 2 with viewport, capture method, checksums, and attribution. No agent workflow reads those fields today, and the server already computes sha256. The rest of ADS-226 stays open.
- A server-side zip endpoint for bundles. It costs Worker CPU and egress, and the client builds the same bundle from reads it already makes.
- Our own browser interaction stack (ADS-232, ADS-233). An agent's Playwright screenshot fed to `screen-commons upload` already works.
- Paid OCR or vision. Agents enrich text with their own vision through SC-11 and SC-15. ADS-244 stays open for a free-tier evaluation.
- A paid D1 plan. ADS-380 stays Canceled at the operator's request.

## Appendix C. Risks

- Fewer than 10 percent of queries change rank under SC-04 relaxation, but a dictionary-word app name can filter wrongly. SC-04 returns results with the warning instead of an empty list, and lane 1 watches the holdout.
- SC-05 rebuilds `flow_fts`. A failed migration on production leaves search empty. The owner runs the migration on a copy of a trunk-seeded D1 in lane 2, and the root merges it early in the UTC day.
- Live lanes launch ten local instances each. Ports start at 5200, and the verify skill gives each run its own state. The owner watches for port exhaustion and runs lanes in two waves of five if needed.
- `control agent` needs Claude Code and Codex credentials on the machine. CI cannot run it, so its evidence is local only. SC-02 lane 4 covers the missing-binary case.
- Publishing Spotify and enriching it spend D1 reads. Both levers throttle, stop on `unavailable`, and resume, and the operator runs them early in the UTC day.
- SC-11 widens admin power to edit others' metadata. The `updated_by` column records every edit, and delete stays owner-only.
- The contribute skill's personal-data scan is pattern-based and misses names and faces. The policy text and the test-account rule stay the main control.
- Ten-lane verification for small PRs such as SC-13 costs more than the change. The playbook requires it, so the owner keeps lanes short.

## Appendix D. Links and reading list

- Feasibility report. `/tmp/screen-commons-agent-assessment-20261109/REPORT.md`, with `COMMANDS.md`, `evidence/`, and the hand-built bundle.
- Spotify transfer evidence. `/tmp/sc-evidence/prod-spotify/`, including `publish1.json` and `manifest.json`.
- Prototype scratch. `/tmp/claude-1000/-home-zxcv-Projects-screen-commons/10391aad-9f97-421c-91d5-090095255a3a/scratchpad/search-proto/` and `.../facts/`.
- The draft plan this replaces. `/home/zxcv/.claude/plans/continue-planning-screen-commons-sprightly-fountain.md`.
- Linear. Project 47d9d858-691c-4ef3-88de-53a8982b70d0 and roadmap document e92fb97d-f08e-4dc5-947d-8d16fcc4e752.
- Read before editing. `.agents/skills/verify-screen-commons/SKILL.md`, `apps/web/content/docs/contributing.md`, `packages/core/src/mcp.ts`, and `apps/web/src/server/services/catalog.ts`.
- SC-04, SC-12, and SC-15 get `pstack/skills/how/SKILL.md` before building and `pstack/skills/interrogate/SKILL.md` before code-ready.
- Keep the decision trail per `pstack/skills/show-me-your-work/SKILL.md` in the session scratchpad, and commit it with SC-15.
- Principles cited by this plan. Laziness Protocol, Subtract Before You Add, Sequence Verifiable Units, Prove It Works, Make Operations Idempotent, Experience First, Build the Lever, Explain the Number, Model the Domain, Boundary Discipline, Never Block on the Human, and Guard the Context Window.

## Appendix E. Decision record (ADR-001)

**Context.** Agents are the main users. The backend already serves search, images, uploads, and review, but agents get wrong-app answers, cannot log in without the website, cannot attach searchable text, and have no packaged procedure.

**Decision.** Cloudflare Workers, D1, R2, and Better Auth stay the only backend, on the free plan. MCP is the main agent client. The CLI owns files, bulk work, login, keys, and review. Installable skills own procedures and safety rules and hold no business logic. Agent-owned browsers do capture. The website stays as a secondary client of the same services. A new agent capability never needs the website, except one browser approval at login.

**Responsibilities.** The backend owns identity, keys, catalog data, search ranking, media, ingest, deduplication, moderation, and the audit column. MCP exposes search, images, contributions, and the shared prompts. The CLI adds bundles, manifests, login, profiles, keys, review, contributions, and skill install. Skills run research, contribution, and enrichment.

**Research workflow.** Preflight, resolve the app, search flows with the app filter, read `match`, inspect images, write a bundle, check references, and answer with cited ids. Default budget is 3 flows and 20 inline images.

**Free-plan rules.** Every list is keyset-paged with a limit of 100 at most. Search runs at most two FTS queries and one app lookup per call. Bulk levers throttle, stop on `unavailable`, and resume. Production proofs stay at 10 calls or fewer and record their rows.

**Consequences.** Search quality, contribution status, and login improve for every client, including the website. Semantic search, durable jobs, native capture, and manifest version 2 stay in the backlog with their reasons recorded in Appendix B.

## Appendix F. Linear mapping

| PR       | Linear                                                                                                                              | Action                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| SC-01    | ADS-381                                                                                                                             | Close on merge                                                          |
| SC-02    | new, under ADS-219                                                                                                                  | Real-agent journey and D1 row counter                                   |
| SC-03    | ADS-241                                                                                                                             | Baseline only. The judged set grows later                               |
| SC-04    | new, under ADS-222                                                                                                                  | Lexical ranking, normalization, and app matching                        |
| SC-05    | ADS-247                                                                                                                             | Partial. Sequence-aware ranking stays open                              |
| SC-06    | ADS-229                                                                                                                             | Partial. Batch reads by id stay open                                    |
| SC-07    | ADS-224                                                                                                                             | Prompt parity row of the capability matrix                              |
| SC-08    | ADS-226                                                                                                                             | Partial. Viewport, capture method, checksums, and attribution stay open |
| SC-09    | ADS-224                                                                                                                             | Contribution status row                                                 |
| SC-10    | new, under ADS-219                                                                                                                  | Paged review and CLI review                                             |
| SC-11    | new, under ADS-221                                                                                                                  | Admin metadata edits for enrichment                                     |
| SC-12    | new, under ADS-219, related to ADS-225                                                                                              | Closes ADS-225's profile and doctor items                               |
| SC-13    | ADS-385                                                                                                                             | Close on merge                                                          |
| SC-14    | ADS-382                                                                                                                             | Close on merge                                                          |
| SC-15    | ADS-237, ADS-238, ADS-240                                                                                                           | Close on merge. ADS-239 stays Backlog                                   |
| SC-16    | ADS-386                                                                                                                             | Close on merge                                                          |
| Ops      | ADS-387                                                                                                                             | Done after the Spotify publish                                          |
| Deferred | ADS-227, ADS-220, ADS-232 to 236, ADS-223, ADS-251 to 253, ADS-242 to 246, ADS-248 to 250, ADS-93, ADS-80, ADS-91, ADS-383, ADS-384 | No status change                                                        |
