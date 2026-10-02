# The policy-card stack on the onboarding book

**Hypothesis.** The onboarding desk’s policy-card stack (fs-onboarding/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the onboarding book, because the scripted bot does nothing wrong; every effect is expected to read untestable until an error model is built for this desk.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (16 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T12:47:12.788Z; controls —; obligations —; campaigns onboarding-stack--guard=none, onboarding-stack--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## decision-matches-rules

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -19.4 – +19.4 | 1.000 | 16 / 16 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 16 pairs.

## hit-contained

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -19.4 – +19.4 | 1.000 | 16 / 16 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 16 pairs.

Digest `fe2adf3f91f393d09a0ce12d77a0c9b2e9878b1bf71e8f5c6859020bd84c5a74`.
