# Screen Commons verification map

This directory is the maintained source for verifying the user-facing behavior of Screen Commons. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `control launch --run <id>`, where `control` is `.claude/skills/verify-screen-commons/scripts/control.mjs`, run from the repository root.
- Run `control doctor --run <id>` and require `"healthy": true`.
- A fresh instance has the admin `admin@screencommons.dev`, its API key, and the seed: 9 web apps, 28 screens (home, pricing, sign-in and sign-up pages), 9 pricing screens and 9 flows. Every seeded screen is published. There is no iOS or Android content.
- Never drive an instance that `control list` doesn't show.

## Driving conventions

- Start each journey from a launched instance. Journeys can repeat and can share an instance, since names carry a per-drive stamp, but they leave their data behind until teardown.
- Prefer ARIA roles and accessible names, then `data-screen-id`, over CSS selectors or DOM position.
- Treat every name below as literal. Keep quoted names unchanged.
- Use the SDK's client through `h.remoteMcp` or `h.localMcp` for MCP tool behavior, and raw `h.mcp` only for what a client hides, such as status codes. Point browser tools at `h.fixtureSite`, never at a public site.
- Run a shipped journey with `control drive <journey> --run <id>`. Write extra steps as a journey of your own and run it by path; see the Drive section of `../SKILL.md`.

## Proof and skip reporting

- Capture the user action and the resulting state with `h.step`, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot, which `h.step` saves together with the URL.
- Mutation proof includes a second read: `h.sql`, `h.api` or a media fetch.
- Each file under `How to get to it` marks entry points as `driven` or `not scripted`. The shipped journey covers only `driven` ones.
- Report a `not scripted` entry point as skipped, or script it. Do not report it as verified through a different path.
- Report an unreachable path with the attempted command and the unmet precondition.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact handle and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

MCP is the main client surface, so its three entries come first.

- [Remote MCP](./mcp-remote.md) covers `/mcp` with a real client: auth, every catalog tool, member and admin behavior, and revocation. Journey: `mcp-remote`.
- [Local MCP](./mcp-local.md) covers the built stdio server: the shared contract, proxied catalog tools, prompts, resources, headless browser tools and key handling. Journey: `mcp-local`.
- [Extension bridge](./mcp-extension.md) covers pairing the real extension and running browser tools through it. Journey: `mcp-extension`.
- [Browse and view](./browse.md) covers public pages, Discover, filters, the screen and flow viewers, and app pages. Journey: `browse`.
- [Search](./search.md) covers the palette, the results page, text inside screenshots, REST and MCP. Journey: `search`.
- [Collections](./collections.md) covers saving from the viewer, the `S` key and REST, plus `/saved` and deletion. Journey: `collections`.
- [Contribute and review](./contribute.md) covers uploads, flows, member and admin paths, approve, reject, and owner edit and delete. Journey: `contribute`.
- [API access](./api-access.md) covers API keys in Settings, then REST and remote MCP with a key, then revocation. Journey: `api-access`.
