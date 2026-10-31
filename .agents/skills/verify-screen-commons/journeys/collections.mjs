import assert from "node:assert/strict";

/** Save from the viewer, the S key and REST; collections at /saved; deletion. */
export default async function collections(h) {
  const page = await h.newPage();
  const member = await h.signUpMember(page);
  const name = `Refs ${h.stamp}`;
  const screens = (await h.api("screens?platform=web&limit=3")).body.items;
  const items = (kind, id) =>
    h.sql(
      `collection items for ${kind}`,
      `SELECT c.name, i.kind, i.item_id FROM collection_item i
       JOIN collection c ON c.id = i.collection_id JOIN user u ON u.id = c.user_id
       WHERE u.email = ?1 AND i.kind = ?2 AND i.item_id = ?3`,
      [member.email, kind, id],
    );

  await h.goto(page, `/browse/web?tab=screens&screen=${screens[0].id}`);
  const viewer = page.getByRole("dialog").filter({ has: page.getByRole("complementary") });
  await viewer.waitFor();
  const save = viewer.getByRole("button", { name: /^Save(d)?$/u });
  assert.equal(await save.getAttribute("aria-pressed"), "false");
  await save.click();
  await page.getByRole("button", { name: "Add to collection" }).click();
  const picker = page.getByRole("dialog", { name: "Save to collection" });
  await picker.getByLabel("New collection name").fill(name);
  await picker.getByRole("button", { name: "Create" }).click();
  const entry = picker.getByRole("button", { name: new RegExp(name, "u") });
  await entry.waitFor();
  assert.equal(await entry.getAttribute("aria-pressed"), "true");
  await h.step("viewer saves into a new collection", page);
  const rows = await items("screen", screens[0].id);
  assert.ok(
    rows.some((row) => row.name === name),
    "the row is in the new collection",
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForURL((url) => !url.searchParams.has("screen"));

  await h.goto(page, "/saved");
  await page.getByRole("link", { name: new RegExp(name, "u") }).click();
  await page.getByRole("heading", { name }).waitFor();
  await page.locator(`main [data-screen-id="${screens[0].id}"]`).waitFor();
  await h.step("the collection lists the saved screen", page);

  await h.goto(page, `/screens/${screens[1].id}`);
  const standalone = page.getByRole("button", { name: /^Save(d)?$/u });
  assert.equal(await standalone.getAttribute("aria-pressed"), "false");
  await page.keyboard.press("s");
  await page.waitForFunction(
    (el) => el?.getAttribute("aria-pressed") === "true",
    await standalone.elementHandle(),
  );
  await h.step("S saves on the standalone page", page);
  assert.equal(
    (await items("screen", screens[1].id))[0]?.name,
    "Saved",
    "S uses the default collection",
  );
  await page.keyboard.press("s");
  await page.waitForFunction(
    (el) => el?.getAttribute("aria-pressed") === "false",
    await standalone.elementHandle(),
  );
  await h.step("S again unsaves", page);
  assert.deepEqual(await items("screen", screens[1].id), []);

  const app = (await h.api("apps?platform=web&limit=1")).body.items[0];
  const saved = await page.request.post(`${h.base}/api/v1/saves`, {
    headers: { origin: h.base },
    data: { kind: "app", id: app.id },
  });
  h.record("REST saves an app with the session", { status: saved.status() });
  assert.equal(saved.status(), 204);
  assert.equal((await items("app", app.id)).length, 1);

  await h.goto(page, "/saved");
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Saved/u })
    .first()
    .click();
  await page.getByText("Default", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Delete collection" }).count(), 0);
  await h.step("the default collection can't be deleted", page);

  await h.goto(page, "/saved");
  await page.getByRole("link", { name: new RegExp(name, "u") }).click();
  await page.getByRole("button", { name: "Delete collection" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete collection" }).click();
  await page.waitForURL(/\/saved$/u);
  await page.getByRole("link", { name: new RegExp(name, "u") }).waitFor({ state: "detached" });
  await h.step("deleted collection leaves /saved", page);
  // Saving also put it in the default collection, and that copy stays.
  assert.deepEqual(
    (await items("screen", screens[0].id)).map((row) => row.name),
    ["Saved"],
  );
}
