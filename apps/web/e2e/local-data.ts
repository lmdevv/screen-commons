/**
 * Removes what an E2E run wrote, straight from the dev server's local D1 database and R2 bucket,
 * through the Local Explorer API that the Cloudflare Vite plugin serves under `vite dev` (on by
 * default; `X_LOCAL_EXPLORER=false` turns it off).
 *
 * There is no product API for this: approving a contribution publishes its app for good, and
 * members can't delete their account. So the suites that write data run against a local dev
 * server only, and purge both before (a crashed earlier run) and after.
 */

export interface E2EData {
  /** Member accounts the run signs up; their sessions, collections and API keys go with them. */
  emails: readonly string[];
  /** Apps the run contributes to, by name; their screens, flows and media go with them. */
  appNames: readonly string[];
}

export function isLocalBase(base: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname);
}

async function explorer<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/cdn-cgi/local/explorer/api${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  if (response.status === 404) {
    throw new Error(
      `Local Explorer ${path}: 404. E2E cleanup needs \`vite dev\` (pnpm dev) with the Local Explorer on.`,
    );
  }
  if (!response.ok) throw new Error(`Local Explorer ${path}: ${await response.text()}`);
  const body = (await response.json()) as { success: boolean; result: T; errors: unknown[] };
  if (!body.success) throw new Error(`Local Explorer ${path}: ${JSON.stringify(body.errors)}`);
  return body.result;
}

/**
 * Deletes the accounts and apps in `data`, everything that hangs off them and the media nothing
 * else uses. D1 enforces foreign keys, so sessions, accounts, API keys, collections and flow steps
 * cascade, and the FTS and save-count triggers fire for every deleted row.
 */
export async function purgeE2EData(base: string, data: E2EData): Promise<void> {
  if (!isLocalBase(base)) throw new Error(`E2E cleanup only runs against a local dev server`);
  const databases = await explorer<{ uuid: string }[]>(base, "/d1/database");
  const { buckets } = await explorer<{ buckets: { name: string }[] }>(base, "/r2/buckets");
  if (databases.length !== 1 || buckets.length !== 1) {
    throw new Error("E2E cleanup expects exactly one local D1 database and one R2 bucket");
  }
  const raw = (queries: { sql: string; params?: readonly string[] }[]) =>
    explorer<{ results: { rows: (string | number | null)[][] } }[]>(
      base,
      `/d1/database/${databases[0]!.uuid}/raw`,
      // A batch runs as one transaction: the purge lands whole or not at all.
      { method: "POST", body: JSON.stringify({ batch: queries }) },
    );

  // Statements share the parameters: ?1… the emails, then the app names.
  const params = [...data.emails, ...data.appNames];
  const list = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => `?${from + index}`).join(", ") || "NULL";
  const emails = list(1, data.emails.length);
  const names = list(data.emails.length + 1, data.appNames.length);
  // Admins are never purged, whatever the email list says.
  const users = `SELECT id FROM user WHERE email IN (${emails}) AND role != 'admin'`;
  // Apps named for the tests or created by the test accounts (earlier runs included).
  const apps = `SELECT id FROM app WHERE name IN (${names}) OR contributor_id IN (${users})`;
  const screens = `SELECT id FROM screen WHERE app_id IN (${apps}) OR contributor_id IN (${users})`;
  const flows = `SELECT id FROM flow WHERE app_id IN (${apps}) OR contributor_id IN (${users})`;
  const query = async (sql: string) =>
    (await raw([{ sql, params }]))[0]?.results.rows.map((row) => row[0]) ?? [];

  // A purged screen can sit in someone else's flow; deleting it would leave that flow with a gap.
  const [broken] = await query(
    `SELECT flow_id FROM flow_step WHERE screen_id IN (${screens}) AND flow_id NOT IN (${flows})`,
  );
  if (broken) throw new Error(`E2E cleanup would break flow ${broken}; clean it up by hand`);

  // Media is content-addressed, so a key can be shared: keep any key a surviving row still uses.
  // Listed before the rows go (a failed purge can simply run again), deleted after.
  const media = (
    await query(
      `SELECT key FROM (
         SELECT image_key AS key FROM screen WHERE id IN (${screens})
         UNION SELECT thumb_key FROM screen WHERE id IN (${screens})
         UNION SELECT original_key FROM screen WHERE id IN (${screens})
         UNION SELECT logo_key FROM app WHERE id IN (${apps})
       ) WHERE key IS NOT NULL
       EXCEPT SELECT image_key FROM screen WHERE id NOT IN (${screens})
       EXCEPT SELECT thumb_key FROM screen WHERE id NOT IN (${screens})
       EXCEPT SELECT original_key FROM screen WHERE id NOT IN (${screens})
       EXCEPT SELECT logo_key FROM app WHERE id NOT IN (${apps})`,
    )
  ).filter((key): key is string => typeof key === "string");

  await raw([
    ...[
      // Saves point at items by id without a foreign key: drop other users' saves of purged items.
      `DELETE FROM collection_item WHERE (kind = 'screen' AND item_id IN (${screens}))
         OR (kind = 'flow' AND item_id IN (${flows})) OR (kind = 'app' AND item_id IN (${apps}))`,
      `DELETE FROM flow WHERE id IN (${flows})`,
      `DELETE FROM screen WHERE id IN (${screens})`,
      `DELETE FROM app WHERE id IN (${apps})`,
    ].map((sql) => ({ sql, params })),
    // D1 wants exactly the parameters a statement uses: this one only takes the emails.
    { sql: `DELETE FROM user WHERE id IN (${users})`, params: data.emails },
  ]);
  if (media.length > 0) {
    await explorer(base, `/r2/buckets/${buckets[0]!.name}/objects`, {
      method: "DELETE",
      body: JSON.stringify(media),
    });
  }
}
