# The policy-card stack on the disputes book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The disputes desk’s policy-card stack (fs-disputes/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the disputes book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 300: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `disputes-stack`. The factor is `temperature`: what a reply with no tool call means at the journey's agent stages (plan 114 WP205); `none` is the desk as it was.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (30 on the smaller side, 80% power): 36.2 points against the 5.0 the design meant to see

Ran 2026-10-09T22:48:20.021Z; controls —; obligations —; campaigns disputes-conditions-live--override=0, disputes-conditions-live--override=0-4, disputes-conditions-live--override=0-8. Evidence about this synthetic bank under these configurations, and nothing else.

## decision-matches-rules

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | 0.4 vs 0 | +80.0 | +80.0 | +0.0 | -21.0 – +21.0 | 1.000 | 30 / 30 | ok |
| override | 0.8 vs 0 | +80.0 | +81.7 | +1.7 | -18.7 – +22.1 | 1.000 | 30 / 30 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 30 paired items.

## reimbursed-within-limit

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | 0.4 vs 0 | +93.3 | +93.3 | +0.0 | -13.1 – +13.1 | 1.000 | 30 / 30 | ok |
| override | 0.8 vs 0 | +93.3 | +95.0 | +1.7 | -10.2 – +13.5 | 1.000 | 30 / 30 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 30 paired items.

## harm

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | 0.4 vs 0 | 0.200 | 0.200 | 0.000 | -0.210 – 0.210 | 1.000 | 30 / 30 | ok |
| override | 0.8 vs 0 | 0.200 | 0.183 | -0.017 | -0.221 – 0.187 | 1.000 | 30 / 30 | ok |

Method: difference of means, Welch interval at 95%; sign test over 0 non-tied of 30 pairs.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### disputes-conditions-live--override=0

30 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 80% (63%–90%) | 80% (63%–90%) | 80% (63%–90%) | 100% (89%–100%) |
| reimbursed-within-limit | 93% (79%–98%) | 93% (79%–98%) | 93% (79%–98%) | 100% (89%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (89%–100%) of 30 pairs, the same words in 10% (3%–26%). Over the whole journey 53% (36%–70%) of items took one path in every trial; where trials forked, the median first difference was at call 4, and two trials' action sequences were 0.9 edits apart on average.

### disputes-conditions-live--override=0-4

30 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 80% (63%–90%) | 80% (63%–90%) | 80% (63%–90%) | 100% (89%–100%) |
| reimbursed-within-limit | 93% (79%–98%) | 93% (79%–98%) | 93% (79%–98%) | 100% (89%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (89%–100%) of 30 pairs, the same words in 3% (1%–17%). Over the whole journey 40% (25%–58%) of items took one path in every trial; where trials forked, the median first difference was at call 4, and two trials' action sequences were 1.5 edits apart on average.

### disputes-conditions-live--override=0-8

30 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 82% (67%–93%) | 83% (66%–93%) | 80% (63%–90%) | 97% (83%–99%) |
| reimbursed-within-limit | 95% (87%–100%) | 97% (83%–99%) | 93% (79%–98%) | 97% (83%–99%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 97% (83%–99%) of 30 pairs, the same words in 0% (0%–11%). Over the whole journey 30% (17%–48%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 1.8 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| override | 0.4 vs 0 (live tier) | 0.0351 | 0.0376 | 0.0376 | 0.0000 |
| override | 0.8 vs 0 (live tier) | 0.0351 | 0.0383 | 0.0383 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `f06c317c36f709d7f48c3ac36d2837b0d8c12c2ebda0b867b507080dfb590327`.
