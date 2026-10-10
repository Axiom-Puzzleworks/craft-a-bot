# The policy-card stack on the loan book — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 1600: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `lending-stack`. The book draws the grey zone (plan 114 WP200): of the applications the plain rule would approve, some sit at its threshold, carry incomes that conflict, or have none verified, and the policy on the case file says refer for each.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (93 on the smaller side, 80% power): 12.1 points against the 5.0 the design meant to see

Ran 2026-10-10T21:14:22.361Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-refer-live--guard=none, lending-refer-live--guard=policy-cards, lending-refer-live--guard=policy-cards-escalating. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +86.0 | +94.6 | +8.6 | +1.7 – +15.5 | 0.003 | 93 / 93 | ok |
| guard | policy-cards-escalating vs none | +86.0 | +100.0 | +14.0 | +8.0 – +19.9 | 0.000 | 93 / 93 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 13 differing of 93 paired items.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 107 / 107 | ok |
| guard | policy-cards-escalating vs none | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 107 / 107 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 107 paired items.

## missed-refer

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +12.1 | +4.7 | -7.5 | -13.5 – -1.4 | 0.003 | 107 / 107 | ok |
| guard | policy-cards-escalating vs none | +12.1 | +0.0 | -12.1 | -17.4 – -6.9 | 0.000 | 107 / 107 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 13 differing of 107 paired items.

## over-refer

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 107 / 107 | ok |
| guard | policy-cards-escalating vs none | +0.0 | +0.0 | +0.0 | +0.0 – +0.0 | 1.000 | 107 / 107 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 107 paired items.

## errored

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +19.2 | +16.8 | -2.3 | -12.1 – +7.4 | 0.454 | 107 / 107 | ok |
| guard | policy-cards-escalating vs none | +19.2 | +18.7 | -0.5 | -10.3 – +9.3 | 1.000 | 107 / 107 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 16 differing of 107 paired items.

## harm

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | 0.117 | 0.047 | -0.070 | -0.129 – -0.011 | 0.003 | 107 / 107 | ok |
| guard | policy-cards-escalating vs none | 0.117 | 0.000 | -0.117 | -0.167 – -0.067 | 0.000 | 107 / 107 | ok |

Method: difference of means, Welch interval at 95%; sign test over 13 non-tied of 107 pairs.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### lending-refer-live--guard=none

107 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 86% (80%–91%) | 93% (86%–97%) | 78% (69%–85%) | 85% (76%–91%) |
| over-approval | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |
| missed-refer | 12% (7%–18%) | 19% (12%–27%) | 6% (3%–12%) | 87% (79%–92%) |
| over-refer | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |
| errored | 19% (13%–26%) | 23% (16%–32%) | 15% (9%–23%) | 92% (85%–96%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 98% (93%–99%) of 107 pairs, the same words in 18% (12%–26%). Over the whole journey 13% (8%–21%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 3.4 edits apart on average.

### lending-refer-live--guard=policy-cards

107 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 95% (91%–98%) | 99% (94%–100%) | 90% (83%–95%) | 91% (84%–96%) |
| over-approval | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |
| missed-refer | 5% (2%–8%) | 8% (4%–15%) | 1% (0%–5%) | 93% (86%–96%) |
| over-refer | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |
| errored | 17% (10%–23%) | 20% (13%–28%) | 14% (9%–22%) | 94% (88%–97%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (97%–100%) of 107 pairs, the same words in 13% (8%–21%). Over the whole journey 11% (7%–19%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 2.6 edits apart on average.

### lending-refer-live--guard=policy-cards-escalating

107 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| agreement | 100% (96%–100%) | 100% (96%–100%) | 100% (96%–100%) | 100% (96%–100%) |
| over-approval | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |
| missed-refer | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |
| over-refer | 0% (0%–3%) | 0% (0%–3%) | 0% (0%–3%) | 100% (97%–100%) |
| errored | 19% (12%–25%) | 23% (16%–32%) | 14% (9%–22%) | 91% (84%–95%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 99% (95%–100%) of 107 pairs, the same words in 14% (9%–22%). Over the whole journey 18% (12%–26%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 1.8 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0480 | 0.0378 | 0.0378 | 0.0000 |
| guard | policy-cards-escalating vs none (live tier) | 0.0480 | 0.0311 | 0.0311 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `7a22cbfb27ed7a778bbb26cb013cf9d6f5ed8640b9614a7fc6cf8be714841094`.
