# The policy-card stack on the onboarding book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The onboarding desk’s policy-card stack (fs-onboarding/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the onboarding book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 400: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `onboarding-stack`.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (33 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see

Ran 2026-10-07T19:35:11.731Z; controls —; obligations —; campaigns onboarding-stack-live--guard=none, onboarding-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## decision-matches-rules

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 33 / 33 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 33 paired items.

## hit-contained

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 33 / 33 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 33 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### onboarding-stack-live--guard=none

33 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |
| hit-contained | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (90%–100%) of 33 pairs, the same words in 24% (13%–41%). Over the whole journey 30% (17%–47%) of items took one path in every trial; where trials forked, the median first difference was at call 4, and two trials' action sequences were 4.6 edits apart on average.

### onboarding-stack-live--guard=policy-cards

33 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| decision-matches-rules | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |
| hit-contained | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (90%–100%) of 33 pairs, the same words in 12% (5%–27%). Over the whole journey 30% (17%–47%) of items took one path in every trial; where trials forked, the median first difference was at call 5, and two trials' action sequences were 4.1 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0542 | 0.0505 | 0.0505 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `eb89043c4611af55edcea6b5b0530e1e3227d24626f1ad723052019fec5a0866`.
