# The 35B suite: runbook (run 2026-10-08; results in FINDINGS.md)

The live-tier test suite (`../live/TEST-REPORT.md`) re-performed with the smaller model in the brain's seat: **Qwen3.6-35B-A3B** (`Qwen3.6-35B-A3B-NVFP4`, cartridge `dgx-spark/quick-qwen`, the "Spark Sprinter"), every design **performed twice** (k = 2), on the same books, prompts and rules as the 122B suite, so the two compare design by design. This file is the runbook; the results will land beside it in this folder when the run is made.

**Status: run.** The suite was recorded on 2026-10-08 (95 minutes); the results are in `FINDINGS.md`, `README.md` and `COMPARISON.md` beside this file. What follows is the runbook as it was staged.

## What is the same, what differs

| | 122B suite (recorded) | 35B suite (staged) |
|---|---|---|
| Model / cartridge | `Qwen3.5-122B-A10B-NVFP4` / `dgx-spark/giant-qwen` | `Qwen3.6-35B-A3B-NVFP4` / `dgx-spark/quick-qwen` |
| Spark pattern | `reasoning-pair` (both units in the puzzle mode) | `fast-pair` (both units in the `chat` mode, 262k context) |
| Designs, books, evaluators, builds, factors | the ten live designs | the same ten, generated from the same base designs |
| Reply limit, temperature, request timeout | 2,048 tokens, 0, 180 s | the same |
| Performed | twice for eight designs, once for the two servicing designs | **twice for all ten** |
| Designs / evidence / stores | `experiments/live/`, `docs/evidence/live/`, `recordings/` | `experiments/live-35b/`, `docs/evidence/live-35b/`, `recordings/35b/` |

A design has the same id in both suites; its cassette, result and stories are told apart by the folder.

## Before the run: the Sparks (needs the owner's word)

The Sparks are in `puzzle` mode (the 122B). The 35B runs in `chat` mode, so the run needs the units switched, which stops the puzzle software on both for the duration (`craftabot spark plan --pattern fast-pair` says: each unit `puzzle -> chat`, about 7 minutes, in parallel). **This is the second Spark change the plan reserves for the owner (`113-…` D10)**: nothing has been switched, and the run should not start until it is approved.

```bash
npm run craftabot -- spark plan --pattern fast-pair --config packages/packs/dgx-spark/craftabot.config.mjs   # what it would change, changes nothing
npm run craftabot -- spark up --pattern fast-pair --yes --config packages/packs/dgx-spark/craftabot.config.mjs   # takes a lease that remembers what each unit was doing
```

After the run, `spark down` restores what each unit was doing (the puzzle mode).

## The run

```bash
node scripts/live-record.mjs --suite quick --all --resume   # pass 0 of every design (cheapest first), then pass 1; verified and written up after each design's last pass
node scripts/live-check.mjs --suite quick                   # every design replayed from its cassette, held to the committed result
node scripts/live-column.mjs --suite quick                  # this folder's README.md
node scripts/live-compare.mjs                               # COMPARISON.md: the 122B and the 35B side by side
```

**Time.** The 122B suite took 422 minutes for 18 performances; the 35B is about five times quicker per call (`99-DGX-SPARK.md` §5) and this suite performs every design twice, so expect roughly **1.5 to 2.5 hours** wall time, plus the two mode switches. `--resume` skips a pass already on disk, so a stopped run restarts with the same command.

**Smoke first (optional, about 10 minutes).** `node scripts/live-smoke.mjs --suite quick --items <file> <design>` runs chosen items against the 35B, into `recordings/smoke-quick/`. A smaller model may stall where the 122B did not (a loop on a refused action, a reply that never reaches a tool call); a smoke of one or two items per design shows it before two hours rest on it.

## What to read from it

- **Agreement with each desk's rule**, the 35B beside the 122B, with the intervals: the 122B suite's headline was that seeing the rule was the difference (lending 53% → 100%); the question here is whether a model a fifth of the size can use it.
- **pass^2 and consistency**: the 35B's wording and calls may be less repeatable.
- **Cells lost** to a model's habits (stalls, retried refusals, timeouts), which `COMPARISON.md` totals per design.
- **Whether a control now has something to catch.** Most 122B designs sit at a ceiling (*untestable*); a weaker model that errs more is where the stacks have an effect to measure, and `controls-live` is the attack scenarios against a model likelier to be fooled.
- **Cost**: tokens a case and wall time.

## Limits to carry into the report

One sample per design per model at temperature 0, performed twice; the 35B is a mixture-of-experts model with about 3 billion active parameters served by the same stack, so its non-determinism is its own and is measured by the trials, not assumed from the 122B's. Everything is evidence about this synthetic bank. The prompts were tuned against the 122B (the desks' stage goals and refusals were reworded where it stalled); a stall the 35B shows that the 122B did not is a finding about the prompts' fit to a smaller model, not only about the model.
