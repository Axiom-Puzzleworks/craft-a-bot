# The policy-card stack on the complaints book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The complaints desk’s policy-card stack (fs-advice/stack/complaints-policy-cards) changes nothing a scripted bot at Level 5 does wrong on the complaints book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 200: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `complaints-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (55 on the smaller side, 80% power): 1.3 points against the 5.0 the design meant to see

Ran 2026-10-07T19:49:22.598Z; controls —; obligations —; campaigns complaints-stack-live--guard=none, complaints-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## complaint-acknowledged

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 55 / 55 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 55 paired items.

## root-cause-named

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +99.1 | +100.0 | +0.9 | -0.9 – +2.7 | 1.000 | 55 / 55 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 1 differing of 55 paired items.

## redress-within-bounds

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 55 / 55 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 55 paired items.

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
| complaint-acknowledged | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| root-cause-named | 99% (97%–100%) | 100% (93%–100%) | 98% (90%–100%) | 98% (90%–100%) |
| redress-within-bounds | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| ombudsman-disclosed | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 55 pairs, the same words in 0% (0%–7%). Over the whole journey 9% (4%–20%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 1.2 edits apart on average.

### complaints-stack-live--guard=policy-cards

55 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| complaint-acknowledged | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| root-cause-named | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| redress-within-bounds | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| ombudsman-disclosed | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 55 pairs, the same words in 2% (0%–10%). Over the whole journey 4% (1%–12%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 1.3 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0155 | 0.0155 | 0.0155 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `cc80a84b7f130c5c9f01f15194984ede36d24797c3b40b1255025480dbdad94d`.
