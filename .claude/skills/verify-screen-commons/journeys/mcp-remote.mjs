import assert from "node:assert/strict";

const CATALOG = [
  "create_flow",
  "get_app",
  "get_flow",
  "get_screen",
  "get_taxonomy",
  "list_apps",
  "search_flows",
  "search_screens",
  "upload_screen",
];

const memberKey = async (page, h, name) => {
  const response = await page.request.post(`${h.base}/api/v1/keys`, {
    headers: { origin: h.base },
    data: { name },
  });
  assert.equal(response.status(), 201);
  return (await response.json()).token;
};

const webp = (bytes) => bytes.toString("ascii", 8, 12) === "WEBP";

/** The remote server at /mcp with the SDK's Streamable HTTP client: every catalog tool, both roles. */
export default async function mcpRemote(h) {
  const endpoint = `${h.base}/mcp`;
  const rpc = (headers, body = { jsonrpc: "2.0", id: 1, method: "tools/list" }) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  const anonymous = await rpc({});
  const wrongKey = await rpc({ authorization: "Bearer sc_not_a_real_key" });
  const noAccept = await rpc({ authorization: `Bearer ${h.adminKey}`, accept: "application/json" });
  const get = await fetch(endpoint, { headers: { authorization: `Bearer ${h.adminKey}` } });
  const tooLarge = await rpc(
    { authorization: `Bearer ${h.adminKey}` },
    `{"pad":"${"x".repeat(41 * 1024 * 1024)}"}`,
  );
  h.record("endpoint refuses what it should", {
    anonymous: anonymous.status,
    wwwAuthenticate: anonymous.headers.get("www-authenticate"),
    wrongKey: wrongKey.status,
    noAccept: noAccept.status,
    get: get.status,
    allow: get.headers.get("allow"),
    tooLarge: tooLarge.status,
  });
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get("www-authenticate") ?? "", /^Bearer/u);
  assert.equal(wrongKey.status, 401);
  assert.equal(noAccept.status, 406);
  assert.equal(get.status, 405);
  assert.equal(tooLarge.status, 413);

  const admin = await h.remoteMcp();
  const server = admin.getServerVersion();
  assert.equal(server.name, "screen-commons");
  assert.match(admin.getInstructions() ?? "", /search_screens/u);
  const { tools } = await admin.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), CATALOG);
  for (const tool of tools) {
    const writes = ["upload_screen", "create_flow"].includes(tool.name);
    assert.equal(tool.annotations.readOnlyHint, !writes, `${tool.name} readOnlyHint`);
  }
  h.record("handshake and tool list", {
    server,
    tools: tools.map(({ name, annotations }) => ({ name, readOnly: annotations.readOnlyHint })),
  });

  const taxonomy = await h.call(admin, "get_taxonomy", "get_taxonomy");
  assert.match(taxonomy.text, /signing-up/u);

  const byText = await h.call(admin, "search_screens by screenshot text", "search_screens", {
    query: "billed yearly",
  });
  const found = JSON.parse(byText.text);
  assert.ok(found.items.length >= 3, "text inside screenshots is searchable");
  assert.match(found.items[0].url, new RegExp(`^${h.base}/screens/`, "u"));
  assert.match(found.items[0].thumbUrl, new RegExp(`^${h.base}/media/`, "u"));

  const filtered = JSON.parse(
    (
      await h.call(admin, "search_screens by pattern", "search_screens", {
        pattern: "pricing",
        platform: "web",
        limit: 30,
      })
    ).text,
  );
  assert.ok(filtered.items.length >= 9);
  assert.ok(filtered.items.every((screen) => screen.patterns.includes("pricing")));

  const firstPage = JSON.parse(
    (await h.call(admin, "search_screens first page", "search_screens", { limit: 2 })).text,
  );
  assert.ok(firstPage.nextCursor, "more than one page");
  const secondPage = JSON.parse(
    (
      await h.call(admin, "search_screens next page", "search_screens", {
        limit: 2,
        cursor: firstPage.nextCursor,
      })
    ).text,
  );
  assert.equal(secondPage.items.length, 2, "the cursor returns the next page");
  const pageIds = new Set(firstPage.items.map((screen) => screen.id));
  assert.ok(
    secondPage.items.every((screen) => !pageIds.has(screen.id)),
    "pages don't overlap",
  );

  const refused = await h.call(admin, "an invalid pattern is refused", "search_screens", {
    pattern: "not-a-pattern",
  });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /-32602.*Invalid option/su);

  const apps = JSON.parse((await h.call(admin, "list_apps", "list_apps", { limit: 50 })).text);
  assert.ok(apps.items.length >= 9);
  const app = apps.items.at(-1);
  const detail = JSON.parse((await h.call(admin, "get_app", "get_app", { slug: app.slug })).text);
  assert.equal(detail.slug, app.slug);
  assert.ok(detail.screenCount >= 2);
  const missing = await h.call(admin, "get_app for a missing slug", "get_app", {
    slug: "no-such-app",
  });
  assert.equal(missing.isError, true);
  assert.match(missing.text, /^not_found/u);

  const flows = JSON.parse(
    (
      await h.call(admin, "search_flows by type", "search_flows", {
        type: "signing-up",
        platform: "web",
      })
    ).text,
  );
  assert.ok(flows.items.length >= 1);
  const flowDetail = await h.call(admin, "get_flow with images", "get_flow", {
    id: flows.items[0].id,
    includeImages: true,
  });
  const flow = JSON.parse(flowDetail.text);
  assert.ok(flow.steps.length >= 2);
  assert.equal(flowDetail.images.length, flow.steps.length, "a thumbnail per step");
  assert.ok(flowDetail.images.every((image) => webp(image.bytes)));

  const thumb = await h.call(admin, "get_screen thumbnail", "get_screen", {
    id: found.items[0].id,
  });
  const full = await h.call(admin, "get_screen full size", "get_screen", {
    id: found.items[0].id,
    full: true,
  });
  assert.equal(thumb.images[0].mimeType, "image/webp");
  assert.ok(webp(thumb.images[0].bytes) && webp(full.images[0].bytes));
  assert.ok(full.images[0].bytes.byteLength > thumb.images[0].bytes.byteLength);

  const appName = `Remote MCP ${h.stamp}`;
  const appInput = { name: appName, websiteUrl: `https://remote-${h.stamp}.example.com` };
  const [one, two, mislabeled, pendingImage] = await h.pngs([
    "Remote one",
    "Remote two",
    "Remote mislabeled",
    "Remote pending",
  ]);
  const upload = (client, label, file, type = "image/png", title = file.name) =>
    h.call(client, label, "upload_screen", {
      app: appInput,
      title,
      patterns: ["pricing"],
      image: { type, base64: file.buffer.toString("base64") },
    });

  const first = JSON.parse((await upload(admin, "admin upload_screen", one)).text);
  assert.equal(first.screen.status, "published");
  const second = JSON.parse((await upload(admin, "second admin upload_screen", two)).text);
  const [row] = await h.sql(
    "the upload's row in D1",
    "SELECT s.id, s.status, s.source, s.image_key, a.name AS app, a.id AS app_id FROM screen s JOIN app a ON a.id = s.app_id WHERE s.id = ?1",
    [first.screen.id],
  );
  assert.equal(row.status, "published");
  assert.equal(row.source, "mcp");
  assert.equal(row.app, appName);
  const media = await fetch(`${h.base}/media/${row.image_key}`, {
    headers: { authorization: `Bearer ${h.adminKey}` },
  });
  assert.equal(media.status, 200);
  h.record("the upload's image is in R2", {
    key: row.image_key,
    type: media.headers.get("content-type"),
  });

  const relabeled = JSON.parse(
    (await upload(admin, "a mislabeled image.type is typed by its bytes", mislabeled, "image/webp"))
      .text,
  );
  assert.equal(relabeled.screen.status, "published");
  // The original keeps the type its bytes have, whatever the label said.
  const [relabeledRow] = await h.sql(
    "the mislabeled original is stored as what it is",
    "SELECT original_key FROM screen WHERE id = ?1",
    [relabeled.screen.id],
  );
  assert.match(relabeledRow.original_key ?? "", /\.png$/u);
  const garbage = await h.call(admin, "bytes that aren't an image are refused", "upload_screen", {
    app: appInput,
    image: { type: "image/png", base64: Buffer.from("not an image").toString("base64") },
  });
  assert.equal(garbage.isError, true);
  assert.match(garbage.text, /^unsupported_media_type/u);

  const created = JSON.parse(
    (
      await h.call(admin, "create_flow", "create_flow", {
        appId: row.app_id,
        name: `Remote flow ${h.stamp}`,
        type: "signing-up",
        steps: [
          { screenId: first.screen.id, label: "One" },
          { screenId: second.screen.id, label: "Two" },
        ],
      })
    ).text,
  );
  assert.equal(created.status, "published");
  const tooShort = await h.call(admin, "a one-step flow is refused", "create_flow", {
    appId: row.app_id,
    name: "Too short",
    steps: [{ screenId: first.screen.id }],
  });
  assert.equal(tooShort.isError, true);
  assert.match(tooShort.text, /-32602.*at steps/su);

  const web = await h.newPage();
  await h.signIn(web);
  await h.goto(web, `/flows/${created.id}`);
  await web.getByText(`Remote flow ${h.stamp}`).first().waitFor();
  await h.step("the MCP flow opens in the web app", web);

  const memberPage = await h.newPage();
  const member = await h.signUpMember(memberPage);
  const token = await memberKey(memberPage, h, `Member MCP ${h.stamp}`);
  const memberClient = await h.remoteMcp(token);
  const pending = JSON.parse(
    (await upload(memberClient, "member upload_screen", pendingImage)).text,
  );
  assert.equal(pending.screen.status, "pending");
  const own = await h.call(memberClient, "the member can read their pending screen", "get_screen", {
    id: pending.screen.id,
  });
  assert.equal(own.isError, false);

  const otherPage = await h.newPage();
  await h.signUpMember(otherPage, "/browse/web", "other");
  const otherClient = await h.remoteMcp(await memberKey(otherPage, h, `Other MCP ${h.stamp}`));
  const hidden = await h.call(otherClient, "another member can't read it", "get_screen", {
    id: pending.screen.id,
  });
  assert.equal(hidden.isError, true);
  assert.match(hidden.text, /^not_found/u);
  const inSearch = async (client, label) => {
    const result = await h.call(client, label, "search_screens", { query: appName, limit: 30 });
    assert.equal(result.isError, false, result.text);
    return JSON.parse(result.text).items.some((screen) => screen.id === pending.screen.id);
  };
  assert.equal(await inSearch(memberClient, "the member's search finds it"), true);
  assert.equal(await inSearch(otherClient, "another member's search skips it"), false);

  await h.goto(web, "/review");
  await web
    .getByRole("list", { name: "Pending items" })
    .getByRole("button", { name: new RegExp(pendingImage.name.replace(/\.png$/u, ""), "u") })
    .click();
  await web.keyboard.press("a");
  await web.getByText("Screen approved").waitFor();
  await h.step("an admin approves the MCP upload in /review", web);
  const approved = await h.call(otherClient, "now everyone can read it", "get_screen", {
    id: pending.screen.id,
  });
  assert.equal(approved.isError, false);
  assert.match(approved.text, /"status":"published"/u);
  assert.equal(await inSearch(otherClient, "another member's search now finds it"), true);

  const keys = await (await memberPage.request.get(`${h.base}/api/v1/keys`)).json();
  const key = (keys.items ?? keys).find((item) => item.name === `Member MCP ${h.stamp}`);
  const revoke = await memberPage.request.delete(`${h.base}/api/v1/keys/${key.id}`, {
    headers: { origin: h.base },
  });
  assert.ok(revoke.ok());
  const revoked = await h.call(memberClient, "a revoked key stops an open client", "get_taxonomy");
  assert.equal(revoked.isError, true);
  assert.match(revoked.text, /401|unauthorized/iu);
  h.record("whose key was revoked", { member: member.email });
}
