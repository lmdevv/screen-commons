export const OUTCOMES = ["hit@1", "hit@3", "app-not-found", "miss", "wrong-app", "empty"];

const TOP = 3;

const relevant = (expect, result) =>
  (!expect.app || result.app === expect.app) &&
  result.flows.some((name) => expect.flows.includes(name));

export function judge(expect, results, appNotFound) {
  const top = results.slice(0, TOP);
  if (expect.missingApp) {
    if (appNotFound?.toLowerCase() === expect.missingApp.toLowerCase()) return "app-not-found";
    return top.length > 0 ? "wrong-app" : "empty";
  }
  if (top[0] && relevant(expect, top[0])) return "hit@1";
  if (top.some((result) => relevant(expect, result))) return "hit@3";
  if (expect.app && top.some((result) => result.app !== expect.app)) return "wrong-app";
  return "miss";
}

export function tally(cases, surfaces) {
  const summary = {};
  for (const scored of cases) {
    summary[scored.split] ??= Object.fromEntries(
      surfaces.map((surface) => [surface, Object.fromEntries(OUTCOMES.map((o) => [o, 0]))]),
    );
    for (const surface of surfaces) summary[scored.split][surface][scored[surface].outcome] += 1;
  }
  return summary;
}

export function rowStats(rows) {
  const known = rows.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (known.length === 0) return null;
  const at = (fraction) =>
    known[Math.min(known.length - 1, Math.ceil(fraction * known.length) - 1)];
  return { calls: known.length, median: at(0.5), p95: at(0.95) };
}

export function shortfalls(summary, thresholds) {
  const found = [];
  for (const [surface, splits] of Object.entries(thresholds)) {
    for (const [split, { minAnswered = 0, maxWrongApp = Infinity }] of Object.entries(splits)) {
      const counts = summary[split]?.[surface];
      if (!counts) continue;
      const answered = counts["hit@1"] + counts["app-not-found"];
      if (answered < minAnswered) {
        found.push(`${surface} ${split} answered ${answered} < ${minAnswered}`);
      }
      if (counts["wrong-app"] > maxWrongApp) {
        found.push(`${surface} ${split} wrong-app ${counts["wrong-app"]} > ${maxWrongApp}`);
      }
    }
  }
  return found;
}
