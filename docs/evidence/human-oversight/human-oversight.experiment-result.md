# Human oversight by autonomy level on the loan book

**Hypothesis.** Moving the lending journey from Level 3 to Level 5 cuts touches per case by a stated factor and raises the ceiling-breach rate from zero; the policy-card stack at Level 4 recovers most of the outcome loss at a fraction of Level 3’s touches.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 1.3 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-29T22:17:57.861Z; controls fs-lending/control-map/four-eyes; obligations pra:ss1-23:mitigants, pra:ss1-23:governance; campaigns human-oversight--brain=scripted-noisy--executors=rules-only--guard=none, human-oversight--brain=fallible--executors=rules-only--guard=none, human-oversight--brain=scripted-noisy--executors=rules-only--guard=policy-cards, human-oversight--brain=fallible--executors=rules-only--guard=policy-cards, human-oversight--brain=scripted-noisy--executors=bot-explains-only--guard=none, human-oversight--brain=fallible--executors=bot-explains-only--guard=none, human-oversight--brain=scripted-noisy--executors=bot-explains-only--guard=policy-cards, human-oversight--brain=fallible--executors=bot-explains-only--guard=policy-cards, human-oversight--brain=scripted-noisy--executors=bot-recommends--guard=none, human-oversight--brain=fallible--executors=bot-recommends--guard=none, human-oversight--brain=scripted-noisy--executors=bot-recommends--guard=policy-cards, human-oversight--brain=fallible--executors=bot-recommends--guard=policy-cards, human-oversight--brain=scripted-noisy--executors=bot-with-a-person-at-the-decision--guard=none, human-oversight--brain=fallible--executors=bot-with-a-person-at-the-decision--guard=none, human-oversight--brain=scripted-noisy--executors=bot-with-a-person-at-the-decision--guard=policy-cards, human-oversight--brain=fallible--executors=bot-with-a-person-at-the-decision--guard=policy-cards, human-oversight--brain=scripted-noisy--executors=bot-everywhere--guard=none, human-oversight--brain=fallible--executors=bot-everywhere--guard=none, human-oversight--brain=scripted-noisy--executors=bot-everywhere--guard=policy-cards, human-oversight--brain=fallible--executors=bot-everywhere--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## touches

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | bot-explains-only vs rules-only | 0.478 | 1.000 | 0.522 | 0.487 – 0.557 | 0.000 | 783 / 783 | ok |
| executors | bot-recommends vs rules-only | 0.478 | 1.447 | 0.969 | 0.920 – 1.019 | 0.000 | 783 / 783 | ok |
| executors | bot-with-a-person-at-the-decision vs rules-only | 0.478 | 1.000 | 0.522 | 0.487 – 0.557 | 0.000 | 783 / 783 | ok |
| executors | bot-everywhere vs rules-only | 0.478 | 0.000 | -0.478 | -0.513 – -0.443 | 0.000 | 783 / 783 | ok |
| executors | bot-explains-only vs rules-only | 0.478 | 1.000 | 0.522 | 0.487 – 0.557 | 0.000 | 783 / 783 | ok |
| executors | bot-recommends vs rules-only | 0.478 | 1.447 | 0.969 | 0.920 – 1.019 | 0.000 | 783 / 783 | ok |
| executors | bot-with-a-person-at-the-decision vs rules-only | 0.478 | 1.000 | 0.522 | 0.487 – 0.557 | 0.000 | 783 / 783 | ok |
| executors | bot-everywhere vs rules-only | 0.478 | 0.000 | -0.478 | -0.513 – -0.443 | 0.000 | 783 / 783 | ok |
| guard | policy-cards vs none | 0.478 | 0.478 | 0.000 | -0.050 – 0.050 | 1.000 | 783 / 783 | ok |
| guard | policy-cards vs none | 0.478 | 0.478 | 0.000 | -0.050 – 0.050 | 1.000 | 783 / 783 | ok |

Method: difference of means, Welch interval at 95%; sign test over 409 non-tied of 783 pairs.

## breaches

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | bot-explains-only vs rules-only | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |
| executors | bot-recommends vs rules-only | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |
| executors | bot-with-a-person-at-the-decision vs rules-only | 0.000 | 0.148 | 0.148 | 0.123 – 0.173 | 0.000 | 783 / 783 | ok |
| executors | bot-everywhere vs rules-only | 0.000 | 0.626 | 0.626 | 0.592 – 0.660 | 0.000 | 783 / 783 | ok |
| executors | bot-explains-only vs rules-only | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |
| executors | bot-recommends vs rules-only | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |
| executors | bot-with-a-person-at-the-decision vs rules-only | 0.000 | 0.169 | 0.169 | 0.142 – 0.195 | 0.000 | 783 / 783 | ok |
| executors | bot-everywhere vs rules-only | 0.000 | 0.627 | 0.627 | 0.593 – 0.661 | 0.000 | 783 / 783 | ok |
| guard | policy-cards vs none | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |
| guard | policy-cards vs none | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |

Method: difference of means, Welch interval at 95%; sign test over 0 non-tied of 783 pairs.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | bot-explains-only vs rules-only | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-recommends vs rules-only | +100.0 | +94.3 | -5.7 | -7.6 – -4.2 | 0.000 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs rules-only | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-everywhere vs rules-only | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-explains-only vs rules-only | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-recommends vs rules-only | +100.0 | +94.3 | -5.7 | -7.6 – -4.2 | 0.000 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs rules-only | +100.0 | +91.3 | -8.7 | -10.9 – -6.8 | 0.000 | 783 / 783 | underpowered |
| executors | bot-everywhere vs rules-only | +100.0 | +91.3 | -8.7 | -10.9 – -6.8 | 0.000 | 783 / 783 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 783 pairs.

Digest `0ed4b7b4163ee1db2fc31ba8ff162ea3e47a57a0d1579f731b2ab22c83dae8cf`.
