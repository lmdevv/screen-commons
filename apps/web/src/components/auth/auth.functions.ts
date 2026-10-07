import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";

import { githubEnabled } from "../../server/auth";
import { getDb } from "../../server/env";

/** Public: sign-in options and whether the next account will be the instance's first (admin). */
export const getAuthPageInfo = createServerFn({ method: "GET" }).handler(async () => {
  const [row] = await getDb().all<{ users: number }>(sql`SELECT count(*) AS users FROM user`);
  return { github: githubEnabled(), firstAccount: Number(row?.users ?? 0) === 0 };
});
