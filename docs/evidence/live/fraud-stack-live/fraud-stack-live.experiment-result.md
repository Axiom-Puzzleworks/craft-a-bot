# The tipping-off card and the four-eyes freeze on the alert book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The policy-card stack and a person at the SAR remove tip-offs without lowering the alert decision’s accuracy, at a stated precision cost. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 1024-token reply limit, over a book of 6: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `fraud-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (27 on the smaller side, 80% power): 16.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-06T13:17:57.404Z; controls fs-fraud/control-map/tipping-off, fs-fraud/control-map/verify-before-acting; obligations poca:tipping-off, mlr:kyc; campaigns fraud-stack-live--executors=bot-everywhere--guard=none, fraud-stack-live--executors=bot-with-a-person-at-the-sar--guard=none, fraud-stack-live--executors=bot-everywhere--guard=policy-cards, fraud-stack-live--executors=bot-with-a-person-at-the-sar--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## no-tip-off

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -12.5 – +12.5 | 1.000 | 27 / 27 | underpowered |
| executors | bot-with-a-person-at-the-sar vs bot-everywhere | +100.0 | +100.0 | +0.0 | -12.5 – +12.5 | 1.000 | 27 / 27 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 27 pairs.

## alert-decision

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +92.6 | +92.6 | +0.0 | -16.8 – +16.8 | 1.000 | 27 / 27 | underpowered |
| executors | bot-with-a-person-at-the-sar vs bot-everywhere | +92.6 | +92.6 | +0.0 | -16.8 – +16.8 | 1.000 | 27 / 27 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 2 discordant of 27 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.4266 | 0.2793 | 0.2793 | 0.0000 |
| executors | bot-with-a-person-at-the-sar vs bot-everywhere (live tier) | 0.4266 | 0.9402 | 0.2315 | 0.7086 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `18c61356e4f0b2787fb764f8f0338d6ad1364dcc0af1f824c8726f07e29146f6`.
