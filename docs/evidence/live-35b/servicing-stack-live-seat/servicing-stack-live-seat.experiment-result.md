# The policy-card stack on the servicing book — with the 35B on the DGX Sparks as the brain and as the customer

**Hypothesis.** The servicing desk’s policy-card stack (fs-servicing/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the servicing book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 100: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `servicing-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (16 on the smaller side, 80% power): 19.2 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-08T11:42:49.961Z; controls —; obligations —; campaigns servicing-stack-live-seat--guard=none, servicing-stack-live-seat--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## needs-met

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +93.8 | +90.6 | -3.1 | -16.6 – +10.4 | 1.000 | 16 / 16 | underpowered |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 5 differing of 16 paired items.

## disclosure-recorded

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 16 / 16 | underpowered |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 16 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### servicing-stack-live-seat--guard=none

16 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| needs-met | 94% (84%–100%) | 100% (81%–100%) | 88% (64%–97%) | 88% (64%–97%) |
| disclosure-recorded | 100% (81%–100%) | 100% (81%–100%) | 100% (81%–100%) | 100% (81%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 69% (44%–86%) of 16 pairs, the same words in 31% (14%–56%). Over the whole journey 19% (7%–43%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 4.1 edits apart on average.

### servicing-stack-live-seat--guard=policy-cards

16 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| needs-met | 91% (81%–100%) | 100% (81%–100%) | 81% (57%–93%) | 81% (57%–93%) |
| disclosure-recorded | 100% (81%–100%) | 100% (81%–100%) | 100% (81%–100%) | 100% (81%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 69% (44%–86%) of 16 pairs, the same words in 38% (18%–61%). Over the whole journey 25% (10%–49%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 3.5 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0365 | 0.0326 | 0.0326 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `9a6189ce1fb0349ee545488ea2d44277090062bacb019156394dc611f1587e6d`.
