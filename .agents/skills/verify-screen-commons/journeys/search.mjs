import assert from "node:assert/strict";

/** Search from every entry point: ⌘K, /, the top bar pill, the URL, REST and remote MCP. */
export default async function search(h) {
  const page = await h.newPage();
  await h.signIn(page);
  const palette = page.getByRole("dialog", { name: "Search" });

  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill("pricing");
  await palette.getByRole("option", { name: /Search for “pricing”/u }).waitFor();
  await palette.getByRole("option").nth(3).waitFor();
  await h.step("Ctrl+K lists live results", page);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/search\?q=pricing/u);
  await page.getByRole("heading", { name: /Results for/u }).waitFor();
  await page.locator("main [data-screen-id]").first().waitFor();
  await h.step("Enter opens the full results page", page);

  await h.goto(page, "/browse/web");
  await page.keyboard.press("/");
  await palette.getByRole("combobox").waitFor();
  await h.step("slash opens the palette", page);
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "detached" });

  await page.getByRole("button", { name: /^Search .*apps, screens, flows/u }).click();
  await palette.getByRole("combobox").waitFor();
  await h.step("the top bar pill opens the palette", page);
  await page.keyboard.press("Escape");

  // Only the screenshot's text says this; no title, tag or pattern does.
  await h.goto(page, `/search?q=${encodeURIComponent("billed yearly")}`);
  await page.locator("main [data-screen-id]").first().waitFor();
  await h.step("the URL searches text inside screenshots", page);
  const rest = await h.api(`search?q=${encodeURIComponent("billed yearly")}`);
  assert.equal(rest.status, 200);
  assert.ok(rest.body.screens.length >= 3, "REST finds the pricing pages by their text");
  h.record("REST search response", {
    status: rest.status,
    screens: rest.body.screens.map((s) => s.title),
  });

  await h.goto(page, "/search?q=zzzznothingmatches");
  await page
    .getByText(/No (results|matches)/iu)
    .first()
    .waitFor();
  await h.step("a query with no match shows the empty state", page);

  const mcp = await h.call(await h.remoteMcp(), "MCP search_screens response", "search_screens", {
    query: "billed yearly",
  });
  assert.equal(mcp.isError, false);
  assert.ok(JSON.parse(mcp.text).items.every((screen) => screen.patterns.includes("pricing")));
  assert.ok(JSON.parse(mcp.text).items.length >= 3);

  const anonymous = await h.api("search?q=pricing", { token: null });
  assert.equal(anonymous.status, 401);
  h.record("REST search without a key is refused", { status: anonymous.status });
}
