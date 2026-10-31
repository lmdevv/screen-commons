import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** The production package as a user gets it: packed, installed outside the workspace, then used. */
export default async function mcpPackage(h) {
  const { client, manifest, files } = await h.packagedMcp();
  h.record("the package's manifest and files", { manifest, files });
  assert.equal(manifest.name, "screen-commons-mcp");
  assert.equal(manifest.private, undefined);
  for (const [name, range] of Object.entries(manifest.dependencies)) {
    assert.match(range, /^\^\d/u, `${name} has a range npm understands`);
    assert.ok(!name.startsWith("@screen-commons/"), `${name} is bundled, not a dependency`);
  }
  assert.ok(files.includes("dist/index.js") && files.includes("README.md"));
  assert.ok(files.includes("LICENSE"));
  assert.ok(files.every((file) => !file.endsWith(".map") && !file.startsWith("src/")));

  const workspace = JSON.parse(
    readFileSync(new URL("../../../../packages/mcp/package.json", import.meta.url), "utf8"),
  );
  assert.equal(workspace.private, true, "development can't publish the workspace package");

  const server = client.getServerVersion();
  assert.equal(server.name, "screen-commons-mcp");
  assert.equal(server.version, manifest.version);
  const remote = await h.remoteMcp();
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, (await remote.listTools()).tools.length + 7);

  const args = { query: "billed yearly" };
  const packaged = await h.call(client, "search_screens from the package", "search_screens", args);
  const hosted = await h.call(remote, "search_screens from remote", "search_screens", args);
  assert.equal(packaged.isError, false);
  assert.equal(packaged.text, hosted.text, "one format");

  const { id } = JSON.parse(packaged.text).items[0];
  const screen = await h.call(client, "get_screen from the package", "get_screen", { id });
  assert.equal(screen.images[0].mimeType, "image/webp");

  // sharp and playwright-core have to work from a plain npm install.
  const site = await h.fixtureSite();
  const name = `Packaged ${h.stamp}`;
  const captured = await h.call(client, "capture_pages from the package", "capture_pages", {
    urls: [site.url("/"), site.url("/pricing")],
    app: { name, platform: "web", websiteUrl: `https://packaged-${h.stamp}.example.com` },
    flow: { name: `Packaged flow ${h.stamp}`, type: "exploring" },
  });
  assert.equal(captured.isError, false, captured.text);
  assert.match(captured.text, /Uploaded 2 screens/u);
  const rows = await h.sql(
    "the capture in D1",
    "SELECT s.source, s.status FROM screen s JOIN app a ON a.id = s.app_id WHERE a.name = ?1",
    [name],
  );
  assert.deepEqual(rows, [
    { source: "mcp", status: "published" },
    { source: "mcp", status: "published" },
  ]);
}
