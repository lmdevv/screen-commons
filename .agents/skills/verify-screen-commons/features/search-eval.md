# Search eval

An agent asks catalog questions such as "How does Spotify let users create a playlist?" and needs the right app's flow first, or a clear answer that an app isn't in the catalog. The eval asks 34 judged questions against a copy of the production Spotify catalog's shape and records how flow and screen search answer them. It records a baseline and gates nothing.

## Sub-features

- `eval-seed` publishes the `spotify-shape` fixture: 317 Spotify flows over 1,150 screens, then the decoy apps Vercel, Linear, Stripe and Fixture Tunes.
- `eval-flows` asks each question through `GET /api/v1/flows?q=…&limit=8`, which is what `search_flows` calls.
- `eval-screens` asks each question through `GET /api/v1/screens?q=…&limit=12`, which is what `search_screens` calls.
- `eval-score` judges the top 3 answers as hit at 1, hit at 3, app not found, miss, wrong app or empty.
- `eval-rows` records `x-sc-d1-rows` and latency for every call.
- `eval-split` reports the 17 tuning and 17 holdout questions separately, or runs one split.

## How to get to it (user POV)

- Run `control seed spotify-shape --run <id>` (driven).
- Run `control drive search-eval --run <id>` (driven).
- Run `SC_EVAL_SPLIT=holdout control drive search-eval --run <id>`, or `tuning` (driven).
- Run the scorer's tests with `node --test '.agents/skills/verify-screen-commons/eval/*.test.mjs'` (driven).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- `control seed spotify-shape --run <id>` printed 317 flows and 1,150 screens for Spotify. Seed once per instance before the eval, and again whenever you like, since a reseed changes nothing.

Run `control drive search-eval --run <id>`, which performs these steps.

- **Seeded.** `h.sql` counts 317 published Spotify flows, or the journey fails and names the seed command.
- **Ground truth.** `h.sql` reads every flow step, so a screen counts as an answer when a flow it belongs to is expected.
- **Questions.** Each case in `eval/search-cases.json` is asked of flow search and screen search with an API key.
- **Score.** `eval/score.mjs` judges each answer. A case names expected flows, with or without an app, or a missing app. A missing app counts as found only when the response's `match.appNotFound` names it.
- **Report.** The journey writes `eval.json` with every case, its top 3 answers, outcome, rows and milliseconds, then `eval.txt` with a table per split. It prints the table to stderr.
- **Proof.** Read `test-results/verify/<run>/search-eval-*/eval.json` and `eval.txt`.

## Gotchas

- The eval exits 0 whatever the scores. A failed request still fails it.
- Without the seed, the eval fails at once and names the seed command.
- Rows are `null` per call, and `rows` is `unavailable` in the report, on an instance launched with `SC_D1_COUNTER=0`.
- Results order by recency today, so the decoys, published last, win the fallback. Compare runs only between instances seeded the same way.
- The fixture's decoy Linear, Vercel and Stripe flows join the apps the launch seeded.
