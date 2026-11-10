import assert from "node:assert/strict";
import { test } from "node:test";

import { judge, rowStats, tally } from "./score.mjs";

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
