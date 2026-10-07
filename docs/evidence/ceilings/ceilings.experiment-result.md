# The ceilings enforced at Level 5 on the loan book

**Hypothesis.** Enforcing the decision-rights ceilings at Level 5 (WP139) brings the ceiling-breach rate to zero, with agreement with the rules unchanged; the price, a person’s touch on each decision above its ceiling, is read from each effect’s cost.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 2.9 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-07T13:05:59.229Z; controls fs-lending/control-map/ceilings-enforced; obligations pra:ss1-23:mitigants, pra:ss1-23:governance; campaigns ceilings--brain=scripted-noisy--executors=bot-everywhere, ceilings--brain=fallible--executors=bot-everywhere, ceilings--brain=scripted-noisy--executors=bot-everywhere-ceilings-enforced, ceilings--brain=fallible--executors=bot-everywhere-ceilings-enforced. Evidence about this synthetic bank under these configurations, and nothing else.

## breaches

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | bot-everywhere-ceilings-enforced vs bot-everywhere | 0.626 | 0.000 | -0.626 | -0.660 – -0.592 | 0.000 | 783 / 783 | ok |
| executors | bot-everywhere-ceilings-enforced vs bot-everywhere | 0.627 | 0.000 | -0.627 | -0.661 – -0.593 | 0.000 | 783 / 783 | ok |

Method: difference of means, Welch interval at 95%; sign test over 490 non-tied of 783 pairs.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | bot-everywhere-ceilings-enforced vs bot-everywhere | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-everywhere-ceilings-enforced vs bot-everywhere | +91.3 | +91.3 | +0.0 | -2.8 – +2.8 | 1.000 | 783 / 783 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 783 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| executors | bot-everywhere-ceilings-enforced vs bot-everywhere (scripted-noisy tier) | 0.0079 | 0.0079 | 0.0079 | 0.0000 |
| executors | bot-everywhere-ceilings-enforced vs bot-everywhere (fallible tier) | 0.0078 | 0.0078 | 0.0078 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `42d278399a459e6faab94c61de27ed156f95427f1a73638aae88587e41f4d294`.
