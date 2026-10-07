# The policy-card stack on the loan book

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 6.6 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-07T11:30:25.690Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-stack--brain=scripted-noisy--executors=rules-only--guard=none, lending-stack--brain=fallible--executors=rules-only--guard=none, lending-stack--brain=scripted-noisy--executors=bot-with-a-person-at-the-decision--guard=none, lending-stack--brain=fallible--executors=bot-with-a-person-at-the-decision--guard=none, lending-stack--brain=scripted-noisy--executors=bot-everywhere--guard=none, lending-stack--brain=fallible--executors=bot-everywhere--guard=none, lending-stack--brain=scripted-noisy--executors=rules-only--guard=policy-cards, lending-stack--brain=fallible--executors=rules-only--guard=policy-cards, lending-stack--brain=scripted-noisy--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-stack--brain=fallible--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-stack--brain=scripted-noisy--executors=bot-everywhere--guard=policy-cards, lending-stack--brain=fallible--executors=bot-everywhere--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| guard | policy-cards vs none | +91.3 | +91.3 | +0.0 | -2.8 – +2.8 | 1.000 | 783 / 783 | ok |
| executors | rules-only vs bot-everywhere | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | rules-only vs bot-everywhere | +91.3 | +100.0 | +8.7 | +6.8 – +10.9 | 0.000 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +91.3 | +91.3 | +0.0 | -2.8 – +2.8 | 1.000 | 783 / 783 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 783 pairs.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| guard | policy-cards vs none | +0.9 | +0.9 | +0.0 | -1.0 – +1.0 | 1.000 | 783 / 783 | ok |
| executors | rules-only vs bot-everywhere | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | rules-only vs bot-everywhere | +0.9 | +0.0 | -0.9 | -1.8 – -0.2 | 0.016 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.9 | +0.9 | +0.0 | -1.0 – +1.0 | 1.000 | 783 / 783 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 783 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (scripted-noisy tier) | 0.0078 | 0.0081 | 0.0081 | 0.0000 |
| guard | policy-cards vs none (fallible tier) | 0.0078 | 0.0081 | 0.0081 | 0.0000 |
| executors | rules-only vs bot-everywhere (scripted-noisy tier) | 0.0078 | 0.6145 | 0.0000 | 0.6145 |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere (scripted-noisy tier) | 0.0078 | 1.3655 | 0.0078 | 1.3577 |
| executors | rules-only vs bot-everywhere (fallible tier) | 0.0078 | 0.6145 | 0.0000 | 0.6145 |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere (fallible tier) | 0.0078 | 1.3595 | 0.0077 | 1.3517 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `2c6b9efc8720643c2e55e0a5e54e2cf56172a2b93e05100a2e721d6288445ae9`.
