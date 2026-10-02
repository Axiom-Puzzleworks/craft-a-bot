# The policy-card stack on the loan book

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 6.6 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T12:42:35.320Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-stack--brain=scripted-noisy--executors=rules-only--guard=none, lending-stack--brain=fallible--executors=rules-only--guard=none, lending-stack--brain=scripted-noisy--executors=bot-with-a-person-at-the-decision--guard=none, lending-stack--brain=fallible--executors=bot-with-a-person-at-the-decision--guard=none, lending-stack--brain=scripted-noisy--executors=bot-everywhere--guard=none, lending-stack--brain=fallible--executors=bot-everywhere--guard=none, lending-stack--brain=scripted-noisy--executors=rules-only--guard=policy-cards, lending-stack--brain=fallible--executors=rules-only--guard=policy-cards, lending-stack--brain=scripted-noisy--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-stack--brain=fallible--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-stack--brain=scripted-noisy--executors=bot-everywhere--guard=policy-cards, lending-stack--brain=fallible--executors=bot-everywhere--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

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

Digest `a53cd0798cb6231b16e334cc39881f5da2c4f72de4f53934529aa66b2288f03c`.
