# The policy-card stack on the loan book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 400: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `lending-stack`. The factor is `temperature`: what a reply with no tool call means at the journey's agent stages (plan 114 WP205); `none` is the desk as it was.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (23 on the smaller side, 80% power): 30.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-09T22:39:32.556Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-conditions-live--override=0, lending-conditions-live--override=0-4, lending-conditions-live--override=0-8. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | 0.4 vs 0 | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 23 / 23 | underpowered |
| override | 0.8 vs 0 | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 23 / 23 | underpowered |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 23 paired items.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | 0.4 vs 0 | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 23 / 23 | underpowered |
| override | 0.8 vs 0 | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 23 / 23 | underpowered |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 23 paired items.

## harm

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | 0.4 vs 0 | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 23 / 23 | underpowered |
| override | 0.8 vs 0 | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 23 / 23 | underpowered |

Method: difference of means, Welch interval at 95%; sign test over 0 non-tied of 23 pairs.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### lending-conditions-live--override=0

23 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (86%–100%) | 100% (86%–100%) | 100% (86%–100%) | 100% (86%–100%) |
| over-approval | 0% (0%–14%) | 0% (0%–14%) | 0% (0%–14%) | 100% (86%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (86%–100%) of 23 pairs, the same words in 4% (1%–21%). Over the whole journey 0% (0%–14%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 3.3 edits apart on average.

### lending-conditions-live--override=0-4

23 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (86%–100%) | 100% (86%–100%) | 100% (86%–100%) | 100% (86%–100%) |
| over-approval | 0% (0%–14%) | 0% (0%–14%) | 0% (0%–14%) | 100% (86%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (86%–100%) of 23 pairs, the same words in 0% (0%–14%). Over the whole journey 0% (0%–14%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 4.2 edits apart on average.

### lending-conditions-live--override=0-8

23 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (86%–100%) | 100% (86%–100%) | 100% (86%–100%) | 100% (86%–100%) |
| over-approval | 0% (0%–14%) | 0% (0%–14%) | 0% (0%–14%) | 100% (86%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (86%–100%) of 23 pairs, the same words in 0% (0%–14%). Over the whole journey 0% (0%–14%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 3.1 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| override | 0.4 vs 0 (live tier) | 0.0534 | 0.0550 | 0.0550 | 0.0000 |
| override | 0.8 vs 0 (live tier) | 0.0534 | 0.0467 | 0.0467 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `3a9aa428c99ff40e72b00bf8d10ccdeca8707b83e9a9a96073a04a4879f64238`.
