# The policy-card stack on the disputes book — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The disputes desk’s policy-card stack (fs-disputes/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the disputes book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 400: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `disputes-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (40 on the smaller side, 80% power): 9.8 points against the 5.0 the design meant to see

Ran 2026-10-08T11:37:09.300Z; controls —; obligations —; campaigns disputes-stack-live--guard=none, disputes-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## decision-matches-rules

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +93.8 | +97.5 | +3.7 | -3.5 – +11.0 | 0.688 | 40 / 40 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 6 differing of 40 paired items.

## reimbursed-within-limit

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +98.8 | +100.0 | +1.2 | -1.3 – +3.8 | 1.000 | 40 / 40 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 1 differing of 40 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### disputes-stack-live--guard=none

40 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 94% (86%–99%) | 98% (87%–100%) | 90% (77%–96%) | 93% (80%–97%) |
| reimbursed-within-limit | 99% (96%–100%) | 100% (91%–100%) | 98% (87%–100%) | 98% (87%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 80% (65%–90%) of 40 pairs, the same words in 10% (4%–23%). Over the whole journey 43% (29%–58%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 2.1 edits apart on average.

### disputes-stack-live--guard=policy-cards

40 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 98% (94%–100%) | 100% (91%–100%) | 95% (83%–99%) | 95% (83%–99%) |
| reimbursed-within-limit | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 83% (68%–91%) of 40 pairs, the same words in 10% (4%–23%). Over the whole journey 45% (31%–60%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 2.5 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0363 | 0.0408 | 0.0408 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `e32f02077e158c85e2d9ef674de0fa96560d4393153dc26e79a184cac0808112`.
