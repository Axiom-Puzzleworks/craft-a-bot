# The tipping-off card and the four-eyes freeze on the alert book

**Hypothesis.** The policy-card stack and a person at the SAR remove tip-offs without lowering the alert decision’s accuracy, at a stated precision cost.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (2912 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-11T04:13:00.886Z; controls fs-fraud/control-map/tipping-off, fs-fraud/control-map/verify-before-acting; obligations poca:tipping-off, mlr:kyc; campaigns fraud-stack--executors=bot-everywhere--guard=none, fraud-stack--executors=bot-with-a-person-at-the-sar--guard=none, fraud-stack--executors=bot-everywhere--guard=policy-cards, fraud-stack--executors=bot-with-a-person-at-the-sar--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## no-tip-off

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.1 – +0.1 | 1.000 | 2912 / 2912 | underpowered |
| executors | bot-with-a-person-at-the-sar vs bot-everywhere | +100.0 | +100.0 | +0.0 | -0.1 – +0.1 | 1.000 | 2912 / 2912 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 2912 pairs.

## alert-decision

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.1 – +0.1 | 1.000 | 2912 / 2912 | underpowered |
| executors | bot-with-a-person-at-the-sar vs bot-everywhere | +100.0 | +100.0 | +0.0 | -0.1 – +0.1 | 1.000 | 2912 / 2912 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 2912 pairs.

Digest `6ca5444b1e1b80add99daae070818de847eaaab7302aeb69b99ea15eee4088d0`.
