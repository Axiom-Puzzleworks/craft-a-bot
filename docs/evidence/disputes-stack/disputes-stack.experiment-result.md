# The policy-card stack on the disputes book

**Hypothesis.** The disputes desk’s policy-card stack (fs-disputes/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the disputes book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (300 on the smaller side, 80% power): 3.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-07T11:03:41.386Z; controls —; obligations —; campaigns disputes-stack--brain=scripted-optimal--guard=none, disputes-stack--brain=fallible--guard=none, disputes-stack--brain=scripted-optimal--guard=policy-cards, disputes-stack--brain=fallible--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## decision-matches-rules

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -1.3 – +1.3 | 1.000 | 300 / 300 | underpowered |
| guard | policy-cards vs none | +93.0 | +93.0 | +0.0 | -4.2 – +4.2 | 1.000 | 300 / 300 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 300 pairs.

## reimbursed-within-limit

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -1.3 – +1.3 | 1.000 | 300 / 300 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -1.3 – +1.3 | 1.000 | 300 / 300 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 300 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (scripted-optimal tier) | 0.0085 | 0.0085 | 0.0085 | 0.0000 |
| guard | policy-cards vs none (fallible tier) | 0.0085 | 0.0085 | 0.0085 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `8fc87a2f7265314d27e0190b6659b758501b3d74ae0f8ff2ce88c6ed9f457e8e`.
