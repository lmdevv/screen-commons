# Browse and view

Visitors see a landing page and docs. Signed-in users browse apps, screens and flows by platform, filter them, and open screens and flows in viewers with shareable URLs.

## Sub-features

- `browse-public` renders the landing page's catalog thumbnails and the docs while signed out.
- `browse-gate` sends a visitor from the library to sign in.
- `browse-discover` lists apps per platform and switches platform.
- `browse-filter` narrows the screens tab by pattern.
- `browse-more` loads more screens on scroll.
- `browse-viewer` opens a screen in the viewer, walks results with arrow keys, and closes with Escape.
- `browse-links` opens the same screen from a shared URL and at `/screens/<id>`.
- `browse-app` lists an app's screens at `/apps/<slug>`.
- `browse-flow` opens a flow, opens a step in the screen viewer, and closes each layer in turn.

## How to get to it (user POV)

- Open `/` and `/docs` signed out (driven).
- Sign in and land on `/browse/web` (driven).
- Choose `iOS` in the top bar's `Platform` switch (driven). `Android` is not scripted.
- Choose the `Screens` or `Flows` tab, or open `?tab=flows` directly (driven). `UI Elements` is not scripted.
- Choose a chip in `Screen patterns` (driven). Category, element and flow type filters, and the `Popular` sort, are not scripted.
- Click a tile, or paste a `?screen=<id>` link (driven).
- Open `/screens/<id>` and `/apps/<slug>` directly (driven). Clicking an app card, and `/flows/<id>`, are not scripted.
- Scroll to load more results (driven; a page holds 24 screens and the seed has 28).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.

Run `control drive browse --run <id>`, which performs these steps.

- **Landing.** Open `/` signed out. The heading matching `Real product screens` appears, and the first 3 images in the region `From the library` finish loading with a nonzero width.
- **Docs.** Open `/docs` and choose link `MCP` in navigation `Documentation`. The URL ends in `/docs/mcp` and the level 1 heading reads `MCP`.
- **Gate.** Open `/browse/web` signed out. The URL becomes `/sign-in`.
- **Discover.** Sign in. Heading `Discover` appears with at least 6 `main a[href^="/apps/"]` cards.
- **Platform.** Choose radio `iOS` in radiogroup `Platform`. The URL becomes `/browse/ios`.
- **Filter.** Back on `/browse/web`, choose link `Screens`, then the button matching `Pricing` in group `Screen patterns`. The URL gains `pattern=pricing`, and every `main [data-screen-id]` tile is in the REST list from `screens?platform=web&pattern=pricing&limit=100`, which is shorter than the unfiltered list.
- **Viewer.** Click the first tile's link. The dialog containing a `complementary` panel opens and `?screen=` holds that tile's id. `ArrowRight` moves `?screen=` to the second tile's id. `Escape` removes it.
- **Shared link.** In a new signed-in context, open `/browse/web?tab=screens&pattern=pricing&screen=<id>`. The viewer dialog opens with an image whose `src` is that screen's `imageUrl`.
- **Standalone.** Open `/screens/<id>`. Button `Save` or `Saved` is present, with an image whose `src` is that screen's `imageUrl`.
- **App page.** Open `/apps/<slug>` for the newest app from REST. The app's name is a heading and tiles are listed.
- **Load more.** On `/browse/web?tab=screens`, scroll to the last tile. The number of tiles grows past the first page.
- **Flow.** Open `/browse/web?tab=flows` and click the first `main a[href*="flow="]`. The dialog with a list named like `… steps` opens with at least 2 buttons matching `Open step`. Clicking the second one opens the screen viewer with both `flow` and `screen` in the URL. `Escape` removes `screen`, and `Escape` again removes `flow`.
- **Proof.** Read `test-results/verify/<run>/browse-*/result.json` and screenshots for the viewer and flow steps.

## Gotchas

- Seed screenshots are synthetic. They prove the pipeline and layout, not how a real capture renders.
- Grids are paged at 24 and other journeys add screens, so compare membership, never totals, with REST.
- Filtered results keep the old grid dimmed with `aria-busy` until the new page arrives. Wait for `main [aria-busy="true"]` to go away before counting tiles.
- Keys need a hydrated page. Use `h.goto`, which waits for network idle, before pressing any.
