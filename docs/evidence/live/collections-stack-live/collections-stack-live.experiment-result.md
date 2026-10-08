# The policy-card stack on the collections book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The collections desk’s policy-card stack (fs-collections/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the collections book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 300: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `collections-stack`.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (37 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see

Ran 2026-10-07T20:19:45.643Z; controls —; obligations —; campaigns collections-stack-live--guard=none, collections-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## plan-matches-rule

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 37 / 37 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 37 paired items.

## vulnerability-actioned

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 37 / 37 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 37 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### collections-stack-live--guard=none

37 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| plan-matches-rule | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |
| vulnerability-actioned | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (91%–100%) of 37 pairs, the same words in 24% (13%–40%). Over the whole journey 24% (13%–40%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 4.0 edits apart on average.

### collections-stack-live--guard=policy-cards

37 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| plan-matches-rule | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |
| vulnerability-actioned | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (91%–100%) of 37 pairs, the same words in 24% (13%–40%). Over the whole journey 27% (15%–43%) of items took one path in every trial; where trials forked, the median first difference was at call 4, and two trials' action sequences were 2.5 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0654 | 0.0520 | 0.0520 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `ab8d6dcf9427fafdb625fc4a47106c1cc1f5abe0c5626045527fc7f6446ceef9`.
