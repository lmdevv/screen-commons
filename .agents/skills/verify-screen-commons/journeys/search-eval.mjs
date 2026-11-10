import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { judge, OUTCOMES, rowStats, tally } from "../eval/score.mjs";

const SURFACES = {
  flows: { path: "flows", mcpDefaultLimit: 8 },
  screens: { path: "screens", mcpDefaultLimit: 12 },
};

export default async function searchEval(h) {
  const split = process.env.SC_EVAL_SPLIT;
  assert.ok([undefined, "tuning", "holdout"].includes(split), `Bad SC_EVAL_SPLIT "${split}"`);
  const { cases } = JSON.parse(
    readFileSync(new URL("../eval/search-cases.json", import.meta.url), "utf8"),
  );
  const chosen = cases.filter((c) => !split || c.split === split);
  const [spotify] = await h.sql(
    "spotify flows",
    "SELECT count(*) AS flows FROM flow f JOIN app a ON a.id = f.app_id WHERE a.slug = 'spotify' AND f.status = 'published'",
  );
  assert.equal(spotify.flows, 317, "Run `control seed spotify-shape` on this instance first");

  const flowsOfScreen = new Map();
  for (const { screen, flow } of await h.sql(
    "flow steps",
    "SELECT fs.screen_id AS screen, f.name AS flow FROM flow_step fs JOIN flow f ON f.id = fs.flow_id",
  )) {
    flowsOfScreen.set(screen, [...(flowsOfScreen.get(screen) ?? []), flow]);
  }
  const asResult = {
    flows: (item) => ({ id: item.id, app: item.app.name, flows: [item.name] }),
    screens: (item) => ({
      id: item.id,
      app: item.app.name,
      flows: flowsOfScreen.get(item.id) ?? [],
    }),
  };

  const scored = [];
  for (const c of chosen) {
    const entry = { id: c.id, split: c.split, query: c.query, expect: c.expect };
    for (const [surface, { path, mcpDefaultLimit }] of Object.entries(SURFACES)) {
      const started = performance.now();
      const response = await h.api(
        `${path}?q=${encodeURIComponent(c.query)}&limit=${mcpDefaultLimit}`,
      );
      const ms = Math.round(performance.now() - started);
      assert.equal(response.status, 200, `${surface} search for "${c.query}"`);
      const results = response.body.items.map(asResult[surface]);
      const header = response.headers["x-sc-d1-rows"];
      entry[surface] = {
        outcome: judge(c.expect, results, response.body.match?.appNotFound),
        top: results.slice(0, 3),
        rows: header === undefined ? null : Number(header),
        ms,
      };
    }
    scored.push(entry);
  }

  const surfaces = Object.keys(SURFACES);
  const report = {
    split: split ?? "all",
    rows: h.d1Counter
      ? Object.fromEntries(surfaces.map((s) => [s, rowStats(scored.map((c) => c[s].rows))]))
      : "unavailable",
    summary: tally(scored, surfaces),
    cases: scored,
  };
  writeFileSync(join(h.out, "eval.json"), `${JSON.stringify(report, null, 2)}\n`);
  const table = formatTable(report);
  writeFileSync(join(h.out, "eval.txt"), table);
  process.stderr.write(table);
  h.record("eval summary", { split: report.split, rows: report.rows, summary: report.summary });
}

function formatTable(report) {
  const lines = [];
  for (const [split, bySurface] of Object.entries(report.summary)) {
    const total = report.cases.filter((c) => c.split === split).length;
    lines.push(`${split} (${total} cases)`, row(["surface", ...OUTCOMES]));
    for (const [surface, counts] of Object.entries(bySurface)) {
      lines.push(row([surface, ...OUTCOMES.map((o) => String(counts[o]))]));
    }
  }
  lines.push(
    report.rows === "unavailable"
      ? "D1 rows per call: unavailable, the run has no counter"
      : `D1 rows per call: ${Object.entries(report.rows)
          .map(([surface, stats]) => `${surface} median ${stats.median}, p95 ${stats.p95}`)
          .join("; ")}`,
  );
  return `${lines.join("\n")}\n`;
}

const row = (cells) =>
  `  ${cells
    .map((cell) => cell.padEnd(15))
    .join("")
    .trimEnd()}`;
