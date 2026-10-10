# The policy-card stack on the loan book — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 1600: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `lending-stack`. The book draws the grey zone (plan 114 WP200): of the applications the plain rule would approve, some sit at its threshold, carry incomes that conflict, or have none verified, and the policy on the case file says refer for each.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (93 on the smaller side, 80% power): 15.8 points against the 5.0 the design meant to see

Ran 2026-10-10T18:38:28.282Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-grey-live--executors=rules-only--guard=none, lending-grey-live--executors=bot-with-a-person-at-the-decision--guard=none, lending-grey-live--executors=bot-everywhere--guard=none, lending-grey-live--executors=rules-only--guard=policy-cards, lending-grey-live--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-grey-live--executors=bot-everywhere--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +88.2 | +88.7 | +0.5 | -7.4 – +8.5 | 1.000 | 93 / 93 | ok |
| executors | rules-only vs bot-everywhere | +88.2 | +100.0 | +11.8 | +6.5 – +17.2 | 0.000 | 93 / 93 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +88.2 | +89.2 | +1.1 | -6.5 – +8.7 | 0.791 | 93 / 93 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 14 differing of 93 paired items.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 107 / 107 | ok |
| executors | rules-only vs bot-everywhere | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 107 / 107 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 107 / 107 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 107 paired items.

## harm

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | 0.100 | 0.098 | -0.002 | -0.071 – 0.067 | 1.000 | 107 / 107 | ok |
| executors | rules-only vs bot-everywhere | 0.100 | 0.000 | -0.100 | -0.147 – -0.054 | 0.000 | 107 / 107 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | 0.100 | 0.089 | -0.011 | -0.077 – 0.055 | 0.791 | 107 / 107 | ok |

Method: difference of means, Welch interval at 95%; sign test over 14 non-tied of 107 pairs.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### lending-grey-live--executors=rules-only--guard=none

107 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (96%–100%) | 100% (96%–100%) | 100% (96%–100%) | 100% (96%–100%) |
| over-approval | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (97%–100%) of 107 pairs, the same words in 100% (97%–100%). Over the whole journey 100% (97%–100%) of items took one path in every trial; where trials forked, the median first difference was at call —, and two trials' action sequences were 0.0 edits apart on average.

### lending-grey-live--executors=bot-with-a-person-at-the-decision--guard=none

107 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 89% (83%–94%) | 95% (88%–98%) | 84% (75%–90%) | 89% (81%–94%) |
| over-approval | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 99% (95%–100%) of 107 pairs, the same words in 16% (10%–24%). Over the whole journey 13% (8%–21%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 2.6 edits apart on average.

### lending-grey-live--executors=bot-everywhere--guard=none

107 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 88% (83%–93%) | 96% (89%–98%) | 81% (71%–87%) | 85% (76%–91%) |
| over-approval | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 99% (95%–100%) of 107 pairs, the same words in 12% (7%–20%). Over the whole journey 14% (9%–22%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 3.3 edits apart on average.

### lending-grey-live--executors=rules-only--guard=policy-cards

107 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (96%–100%) | 100% (96%–100%) | 100% (96%–100%) | 100% (96%–100%) |
| over-approval | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (97%–100%) of 107 pairs, the same words in 100% (97%–100%). Over the whole journey 100% (97%–100%) of items took one path in every trial; where trials forked, the median first difference was at call —, and two trials' action sequences were 0.0 edits apart on average.

### lending-grey-live--executors=bot-with-a-person-at-the-decision--guard=policy-cards

107 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 92% (87%–96%) | 97% (91%–99%) | 87% (79%–92%) | 90% (83%–95%) |
| over-approval | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 98% (93%–99%) of 107 pairs, the same words in 14% (9%–22%). Over the whole journey 13% (8%–21%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 2.6 edits apart on average.

### lending-grey-live--executors=bot-everywhere--guard=policy-cards

107 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 89% (82%–94%) | 92% (85%–96%) | 85% (76%–91%) | 92% (85%–96%) |
| over-approval | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 96% (91%–99%) of 107 pairs, the same words in 16% (10%–24%). Over the whole journey 14% (9%–22%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 3.1 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0419 | 0.0456 | 0.0456 | 0.0000 |
| executors | rules-only vs bot-everywhere (live tier) | 0.0419 | 0.0174 | 0.0000 | 0.0174 |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere (live tier) | 0.0419 | 1.1756 | 0.0373 | 1.1383 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `88638cd2cbbd59154bf54e14704a48ca74031d568336cac700e369ffe16688c5`.
