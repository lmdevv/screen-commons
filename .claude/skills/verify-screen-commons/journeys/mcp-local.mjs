import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const BROWSER = [
  "browser_extract",
  "browser_navigate",
  "browser_screenshot",
  "browser_status",
  "capture_pages",
  "site_crawl",
];

/** The real capture's size; the returned image is only a preview of it. */
const shotSize = ({ text }) => {
  const [, width, height] = text.match(/^(\d+)×(\d+)/u);
  return { width: Number(width), height: Number(height) };
};

/** The built stdio server with headless capture, against this instance: catalog and browser tools. */
export default async function mcpLocal(h) {
  const local = await h.localMcp();
  const remote = await h.remoteMcp();
  assert.equal(local.getServerVersion().name, "screen-commons-mcp");
  assert.match(local.getInstructions() ?? "", /capture_pages/u);

  const localTools = (await local.listTools()).tools;
  const remoteTools = (await remote.listTools()).tools;
  const names = localTools.map((tool) => tool.name).sort();
  const catalog = remoteTools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [...catalog, ...BROWSER].sort());
  for (const tool of remoteTools) {
    const twin = localTools.find((candidate) => candidate.name === tool.name);
    assert.deepEqual(twin, tool, `${tool.name} has one contract`);
  }
  h.record("both servers share one catalog contract", { catalog, local: names });

  const prompts = (await local.listPrompts()).prompts.map((prompt) => prompt.name).sort();
  assert.deepEqual(prompts, ["capture_site", "find_inspiration"]);
  const prompt = await local.getPrompt({
    name: "capture_site",
    arguments: { url: "https://example.com" },
  });
  assert.match(JSON.stringify(prompt.messages), /capture_pages/u);
  h.record("prompts", { prompts, capture_site: prompt.messages[0].content.text });

  const resources = (await local.listResources()).resources;
  assert.deepEqual(
    resources.map((resource) => resource.uri),
    ["screen-commons://taxonomy"],
  );
  const resource = await local.readResource({ uri: "screen-commons://taxonomy" });
  assert.match(resource.contents[0].text, /signing-up/u);
  h.record("the taxonomy resource", {
    uri: resources[0].uri,
    bytes: resource.contents[0].text.length,
  });

  // One format from either server: the same call returns the same bytes.
  const same = async (label, tool, args = {}) => {
    const [fromLocal, fromRemote] = [
      await h.call(local, `local ${label}`, tool, args),
      await h.call(remote, `remote ${label}`, tool, args),
    ];
    assert.equal(fromLocal.isError, fromRemote.isError, `${label}: isError`);
    assert.equal(fromLocal.text, fromRemote.text, `${label}: text`);
    assert.deepEqual(
      fromLocal.images.map((image) => [image.mimeType, image.bytes.toString("base64")]),
      fromRemote.images.map((image) => [image.mimeType, image.bytes.toString("base64")]),
      `${label}: images`,
    );
    return fromLocal;
  };

  const search = await same("search_screens", "search_screens", { query: "billed yearly" });
  const found = JSON.parse(search.text);
  assert.ok(found.items.length >= 3, "text inside screenshots is searchable");
  assert.ok(found.items[0].url.startsWith(`${h.base}/screens/`), "links are absolute");
  assert.ok(found.items[0].thumbUrl.startsWith(`${h.base}/media/`), "links are absolute");
  await same("search_screens with filters", "search_screens", {
    pattern: "pricing",
    platform: "web",
    limit: 2,
  });
  const empty = await same("search_screens with no match", "search_screens", {
    query: "zzzznothingmatches",
  });
  assert.deepEqual(JSON.parse(empty.text), { items: [], nextCursor: null });

  const screen = await same("get_screen", "get_screen", { id: found.items[0].id });
  assert.equal(screen.images.length, 1);
  assert.equal(screen.images[0].mimeType, "image/webp");
  const fullScreen = await same("get_screen full", "get_screen", {
    id: found.items[0].id,
    full: true,
  });
  assert.ok(fullScreen.images[0].bytes.byteLength > screen.images[0].bytes.byteLength);

  const apps = JSON.parse((await same("list_apps", "list_apps", { limit: 50 })).text);
  const { slug } = apps.items.at(-1);
  const app = JSON.parse((await same("get_app", "get_app", { slug })).text);
  assert.ok(app.screenCount >= 2);

  const flows = JSON.parse(
    (await same("search_flows", "search_flows", { type: "signing-up", platform: "web" })).text,
  );
  const flow = await same("get_flow with images", "get_flow", {
    id: flows.items[0].id,
    includeImages: true,
  });
  const { steps } = JSON.parse(flow.text);
  assert.ok(steps.length >= 2);
  assert.equal(flow.images.length, steps.length, "a thumbnail per step");

  const taxonomy = await same("get_taxonomy", "get_taxonomy");
  assert.ok(JSON.parse(taxonomy.text).patterns.length > 10);

  const missing = await same("get_app for a missing slug", "get_app", { slug: "no-such-app" });
  assert.equal(missing.isError, true);
  assert.match(missing.text, /^not_found: /u);
  const noScreen = await same("get_screen for a missing id", "get_screen", { id: "nope" });
  assert.match(noScreen.text, /^not_found: /u);
  const invalid = await same("an invalid pattern", "search_screens", { pattern: "not-a-pattern" });
  assert.match(invalid.text, /-32602.*Invalid option/su);

  const appName = `Local MCP ${h.stamp}`;
  const appInput = { name: appName, websiteUrl: `https://local-${h.stamp}.example.com` };
  const [one, two, mislabeled, remoteOne, remoteMislabeled] = await h.pngs([
    "Local one",
    "Local two",
    "Local mislabeled",
    "Remote one",
    "Remote mislabeled",
  ]);
  const upload = (client, label, file, type = "image/png") =>
    h.call(client, label, "upload_screen", {
      app: appInput,
      title: file.name,
      image: { type, base64: file.buffer.toString("base64") },
    });
  const firstUpload = JSON.parse((await upload(local, "upload_screen", one)).text);
  assert.equal(firstUpload.screen.status, "published");
  const secondUpload = JSON.parse((await upload(local, "second upload_screen", two)).text);
  const relabeled = JSON.parse(
    (await upload(local, "a mislabeled image is noted", mislabeled, "image/jpeg")).text,
  );
  assert.match(relabeled.note, /the bytes are image\/png/u);

  const remoteUpload = JSON.parse(
    (await upload(remote, "the same upload, remote", remoteOne)).text,
  );
  assert.deepEqual(Object.keys(firstUpload).sort(), Object.keys(remoteUpload).sort());
  assert.deepEqual(firstUpload.app, remoteUpload.app, "both join one app, in one shape");
  assert.deepEqual(Object.keys(firstUpload.screen).sort(), Object.keys(remoteUpload.screen).sort());
  const remoteRelabeled = JSON.parse(
    (await upload(remote, "the same mislabel, remote", remoteMislabeled, "image/jpeg")).text,
  );
  assert.equal(relabeled.note, remoteRelabeled.note);

  const garbage = await same("bytes that aren't an image", "upload_screen", {
    app: appInput,
    image: { type: "image/png", base64: Buffer.from("not an image").toString("base64") },
  });
  assert.match(garbage.text, /^unsupported_media_type: /u);

  const [row] = await h.sql(
    "the upload's row in D1",
    "SELECT s.status, s.source, a.id AS app_id FROM screen s JOIN app a ON a.id = s.app_id WHERE s.id = ?1",
    [firstUpload.screen.id],
  );
  assert.equal(row.source, "mcp");
  const flowArgs = (client) => ({
    appId: row.app_id,
    name: `${client} flow ${h.stamp}`,
    steps: [{ screenId: firstUpload.screen.id }, { screenId: secondUpload.screen.id }],
  });
  const created = JSON.parse(
    (await h.call(local, "create_flow", "create_flow", flowArgs("Local"))).text,
  );
  const remoteCreated = JSON.parse(
    (await h.call(remote, "create_flow, remote", "create_flow", flowArgs("Remote"))).text,
  );
  assert.equal(created.stepCount, 2);
  assert.deepEqual(Object.keys(created).sort(), Object.keys(remoteCreated).sort());
  assert.deepEqual(created.steps, remoteCreated.steps);
  const tooShort = await same("a one-step flow", "create_flow", {
    appId: row.app_id,
    name: "Too short",
    steps: [{ screenId: firstUpload.screen.id }],
  });
  assert.match(tooShort.text, /-32602.*at steps/su);

  const site = await h.fixtureSite();
  const status = await h.call(local, "browser_status before use", "browser_status");
  assert.match(status.text, /Active driver: headless/u);
  assert.match(status.text, /Extension bridge: disabled/u);

  const opened = await h.call(local, "browser_navigate", "browser_navigate", {
    url: site.url("/pricing"),
  });
  assert.match(opened.text, new RegExp(`Pricing - Fixture ${h.stamp}`, "u"));

  const shot = await h.call(local, "browser_screenshot viewport", "browser_screenshot");
  assert.equal(shot.images.length, 1);
  // Headless captures at 2x, so the 1440×900 viewport is 2880×1800 pixels.
  assert.deepEqual(shotSize(shot), { width: 2880, height: 1800 });
  const saved = shot.text.match(/saved to (\S+?)\.(?:\s|$)/u)?.[1];
  assert.ok(saved && existsSync(saved), "the full image is saved where the result says");
  const element = await h.call(local, "browser_screenshot one element", "browser_screenshot", {
    selector: "#top",
  });
  assert.equal(shotSize(element).height, 144);
  const tall = await h.call(local, "browser_screenshot full page", "browser_screenshot", {
    fullPage: true,
  });
  assert.ok(shotSize(tall).height > 1800);

  const extracted = JSON.parse((await h.call(local, "browser_extract", "browser_extract")).text);
  assert.equal(extracted.title, `Pricing - Fixture ${h.stamp}`);
  assert.ok(extracted.links.length >= 3, "same-origin links");

  const crawl = await h.call(local, "site_crawl", "site_crawl", {
    url: site.url(),
    maxPages: 10,
    maxDepth: 1,
  });
  for (const path of ["/pricing", "/signup", "/docs"]) {
    assert.ok(crawl.text.includes(site.url(path)), `the crawl finds ${path}`);
  }

  const urls = ["/", "/pricing", "/signup"].map((path) => site.url(path));
  const catalogSize = async (label) => ({
    rows: await h.sql(
      `${label}: rows`,
      "SELECT (SELECT count(*) FROM screen) AS screens, (SELECT count(*) FROM app) AS apps, (SELECT count(*) FROM flow) AS flows",
    ),
    objects: (await h.r2()).length,
  });
  const before = await catalogSize("before a capture that doesn't upload");
  const dry = await h.call(local, "capture_pages with upload=false", "capture_pages", {
    urls,
    upload: false,
  });
  assert.match(dry.text, /not uploaded/u);
  assert.equal(dry.images.length, 3);
  const after = await catalogSize("after a capture that doesn't upload");
  assert.deepEqual(after, before, "upload=false writes no row and no media");

  const captureName = `Captured ${h.stamp}`;
  const flowName = `Captured flow ${h.stamp}`;
  const captured = await h.call(local, "capture_pages uploads a flow", "capture_pages", {
    urls,
    app: {
      name: captureName,
      platform: "web",
      websiteUrl: `https://captured-${h.stamp}.example.com`,
    },
    flow: { name: flowName, type: "signing-up" },
  });
  assert.equal(captured.isError, false, captured.text);
  assert.match(captured.text, /Uploaded 3 screens/u);
  const rows = await h.sql(
    "captured screens in D1",
    `SELECT s.source, s.status, s.source_url, s.patterns FROM screen s JOIN app a ON a.id = s.app_id
     WHERE a.name = ?1 ORDER BY s.source_url`,
    [captureName],
  );
  assert.equal(rows.length, 3);
  assert.ok(rows.every((item) => item.source === "mcp" && item.status === "published"));

  const words = await h.api(
    `search?q=${encodeURIComponent(`words only in the capture ${h.stamp}`)}`,
  );
  assert.equal(words.body.screens.length, 3, "page text is searchable after capture");

  const captureSlug = captured.text.match(/\/apps\/([\w-]+)/u)[1];
  const web = await h.newPage();
  await h.signIn(web);
  await h.goto(web, `/apps/${captureSlug}?tab=flows`);
  await web.getByText(flowName).first().waitFor();
  await h.step("the capture and its flow show in the web app", web);

  const noKey = await h.localMcp({ label: "no-key", token: null });
  const noKeySearch = await h.call(noKey, "no key: catalog tools explain", "search_screens", {
    query: "pricing",
  });
  assert.equal(noKeySearch.isError, true);
  assert.match(noKeySearch.text, /SCREEN_COMMONS_API_KEY/u);
  const noKeyTaxonomy = await h.call(noKey, "no key: taxonomy is bundled", "get_taxonomy");
  assert.equal(noKeyTaxonomy.text, taxonomy.text, "the bundled copy is the same contract");
  const noKeyCapture = await h.call(noKey, "no key: upload capture is refused", "capture_pages", {
    urls: [site.url()],
  });
  assert.equal(noKeyCapture.isError, true);
  assert.match(noKeyCapture.text, /upload=false/u);

  const badKey = await h.localMcp({ label: "bad-key", token: "sc_not_a_real_key" });
  const badKeySearch = await h.call(badKey, "a bad key is explained", "search_screens", {
    query: "pricing",
  });
  assert.equal(badKeySearch.isError, true);
  assert.match(badKeySearch.text, /rejected the API key \(401\)/u);

  const memberPage = await h.newPage();
  await h.signUpMember(memberPage);
  const created_key = await memberPage.request.post(`${h.base}/api/v1/keys`, {
    headers: { origin: h.base },
    data: { name: `Local member ${h.stamp}` },
  });
  const member = await h.localMcp({ label: "member", token: (await created_key.json()).token });
  const pending = await h.call(member, "a member's capture is pending", "capture_pages", {
    urls: [site.url("/docs")],
    app: {
      name: `Member capture ${h.stamp}`,
      platform: "web",
      websiteUrl: `https://member-${h.stamp}.example.com`,
    },
  });
  assert.equal(pending.isError, false, pending.text);
  assert.match(pending.text, /\(pending\)/u);
  assert.match(pending.text, /pending until an admin approves/u);
}
