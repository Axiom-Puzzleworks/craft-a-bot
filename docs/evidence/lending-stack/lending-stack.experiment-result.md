# The policy-card stack on the loan book

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 6.7 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-11T04:08:26.882Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-stack--executors=rules-only--guard=none, lending-stack--executors=bot-with-a-person-at-the-decision--guard=none, lending-stack--executors=bot-everywhere--guard=none, lending-stack--executors=rules-only--guard=policy-cards, lending-stack--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-stack--executors=bot-everywhere--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs rules-only | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-everywhere vs rules-only | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 783 pairs.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs rules-only | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-everywhere vs rules-only | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 783 pairs.

Digest `d22cafa1b08b45638d1b73c6d1f2b4640ffe8645287e6d09c2e298d93d8bd045`.
