# The policy-card stack on the collections book

**Hypothesis.** The collections desk’s policy-card stack (fs-collections/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the collections book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (390 on the smaller side, 80% power): 3.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T17:24:43.551Z; controls —; obligations —; campaigns collections-stack--brain=scripted-optimal--guard=none, collections-stack--brain=fallible--guard=none, collections-stack--brain=scripted-optimal--guard=policy-cards, collections-stack--brain=fallible--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## plan-matches-rule

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -1.0 – +1.0 | 1.000 | 400 / 400 | underpowered |
| guard | policy-cards vs none | +90.0 | +92.3 | +2.3 | -1.7 – +6.3 | 1.000 | 400 / 390 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 400 pairs.

## vulnerability-actioned

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -1.0 – +1.0 | 1.000 | 400 / 400 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -1.0 – +1.0 | 1.000 | 400 / 400 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 400 pairs.

Digest `a339383d534c3b966e0ed2bc5e98a94dd73ba68265a82a408ea7ab3864def2b4`.
