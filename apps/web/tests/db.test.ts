import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { D1Database } from "@cloudflare/workers-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { writeTestWranglerConfig } from "./wrangler-config";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");

let stateDir: string;
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;

/** Database-level invariants (triggers), against a fresh local D1 with all migrations applied. */
beforeAll(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "screen-commons-db-test-"));
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

describe("0003_global_app_slugs (migration safety)", () => {
  it("renames cross-platform duplicate slugs before enforcing global uniqueness", async () => {
    const dir = await mkdtemp(join(tmpdir(), "screen-commons-migration-test-"));
    try {
      const source = join(webDir, "../../packages/db/migrations");
      const migrations = join(dir, "migrations");
      await mkdir(migrations);
      const files = (await readdir(source)).filter((file) => file.endsWith(".sql")).sort();
      const copy = (names: string[]) =>
        Promise.all(names.map((file) => copyFile(join(source, file), join(migrations, file))));
      const config = writeTestWranglerConfig(dir, { migrationsDir: migrations });
      const wrangler = (...args: string[]) =>
        execFileSync(
          "pnpm",
          [
            "exec",
            "wrangler",
            "d1",
            ...args,
            "--local",
            "--config",
            config,
            "--persist-to",
            join(dir, "state"),
          ],
          { cwd: webDir, env: { ...process.env, CI: "1" }, stdio: "pipe" },
        ).toString();

      await copy(files.filter((file) => file < "0003"));
      wrangler("migrations", "apply", "DB");
      wrangler(
        "execute",
        "DB",
        "--command",
        `INSERT INTO app (id, slug, name, platform, created_at) VALUES
          ('a-web', 'linear', 'Linear', 'web', 1),
          ('a-ios', 'linear', 'Linear', 'ios', 2),
          ('a-android', 'linear', 'Linear', 'android', 3),
          ('b-web', 'linear-ios', 'Linear iOS fan site', 'web', 4)`,
      );

      await copy(files.filter((file) => file >= "0003"));
      wrangler("migrations", "apply", "DB");
      const output = wrangler(
        "execute",
        "DB",
        "--json",
        "--command",
        "SELECT id, slug FROM app ORDER BY id",
      );
      const [{ results }] = JSON.parse(output) as [{ results: { id: string; slug: string }[] }];
      expect(Object.fromEntries(results.map((row) => [row.id, row.slug]))).toEqual({
        "a-android": "linear-android",
        "a-ios": "linear-ios",
        "a-web": "linear",
        "b-web": "linear-ios-b-web",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
