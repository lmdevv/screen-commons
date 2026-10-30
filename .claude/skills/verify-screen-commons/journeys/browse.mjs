import assert from "node:assert/strict";

/** Public pages, Discover, filters, the screen and flow viewers, app and standalone pages. */
export default async function browse(h) {
  const visitor = await h.newPage();
  await h.goto(visitor, "/");
  await visitor.getByRole("heading", { level: 1, name: /Real product screens/u }).waitFor();
  const thumbs = visitor.getByRole("region", { name: "From the library" }).locator("img");
  await thumbs.first().waitFor();
  await visitor.waitForFunction(() =>
    [...document.querySelectorAll('section[aria-label="From the library"] img')]
      .slice(0, 3)
      .every((img) => img.complete && img.naturalWidth > 0),
  );
  await h.step("landing signed out shows real thumbnails", visitor);

  await h.goto(visitor, "/docs");
  const sidebar = visitor.getByRole("navigation", { name: "Documentation" });
  await sidebar.getByRole("link", { name: "MCP", exact: true }).click();
  await visitor.waitForURL(/\/docs\/mcp$/u);
  await visitor.getByRole("heading", { level: 1, name: "MCP" }).waitFor();
  await h.step("docs open from the sidebar", visitor);

  await h.goto(visitor, "/browse/web");
  await visitor.waitForURL(/\/sign-in/u);
  await h.step("library sends a visitor to sign in", visitor);

  const page = await h.newPage();
  await h.signIn(page);
  await page.getByRole("heading", { name: "Discover" }).waitFor();
  const cards = page.locator('main a[href^="/apps/"]');
  await cards.first().waitFor();
  assert.ok((await cards.count()) >= 6, "Discover lists the seeded apps");
  await h.step("Discover lists apps", page);

  await page
    .getByRole("radiogroup", { name: "Platform" })
    .getByRole("radio", { name: "iOS" })
    .click();
  await page.waitForURL(/\/browse\/ios/u);
  await page.waitForLoadState("networkidle");
  await h.step("platform switch moves to iOS", page);
  await h.goto(page, "/browse/web");

  await page.getByRole("link", { name: "Screens", exact: true }).click();
  await page.waitForURL(/tab=screens/u);
  await page
    .getByRole("group", { name: "Screen patterns" })
    .getByRole("button", { name: /^Pricing/u })
    .click();
  await page.waitForURL(/pattern=pricing/u);
  await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
  const tiles = page.locator("main [data-screen-id]");
  await tiles.first().waitFor();
  // The grid is paged and other journeys add pricing screens, so compare membership, not totals.
  const pricing = await h.api("screens?platform=web&pattern=pricing&limit=100");
  const pricingIds = new Set(pricing.body.items.map((screen) => screen.id));
  const shown = await tiles.evaluateAll((items) => items.map((item) => item.dataset.screenId));
  assert.ok(shown.length >= 3, "pricing screens are listed");
  assert.ok(
    shown.every((id) => pricingIds.has(id)),
    "the grid shows only pricing screens",
  );
  await h.step("pattern filter narrows the grid", page);

  const everything = await h.api("screens?platform=web&limit=100");
  assert.ok(everything.body.items.length > shown.length, "the filter removed something");

  const first = await tiles.nth(0).getAttribute("data-screen-id");
  const second = await tiles.nth(1).getAttribute("data-screen-id");
  await tiles.nth(0).getByRole("link").first().click();
  const viewer = page.getByRole("dialog").filter({ has: page.getByRole("complementary") });
  await viewer.waitFor();
  assert.equal(new URL(page.url()).searchParams.get("screen"), first);
  await h.step("viewer opens with a deep link", page);
  await page.keyboard.press("ArrowRight");
  await page.waitForURL((url) => url.searchParams.get("screen") === second);
  await h.step("arrow key moves to the next screen", page);
  await page.keyboard.press("Escape");
  await page.waitForURL((url) => !url.searchParams.has("screen"));

  const deepLink = await h.newPage();
  await h.signIn(deepLink);
  await h.goto(deepLink, `/browse/web?tab=screens&pattern=pricing&screen=${second}`);
  const sharedViewer = deepLink
    .getByRole("dialog")
    .filter({ has: deepLink.getByRole("complementary") });
  await sharedViewer.waitFor();
  const { imageUrl: secondImage } = (await h.api(`screens/${second}`)).body;
  await sharedViewer.locator(`img[src="${secondImage}"]`).first().waitFor();
  await h.step("a shared viewer link opens the same screen", deepLink);

  await h.goto(page, `/screens/${first}`);
  await page.getByRole("button", { name: /^Save(d)?$/u }).waitFor();
  const { imageUrl: firstImage } = (await h.api(`screens/${first}`)).body;
  await page.locator(`img[src="${firstImage}"]`).first().waitFor();
  await h.step("standalone screen page", page);

  const { slug, name } = (await h.api("apps?platform=web&limit=1")).body.items[0];
  await h.goto(page, `/apps/${slug}`);
  await page.getByRole("heading", { name }).first().waitFor();
  await page.locator("main [data-screen-id]").first().waitFor();
  await h.step("app page lists its screens", page);

  await h.goto(page, "/browse/web?tab=screens");
  const unfiltered = page.locator("main [data-screen-id]");
  await unfiltered.first().waitFor();
  const firstPage = await unfiltered.count();
  await unfiltered.last().scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 4000);
  await page.waitForFunction(
    (count) => document.querySelectorAll("main [data-screen-id]").length > count,
    firstPage,
  );
  await h.step("scrolling loads more screens", page);

  await h.goto(page, "/browse/web?tab=flows");
  await page.locator('main a[href*="flow="]').first().click();
  const flow = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("list", { name: /steps$/u }) });
  await flow.waitFor();
  const steps = flow.getByRole("button", { name: /^Open step/u });
  assert.ok((await steps.count()) >= 2, "the flow has steps");
  await h.step("flow viewer lists its steps", page);
  await steps.nth(1).click();
  await viewer.waitFor();
  const params = new URL(page.url()).searchParams;
  assert.ok(params.get("flow") && params.get("screen"), "both overlays are in the URL");
  await h.step("a flow step opens in the screen viewer", page);
  await page.keyboard.press("Escape");
  await page.waitForURL((url) => !url.searchParams.has("screen") && url.searchParams.has("flow"));
  await page.keyboard.press("Escape");
  await page.waitForURL((url) => !url.searchParams.has("flow"));
  await h.step("Escape closes the viewers one at a time", page);
}
