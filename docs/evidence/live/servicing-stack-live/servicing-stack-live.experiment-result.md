# The policy-card stack on the servicing book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The servicing desk’s policy-card stack (fs-servicing/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the servicing book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 1024-token reply limit, over a book of 200: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `servicing-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (33 on the smaller side, 80% power): 11.8 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-06T13:17:10.078Z; controls —; obligations —; campaigns servicing-stack-live--guard=none, servicing-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## needs-met

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +93.9 | +93.9 | +0.0 | -14.2 – +14.2 | 1.000 | 33 / 33 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 33 pairs.

## disclosure-recorded

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -10.4 – +10.4 | 1.000 | 33 / 33 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 33 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0471 | 0.0426 | 0.0426 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `7d8866fe3e3c89075ad52351ec0d62d214aa97faa38da6f06d1d2327ac82a98c`.
