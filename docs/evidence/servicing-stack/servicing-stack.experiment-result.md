# The policy-card stack on the servicing book

**Hypothesis.** The servicing desk’s policy-card stack (fs-servicing/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the servicing book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (400 on the smaller side, 80% power): 3.2 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-07T11:31:36.818Z; controls —; obligations —; campaigns servicing-stack--brain=scripted-optimal--guard=none, servicing-stack--brain=fallible--guard=none, servicing-stack--brain=scripted-optimal--guard=policy-cards, servicing-stack--brain=fallible--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

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

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (scripted-optimal tier) | 0.0041 | 0.0041 | 0.0041 | 0.0000 |
| guard | policy-cards vs none (fallible tier) | 0.0053 | 0.0051 | 0.0051 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `c04871e8cf984153ff95cecb69c8d36034ea5f01c480489691a1dfe7c9784bd0`.
