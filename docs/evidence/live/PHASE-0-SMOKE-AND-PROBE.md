# Phase 0: the live smoke and the determinism probe

_2026-10-07, the 122B (`Qwen3.5-122B-A10B-NVFP4`, `dgx-spark/giant-qwen`) on both DGX Sparks in the `reasoning-pair` pattern. Plan: `docs/design-day2/113-RECORDING-AND-RELIABILITY.md` §13. The Sparks were already in that shape (both serving the 122B under the puzzle software's mode), so nothing was changed and no lease was taken. The runs' own stores are under `recordings/` (gitignored)._

## The smoke: did WP193's desk fixes end the loops?

`node scripts/live-smoke.mjs` recorded the items the first live recording failed on for real (`smoke-items.json`) and eight it did not, once each, on the fixed desk.

| Design | Items that failed for real | Now fail | Controls fine | Calls in the longest cell |
| --- | ---: | ---: | ---: | ---: |
| `complaints-stack-live` | 2 | 0 | 3 of 3 | 4 |
| `fraud-stack-live` | 20 | 0 | 3 of 3 | 37 |
| `advice-context-live` | 2 | 0 | 2 of 2 | 18 |
| **All** | **24** | **0** | **8 of 8** | |

**Gate passed** (the plan's gate was "more than 2 of the 24 still loop: stop"): none does. Every one of the 24 cells' worth of items now ends in `SUCCESS` or `STOPPED_BY_GUARDRAIL`, in 4 to 37 calls where the first recording used 30 to 60 turns repeating one failing call. Fraud's longest cells (about 30 calls) are the `policy-cards` ones, where a guard stopped or slowed the bot; those are worth reading in Phase 1, but none is a loop of the old kind.

What this does not show: one performance of each item, so it says the loops are gone, not that the bot is reliable on these items (that is what the trials are for); and the fraud `contact` stage's twelve cells were the ones whose cause (the model's own verify-before-disclosing instinct) the plan said it could not separate from the prompt; they now finish, so the screen note appears to have been enough.

## The probe: how repeatable is the 122B?

24 first-tick prompts (8 each from the complaints, fraud and advice recordings), each sent 5 times per configuration and arm, 1,080 requests, no failures. Intervals are over prompts.

| Configuration | Arm | Same text | Same call | First differs at char | Token spread |
| --- | --- | --- | --- | ---: | ---: |
| spark-619c alone | temperature 0 | 10% (5–16%) | 93% (87–98%) | 48 | 5.9 |
| spark-619c alone | temperature 0, seed | 6% (3–10%) | 97% (92–100%) | 46 | 6.5 |
| spark-619c alone | temperature 0.7, seed | 3% (2–5%) | 84% (74–93%) | 25 | 8.2 |
| spark-ef08 alone | temperature 0 | 14% (7–22%) | 98% (95–100%) | 44 | 5.4 |
| spark-ef08 alone | temperature 0, seed | 5% (3–8%) | 97% (92–100%) | 43 | 6.3 |
| spark-ef08 alone | temperature 0.7, seed | 0% (0–1%) | 88% (77–97%) | 28 | 7.6 |
| the pair | temperature 0 | 7% (3–13%) | 93% (87–98%) | 41 | 5.7 |
| the pair | temperature 0, seed | 11% (4–21%) | 93% (85–98%) | 38 | 6.5 |
| the pair | temperature 0.7, seed | 4% (2–6%) | 88% (79–97%) | 24 | 8.8 |

Between units (same prompt, an answer from each): same text 9% (temperature 0), 7% (with a seed), 3% (warm); same call 96%, 97%, 86%.

**Three answers, each from the numbers:**

1. **The model repeats its words about one time in ten, and its call about nineteen times in twenty.** At temperature 0 the same prompt gives the same text in 7–14% of pairs and the same tool call, with the same arguments, in 93–98%. The first difference comes about 45 characters in. So a journey's *decision* at one tick is nearly repeatable and its *wording* almost never is, and because each tick's wording becomes the next tick's memory, paths fork over a journey: this is what the trials measure, and why one performance of a cell says little.
2. **A seed does not make a live run repeatable.** Temperature 0 with a seed reads 5–11% same text, no better than without one (7–14%). The serving stack's own non-determinism (batching and numerics), not the sampling, is what varies. A request `seed` therefore does not belong in a recording's manifest, and a live `reperform` cannot be expected to match a recording exactly.
3. **The pair adds no detectable variance.** Each unit alone repeats itself about as often as the pair does (10%, 14% and 7% at temperature 0), and the two units agree with each other about as often as each agrees with itself (9%). The load can stay spread over both.

Warm sampling (0.7) lowers the same-call rate to 84–88% and the same-text rate to 0–4%, so the live designs keep temperature 0.
