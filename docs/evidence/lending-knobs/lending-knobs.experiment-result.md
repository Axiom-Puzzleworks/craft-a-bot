# Loosening the refer ratio on the loan book

**Hypothesis.** Lowering referRatioPercent from 60 to 45 raises over-approval when the bot decides alone, and a person at the decision removes it at a stated escalation cost.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-11T04:10:26.472Z; controls fs-lending/control-map/four-eyes; obligations fca:conc:affordability, pra:ss1-23:mitigants; campaigns lending-knobs--executors=bot-everywhere--knob=60, lending-knobs--executors=bot-with-a-person-at-the-decision--knob=60, lending-knobs--executors=bot-everywhere--knob=45, lending-knobs--executors=bot-with-a-person-at-the-decision--knob=45. Evidence about this synthetic bank under these configurations, and nothing else.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| knob | 45 vs 60 | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 783 pairs.

## escalations

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| knob | 45 vs 60 | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |

Method: difference of means, Welch interval at 95%; sign test over 0 non-tied of 783 pairs.

Digest `13535b80156a9414480b5458b57c4a0dfdb9a2561fcd4e3ef2a07c9d1be19afe`.
