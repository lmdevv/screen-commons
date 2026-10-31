# npm package

Users of a production instance run the local MCP server with `npx -y screen-commons-mcp`. The workspace package stays private, and only the production pipeline publishes a staged copy of it.

## Sub-features

- `package-manifest` publishes under the unscoped name with real version ranges, and bundled workspace code.
- `package-files` ships only the built code, README and license.
- `package-private` keeps the workspace package private.
- `package-runs` works from a plain npm install outside the workspace, with one format and working capture.

## How to get to it (user POV)

- Pack the staged package and install it with npm, as `npx` would fetch it (driven).
- Run `npx -y screen-commons-mcp@<version>` once a version is on npm (not scripted; check it by hand against a run after each release, using `SCREEN_COMMONS_URL` and `SCREEN_COMMONS_API_KEY` from `control mcp-config`).
- Release by bumping `packages/mcp/package.json` and `SERVER_INFO` in `packages/mcp/src/server.ts`, then merging to `main` (not scripted; the `publish-mcp` CI job runs it).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- The npm registry is reachable, because installing fetches the package's dependencies.

Run `control drive mcp-package --run <id>`, which performs these steps.

- **Manifest.** The staged manifest is named `screen-commons-mcp`, isn't private, and every dependency is a `^x.y.z` range with no `@screen-commons/` package.
- **Files.** They include `dist/index.js`, `README.md` and `LICENSE`, with no source maps or `src/`.
- **Private.** `packages/mcp/package.json` still has `private: true`.
- **Runs.** The installed bin connects as `screen-commons-mcp` at the manifest's version, with 6 more tools than the remote server.
- **One format.** `search_screens` returns the same text as the remote server, and `get_screen` returns a WebP.
- **Capture.** `capture_pages` on the fixture site says `Uploaded 2 screens`, and D1 has 2 `mcp`, `published` rows.
- **Proof.** Read `test-results/verify/<run>/mcp-package-*/result.json` and the manifest JSON.

## Gotchas

- This journey needs the network, unlike the others. It fails offline without saying anything about the product.
- It builds to the run's own directory, so it neither touches `dist/` nor needs `.publish/`.
- `npm view` can't confirm a version until a release has run, so this journey proves the tarball, not the registry.
