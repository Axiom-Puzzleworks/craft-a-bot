# The policy-card stack on the complaints book

**Hypothesis.** The complaints desk’s policy-card stack (fs-advice/stack/complaints-policy-cards) changes nothing a scripted bot at Level 5 does wrong on the complaints book, because the scripted bot does nothing wrong; every effect is expected to read untestable until an error model is built for this desk.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (90 on the smaller side, 80% power): 13.5 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T12:47:53.226Z; controls —; obligations —; campaigns complaints-stack--guard=none, complaints-stack--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## complaint-acknowledged

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -4.1 – +4.1 | 1.000 | 90 / 90 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 90 pairs.

## root-cause-named

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +68.9 | +68.9 | +0.0 | -13.3 – +13.3 | 1.000 | 90 / 90 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 90 pairs.

## redress-within-bounds

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +67.8 | +67.8 | +0.0 | -13.5 – +13.5 | 1.000 | 90 / 90 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 90 pairs.

## ombudsman-disclosed

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -4.1 – +4.1 | 1.000 | 90 / 90 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 90 pairs.

Digest `97b48f78a24e13c381302de86f93605bb682976283767ace99c1af90c3f4c83b`.
