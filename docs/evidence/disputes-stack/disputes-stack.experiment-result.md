# The policy-card stack on the disputes book

**Hypothesis.** The disputes desk’s policy-card stack (fs-disputes/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the disputes book, because the scripted bot does nothing wrong; every effect is expected to read untestable until an error model is built for this desk.

**Verdict: untestable.** minimum detectable difference of rates at the achieved n (30 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T12:47:10.728Z; controls —; obligations —; campaigns disputes-stack--guard=none, disputes-stack--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## decision-matches-rules

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -11.4 – +11.4 | 1.000 | 30 / 30 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 30 pairs.

## reimbursed-within-limit

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -11.4 – +11.4 | 1.000 | 30 / 30 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 30 pairs.

Digest `e104cfcfb17ca26ec40da1bf600c7f89cfa27e3e33b2aede9d26f67de577acfc`.
