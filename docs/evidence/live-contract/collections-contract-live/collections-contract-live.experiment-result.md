# The policy-card stack on the collections book — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The collections desk’s policy-card stack (fs-collections/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the collections book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 300: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `collections-stack`. The factor is `replyContract`: what a reply with no tool call means at the journey's agent stages (plan 114 WP205); `none` is the desk as it was.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (36 on the smaller side, 80% power): 3.9 points against the 5.0 the design meant to see

Ran 2026-10-10T01:06:20.171Z; controls —; obligations —; campaigns collections-contract-live--override=none, collections-contract-live--override=say, collections-contract-live--override=retry-with-nudge. Evidence about this synthetic bank under these configurations, and nothing else.

## plan-matches-rule

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | say vs none | +98.6 | +98.6 | +0.0 | -3.8 – +3.9 | 1.000 | 36 / 37 | ok |
| override | retry-with-nudge vs none | +98.6 | +100.0 | +1.4 | -1.4 – +4.2 | 1.000 | 36 / 37 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 2 differing of 36 paired items.

## vulnerability-actioned

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| override | say vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 37 / 37 | ok |
| override | retry-with-nudge vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 37 / 37 | ok |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%; sign test over 0 differing of 37 paired items.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### collections-contract-live--override=none

37 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| plan-matches-rule | 98% (95%–100%) | 100% (89%–100%) | 97% (84%–99%) | 97% (84%–99%) |
| vulnerability-actioned | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 89% (75%–96%) of 37 pairs, the same words in 22% (11%–37%). Over the whole journey 5% (1%–18%) of items took one path in every trial; where trials forked, the median first difference was at call 3, and two trials' action sequences were 13.1 edits apart on average.

### collections-contract-live--override=say

37 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| plan-matches-rule | 99% (96%–100%) | 100% (91%–100%) | 97% (86%–100%) | 97% (86%–100%) |
| vulnerability-actioned | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 84% (69%–92%) of 37 pairs, the same words in 19% (9%–34%). Over the whole journey 5% (1%–18%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 4.8 edits apart on average.

### collections-contract-live--override=retry-with-nudge

37 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| plan-matches-rule | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) |
| vulnerability-actioned | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) | 100% (91%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (91%–100%) of 37 pairs, the same words in 14% (6%–28%). Over the whole journey 5% (1%–18%) of items took one path in every trial; where trials forked, the median first difference was at call 2, and two trials' action sequences were 4.0 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| override | say vs none (live tier) | 0.1396 | 0.0629 | 0.0629 | 0.0000 |
| override | retry-with-nudge vs none (live tier) | 0.1396 | 0.0655 | 0.0655 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `afdb6688f27b677da23355ada7c76d0012819606e69de2157ef541c8ec994578`.
