# The policy-card stack on the disputes book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The disputes desk’s policy-card stack (fs-disputes/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the disputes book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 1024-token reply limit, over a book of 400: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `disputes-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (40 on the smaller side, 80% power): 23.1 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-06T13:17:17.013Z; controls —; obligations —; campaigns disputes-stack-live--guard=none, disputes-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## decision-matches-rules

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +67.5 | +67.5 | +0.0 | -19.8 – +19.8 | 1.000 | 40 / 40 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 40 pairs.

## reimbursed-within-limit

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -8.8 – +8.8 | 1.000 | 40 / 40 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 40 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0300 | 0.0300 | 0.0300 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `6998b6f1f8a2739d32d5ce66810a2b7b4b1c0f4678fe2da15aa281b895f51ea5`.
