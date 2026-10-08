# The policy-card stack on the complaints book — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The complaints desk’s policy-card stack (fs-advice/stack/complaints-policy-cards) changes nothing a scripted bot at Level 5 does wrong on the complaints book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 200: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `complaints-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (55 on the smaller side, 80% power): 4.9 points against the 5.0 the design meant to see

Ran 2026-10-08T11:38:53.869Z; controls —; obligations —; campaigns complaints-stack-live--guard=none, complaints-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## complaint-acknowledged

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +97.3 | +99.1 | +1.8 | -1.7 – +5.4 | 0.625 | 55 / 55 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 4 differing of 55 paired items.

## root-cause-named

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +96.4 | +99.1 | +2.7 | -1.2 – +6.7 | 0.375 | 55 / 55 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 5 differing of 55 paired items.

## redress-within-bounds

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +97.3 | +100.0 | +2.7 | -0.4 – +5.8 | 0.250 | 55 / 55 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 3 differing of 55 paired items.

## ombudsman-disclosed

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 55 / 55 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 55 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### complaints-stack-live--guard=none

55 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| complaint-acknowledged | 97% (94%–100%) | 100% (93%–100%) | 95% (85%–98%) | 95% (85%–98%) |
| root-cause-named | 96% (93%–99%) | 100% (93%–100%) | 93% (83%–97%) | 93% (83%–97%) |
| redress-within-bounds | 97% (94%–100%) | 100% (93%–100%) | 95% (85%–98%) | 95% (85%–98%) |
| ombudsman-disclosed | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 85% (74%–92%) of 55 pairs, the same words in 5% (2%–15%). Over the whole journey 2% (0%–10%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 1.7 edits apart on average.

### complaints-stack-live--guard=policy-cards

55 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| complaint-acknowledged | 99% (97%–100%) | 100% (93%–100%) | 98% (90%–100%) | 98% (90%–100%) |
| root-cause-named | 99% (97%–100%) | 100% (93%–100%) | 98% (90%–100%) | 98% (90%–100%) |
| redress-within-bounds | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| ombudsman-disclosed | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 93% (83%–97%) of 55 pairs, the same words in 0% (0%–7%). Over the whole journey 2% (0%–10%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 1.6 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0155 | 0.0151 | 0.0151 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `00914ada5cb06fc81d90ff09a28d3d5fa61ecfaed5507dec624db881eac39892`.
