# Search

Signed-in users search apps, screens and flows from a palette or a results page, including text that appears only inside a screenshot. API clients get the same search over REST and MCP.

## Sub-features

- `search-palette` shows live results as you type, and Enter opens the results page.
- `search-open` opens the palette by `Ctrl+K`, `/` or the top bar pill.
- `search-page` shows results at `/search?q=…`, and an empty state when nothing matches.
- `search-text` finds a screen by text in its screenshot.
- `search-rest` answers `GET /api/v1/search` and refuses anonymous calls.
- `search-mcp` answers the `search_screens` tool on `/mcp`.

## How to get to it (user POV)

- Press `Ctrl+K` (`⌘K` on macOS) on any page (driven).
- Press `/` with focus outside a field (driven).
- Click the top bar button named `Search <platform> apps, screens, flows…` (driven).
- Open `/search?q=<query>` (driven).
- Call `GET /api/v1/search?q=<query>` with an API key (driven).
- Call MCP tool `search_screens` on the remote server (driven), or on the local server (driven in [Local MCP](./mcp-local.md)).
- Use the palette signed out, where it lists only pages and docs (not scripted).
- Choose a palette command or a Trending entry (not scripted; `apps/web/e2e/keyboard.e2e.ts` covers commands).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- The pricing screens are seeded with the text `Plans billed yearly.` in their captured text only.

Run `control drive search --run <id>`, which performs these steps.

- **Palette.** Press `Control+k` and fill the `combobox` in dialog `Search` with `pricing`. The option matching `Search for “pricing”` appears, with at least 4 options.
- **Results.** Press `Enter`. The URL becomes `/search?q=pricing`, a heading matches `Results for`, and tiles appear under `main [data-screen-id]`.
- **Slash.** On `/browse/web`, press `/`. The palette's combobox appears. `Escape` closes it.
- **Pill.** Click the top bar button matching `^Search .*apps, screens, flows`. The palette's combobox appears.
- **Text in a screenshot.** Open `/search?q=billed%20yearly`. Tiles appear even though no title, tag or pattern has those words.
- **REST.** `h.api("search?q=billed%20yearly")` returns 200 with at least 3 items in `screens`.
- **Empty.** Open `/search?q=zzzznothingmatches`. Text matching `No results` or `No matches` appears.
- **MCP.** `h.call(await h.remoteMcp(), …, "search_screens", { query: "billed yearly" })` returns no error and at least 3 screens, all tagged pricing.
- **Anonymous.** `h.api("search?q=pricing", { token: null })` returns 401.
- **Proof.** Read `test-results/verify/<run>/search-*/result.json` and the `billed yearly` screenshot.

## Gotchas

- The palette debounces, so wait for an option rather than sleeping.
- The dialog is named `Search` when signed in and `Search pages and docs` when signed out.
- REST search returns plain arrays under `apps`, `screens`, `flows` and `terms`, not `items` as the list endpoints do.
- Every word must match. If none match together, results fall back to any word, so a partly unrelated query can still return results. Use a nonsense single word to prove the empty state.
