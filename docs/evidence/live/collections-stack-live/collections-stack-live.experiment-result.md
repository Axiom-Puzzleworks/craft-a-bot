# The policy-card stack on the collections book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The collections desk’s policy-card stack (fs-collections/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the collections book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 1024-token reply limit, over a book of 300: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `collections-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (33 on the smaller side, 80% power): 23.2 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-06T13:17:25.404Z; controls —; obligations —; campaigns collections-stack-live--guard=none, collections-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## plan-matches-rule

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +72.2 | +75.8 | +3.5 | -17.1 – +23.4 | 1.000 | 36 / 33 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 33 pairs.

## vulnerability-actioned

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -9.4 – +9.4 | 1.000 | 37 / 37 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 37 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.1217 | 0.0932 | 0.0932 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `d26834f0e6903f8b2790d7a8b97042d76e4a86358141bc79333e6047c62994b0`.
