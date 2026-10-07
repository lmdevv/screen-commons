import type { Screen } from "@open-ui/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { sql } from "drizzle-orm";

import { appOrigin, getDb } from "../../server/env";
import * as services from "../../server/services";

type ScreenThumb = Pick<Screen, "id" | "title" | "thumbUrl" | "width" | "height" | "app">;

export interface LandingData {
  /** Published web screens, one per app where possible, most popular first. */
  screens: ScreenThumb[];
  /** A few published pricing pages (MCP example result). */
  pricing: ScreenThumb[];
  counts: { apps: number; screens: number; flows: number };
  /** This instance's public origin, for the MCP snippet. */
  origin: string;
}

const thumb = ({ id, title, thumbUrl, width, height, app }: Screen): ScreenThumb => ({
  id,
  title,
  thumbUrl,
  width,
  height,
  app,
});

/**
 * Public, logged-out safe: only published content (viewer = null). Media of published content is
 * public, so thumbnails can be shown on the landing page.
 */
export const getLandingData = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingData> => {
    const [page, pricing, totals] = await Promise.all([
      services.listScreens(null, { platform: "web", sort: "popular", limit: 60 }),
      services.listScreens(null, { platform: "web", pattern: "pricing", limit: 4 }),
      getDb().all<{ apps: number; screens: number; flows: number }>(
        sql`SELECT
          (SELECT count(*) FROM app WHERE status = 'published') AS apps,
          (SELECT count(*) FROM screen WHERE status = 'published') AS screens,
          (SELECT count(*) FROM flow WHERE status = 'published') AS flows`,
      ),
    ]);
    // Prefer landing pages, one per app, so the strip shows variety.
    const ranked = [...page.items].sort(
      (a, b) => Number(b.patterns.includes("landing")) - Number(a.patterns.includes("landing")),
    );
    const picked: Screen[] = [];
    const seen = new Set<string>();
    for (const screen of ranked) {
      if (seen.has(screen.app.id)) continue;
      seen.add(screen.app.id);
      picked.push(screen);
      if (picked.length === 8) break;
    }
    for (const screen of page.items) {
      if (picked.length === 8) break;
      if (!picked.includes(screen)) picked.push(screen);
    }
    setResponseHeader("cache-control", "public, max-age=60");
    const row = totals[0];
    return {
      screens: picked.map(thumb),
      pricing: pricing.items.map(thumb),
      origin: appOrigin(getRequest()),
      counts: {
        apps: Number(row?.apps ?? 0),
        screens: Number(row?.screens ?? 0),
        flows: Number(row?.flows ?? 0),
      },
    };
  },
);
