import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { D1Database } from "@cloudflare/workers-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");

let stateDir: string;
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;

/** Database-level invariants (triggers), against a fresh local D1 with all migrations applied. */
beforeAll(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "open-ui-db-test-"));
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", stateDir],
    { cwd: webDir, env: { ...process.env, CI: "1" }, stdio: "pipe" },
  );
  proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(webDir, "wrangler.jsonc"),
    persist: { path: join(stateDir, "v3") },
  });
  db = proxy.env.DB;
});

afterAll(async () => {
  await proxy?.dispose();
  await rm(stateDir, { recursive: true, force: true });
});

const insertUser = (id: string) =>
  db.prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)").bind(id, id, `${id}@db.test`);

describe("first admin bootstrap (regression: count-then-insert race)", () => {
  it("promotes exactly one user even when sign-ups are concurrent", async () => {
    const ids = Array.from({ length: 12 }, (_, index) => `racer-${index}`);
    await Promise.all(ids.map((id) => insertUser(id).run()));
    const { results } = await db
      .prepare("SELECT id, role FROM user WHERE id LIKE 'racer-%'")
      .all<{ id: string; role: string }>();
    const admins = results.filter((row) => row.role === "admin");
    expect(results).toHaveLength(12);
    expect(admins).toHaveLength(1);
    const bootstrap = await db.prepare("SELECT admin_user_id FROM instance_bootstrap").all();
    expect(bootstrap.results).toEqual([{ admin_user_id: admins[0]!.id }]);

    // Even after the admin is deleted, later users never become admin automatically.
    await db.prepare("DELETE FROM user WHERE role = 'admin'").run();
    await insertUser("latecomer").run();
    const late = await db.prepare("SELECT role FROM user WHERE id = 'latecomer'").first();
    expect(late).toEqual({ role: "member" });
  });
});

describe("save_count triggers (regression: counters diverging)", () => {
  it("tracks inserts, deletes and cascades from collection or user removal", async () => {
    await db.batch([
      insertUser("saver"),
      db.prepare(
        "INSERT INTO app (id, slug, name, platform, status) VALUES ('app-1', 'app-1', 'App', 'web', 'published')",
      ),
      db.prepare(
        "INSERT INTO screen (id, app_id, image_key, thumb_key, width, height, bytes, thumb_width, thumb_height, status) VALUES ('screen-1', 'app-1', 'k', 'k', 1, 1, 1, 1, 1, 'published')",
      ),
      db.prepare(
        "INSERT INTO collection (id, user_id, name, is_default) VALUES ('c-1', 'saver', 'Saved', 1), ('c-2', 'saver', 'Ideas', 0)",
      ),
      db.prepare(
        "INSERT INTO collection_item (collection_id, kind, item_id) VALUES ('c-1', 'screen', 'screen-1'), ('c-2', 'screen', 'screen-1'), ('c-2', 'app', 'app-1')",
      ),
    ]);
    const counts = async () => ({
      screen: (await db
        .prepare("SELECT save_count AS n FROM screen WHERE id = 'screen-1'")
        .first<{ n: number }>())!.n,
      app: (await db
        .prepare("SELECT save_count AS n FROM app WHERE id = 'app-1'")
        .first<{ n: number }>())!.n,
    });
    expect(await counts()).toEqual({ screen: 2, app: 1 });

    // duplicate save is ignored by the primary key and must not bump the counter
    await db
      .prepare(
        "INSERT OR IGNORE INTO collection_item (collection_id, kind, item_id) VALUES ('c-1', 'screen', 'screen-1')",
      )
      .run();
    expect(await counts()).toEqual({ screen: 2, app: 1 });

    await db.prepare("DELETE FROM collection WHERE id = 'c-2'").run();
    expect(await counts()).toEqual({ screen: 1, app: 0 });

    await db.prepare("DELETE FROM user WHERE id = 'saver'").run();
    expect(await counts()).toEqual({ screen: 0, app: 0 });
  });
});
