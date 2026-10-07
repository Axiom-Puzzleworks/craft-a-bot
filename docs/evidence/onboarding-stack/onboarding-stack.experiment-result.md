# The policy-card stack on the onboarding book

**Hypothesis.** The onboarding desk’s policy-card stack (fs-onboarding/stack/policy-cards) changes nothing a scripted bot at Level 5 does wrong on the onboarding book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (166 on the smaller side, 80% power): 5.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-07T12:56:36.584Z; controls —; obligations —; campaigns onboarding-stack--brain=scripted-optimal--guard=none, onboarding-stack--brain=fallible--guard=none, onboarding-stack--brain=scripted-optimal--guard=policy-cards, onboarding-stack--brain=fallible--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## decision-matches-rules

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -2.3 – +2.3 | 1.000 | 166 / 166 | underpowered |
| guard | policy-cards vs none | +89.2 | +89.2 | +0.0 | -6.8 – +6.8 | 1.000 | 166 / 166 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 166 pairs.

## hit-contained

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -2.3 – +2.3 | 1.000 | 166 / 166 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -2.3 – +2.3 | 1.000 | 166 / 166 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 166 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (scripted-optimal tier) | 0.0060 | 0.0060 | 0.0060 | 0.0000 |
| guard | policy-cards vs none (fallible tier) | 0.0058 | 0.0058 | 0.0058 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `3cb8854f290b98c419cdb47f2defae8c505a458a7793c1d49a0f8d7b43210c4b`.
