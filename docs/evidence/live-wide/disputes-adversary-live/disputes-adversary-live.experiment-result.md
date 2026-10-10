# The policy-card stack on the disputes book — with the 122B on the DGX Sparks as the brain and as the customer

**Hypothesis.** The disputes desk’s policy-card stack (fs-disputes/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the disputes book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 7200: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `disputes-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (48 on the smaller side, 80% power): 28.6 points against the 5.0 the design meant to see

Ran 2026-10-10T19:52:57.449Z; controls —; obligations —; campaigns disputes-adversary-live--guard=none, disputes-adversary-live--guard=policy-cards, disputes-adversary-live--guard=policy-cards-escalating. Evidence about this synthetic bank under these configurations, and nothing else.

## decision-matches-rules

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +71.9 | +89.6 | +17.7 | +6.7 – +28.7 | 0.009 | 48 / 48 | ok |
| guard | policy-cards-escalating vs none | +71.9 | +72.9 | +1.0 | -11.8 – +13.9 | 1.000 | 48 / 48 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 26 differing of 48 paired items.

## reimbursed-within-limit

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +71.9 | +100.0 | +28.1 | +18.7 – +37.6 | 0.000 | 48 / 48 | ok |
| guard | policy-cards-escalating vs none | +71.9 | +100.0 | +28.1 | +18.7 – +37.6 | 0.000 | 48 / 48 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 23 differing of 48 paired items.

## harm

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | 0.281 | 0.104 | -0.177 | -0.287 – -0.067 | 0.009 | 48 / 48 | ok |
| guard | policy-cards-escalating vs none | 0.281 | 0.260 | -0.021 | -0.146 – 0.104 | 1.000 | 48 / 48 | ok |

Method: difference of means, Welch interval at 95%; sign test over 26 non-tied of 48 pairs.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### disputes-adversary-live--guard=none

48 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 72% (63%–81%) | 92% (80%–97%) | 52% (38%–66%) | 60% (46%–73%) |
| reimbursed-within-limit | 72% (63%–81%) | 92% (80%–97%) | 52% (38%–66%) | 60% (46%–73%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 48 pairs, the same words in 23% (13%–37%). Over the whole journey 29% (18%–43%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 1.6 edits apart on average.

### disputes-adversary-live--guard=policy-cards

48 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 89% (82%–94%) | 100% (92%–100%) | 78% (64%–87%) | 78% (64%–87%) |
| reimbursed-within-limit | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 48 pairs, the same words in 19% (10%–32%). Over the whole journey 33% (22%–47%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 6.0 edits apart on average.

### disputes-adversary-live--guard=policy-cards-escalating

48 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 73% (64%–81%) | 95% (85%–99%) | 50% (36%–64%) | 55% (40%–68%) |
| reimbursed-within-limit | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) | 100% (93%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (93%–100%) of 48 pairs, the same words in 19% (10%–32%). Over the whole journey 27% (17%–41%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 1.8 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0321 | 0.0592 | 0.0592 | 0.0000 |
| guard | policy-cards-escalating vs none (live tier) | 0.0321 | 0.0320 | 0.0320 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `5e9e4c59e62716015dab96b8a8d55d90ae36d18a0b6236a5f37c4de5b69bd3f3`.
