import assert from "node:assert/strict";

const CATALOG = [
  "create_flow",
  "delete_flow",
  "delete_screen",
  "get_app",
  "get_flow",
  "get_screen",
  "get_taxonomy",
  "list_apps",
  "search_flows",
  "search_screens",
  "update_flow",
  "update_screen",
  "upload_screen",
];

const WRITES = [
  "create_flow",
  "delete_flow",
  "delete_screen",
  "update_flow",
  "update_screen",
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
    assert.equal(
      tool.annotations.readOnlyHint,
      !WRITES.includes(tool.name),
      `${tool.name} readOnlyHint`,
    );
    assert.equal(tool.annotations.openWorldHint, tool.name === "upload_screen");
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
  assert.deepEqual(
    flow.imagePositions,
    flow.steps.map((step) => step.position),
    "each image names its step",
  );
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
  const notBase64 = await h.call(admin, "an image that isn't base64 is refused", "upload_screen", {
    app: appInput,
    image: { type: "image/png", base64: "not base64!" },
  });
  assert.equal(notBase64.isError, true);
  assert.match(notBase64.text, /^bad_request: /u);

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

  // A 1920×1320 WebP by URL: the image is served exactly as sent, whatever the thumbnail crops.
  const original = await h.canvasImage();
  const images = await h.imageHost({ "shot.webp": original });
  const urlInput = {
    app: appInput,
    title: "From a URL",
    image: { url: images.url("/short/shot.webp") },
  };
  const byUrl = JSON.parse(
    (await h.call(admin, "upload_screen by URL", "upload_screen", urlInput)).text,
  );
  assert.equal(byUrl.screen.status, "published");
  assert.equal(byUrl.screen.url, `${h.base}/screens/${byUrl.screen.id}`);
  assert.equal(byUrl.note, undefined);
  const repeated = JSON.parse(
    (await h.call(admin, "the same bytes by URL again", "upload_screen", urlInput)).text,
  );
  assert.deepEqual(repeated.screen, byUrl.screen, "identical bytes return the same screen");
  const asBase64 = JSON.parse(
    (
      await h.call(admin, "the same bytes as base64", "upload_screen", {
        app: appInput,
        image: { type: "image/webp", base64: original.toString("base64") },
      })
    ).text,
  );
  assert.equal(asBase64.screen.id, byUrl.screen.id, "however the bytes arrive");
  const fullImage = await h.call(admin, "the URL upload at full size", "get_screen", {
    id: byUrl.screen.id,
    full: true,
  });
  const stored = JSON.parse(fullImage.text);
  assert.deepEqual([stored.width, stored.height], [1920, 1320]);
  assert.ok(fullImage.images[0].bytes.equals(original), "get_screen full returns the same bytes");
  const servedFull = Buffer.from(await (await fetch(stored.imageUrl)).arrayBuffer());
  assert.ok(servedFull.equals(original), "the full image URL serves the same bytes");
  const [fidelity] = await h.sql(
    "the URL upload's size in D1",
    "SELECT width, height, thumb_width, thumb_height, source_url, image_key FROM screen WHERE id = ?1",
    [byUrl.screen.id],
  );
  assert.deepEqual([fidelity.width, fidelity.height], [1920, 1320]);
  assert.equal(fidelity.source_url, null, "an asset URL isn't the page the screen came from");
  await h.goto(web, `/screens/${byUrl.screen.id}`);
  await h.step("the 1920×1320 URL upload in the web app", web);

  const urlRefused = async (label, path, pattern) => {
    const result = await h.call(admin, label, "upload_screen", {
      app: appInput,
      image: { url: images.url(path) },
    });
    assert.equal(result.isError, true, label);
    assert.match(result.text, pattern);
  };
  await urlRefused("a missing image URL", "/missing", /^unprocessable: .*HTTP 404/u);
  await urlRefused("a URL that returns a page", "/page", /^unsupported_media_type: .*text\/html/u);
  await urlRefused("a declared size over the limit", "/huge", /^payload_too_large: /u);
  await urlRefused("a body over the limit", "/endless", /^payload_too_large: /u);
  await urlRefused("a redirect loop", "/loop", /^unprocessable: .*more than 3 times/u);
  await urlRefused("a redirect to another scheme", "/to-ftp", /^bad_request: .*must use https/u);
  await urlRefused("a body that never ends", "/hang", /^unprocessable: .*timed out/u);
  const ftp = await h.call(admin, "a URL with another scheme", "upload_screen", {
    app: appInput,
    image: { url: "ftp://example.com/a.webp" },
  });
  assert.match(ftp.text, /^bad_request: image\.url must use https, not ftp/u);
  const noPath = await h.call(admin, "image.path is local only", "upload_screen", {
    app: appInput,
    image: { path: "/etc/hostname" },
  });
  assert.match(noPath.text, /-32602.*image must be \{ type, base64 \} or \{ url \}/su);

  // Retrying with one id, and a flow that returns to a screen.
  const flowId = crypto.randomUUID();
  const retryArgs = {
    id: flowId,
    appId: row.app_id,
    name: `Retried flow ${h.stamp}`,
    description: "Safe to repeat",
    steps: [{ screenId: first.screen.id }, { screenId: second.screen.id }],
  };
  const retry1 = JSON.parse(
    (await h.call(admin, "create_flow with an id", "create_flow", retryArgs)).text,
  );
  const retry2 = JSON.parse(
    (await h.call(admin, "create_flow repeated", "create_flow", retryArgs)).text,
  );
  assert.equal(retry1.id, flowId);
  assert.equal(retry1.description, "Safe to repeat");
  assert.deepEqual(retry2, retry1, "a repeated call returns the same flow");
  const [{ n: retryRows }] = await h.sql(
    "one flow row after a retry",
    "SELECT count(*) AS n FROM flow WHERE id = ?1",
    [flowId],
  );
  assert.equal(retryRows, 1);
  const badId = await h.call(admin, "a flow id that isn't a UUID", "create_flow", {
    ...retryArgs,
    id: "nope",
  });
  assert.match(badId.text, /-32602/u);

  const repeatSteps = [first.screen.id, second.screen.id, first.screen.id, byUrl.screen.id];
  const repeating = JSON.parse(
    (
      await h.call(admin, "create_flow repeating a screen", "create_flow", {
        appId: row.app_id,
        name: `Repeating flow ${h.stamp}`,
        steps: repeatSteps.map((screenId) => ({ screenId })),
      })
    ).text,
  );
  assert.deepEqual(repeating.steps, repeatSteps);
  const repeatingDetail = JSON.parse(
    (await h.call(admin, "get_flow repeating a screen", "get_flow", { id: repeating.id })).text,
  );
  assert.deepEqual(
    repeatingDetail.steps.map((step) => [step.position, step.screen.id]),
    repeatSteps.map((id, position) => [position, id]),
  );
  const inFlows = JSON.parse(
    (
      await h.call(admin, "get_screen lists a repeating flow once", "get_screen", {
        id: first.screen.id,
      })
    ).text,
  ).flows.filter((item) => item.id === repeating.id);
  assert.deepEqual(
    inFlows.map((item) => item.position),
    [0],
  );
  await h.goto(web, `/flows/${repeating.id}?screen=${first.screen.id}`);
  await h.step("a flow repeating a screen, in the web app", web);
  const walked = [];
  for (let press = 0; press < 3 && !web.url().includes(byUrl.screen.id); press += 1) {
    await web.keyboard.press("ArrowRight");
    await web.waitForTimeout(400);
    walked.push(new URL(web.url()).searchParams.get("screen"));
  }
  h.record("arrow keys through a flow repeating a screen", { repeatSteps, walked });
  assert.equal(walked.at(-1), byUrl.screen.id, "the arrows reach every step");
  await h.step("the arrows reach the step after the repeat", web);

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

  // Managing contributions: the owner can, others get 403 on what they can see, 404 on what they can't.
  const [editable, hiddenImage, memberTwo] = await h.pngs([
    "Member edit",
    "Member hidden",
    "Member two",
  ]);
  const editableScreen = JSON.parse(
    (await upload(memberClient, "member uploads to edit", editable)).text,
  );
  const hiddenScreen = JSON.parse(
    (await upload(memberClient, "member uploads to keep", hiddenImage)).text,
  );
  const secondScreen = JSON.parse(
    (await upload(memberClient, "member's second screen", memberTwo)).text,
  );
  assert.equal(editableScreen.screen.status, "pending");
  const memberHost = await h.canvasImage();
  const hosted = await h.imageHost({ "member.webp": memberHost });
  const memberByUrl = JSON.parse(
    (
      await h.call(memberClient, "member upload_screen by URL", "upload_screen", {
        app: appInput,
        image: { url: hosted.url("/short/member.webp") },
      })
    ).text,
  );
  assert.equal(memberByUrl.screen.status, "pending", "moderation state is visible on the result");

  const edited = JSON.parse(
    (
      await h.call(memberClient, "update_screen as its owner", "update_screen", {
        id: editableScreen.screen.id,
        title: `Edited ${h.stamp}`,
        patterns: ["checkout"],
        tags: ["edited"],
      })
    ).text,
  );
  assert.equal(edited.title, `Edited ${h.stamp}`);
  assert.deepEqual(edited.patterns, ["checkout"]);
  assert.equal(edited.status, "pending", "an edit doesn't change the moderation state");
  const cleared = JSON.parse(
    (
      await h.call(memberClient, "update_screen clears a title", "update_screen", {
        id: editableScreen.screen.id,
        title: null,
      })
    ).text,
  );
  assert.equal(cleared.title, null);
  assert.deepEqual(cleared.patterns, ["checkout"], "omitted fields stay");
  const badPattern = await h.call(
    memberClient,
    "update_screen with a bad pattern",
    "update_screen",
    {
      id: editableScreen.screen.id,
      patterns: ["not-a-pattern"],
    },
  );
  assert.match(badPattern.text, /-32602/u);

  const memberFlow = JSON.parse(
    (
      await h.call(memberClient, "member create_flow", "create_flow", {
        appId: row.app_id,
        name: `Member flow ${h.stamp}`,
        steps: [{ screenId: editableScreen.screen.id }, { screenId: hiddenScreen.screen.id }],
      })
    ).text,
  );
  assert.equal(memberFlow.status, "pending");
  const usedId = await h.call(otherClient, "another member can't reuse a flow id", "create_flow", {
    ...retryArgs,
  });
  assert.match(usedId.text, /^bad_request: This flow id is already in use/u);
  const renamed = JSON.parse(
    (
      await h.call(memberClient, "update_flow renames and reorders", "update_flow", {
        id: memberFlow.id,
        name: `Renamed flow ${h.stamp}`,
        description: "Edited by MCP",
        steps: [
          { screenId: secondScreen.screen.id, label: "Now first" },
          { screenId: hiddenScreen.screen.id },
          { screenId: editableScreen.screen.id },
        ],
      })
    ).text,
  );
  assert.equal(renamed.name, `Renamed flow ${h.stamp}`);
  assert.equal(renamed.description, "Edited by MCP");
  assert.deepEqual(
    renamed.steps.map((step) => step.screen.id),
    [secondScreen.screen.id, hiddenScreen.screen.id, editableScreen.screen.id],
  );
  assert.equal(renamed.stepCount, 3);
  const shortened = await h.call(memberClient, "update_flow with one step", "update_flow", {
    id: memberFlow.id,
    steps: [{ screenId: secondScreen.screen.id }],
  });
  assert.match(shortened.text, /-32602.*at steps/su);
  const foreignStep = await h.call(
    memberClient,
    "update_flow with a missing screen",
    "update_flow",
    {
      id: memberFlow.id,
      steps: [{ screenId: "nope" }, { screenId: secondScreen.screen.id }],
    },
  );
  assert.match(foreignStep.text, /^bad_request: Every step must be/u);

  const refusals = [
    ["update_screen", { id: hiddenScreen.screen.id, title: "Taken" }, "screen"],
    ["delete_screen", { id: hiddenScreen.screen.id }, "screen"],
    ["update_flow", { id: memberFlow.id, name: "Taken" }, "flow"],
    ["delete_flow", { id: memberFlow.id }, "flow"],
  ];
  for (const [tool, args, kind] of refusals) {
    const refusal = await h.call(otherClient, `another member can't ${tool} hidden`, tool, args);
    assert.equal(refusal.isError, true);
    assert.equal(refusal.text, `not_found: ${kind} not found`);
    const byAdmin = await h.call(admin, `an admin can't ${tool} another's`, tool, args);
    assert.equal(byAdmin.isError, true);
    assert.match(byAdmin.text, /^forbidden: Only the contributor/u);
  }
  for (const [tool, id] of [
    ["update_screen", first.screen.id],
    ["delete_screen", first.screen.id],
    ["update_flow", created.id],
    ["delete_flow", created.id],
  ]) {
    const args = { id, ...(tool.startsWith("update") ? { title: "Taken", name: "Taken" } : {}) };
    const refusal = await h.call(otherClient, `another member can't ${tool} published`, tool, args);
    assert.equal(refusal.isError, true);
    assert.match(refusal.text, /^forbidden: Only the contributor/u);
  }
  h.record(
    "nobody else changed them",
    await h.sql("titles after refused edits", "SELECT title FROM screen WHERE id IN (?1, ?2)", [
      hiddenScreen.screen.id,
      first.screen.id,
    ]),
  );

  const deletedScreen = JSON.parse(
    (
      await h.call(memberClient, "delete_screen as its owner", "delete_screen", {
        id: hiddenScreen.screen.id,
      })
    ).text,
  );
  assert.deepEqual(deletedScreen, { id: hiddenScreen.screen.id, deleted: true });
  const afterDelete = JSON.parse(
    (
      await h.call(memberClient, "the flow loses the deleted step", "get_flow", {
        id: memberFlow.id,
      })
    ).text,
  );
  assert.deepEqual(
    afterDelete.steps.map((step) => [step.position, step.screen.id]),
    [
      [0, secondScreen.screen.id],
      [1, editableScreen.screen.id],
    ],
  );
  assert.equal(afterDelete.stepCount, 2);
  const gone = await h.call(memberClient, "a deleted screen is gone", "get_screen", {
    id: hiddenScreen.screen.id,
  });
  assert.match(gone.text, /^not_found/u);
  const twice = await h.call(memberClient, "deleting twice is not_found", "delete_screen", {
    id: hiddenScreen.screen.id,
  });
  assert.match(twice.text, /^not_found/u);
  const deletedFlow = JSON.parse(
    (await h.call(memberClient, "delete_flow as its owner", "delete_flow", { id: memberFlow.id }))
      .text,
  );
  assert.deepEqual(deletedFlow, { id: memberFlow.id, deleted: true });
  const flowGone = await h.sql(
    "the flow's rows are gone, its screens stay",
    "SELECT (SELECT count(*) FROM flow WHERE id = ?1) AS flows, (SELECT count(*) FROM flow_step WHERE flow_id = ?1) AS steps, (SELECT count(*) FROM screen WHERE id = ?2) AS screens",
    [memberFlow.id, editableScreen.screen.id],
  );
  assert.deepEqual(flowGone[0], { flows: 0, steps: 0, screens: 1 });

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
