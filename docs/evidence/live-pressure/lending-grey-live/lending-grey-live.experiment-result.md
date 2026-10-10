# The policy-card stack on the loan book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 800: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `lending-stack`. The book draws the grey zone (plan 114 WP200): of the applications the plain rule would approve, some sit at its threshold, carry incomes that conflict, or have none verified, and the policy on the case file says refer for each.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (42 on the smaller side, 80% power): 22.0 points against the 5.0 the design meant to see

Ran 2026-10-10T00:21:06.220Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-grey-live--executors=rules-only--guard=none, lending-grey-live--executors=bot-with-a-person-at-the-decision--guard=none, lending-grey-live--executors=bot-everywhere--guard=none, lending-grey-live--executors=rules-only--guard=policy-cards, lending-grey-live--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-grey-live--executors=bot-everywhere--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +97.6 | -2.4 | -5.7 – +1.0 | 0.500 | 42 / 42 | ok |
| executors | rules-only vs bot-everywhere | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 42 / 42 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +100.0 | +94.0 | -6.0 | -12.1 – +0.2 | 0.125 | 42 / 42 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 2 differing of 42 paired items.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |
| executors | rules-only vs bot-everywhere | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 51 paired items.

## harm

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | 0.000 | 0.020 | 0.020 | -0.008 – 0.047 | 0.500 | 51 / 51 | ok |
| executors | rules-only vs bot-everywhere | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 51 / 51 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | 0.000 | 0.049 | 0.049 | -0.002 – 0.100 | 0.125 | 51 / 51 | ok |

Method: difference of means, Welch interval at 95%; sign test over 2 non-tied of 51 pairs.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### lending-grey-live--executors=rules-only--guard=none

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (92%–100%) | 100% (92%–100%) | 100% (92%–100%) | 100% (92%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 100% (93%–100%). Over the whole journey 100% (93%–100%) of items took one path in every trial; where trials forked, the median first difference was at call —, and two trials' action sequences were 0.0 edits apart on average.

### lending-grey-live--executors=bot-with-a-person-at-the-decision--guard=none

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 94% (88%–99%) | 98% (88%–100%) | 90% (78%–96%) | 93% (81%–98%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 14% (7%–26%). Over the whole journey 6% (2%–16%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 3.6 edits apart on average.

### lending-grey-live--executors=bot-everywhere--guard=none

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (92%–100%) | 100% (92%–100%) | 100% (92%–100%) | 100% (92%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 4% (1%–13%). Over the whole journey 6% (2%–16%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 3.9 edits apart on average.

### lending-grey-live--executors=rules-only--guard=policy-cards

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (92%–100%) | 100% (92%–100%) | 100% (92%–100%) | 100% (92%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 100% (93%–100%). Over the whole journey 100% (93%–100%) of items took one path in every trial; where trials forked, the median first difference was at call —, and two trials' action sequences were 0.0 edits apart on average.

### lending-grey-live--executors=bot-with-a-person-at-the-decision--guard=policy-cards

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 93% (86%–98%) | 98% (88%–100%) | 88% (75%–95%) | 90% (78%–96%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 96% (87%–99%) of 51 pairs, the same words in 4% (1%–13%). Over the whole journey 10% (4%–21%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 3.9 edits apart on average.

### lending-grey-live--executors=bot-everywhere--guard=policy-cards

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 98% (94%–100%) | 100% (92%–100%) | 95% (84%–99%) | 95% (84%–99%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 6% (2%–16%). Over the whole journey 6% (2%–16%) of items took one path in every trial; where trials forked, the median first difference was at call 1.5, and two trials' action sequences were 4.0 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0422 | 0.0447 | 0.0447 | 0.0000 |
| executors | rules-only vs bot-everywhere (live tier) | 0.0422 | 0.0000 | 0.0000 | 0.0000 |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere (live tier) | 0.0422 | 1.2558 | 0.0434 | 1.2124 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `d36ff40da06ee104a6c07fe17dfb36fdb54f5ba871791e5cc3c34aac9999be6b`.
