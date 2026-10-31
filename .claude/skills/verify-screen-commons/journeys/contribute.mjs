import assert from "node:assert/strict";

const STEPS = ["Sign up", "Verify email", "Welcome"];

/** Hands files to the page as a DataTransfer, the way a drop or a paste delivers them. */
const dataTransfer = (page, files) =>
  page.evaluateHandle(
    (items) => {
      const transfer = new DataTransfer();
      for (const { name, mimeType, base64 } of items) {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        transfer.items.add(new File([bytes], name, { type: mimeType }));
      }
      return transfer;
    },
    files.map(({ name, mimeType, buffer }) => ({
      name,
      mimeType,
      base64: buffer.toString("base64"),
    })),
  );

const rows = (h, label, table, id) =>
  h.sql(label, `SELECT id, status, title, image_key FROM ${table} WHERE id = ?1`, [id]);

/** The wizard from a file picker to its success page, no flow, onto an existing app. */
async function submitScreens(page, h, files, appName, button) {
  await h.goto(page, "/contribute");
  await page.locator('input[type="file"]').setInputFiles(files);
  await page.getByText(new RegExp(`^${files.length} screens? ready`, "u")).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Search apps").fill(appName);
  await page
    .getByRole("option", { name: new RegExp(appName, "u") })
    .first()
    .click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: button }).click();
}

/** Contribute from each intake path, review both ways, and the owner's edit and delete. */
export default async function contribute(h) {
  const appName = `Verify App ${h.stamp}`;
  const flowName = `Signing up ${h.stamp}`;
  const member = await h.newPage();
  const admin = await h.newPage();

  await h.goto(member, "/sign-up?redirect=%2Fcontribute");
  await member.getByRole("button", { name: "Create account" }).click();
  await member.getByText("Enter your name.").waitFor();
  await h.step("sign-up validates inline", member);
  await h.signUpMember(member);

  await h.goto(member, "/browse/web");
  await member.keyboard.press("g");
  await member.getByRole("status").filter({ hasText: "Go to" }).waitFor();
  await member.keyboard.press("c");
  await member.waitForURL(/\/contribute$/u);
  await member.getByRole("heading", { level: 1, name: "Contribute" }).waitFor();
  await h.step("G then C opens Contribute", member);
  await h.goto(member, "/browse/web");
  await member.getByRole("banner").getByRole("link", { name: "Contribute" }).click();
  await member.waitForURL(/\/contribute$/u);
  await member.getByRole("heading", { level: 1, name: "Contribute" }).waitFor();
  await h.step("the top bar link opens Contribute", member);

  const [picked, dropped, pasted] = await h.pngs(STEPS);
  await member.locator('input[type="file"]').setInputFiles(picked);
  await member.getByText("1 screen ready").waitFor();
  await h.step("file picker adds a screen", member);
  await member
    .locator('input[type="file"]')
    .locator("..")
    .dispatchEvent("drop", {
      dataTransfer: await dataTransfer(member, [dropped]),
    });
  await member.getByText("2 screens ready").waitFor();
  await h.step("drop adds a screen", member);
  await member.evaluate(
    (clipboardData) =>
      document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true })),
    await dataTransfer(member, [pasted]),
  );
  await member.getByText("3 screens ready").waitFor();
  await h.step("paste adds a screen", member);
  await member.getByRole("button", { name: "Continue" }).click();

  await member.getByLabel("Search apps").fill(appName);
  await member.getByRole("option", { name: `Create “${appName}”` }).click();
  await member.getByLabel("Website").fill(`https://verify-${h.stamp}.example.com`);
  await member.getByRole("button", { name: "Continue" }).click();

  await member.getByRole("switch", { name: "Save as a flow" }).click();
  await member.getByRole("button", { name: "Continue" }).click();
  await member.getByText("Name the flow.").waitFor();
  await member.getByLabel("Flow name").fill(flowName);
  await member.getByLabel("Flow type").selectOption("signing-up");
  for (const [index, label] of STEPS.entries()) {
    await member.getByLabel(`Step label for screen ${index + 1}`).fill(label);
  }
  await h.step("flow is named and its steps labeled", member);
  await member.getByRole("button", { name: "Continue" }).click();

  await member.getByText("Members’ uploads are reviewed by an admin").waitFor();
  await h.step("review step warns about the queue", member);
  await member.getByRole("button", { name: "Submit 3 screens" }).click();
  await member.getByRole("heading", { name: "Submitted for review" }).waitFor({ timeout: 60_000 });
  await h.step("submit lands as pending", member);

  const link = new URL(
    await member.getByRole("link", { name: "View flow" }).getAttribute("href"),
    h.base,
  );
  const flowId = link.searchParams.get("flow");
  const appSlug = link.pathname.split("/").pop();
  assert.ok(flowId && appSlug, "the success page links to the flow");

  let flow = await (await member.request.get(`${h.base}/api/v1/flows/${flowId}`)).json();
  assert.equal(flow.status, "pending");
  assert.deepEqual(
    flow.steps.map((step) => step.label),
    STEPS,
  );
  h.record("flow is pending in REST", {
    status: flow.status,
    steps: flow.steps.map((s) => [s.label, s.screen.status]),
  });
  const [pendingRow] = await h.sql(
    "flow is pending in D1",
    "SELECT id, name, status FROM flow WHERE id = ?1",
    [flowId],
  );
  assert.equal(pendingRow.status, "pending");
  const [pendingApp] = await h.sql(
    "the new app is pending in D1 too",
    "SELECT status FROM app WHERE slug = ?1",
    [appSlug],
  );
  assert.equal(pendingApp.status, "pending");
  const [firstStep] = flow.steps;
  assert.match(firstStep.screen.imageUrl, /^\/media\/img\/[0-9a-f]{64}\.webp$/u);
  const media = await member.request.get(`${h.base}${firstStep.screen.imageUrl}`);
  assert.equal(media.headers()["content-type"], "image/webp");
  h.record("browser-encoded WebP is served from R2", {
    url: firstStep.screen.imageUrl,
    type: media.headers()["content-type"],
  });

  assert.equal((await member.request.get(`${h.base}/review`)).status(), 404);
  assert.equal(
    (await h.api(`flows?platform=web&limit=100`)).body.items.some((f) => f.id === flowId),
    false,
  );
  h.record("members get 404 at /review; the pending flow is not listed", { review: 404 });

  const other = await h.newPage();
  await h.signUpMember(other, "/browse/web", "other");
  const asOther = async (path) => (await other.request.get(`${h.base}/api/v1/${path}`)).status();
  const hidden = {
    flow: await asOther(`flows/${flowId}`),
    screen: await asOther(`screens/${firstStep.screen.id}`),
    app: await asOther(`apps/${appSlug}`),
  };
  h.record("another member can't read the pending contribution", hidden);
  assert.deepEqual(hidden, { flow: 404, screen: 404, app: 404 });

  await h.signIn(admin, h.admin, "/review");
  await admin.getByRole("link", { name: /^Flows/u }).click();
  await admin.waitForURL(/tab=flows/u);
  const flowRow = admin
    .getByRole("list", { name: "Pending items" })
    .getByRole("button", { name: new RegExp(flowName, "u") });
  await flowRow.click();
  await admin.getByRole("article", { name: `Reviewing ${flowName}` }).waitFor();
  await h.step("admin sees the flow in the queue", admin);
  await admin.keyboard.press("a");
  await admin.getByText("Flow approved").waitFor();
  await h.step("A approves the flow", admin);
  const [publishedRow] = await h.sql(
    "flow and app are published in D1",
    "SELECT f.status AS flow, a.status AS app FROM flow f JOIN app a ON a.id = f.app_id WHERE f.id = ?1",
    [flowId],
  );
  assert.deepEqual(publishedRow, { flow: "published", app: "published" });
  flow = (await h.api(`flows/${flowId}`)).body;
  assert.equal(flow.status, "published");
  for (const step of flow.steps) assert.equal(step.screen.status, "published");
  const visible = { flow: await asOther(`flows/${flowId}`), app: await asOther(`apps/${appSlug}`) };
  h.record("after approval the other member can read it", visible);
  assert.deepEqual(visible, { flow: 200, app: 200 });

  await h.goto(admin, `/apps/${appSlug}?tab=flows`);
  await admin.getByText(flowName).first().waitFor();
  await h.step("the approved flow shows on the app page", admin);

  const [toReject, toDelete] = await h.pngs(["Reject me", "Delete me"]);
  await submitScreens(member, h, [toReject, toDelete], appName, "Submit 2 screens");
  await member.getByRole("heading", { name: "Submitted for review" }).waitFor({ timeout: 60_000 });
  await h.step("a second upload joins the existing app", member);

  await h.goto(admin, "/review");
  const screenRows = admin
    .getByRole("list", { name: "Pending items" })
    .getByRole("button", { name: new RegExp(appName, "u") });
  assert.equal(await screenRows.count(), 2, "both screens wait in the queue");
  await screenRows.first().click();
  await admin.keyboard.press("r");
  await admin.getByLabel(/^Reason/u).fill("Verification: rejected on purpose");
  await h.step("R asks for a reason", admin);
  await admin.keyboard.press("Enter");
  await admin.getByText("Screen rejected").waitFor();
  await screenRows.nth(1).waitFor({ state: "detached" });
  assert.equal(await screenRows.count(), 1, "only the other screen is left");
  await h.step("rejecting removes the item from the queue", admin);
  const [rejected] = await h.sql(
    "the rejected screen and its reason",
    `SELECT s.id, s.status, s.review_reason FROM screen s JOIN app a ON a.id = s.app_id
     WHERE s.status = 'rejected' AND a.name = ?1`,
    [appName],
  );
  assert.equal(rejected.review_reason, "Verification: rejected on purpose");

  const [kept] = await h.sql(
    "the member's remaining pending screen",
    "SELECT s.id, s.status, s.image_key FROM screen s JOIN user u ON u.id = s.contributor_id WHERE u.email LIKE ?1 AND s.status = 'pending'",
    [`member-${h.stamp}@%`],
  );
  assert.ok(kept, "the second screen is still pending");

  await h.goto(member, `/screens/${firstStep.screen.id}`);
  await member.getByRole("button", { name: "Edit contribution" }).click();
  await member.getByLabel("Contribution title").fill(`Edited ${h.stamp}`);
  await member.getByRole("button", { name: "Save changes" }).click();
  await member.getByText("Changes saved").waitFor();
  await h.step("the owner edits a screen", member);
  const edited = (await h.api(`screens/${firstStep.screen.id}`)).body;
  assert.equal(edited.title, `Edited ${h.stamp}`);
  h.record("the edit reads back over REST", { title: edited.title });

  await h.goto(member, `/screens/${kept.id}`);
  await member.getByRole("button", { name: "Delete contribution" }).click();
  await member.getByRole("dialog").getByRole("button", { name: "Delete contribution" }).click();
  await member.getByText("Contribution deleted").waitFor();
  await h.step("the owner deletes a screen", member);
  assert.deepEqual(await rows(h, "the deleted screen is gone from D1", "screen", kept.id), []);

  await h.goto(admin, "/browse/web");
  const [published] = await h.pngs(["Admin upload"]);
  await submitScreens(admin, h, [published], appName, "Publish 1 screen");
  await admin.getByRole("heading", { name: "Published" }).waitFor({ timeout: 60_000 });
  await h.step("an admin upload publishes immediately", admin);
  const adminRows = await h.sql(
    "the admin's upload is published in D1",
    `SELECT s.status FROM screen s JOIN app a ON a.id = s.app_id JOIN user u ON u.id = s.contributor_id
     WHERE a.name = ?1 AND u.email = ?2`,
    [appName, h.admin.email],
  );
  assert.deepEqual(adminRows, [{ status: "published" }]);
}
