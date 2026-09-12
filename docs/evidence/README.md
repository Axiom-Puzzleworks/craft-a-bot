# The reference experiments' results

Each folder here holds one reference experiment's committed result (`80-CONTROL-EFFECTIVENESS-REGISTER.md` §4; `64-TARGET-DESIGN-V5.md` §6.8.3): the design as it ran (`<id>.experiment.json`, its campaign ids filled), the result with its digest (`<id>.experiment-result.json`, `docs/schemas/experiment-result.schema.json`) and the same as markdown (`<id>.experiment-result.md`). `timings.md` records the machine and the wall time each took at full size. CI runs every design again at `--size 200` and `scripts/experiment-shape.mjs` holds the reduced result to the committed one's shape — the same metrics, factors and levels, a verdict from the same three — never its values.

## What these are evidence of

Every number here is a measurement of **this synthetic bank** — the population `@craftabot/pack-fs-bank` generates from a seed through its cited calibration table (`66-CALIBRATION.md`), the loan book, alert book and advice-request register drawn from it (`67-…`), the three desks' rules held in truth, and the scripted bots that work them — **under these configurations**: the reference autonomy levels (`69-…`, `73-…`, `76-…`), the policy-card stacks, the context rungs and the lending knobs the design names. A result says what a control did to _these_ metrics on _this_ book, with an interval and an _n_, and which runs it rests on.

## What they are not evidence of

- Not of any real book, customer, account or decision: nothing in the population is real (hard rule 9; `45-…`).
- Not of a real bot: the brains are the scripted tiers; a live model's behaviour is a different experiment the same file can run from the harness.
- Not of compliance with any rule the obligation tags name: the tags say which obligation a metric speaks to, and the register says whether the control moved the metric; a compliance judgment is a reader's, made against the real book and the real controls.
- Not transferable as magnitudes: a 4-point drop in over-approval on this book is not a 4-point drop anywhere else. What transfers is the method — the design as a file, the analysis as a fold, the verdict as a rule over intervals — and the shape of the result, which is what CI checks.

## Reproducing one

```bash
npm run craftabot -- experiment run --file experiments/lending-stack.json --out campaign-out/lending-stack --egress none --jobs 4
node scripts/experiment-shape.mjs docs/evidence campaign-out
```

The same design, the same seeds, the same population digest give the same effects; a different machine gives the same numbers and a different wall time.
