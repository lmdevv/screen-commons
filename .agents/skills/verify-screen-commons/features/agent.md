# Real agent

A real agent CLI, Claude Code or Codex, answers a catalog question through the run's two MCP servers in one bounded session. It picks its own tools, so this proves an agent's config handling and tool choice, which the SDK client in the other journeys can't.

## Sub-features

- `agent-claude` runs `claude -p` with only the Screen Commons servers and no built-in tools.
- `agent-codex` runs `codex exec` with only the Screen Commons servers, in a read-only sandbox with its shell turned off.
- `agent-tools` records every tool call, its server, its arguments and whether it failed.
- `agent-answer` records the final answer.
- `agent-home` keeps the developer's own agent config, servers, history and login out of the session and unchanged.
- `agent-stop` writes `result.json` with the partial transcript and exit status when the agent is killed or times out.
- `d1-rows` reports `x-sc-d1-rows` on every response of an instance launched with the counter.

## How to get to it (user POV)

- Ask Claude Code with the run's MCP servers configured (driven).
- Ask Codex with the run's MCP servers configured (driven, with `SC_AGENT_CLIENT=codex`).
- Run `control agent --client <claude|codex> --prompt <text> --run <id>` for any other question (not scripted).
- OpenCode and Cursor (not scripted; `control mcp-config` prints their config).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- `claude` or `codex` is on `PATH` and logged in. Claude Code's login is passed as its access token only. Codex's `auth.json` is copied in and removed afterwards.
- A session spends the agent's tokens. The journey runs exactly one, limited to 240 seconds.

Run `control drive agent --run <id>`, or `SC_AGENT_CLIENT=codex control drive agent --run <id>`, which performs these steps.

- **Seed.** Publishes app `Fixture Tunes` with flow `Creating a playlist` through `POST /api/v1/captures` as the admin, once per instance. Its three steps are `Open Your Library`, `Tap the plus button` and `Name the playlist and tap Create`.
- **Ask.** Runs one session with the prompt `How does Fixture Tunes let users create a playlist?`. The agent exits 0 within the limit.
- **Tools.** The transcript shows `search_flows`, then `get_flow` with the playlist flow's id.
- **Answer.** The final answer mentions the playlist.
- **Counter.** `GET /api/v1/screens?limit=5` carries a positive `x-sc-d1-rows`, and an MCP response carries the header too. On an instance launched with `SC_D1_COUNTER=0`, neither has it.
- **Proof.** Read `test-results/verify/<run>/agent-*/NN-agent-<client>/result.json` and `transcript.jsonl` next to it.

## Gotchas

- The agent chooses between the remote and local servers, which share catalog tools, so match on the tool name, not the server.
- `control agent` with no agent on `PATH` exits 1 with the install command before it reads the run.
- The agent's scratch home is under `/tmp/screen-commons-verify/<run>/agents/` and goes at teardown. Copy anything you need first.
- If Codex refreshes its login during the session, the refreshed `auth.json` is written back to the real one, because the refresh can retire the token the real one holds. `result.json` says so in `loginRefreshed`.
- `x-sc-d1-rows` counts the queries that finished before the response headers went out. A streamed page can query after that, so its count can be low.
