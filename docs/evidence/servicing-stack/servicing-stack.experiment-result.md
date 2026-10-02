# The policy-card stack on the servicing book

**Hypothesis.** The servicing desk’s policy-card stack (fs-servicing/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the servicing book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (400 on the smaller side, 80% power): 3.2 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T17:51:08.865Z; controls —; obligations —; campaigns servicing-stack--brain=scripted-optimal--guard=none, servicing-stack--brain=fallible--guard=none, servicing-stack--brain=scripted-optimal--guard=policy-cards, servicing-stack--brain=fallible--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## needs-met

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -1.0 – +1.0 | 1.000 | 400 / 400 | underpowered |
| guard | policy-cards vs none | +89.5 | +89.5 | +0.0 | -4.3 – +4.3 | 1.000 | 400 / 400 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 400 pairs.

## disclosure-recorded

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -1.0 – +1.0 | 1.000 | 400 / 400 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -1.0 – +1.0 | 1.000 | 400 / 400 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 400 pairs.

Digest `c31c759e3c454ac23e9aadfb2a197009f49448eabfda054980cd1fd82887a003`.
