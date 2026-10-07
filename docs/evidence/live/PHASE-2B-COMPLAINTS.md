# Phase 2B: the complaints desk, re-recorded with the register rule on the file

_2026-10-07. Plan: `docs/design-day2/113-RECORDING-AND-RELIABILITY.md` §13. `complaints-stack-live` (the 122B on the two Sparks, temperature 0, 55 items × 2 guards × 2 trials = 220 cells) recorded cell-scoped with WP193's desk, in which the complaint file shows the register's rule. The recording and its replay stores are local and gitignored (`recordings/phase2b/`); this note and the plan's notes are what is committed. The exact-replay verification of the recording passes: 220 of 220 cells replay to the recorded path, and 220 of 220 digest to the live run's own store._

## What the first recording said, and what it was measuring

The first live recording read **root-cause-named 25%** and **44 of 110 `policy-cards` cells ending in `ERROR`**. `PHASE-1-DIAGNOSES.md` traced both to the desk, not the model or the stack: the register's convention (only `charges` and `data` complaints are upheld; every other category is recorded `no-error`) was invisible to the bot, so the natural answer (`service` for a branch complaint, `advice` for unsuitable advice) was wrong in 17 of 17 such cases and the card blocked it, again and again.

## Result

| | First recording (rule hidden, 1 trial) | This recording (rule on the file, 2 trials) |
| --- | ---: | ---: |
| `guard=none`, root cause named | 25% | **100%** (110 of 110 cells) |
| `policy-cards`, root cause named | — | 99% (pass^2 98%, 90–100%) |
| `policy-cards` cells ending `ERROR` | 44 of 110 | **2 of 110** |
| redress within bounds, `none` / `policy-cards` | — | 100% / 98% (pass^2 96%, 88–99%) |
| complaint acknowledged, ombudsman disclosed | — | 100% / 100% under both |
| verdict on the stack's effect | — | *inconclusive*: the effect (−0.9 to −1.8 points) is inside the interval; minimum detectable 2.8 points |

**The rule was the missing information.** With it on the file the unguarded bot names the register's root cause in every one of 110 cells, and the stack's stall almost disappears: 42 of the 44 cells that had ended in `ERROR` are now ordinary completions. The first recording's "25%" measured agreement with a convention the bot could not see.

## The two cells that still end in `ERROR` (both `policy-cards`, both trial 1)

1. **`complaint-05fddcde`, a `data` complaint, root-cause stage.** Trial 0 answered `charges` (the register's answer) and went on to offer £25. Trial 1, at the same temperature, answered **`no-error` four times running**, was blocked four times by *root cause on the register*, and ran out of steps. The identical prompt gave a different first answer: the model's own variance, which the unguarded arm shows too, once in 110, by luck of the draw. The card's refusal does not tell the bot what the register gives, so a bot that repeats itself repeats the block. That is a property of the card's `reason` text, and a candidate for the owner (§ below).
2. **`complaint-4d2cc91d`, a `data` complaint, redress stage.** One request at the end of a long generation hit the 60-second request timeout (`AbortError`; 408 events in the run, the only failed call of 629). It is a provider fault, recorded as it happened and replayed as it happened.

## The variance, now measured

- **629 calls**, median 12.1 s, p95 19.8 s, the one maximum the 60.0 s timeout.
- At the first tick the prompt is identical across the two trials: the model made **the same call in 100% (93–100%) of 55 pairs and the same words in 0% (0–7%)** — it chooses the same action and phrases it differently every time.
- Over the whole journey, **85% (74–92%) of items took one path in both trials** under `none` and 84% (72–91%) under `policy-cards`; where trials forked, the median first difference was at call 1–2 and two trials' action sequences were 0.2–0.4 edits apart.

## Two defects the verification found in the recorder itself

Neither is the model's. Both were found by the first live exact-replay verification, which every earlier test (mock providers, one fixed run id counter) could not exercise.

1. **The path digest read run ids.** A live provider streams in its own chunks and a replay splits the recorded text on whitespace, so the same decisions leave different numbers of `think.token` events; ids come from a counter every event advances, and a journey's stage records name the agent runs by id. The workflow section of the digest hashed those ids, so all 220 cells read `mismatch` while every agent run's own events matched. The digest now reads the stage records by what each stage decided and how it ended, with `runId`, `runIds`, `eventId` and `workflowRunId` left out. The recording's stored digests were recomputed from its live store (the old ones were never valid).
2. **A recorded failure replayed under a different kind.** The tap kept an error's `name` as its kind (`AbortError`) when the session reports `engine` for anything without a `kind` of its own, so the replayed run's `error` event differed from the live one. The recording now keeps the kind the session reports. This one differing cell was the 220th.

Both are noted in plan 113 §11 against WP190, with tests: the path digest is unchanged by other run ids and wall-clock times and changes when a stage ends differently.

## What this settles, and what it leaves for the owner

Settled: the complaints "redress collapse" was the hidden register rule, not the stack and not the model; with the rule visible the `policy-cards` stack costs 0.9 to 1.8 points on two measures and is *inconclusive* at this n, not a stall. WP195's complaints cells can run as designed.

For the owner (these change the desk's cards or truth, so they come before the re-record):

1. **Should the card's refusal name the register's answer?** The bot repeating a blocked answer four times is the shape of the first recording's 44 and of the one left. A reason such as "the register gives *charges* for this complaint" would turn a stall into a correction, and would measure the card as a corrective control rather than a purely preventive one.
2. **Should the register's convention stand?** The bot now follows it when it can see it, so "root cause named" reads rule-following. A real bank upholds many service and advice complaints; whether the desk should model that (and draw a complaint's truth from its own summary) is the question `PHASE-1-DIAGNOSES.md` §B3 raised and this does not answer.
