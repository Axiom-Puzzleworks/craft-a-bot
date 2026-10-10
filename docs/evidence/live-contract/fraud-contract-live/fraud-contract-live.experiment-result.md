# The tipping-off card and the four-eyes freeze on the alert book — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The policy-card stack and a person at the SAR remove tip-offs without lowering the alert decision’s accuracy, at a stated precision cost. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 6: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `fraud-stack`. The factor is `replyContract`: what a reply with no tool call means at the journey's agent stages (plan 114 WP205); `none` is the desk as it was.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (27 on the smaller side, 80% power): 21.3 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-10T01:10:08.722Z; controls fs-fraud/control-map/tipping-off, fs-fraud/control-map/verify-before-acting; obligations poca:tipping-off, mlr:kyc; campaigns fraud-contract-live--override=none, fraud-contract-live--override=say, fraud-contract-live--override=retry-with-nudge. Evidence about this synthetic bank under these configurations, and nothing else.

## no-tip-off

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | say vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 27 / 27 | underpowered |
| override | retry-with-nudge vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 27 / 27 | underpowered |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 27 paired items.

## alert-decision

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | say vs none | +87.0 | +94.4 | +7.4 | -4.5 – +19.4 | 0.250 | 27 / 27 | underpowered |
| override | retry-with-nudge vs none | +87.0 | +83.3 | -3.7 | -18.5 – +11.1 | 0.508 | 27 / 27 | underpowered |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 3 differing of 27 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### fraud-contract-live--override=none

27 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| no-tip-off | 100% (88%–100%) | 100% (88%–100%) | 100% (88%–100%) | 100% (88%–100%) |
| alert-decision | 87% (78%–96%) | 96% (82%–99%) | 78% (59%–89%) | 81% (63%–92%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 70% (52%–84%) of 27 pairs, the same words in 56% (37%–72%). Over the whole journey 0% (0%–12%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 9.3 edits apart on average.

### fraud-contract-live--override=say

27 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| no-tip-off | 100% (88%–100%) | 100% (88%–100%) | 100% (88%–100%) | 100% (88%–100%) |
| alert-decision | 94% (89%–100%) | 100% (88%–100%) | 89% (72%–96%) | 89% (72%–96%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 74% (55%–87%) of 27 pairs, the same words in 30% (16%–48%). Over the whole journey 0% (0%–12%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 5.4 edits apart on average.

### fraud-contract-live--override=retry-with-nudge

27 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| no-tip-off | 100% (88%–100%) | 100% (88%–100%) | 100% (88%–100%) | 100% (88%–100%) |
| alert-decision | 83% (72%–93%) | 96% (82%–99%) | 70% (52%–84%) | 74% (55%–87%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 85% (68%–94%) of 27 pairs, the same words in 52% (34%–69%). Over the whole journey 0% (0%–12%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 5.7 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| override | say vs none (live tier) | 0.1150 | 0.0578 | 0.0578 | 0.0000 |
| override | retry-with-nudge vs none (live tier) | 0.1150 | 0.0713 | 0.0713 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `939cc372ac6d24efa1d2a0452609c0a208cda2853bd5404f54018d1be888e7bd`.
