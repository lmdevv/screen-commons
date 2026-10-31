import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/** API keys in Settings, then REST and remote MCP with that key, then revocation of both. */
export default async function apiAccess(h) {
  const page = await h.newPage();
  await h.signIn(page, h.admin, "/settings");
  await page.getByRole("link", { name: "API keys" }).click();
  await page.waitForURL(/tab=keys/u);
  await h.step("Settings opens the API keys tab", page);

  const name = `Verify key ${h.stamp}`;
  await page.getByRole("button", { name: "Create key" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Create key" }).click();
  const token = (await page.getByTestId("new-token").locator("code").textContent())?.trim() ?? "";
  assert.match(token, /^sc_[A-Za-z0-9_-]+$/u);
  await h.step("a new key shows its token once", page);
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("row", { name: new RegExp(name, "u") }).waitFor();
  await h.step("the key is listed", page);
  const [row] = await h.sql(
    "the key's row holds no plaintext",
    "SELECT * FROM api_key WHERE name = ?1",
    [name],
  );
  assert.equal(row.revoked_at, null);
  assert.ok(!JSON.stringify(row).includes(token), "no column holds the token");
  assert.equal(row.hash, createHash("sha256").update(token).digest("hex"));

  const me = await h.api("me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, h.admin.email);
  h.record("REST identifies the key's owner", {
    status: me.status,
    email: me.body.email,
    role: me.body.role,
  });

  const keys = await h.api("keys", { token });
  assert.ok(keys.status === 401 || keys.status === 403, "keys can't manage keys");
  h.record("a key can't manage keys", { status: keys.status });

  const client = await h.remoteMcp(token);
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  assert.ok(names.includes("search_screens") && names.includes("upload_screen"), "catalog tools");
  h.record("MCP lists the catalog tools", { tools: names });

  const call = await h.call(client, "an MCP tool call succeeds", "search_screens", {
    query: "pricing",
  });
  assert.equal(call.isError, false);
  assert.ok(JSON.parse(call.text).items.length >= 1);

  await page.getByRole("button", { name: `Revoke ${name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke key" }).click();
  await page.getByText("Key revoked").waitFor();
  await page.getByRole("row", { name: new RegExp(name, "u") }).waitFor({ state: "detached" });
  await h.step("revoking removes the key", page);

  const revokedRest = await h.api("me", { token });
  // The raw call, for the status code a client hides.
  const revokedMcp = await h.mcp("tools/list", undefined, token);
  const revokedClient = await h.call(client, "a revoked key stops an open client", "get_taxonomy");
  assert.equal(revokedClient.isError, true);
  assert.equal(revokedRest.status, 401);
  assert.equal(revokedMcp.status, 401);
  h.record("a revoked key is refused", { rest: revokedRest.status, mcp: revokedMcp.status });
  const [gone] = await h.sql(
    "the key's row records the revocation",
    "SELECT name, revoked_at FROM api_key WHERE name = ?1",
    [name],
  );
  assert.ok(gone?.revoked_at, "the row keeps when it was revoked");
}
