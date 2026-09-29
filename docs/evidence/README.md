# The reference experiments' results

Each folder here holds one reference experiment's committed result (`80-CONTROL-EFFECTIVENESS-REGISTER.md` §4; `64-TARGET-DESIGN-V5.md` §6.8.3): the design as it ran (`<id>.experiment.json`, its campaign ids filled), the result with its digest (`<id>.experiment-result.json`, `docs/schemas/experiment-result.schema.json`) and the same as markdown (`<id>.experiment-result.md`). `timings.md` records the machine and the wall time each took at full size. CI runs every design again at `--size 200` and `scripts/experiment-shape.mjs` holds the reduced result to the committed one's shape — the same metrics, factors, levels and tiers, a verdict from the same four — never its values.

## What these are evidence of

Every number here is a measurement of **this synthetic bank** — the population `@craftabot/pack-fs-bank` generates from a seed through its cited calibration table (`66-CALIBRATION.md`), the loan book, alert book and advice-request register drawn from it (`67-…`), the three desks' rules held in truth, and the scripted bots that work them — **under these configurations**: the reference autonomy levels (`69-…`, `73-…`, `76-…`), the policy-card stacks, the context rungs and the lending knobs the design names. A result says what a control did to _these_ metrics on _this_ book, with an interval and an _n_, and which runs it rests on.

## What they are not evidence of

- Not of any real book, customer, account or decision: nothing in the population is real (hard rule 9; `45-…`).
- Not of a real bot: the brains are the scripted tiers and, since WP116, the **fallible** tier — the plan played with decision errors planted at a stated rate (`fs-bank`'s `ERROR_RATES`, assumptions awaiting review), every one on the trace as `decision.fault`. A planted rate stands in for a live model's; a live tier recorded to a provider cassette (WP114) is the same file with another brain, and none is recorded yet.
- Not of a real person: every human stage is answered by the bank's case handler (`fs-bank/reviewer/case-handler` — 95% accurate, taking a wrong recommendation three times in ten, one to eight minutes a case; assumptions awaiting review).
- Not of compliance with any rule the obligation tags name: the tags say which obligation a metric speaks to, and the register says whether the control moved the metric; a compliance judgment is a reader's, made against the real book and the real controls.
- Not transferable as magnitudes: a 4-point drop in over-approval on this book is not a 4-point drop anywhere else. What transfers is the method — the design as a file, the analysis as a fold, the verdict as a rule over intervals — and the shape of the result, which is what CI checks.

## What the 2026-09-29 re-run says (WP116)

Every design now runs each factor under two tiers — its scripted one and the fallible one — and an effect whose sides sit at the same bound reads **untestable** (`103-FALLIBLE-ACTORS.md` §6). `timings.md` has the counts.

- **Under the scripted tiers every comparison of a control is untestable** — 100% against 100%, 0% against 0%. The register of 2026-09-11 read *inconclusive* for the same reason: no actor erred, so nothing could be caught.
- **Under the fallible tier the bank can be wrong, and some controls move it.** On the lending book the rules over the fallible bot raise agreement from 91.3% to 100% and take over-approval from 0.9% to 0 (`lending-stack`); in `human-oversight`, Level 5 breaches its ceilings in 63% of cases and a person at the decision — the case handler, not an oracle — takes agreement down to 94.3%, because the person errs too.
- **Three designs record no effect that excludes zero, and why is the finding.** The fallible tier changes a decision's outcome and keeps the plan's reasons. No policy card on the lending or fraud desks checks an outcome against the rule, the context rung does not change a planted error, and the errors fall evenly across cohorts — so `lending-context`, `lending-fairness` and `fraud-stack` measure controls that cannot act on this kind of error. A card that checks the decision against the worksheet, or an error model that errs by cohort, would give them one; neither is built.
- **`lending-stack`'s baseline moved from `rules-only` to `bot-everywhere`**: under `rules-only` no bot decides, so the stack was being measured where it had nothing to act on.

## Reproducing one

```bash
npm run craftabot -- experiment run --file experiments/lending-stack.json --out campaign-out/lending-stack --egress none --jobs 4
node scripts/experiment-shape.mjs docs/evidence campaign-out
```

The same design, the same seeds, the same population digest give the same effects; a different machine gives the same numbers and a different wall time.
