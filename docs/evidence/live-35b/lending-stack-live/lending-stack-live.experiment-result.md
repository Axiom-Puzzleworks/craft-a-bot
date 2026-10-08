# The policy-card stack on the loan book — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 800: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `lending-stack`.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (51 on the smaller side, 80% power): 26.4 points against the 5.0 the design meant to see

Ran 2026-10-08T12:02:03.019Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-stack-live--executors=rules-only--guard=none, lending-stack-live--executors=bot-with-a-person-at-the-decision--guard=none, lending-stack-live--executors=bot-everywhere--guard=none, lending-stack-live--executors=rules-only--guard=policy-cards, lending-stack-live--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-stack-live--executors=bot-everywhere--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |
| executors | rules-only vs bot-everywhere | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 51 paired items.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |
| executors | rules-only vs bot-everywhere | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 51 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### lending-stack-live--executors=rules-only--guard=none

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 100% (93%–100%). Over the whole journey 100% (93%–100%) of items took one path in every trial; where trials forked, the median first difference was at call —, and two trials' action sequences were 0.0 edits apart on average.

### lending-stack-live--executors=bot-with-a-person-at-the-decision--guard=none

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 12% (6%–23%). Over the whole journey 2% (0%–10%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 3.0 edits apart on average.

### lending-stack-live--executors=bot-everywhere--guard=none

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 25% (16%–39%). Over the whole journey 0% (0%–7%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 3.2 edits apart on average.

### lending-stack-live--executors=rules-only--guard=policy-cards

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 100% (93%–100%). Over the whole journey 100% (93%–100%) of items took one path in every trial; where trials forked, the median first difference was at call —, and two trials' action sequences were 0.0 edits apart on average.

### lending-stack-live--executors=bot-with-a-person-at-the-decision--guard=policy-cards

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 16% (8%–28%). Over the whole journey 2% (0%–10%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 3.0 edits apart on average.

### lending-stack-live--executors=bot-everywhere--guard=policy-cards

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 98% (90%–100%) of 51 pairs, the same words in 16% (8%–28%). Over the whole journey 0% (0%–7%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 3.2 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0475 | 0.0475 | 0.0475 | 0.0000 |
| executors | rules-only vs bot-everywhere (live tier) | 0.0475 | 0.4575 | 0.0000 | 0.4575 |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere (live tier) | 0.0475 | 1.3142 | 0.0469 | 1.2673 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `06e70f2a20c8b0acf793ba60d1439a0de91e923e33fdc2d43d551c599509453b`.
