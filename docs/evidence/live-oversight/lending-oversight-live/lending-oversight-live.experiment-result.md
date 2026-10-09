# The policy-card stack on the loan book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 800: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `lending-stack`. The person at the decisions is the reviewer model `fs-bank/reviewer/person-at-approval`, who refuses an approval one time in twelve, asks a question first one time in eight and is late one time in ten.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (51 on the smaller side, 80% power): 26.8 points against the 5.0 the design meant to see

Ran 2026-10-09T18:35:03.194Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-oversight-live--executors=bot-with-a-person-at-the-decision--guard=none, lending-oversight-live--executors=bot-everywhere--guard=none, lending-oversight-live--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-oversight-live--executors=bot-everywhere--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +99.0 | -1.0 | -2.9 – +1.0 | 1.000 | 51 / 51 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +100.0 | +98.0 | -2.0 | -4.7 – +0.8 | 0.500 | 51 / 51 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 1 differing of 51 paired items.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 51 / 51 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 51 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### lending-oversight-live--executors=bot-with-a-person-at-the-decision--guard=none

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 98% (95%–100%) | 100% (93%–100%) | 96% (87%–99%) | 96% (87%–99%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 98% (90%–100%) of 51 pairs, the same words in 4% (1%–13%). Over the whole journey 0% (0%–7%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 3.1 edits apart on average.

### lending-oversight-live--executors=bot-everywhere--guard=none

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 6% (2%–16%). Over the whole journey 2% (0%–10%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 3.9 edits apart on average.

### lending-oversight-live--executors=bot-with-a-person-at-the-decision--guard=policy-cards

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 51 pairs, the same words in 6% (2%–16%). Over the whole journey 0% (0%–7%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 4.1 edits apart on average.

### lending-oversight-live--executors=bot-everywhere--guard=policy-cards

51 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 99% (97%–100%) | 100% (93%–100%) | 98% (90%–100%) | 98% (90%–100%) |
| over-approval | 0% (0%–7%) | 0% (0%–7%) | 0% (0%–7%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 96% (87%–99%) of 51 pairs, the same words in 10% (4%–21%). Over the whole journey 0% (0%–7%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 4.3 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0505 | 0.0612 | 0.0612 | 0.0000 |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere (live tier) | 0.0505 | 1.6790 | 0.0457 | 1.6333 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `ffbbb3bb2ffdd236b4356623b2bf5fa4c2b95c2ab13024e59ad714a4604033cf`.
