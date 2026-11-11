import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { judge, rowStats, shortfalls, tally } from "./score.mjs";

const playlist = { app: "Spotify", flows: ["Creating a playlist", "Creating a new playlist"] };
const flow = (app, name) => ({ app, flows: [name] });

test("a relevant first result is a hit at 1", () => {
  assert.equal(
    judge(playlist, [flow("Spotify", "Creating a playlist"), flow("Spotify", "Playlist")]),
    "hit@1",
  );
});

test("a relevant second or third result is a hit at 3, and a fourth is not", () => {
  const others = [flow("Spotify", "Playlist"), flow("Spotify", "Playlist detail")];
  assert.equal(judge(playlist, [others[0], flow("Spotify", "Creating a new playlist")]), "hit@3");
  assert.equal(
    judge(playlist, [...others, flow("Spotify", "Queue"), flow("Spotify", "Creating a playlist")]),
    "miss",
  );
});

test("the right flow name from the wrong app is no hit", () => {
  assert.equal(
    judge(playlist, [flow("Fixture Tunes", "Creating a playlist"), flow("Spotify", "Playlist")]),
    "wrong-app",
  );
});

test("a case without an app accepts the flow from any app", () => {
  const anyApp = { flows: ["Creating a playlist"] };
  assert.equal(judge(anyApp, [flow("Fixture Tunes", "Creating a playlist")]), "hit@1");
  assert.equal(judge(anyApp, [flow("Fixture Tunes", "Liking a song")]), "miss");
});

test("a screen counts when any flow it belongs to is expected", () => {
  const screen = { app: "Spotify", flows: ["Playlist detail", "Creating a new playlist"] };
  assert.equal(judge(playlist, [screen]), "hit@1");
  assert.equal(judge(playlist, [{ app: "Spotify", flows: [] }]), "miss");
});

test("a missing app is correct only when the response names it", () => {
  const netflix = { missingApp: "Netflix" };
  const results = [flow("Fixture Tunes", "Downloading an episode")];
  assert.equal(judge(netflix, results, "netflix"), "app-not-found");
  assert.equal(judge(netflix, results), "wrong-app");
  assert.equal(judge(netflix, results, "Spotify"), "wrong-app");
  assert.equal(judge(netflix, []), "empty");
});

test("an empty answer with an expected app is a miss", () => {
  assert.equal(judge(playlist, []), "miss");
});

test("tally counts every outcome per split and surface", () => {
  const summary = tally(
    [
      { split: "tuning", flows: { outcome: "hit@1" }, screens: { outcome: "miss" } },
      { split: "tuning", flows: { outcome: "wrong-app" }, screens: { outcome: "miss" } },
      { split: "holdout", flows: { outcome: "empty" }, screens: { outcome: "hit@3" } },
    ],
    ["flows", "screens"],
  );
  assert.deepEqual(summary.tuning.flows, {
    "hit@1": 1,
    "hit@3": 0,
    "app-not-found": 0,
    miss: 0,
    "wrong-app": 1,
    empty: 0,
  });
  assert.equal(summary.tuning.screens.miss, 2);
  assert.equal(summary.holdout.screens["hit@3"], 1);
});

test("row stats use nearest rank and skip calls without a count", () => {
  assert.deepEqual(rowStats([5, null, 1, 3, 2, 4]), { calls: 5, median: 3, p95: 5 });
  assert.equal(rowStats([null, null]), null);
});

const counts = (overrides) => ({
  "hit@1": 0,
  "hit@3": 0,
  "app-not-found": 0,
  miss: 0,
  "wrong-app": 0,
  empty: 0,
  ...overrides,
});
const gate = { flows: { tuning: { minAnswered: 12, maxWrongApp: 0 } } };

test("a split passes with enough hits at 1 and missing apps, and no wrong app", () => {
  const summary = { tuning: { flows: counts({ "hit@1": 9, "app-not-found": 3, miss: 5 }) } };
  assert.deepEqual(shortfalls(summary, gate), []);
});

test("a split falls short on too few answers or any wrong-app answer", () => {
  const summary = { tuning: { flows: counts({ "hit@1": 11, "hit@3": 5, "wrong-app": 1 }) } };
  assert.deepEqual(shortfalls(summary, gate), [
    "flows tuning answered 11 < 12",
    "flows tuning wrong-app 1 > 0",
  ]);
});

test("a split the run skipped is not gated", () => {
  assert.deepEqual(shortfalls({ holdout: { flows: counts({}) } }, gate), []);
});

test("the gate fails a run whose screen search answers nothing", () => {
  const thresholds = JSON.parse(
    readFileSync(new URL("./thresholds.json", import.meta.url), "utf8"),
  );
  const passing = counts({ "hit@1": 12, "app-not-found": 3 });
  const summary = {
    tuning: { flows: passing, screens: counts({ miss: 14, empty: 3 }) },
    holdout: { flows: passing, screens: counts({ miss: 15, empty: 2 }) },
  };
  assert.deepEqual(shortfalls(summary, thresholds), [
    "screens tuning answered 0 < 3",
    "screens holdout answered 0 < 2",
  ]);
});
