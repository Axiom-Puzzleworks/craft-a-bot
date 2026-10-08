# The relational context on the advice-request register — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The relational context lowers unsuitable recommendations and raises data-minimisation findings against the case file alone. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 1200: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `advice-context`.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (31 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see

Ran 2026-10-08T12:19:22.813Z; controls fs-advice/control-map/suitability, fs-advice/control-map/minimisation-and-purpose; obligations fca:cobs-9:suitability, ukgdpr:data-minimisation; campaigns advice-context-live--context=case-file--executors=bot-everywhere, advice-context-live--context=case-file--executors=bot-recommends, advice-context-live--context=relational--executors=bot-everywhere, advice-context-live--context=relational--executors=bot-recommends. Evidence about this synthetic bank under these configurations, and nothing else.

## suitable

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | — | 31 / 31 | ok |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 31 / 31 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%.

## minimised

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | — | 31 / 31 | ok |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 31 / 31 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### advice-context-live--context=case-file--executors=bot-everywhere

31 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) |
| minimised | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 65% (47%–79%) of 31 pairs, the same words in 3% (1%–16%). Over the whole journey 6% (2%–21%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 10.5 edits apart on average.

### advice-context-live--context=case-file--executors=bot-recommends

31 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) |
| minimised | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 68% (50%–81%) of 31 pairs, the same words in 3% (1%–16%). Over the whole journey 13% (5%–29%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 8.7 edits apart on average.

### advice-context-live--context=relational--executors=bot-everywhere

31 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) |
| minimised | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 84% (67%–93%) of 31 pairs, the same words in 6% (2%–21%). Over the whole journey 29% (16%–47%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 8.9 edits apart on average.

### advice-context-live--context=relational--executors=bot-recommends

31 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) |
| minimised | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 81% (64%–91%) of 31 pairs, the same words in 3% (1%–16%). Over the whole journey 23% (11%–40%) of items took one path in every trial; where trials forked, the median first difference was at call 3.5, and two trials' action sequences were 7.2 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| context | relational vs case-file (live tier) | 0.2545 | 0.3816 | 0.3816 | 0.0000 |
| executors | bot-recommends vs bot-everywhere (live tier) | 0.2545 | 1.0131 | 0.2303 | 0.7828 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `f2026116d83b9f2c30fce5ad6ae98534c2b3e5e7be2a463db23967370b64b2a3`.
