import assert from "node:assert/strict";

/** The local server's preferred driver: the real extension, paired over the bridge in its Options. */
export default async function mcpExtension(h) {
  const pairingToken = `verify-pairing-token-${h.stamp}`;
  const bridgePort = await h.freePort();
  const site = await h.fixtureSite();
  const local = await h.localMcp({ label: "bridge", bridgePort, pairingToken });

  const unpaired = await h.call(local, "before pairing the driver is headless", "browser_status");
  assert.match(unpaired.text, /Active driver: headless/u);
  assert.match(unpaired.text, /no extension connected/u);

  const { options } = await h.extensionBrowser();
  const status = options.getByRole("status").filter({ hasText: "127.0.0.1" });
  await options.getByRole("textbox", { name: "Port" }).fill(String(bridgePort));
  await options.getByRole("textbox", { name: "Pairing token" }).fill("wrong-pairing-token-000");
  await options.getByRole("button", { name: "Save" }).click();
  await options.getByRole("button", { name: "Test bridge" }).click();
  await status.filter({ hasText: "Pairing token rejected" }).waitFor();
  await h.step("a wrong token is rejected", options);
  const still = await h.call(
    local,
    "a rejected browser doesn't become the driver",
    "browser_status",
  );
  assert.match(still.text, /Active driver: headless/u);

  await options.getByRole("textbox", { name: "Pairing token" }).fill(pairingToken);
  await options.getByRole("button", { name: "Save" }).click();
  await options.getByRole("button", { name: "Test bridge" }).click();
  await status.filter({ hasText: "Connected" }).waitFor();
  await h.step("the right token connects", options);

  const paired = await h.call(local, "browser_status reports the extension", "browser_status");
  assert.match(paired.text, /Active driver: extension/u);
  assert.match(paired.text, /connected \(screen-commons-extension/u);

  const opened = await h.call(local, "browser_navigate in the real browser", "browser_navigate", {
    url: site.url("/pricing"),
  });
  assert.equal(opened.isError, false, opened.text);
  assert.match(opened.text, /\(extension/u);

  const shot = await h.call(
    local,
    "browser_screenshot through the extension",
    "browser_screenshot",
  );
  assert.equal(shot.isError, false, shot.text);
  assert.equal(shot.images.length, 1);
  assert.match(shot.text, /via extension/u);

  const extracted = await h.call(local, "browser_extract through the extension", "browser_extract");
  assert.equal(extracted.isError, false, extracted.text);
  assert.equal(JSON.parse(extracted.text).title, `Pricing - Fixture ${h.stamp}`);

  const crawl = await h.call(local, "site_crawl through the extension", "site_crawl", {
    url: site.url(),
    maxPages: 6,
  });
  assert.equal(crawl.isError, false, crawl.text);
  assert.ok(crawl.text.includes(site.url("/signup")));
  // Crawl and capture results don't name their driver, and a lost extension falls back to headless.
  const afterCrawl = await h.call(local, "the extension is still the driver", "browser_status");
  assert.match(afterCrawl.text, /Active driver: extension/u);

  const name = `Extension capture ${h.stamp}`;
  const captured = await h.call(local, "capture_pages through the extension", "capture_pages", {
    urls: [site.url("/"), site.url("/pricing")],
    app: { name, platform: "web", websiteUrl: `https://extension-${h.stamp}.example.com` },
    flow: { name: `Extension flow ${h.stamp}`, type: "exploring" },
  });
  assert.equal(captured.isError, false, captured.text);
  assert.match(captured.text, /Uploaded 2 screens/u);
  const rows = await h.sql(
    "captured screens in D1",
    "SELECT s.source, s.status, s.source_url, s.width FROM screen s JOIN app a ON a.id = s.app_id WHERE a.name = ?1",
    [name],
  );
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.source === "mcp" && row.status === "published"));
  // The extension captures at the browser's scale; headless would have made these 2880 wide.
  assert.ok(
    rows.every((row) => row.width === 1440),
    "captured by the extension, not headless",
  );
  const afterCapture = await h.call(local, "the extension did the capture", "browser_status");
  assert.match(afterCapture.text, /Active driver: extension/u);

  const slug = captured.text.match(/\/apps\/([\w-]+)/u)[1];
  const web = await h.newPage();
  await h.signIn(web);
  await h.goto(web, `/apps/${slug}?tab=flows`);
  await web.getByText(`Extension flow ${h.stamp}`).first().waitFor();
  await h.step("the extension's capture shows in the web app", web);
}
