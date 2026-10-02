# Loosening the refer ratio on the loan book

**Hypothesis.** Lowering referRatioPercent from 60 to 45 raises over-approval when the bot decides alone, and a person at the decision removes it at a stated escalation cost.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 1.1 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T17:47:55.697Z; controls fs-lending/control-map/four-eyes; obligations fca:conc:affordability, pra:ss1-23:mitigants; campaigns lending-knobs--brain=scripted-optimal--executors=bot-everywhere--knob=60, lending-knobs--brain=fallible--executors=bot-everywhere--knob=60, lending-knobs--brain=scripted-optimal--executors=bot-with-a-person-at-the-decision--knob=60, lending-knobs--brain=fallible--executors=bot-with-a-person-at-the-decision--knob=60, lending-knobs--brain=scripted-optimal--executors=bot-everywhere--knob=45, lending-knobs--brain=fallible--executors=bot-everywhere--knob=45, lending-knobs--brain=scripted-optimal--executors=bot-with-a-person-at-the-decision--knob=45, lending-knobs--brain=fallible--executors=bot-with-a-person-at-the-decision--knob=45. Evidence about this synthetic bank under these configurations, and nothing else.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| knob | 45 vs 60 | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| knob | 45 vs 60 | +0.9 | +0.9 | +0.0 | -1.0 – +1.0 | 1.000 | 783 / 783 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.0 | +0.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.9 | +0.9 | +0.0 | -1.0 – +1.0 | 1.000 | 783 / 783 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 783 pairs.

## escalations

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| knob | 45 vs 60 | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |
| knob | 45 vs 60 | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | 1.000 | 783 / 783 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | 0.000 | 0.006 | 0.006 | 0.004 – 0.008 | 0.000 | 783 / 783 | ok |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | 0.000 | 0.013 | 0.013 | 0.011 – 0.016 | 0.000 | 783 / 783 | ok |

Method: difference of means, Welch interval at 95%; sign test over 0 non-tied of 783 pairs.

Digest `8043e568120489e3db32e3faea601404183bd061f51fca16e9699d69c5c9b87b`.
