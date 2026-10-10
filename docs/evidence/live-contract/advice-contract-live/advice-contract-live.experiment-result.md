# The relational context on the advice-request register — with the 35B on the DGX Sparks as the brain

**Hypothesis.** The relational context lowers unsuitable recommendations and raises data-minimisation findings against the case file alone. Here the decisions are made by a live model, `dgx-spark/quick-qwen` (Qwen3.6-35B-A3B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 2048-token reply limit, over a book of 600: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `advice-context`. The factor is `replyContract`: what a reply with no tool call means at the journey's agent stages (plan 114 WP205); `none` is the desk as it was.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (11 on the smaller side, 80% power): 4.5 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-10T00:59:13.123Z; controls fs-advice/control-map/suitability, fs-advice/control-map/minimisation-and-purpose; obligations fca:cobs-9:suitability, ukgdpr:data-minimisation; campaigns advice-contract-live--context=case-file--override=none, advice-contract-live--context=case-file--override=say, advice-contract-live--context=case-file--override=retry-with-nudge, advice-contract-live--context=relational--override=none, advice-contract-live--context=relational--override=say, advice-contract-live--context=relational--override=retry-with-nudge. Evidence about this synthetic bank under these configurations, and nothing else.

## suitable

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | — | 11 / 11 | underpowered |
| override | say vs none | +100.0 | +95.5 | -4.5 | -14.7 – +5.6 | 1.000 | 11 / 11 | underpowered |
| override | retry-with-nudge vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 11 / 11 | underpowered |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%.

## minimised

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | — | 11 / 11 | underpowered |
| override | say vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 11 / 11 | underpowered |
| override | retry-with-nudge vs none | +100.0 | +100.0 | +0.0 | +0.0 – +0.0 | 1.000 | 11 / 11 | underpowered |

Method: difference of rates over items (2 trials each, the item the unit), Welch interval at 95%.

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.

### advice-contract-live--context=case-file--override=none

11 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |
| minimised | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 91% (62%–98%) of 11 pairs, the same words in 9% (2%–38%). Over the whole journey 27% (10%–57%) of items took one path in every trial; where trials forked, the median first difference was at call 2.5, and two trials' action sequences were 9.1 edits apart on average.

### advice-contract-live--context=case-file--override=say

11 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 95% (86%–100%) | 100% (74%–100%) | 91% (62%–98%) | 91% (62%–98%) |
| minimised | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 0% (0%–26%) of 11 pairs, the same words in 0% (0%–26%). Over the whole journey 0% (0%–26%) of items took one path in every trial; where trials forked, the median first difference was at call 0, and two trials' action sequences were 19.2 edits apart on average.

### advice-contract-live--context=case-file--override=retry-with-nudge

11 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |
| minimised | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 73% (43%–90%) of 11 pairs, the same words in 73% (43%–90%). Over the whole journey 0% (0%–26%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 7.7 edits apart on average.

### advice-contract-live--context=relational--override=none

11 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |
| minimised | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 100% (74%–100%) of 11 pairs, the same words in 0% (0%–26%). Over the whole journey 45% (21%–72%) of items took one path in every trial; where trials forked, the median first difference was at call 6.5, and two trials' action sequences were 6.1 edits apart on average.

### advice-contract-live--context=relational--override=say

11 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |
| minimised | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 0% (0%–26%) of 11 pairs, the same words in 0% (0%–26%). Over the whole journey 0% (0%–26%) of items took one path in every trial; where trials forked, the median first difference was at call 0, and two trials' action sequences were 15.5 edits apart on average.

### advice-contract-live--context=relational--override=retry-with-nudge

11 items, 2 trials each, k = 2.

| Metric | pass@1 | pass@k | pass^k | Consistency |
|---|---|---|---|---|
| suitable | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |
| minimised | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) | 100% (74%–100%) |

At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in 91% (62%–98%) of 11 pairs, the same words in 91% (62%–98%). Over the whole journey 0% (0%–26%) of items took one path in every trial; where trials forked, the median first difference was at call 1, and two trials' action sequences were 6.7 edits apart on average.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| context | relational vs case-file (live tier) | 0.3014 | 0.3809 | 0.3809 | 0.0000 |
| override | say vs none (live tier) | 0.3014 | 0.3474 | 0.3474 | 0.0000 |
| override | retry-with-nudge vs none (live tier) | 0.3014 | 0.1961 | 0.1961 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `299359293f52acbab496cc07ba71d7882de815f9b2f9366bacc2326ba5bfc11a`.
