# The policy-card stack on the servicing book — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The servicing desk’s policy-card stack (fs-servicing/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the servicing book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 200: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `servicing-stack`.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (33 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see

Ran 2026-10-08T11:40:55.767Z; controls —; obligations —; campaigns servicing-stack-live--guard=none, servicing-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## needs-met

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 33 / 33 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 33 paired items.

## disclosure-recorded

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 33 / 33 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 33 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### servicing-stack-live--guard=none

33 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| needs-met | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |
| disclosure-recorded | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 67% (50%–80%) of 33 pairs, the same words in 12% (5%–27%). Over the whole journey 30% (17%–47%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 3.9 edits apart on average.

### servicing-stack-live--guard=policy-cards

33 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| needs-met | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |
| disclosure-recorded | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 82% (66%–91%) of 33 pairs, the same words in 9% (3%–24%). Over the whole journey 36% (22%–53%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 1.8 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0382 | 0.0271 | 0.0271 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `61849231722d190785f6179bed633863df49c802cd12f3a27efff36e8fa72557`.
