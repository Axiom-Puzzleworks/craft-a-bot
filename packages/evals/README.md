# `@craftabot/evals` — the behavioural eval harness

The instrument `13-BRICK-TEST-STRATEGY.md` §8 specifies: run a matrix of
`{goal card × brain × brick config × seed}`, score every trace, diff against a
stored baseline, print a scorecard.

```bash
npm run evals                      # run the scripted matrix, diff, write a scorecard
npm run evals -- --record          # promote this run to the baseline
npm run evals -- --expert          # the expert card, on the budget it advertises
npm run evals -- --strict          # exit non-zero on a regression
```

Artefacts land in `baselines/`. The **baseline** and the **scorecard** are
committed; the full per-run report is not (140 KB that changes every run).

## The three tiers, and what each is for

**`scripted-optimal`** follows the plan the solvability suite proves. It should
be a wall of 100%, and it earns its place by being boring — the day it stops
being boring, a card has become unwinnable and every noisy number below it means
nothing.

**`scripted-noisy`** is the tier worth having. It is _not_ a simulation of a
language model; nothing here predicts what GPT would do. It is a **fixed,
reproducible amount of wrongness** — misnamed things, wasted moves, premature
celebration — so that when the world's wording or the prompt or the memory
summary changes, the change shows up as a movement in the score of a bot whose
behaviour did not change at all. A bot that is always right cannot tell you
whether the world explains itself well, because it never needs an explanation.

**`live`** costs money and is not wired up. `runMatrix` refuses a live column
without a `providerFor`, rather than falling back to the mock and filing
scripted numbers under a real model's name.

## The baseline gate

`13-…` §8: _"regressions fail the report, not the build (live models drift — the
gate is on our changes via scripted-noisy, the live numbers are telemetry)."_ So
`npm run evals` reports and exits zero; `--strict` is for a CI job that wants a
hard gate.

Two properties do the work:

- **A report carries the noise rates it was run at**, and the comparison
  **refuses** to diff two reports taken with different instruments — different
  seed counts, different noise, different schema. Answering anyway would produce
  a number indistinguishable from a real regression.
- **Re-baselining is a separate, explicit act.** A harness that quietly
  re-baselined would make every regression disappear the moment it was observed.

## What the numbers currently say

Recorded 2026-08-15, 20 seeds, default noise:

| Card                  | optimal | noisy |
| --------------------- | ------- | ----- |
| `say-hello`           | 100%    | 80%   |
| `snack`               | 100%    | 45%   |
| `tidy-the-blocks`     | 100%    | 20%   |
| `locked-chest`        | 100%    | 15%   |
| `sums-for-teddy`      | 100%    | 100%  |
| `free-play`           | 100%    | 100%  |
| `locked-chest-expert` | 100%    | 0%    |

The gradient is the point: the same 12% error rate costs almost nothing on a
four-step card and nearly everything on a thirteen-step one, because a wasted
move desynchronises the plan and every later step compounds it. That is the
information-design signal — how well a card survives an imperfect bot — and it
is what `13-…` §8 wanted measured.

## Adding a card

Nothing here needs changing. Add the card to the pack, add its scripted-optimal
plan to `pack-starter`'s `session/plans.ts` (the solvability suite will fail
until you do), then add its id to `STANDARD_CARDS` in `matrices.ts` and
re-record. The plans deliberately live in the pack, not here: the harness's
optimal tier _is_ the solvability floor, and two copies of a plan is two things
to keep in step.
