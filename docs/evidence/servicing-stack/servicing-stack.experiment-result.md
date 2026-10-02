# The policy-card stack on the servicing book

**Hypothesis.** The servicing desk’s policy-card stack (fs-servicing/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the servicing book, because the scripted bot does nothing wrong; every effect is expected to read untestable until an error model is built for this desk.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (40 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T12:47:13.741Z; controls —; obligations —; campaigns servicing-stack--guard=none, servicing-stack--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## needs-met

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -8.8 – +8.8 | 1.000 | 40 / 40 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 40 pairs.

## disclosure-recorded

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -8.8 – +8.8 | 1.000 | 40 / 40 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 40 pairs.

Digest `34b398c053a9f13bd4fb916ea34dddbaf5b84d83acc7e6e31dde6fc737705439`.
