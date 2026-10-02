# The policy-card stack on the collections book

**Hypothesis.** The collections desk’s policy-card stack (fs-collections/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the collections book, because the scripted bot does nothing wrong; every effect is expected to read untestable until an error model is built for this desk.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (40 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T12:47:11.803Z; controls —; obligations —; campaigns collections-stack--guard=none, collections-stack--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## plan-matches-rule

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -8.8 – +8.8 | 1.000 | 40 / 40 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 40 pairs.

## vulnerability-actioned

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -8.8 – +8.8 | 1.000 | 40 / 40 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 40 pairs.

Digest `7cbca10aa748b1ccc3dfcac0f8845f44497178cfa7a5cbde667cee4e48f73bf9`.
