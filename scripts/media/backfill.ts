/**
 * Bring existing screens up to the current display policy (WebP display images and thumbnails
 * under versioned keys) through the admin backfill endpoint, one page at a time:
 *
 *   pnpm media:backfill --url http://localhost:5173 --key sc_… [--limit 10] [--dry-run]
 *
 * Safe to interrupt and re-run: processed screens are marked with the policy version, derivatives
 * are content addressed and reused, and replaced images are kept as the screen's original.
 * Screens that fail (e.g. the Images binding is down) are reported and retried by the next run.
 */
import { parseArgs } from "node:util";

import { createScreenCommonsClient } from "../../packages/core/src/index";

const log = (message: string) => process.stderr.write(`${message}\n`);

async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      key: { type: "string" },
      limit: { type: "string", default: "10" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const baseUrl = (values.url ?? process.env.SCREEN_COMMONS_URL ?? "http://localhost:5173").replace(
    /\/+$/u,
    "",
  );
  const apiKey = values.key ?? process.env.SCREEN_COMMONS_API_KEY;
  if (!apiKey) throw new Error("Missing --key sc_… (an admin API key)");
  const dryRun = values["dry-run"];
  const client = createScreenCommonsClient({
    baseUrl,
    apiKey,
    headers: { "x-screen-commons-client": "screen-commons-backfill/0.1.0" },
  });
  log(`${dryRun ? "Dry run against" : "Backfilling"} ${baseUrl}`);

  const counts = { updated: 0, current: 0, failed: 0, pending: 0 };
  let cursor: string | undefined;
  let remaining = 0;
  do {
    const page = await client.backfillDisplay({ limit: Number(values.limit), cursor, dryRun });
    for (const item of page.items) {
      counts[item.action] += 1;
      if (item.action !== "current") {
        log(
          `${item.action.padEnd(8)} ${item.screenId}  ${item.imageKey}  ${item.thumbKey}${item.reason ? `  (${item.reason})` : ""}`,
        );
      }
    }
    cursor = page.nextCursor ?? undefined;
    remaining = page.remaining;
  } while (cursor);

  log(
    dryRun
      ? `${counts.pending} screens below the current display policy`
      : `${counts.updated} updated, ${counts.current} already current, ${counts.failed} failed; ${remaining} still below the policy`,
  );
  if (counts.failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  log(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
