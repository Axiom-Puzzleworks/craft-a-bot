# Jev as the servicing journey’s reader, against the bank’s regex, on the harder v2 corpus

**Hypothesis.** On harder calls — negations, hypotheticals, informal and non-native English, euphemism, transcripts, callers steering the label — Jev still reads the request and the need more accurately than the regex, and its low-confidence answers are where its errors are.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (115 on the smaller side, 80% power): 15.4 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-28T08:30:35.238Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-jev-v2--executors=regex, servicing-jev-v2--executors=jev, servicing-jev-v2--executors=jev-gate-0-80, servicing-jev-v2--executors=jev-gate-0-90. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval      | p     | n         | Power        |
| --------- | ---------------------- | -------- | --------- | ----- | ------------- | ----- | --------- | ------------ |
| executors | jev vs regex           | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |
| executors | jev-gate-0.80 vs regex | +55.7    | +99.1     | +43.5 | +33.9 – +52.6 | 0.000 | 115 / 115 | underpowered |
| executors | jev-gate-0.90 vs regex | +55.7    | +99.1     | +43.5 | +33.9 – +52.6 | 0.000 | 115 / 115 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 50 discordant of 115 pairs.

## need-read-right

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval      | p     | n         | Power |
| --------- | ---------------------- | -------- | --------- | ----- | ------------- | ----- | --------- | ----- |
| executors | jev vs regex           | +59.1    | +93.0     | +33.9 | +23.4 – +43.7 | 0.000 | 115 / 115 | ok    |
| executors | jev-gate-0.80 vs regex | +59.1    | +93.9     | +34.8 | +24.4 – +44.4 | 0.000 | 115 / 115 | ok    |
| executors | jev-gate-0.90 vs regex | +59.1    | +94.8     | +35.7 | +25.4 – +45.2 | 0.000 | 115 / 115 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 41 discordant of 115 pairs.

## need-detected

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval      | p     | n         | Power |
| --------- | ---------------------- | -------- | --------- | ----- | ------------- | ----- | --------- | ----- |
| executors | jev vs regex           | +60.9    | +93.0     | +32.2 | +21.7 – +41.9 | 0.000 | 115 / 115 | ok    |
| executors | jev-gate-0.80 vs regex | +60.9    | +93.9     | +33.0 | +22.7 – +42.7 | 0.000 | 115 / 115 | ok    |
| executors | jev-gate-0.90 vs regex | +60.9    | +94.8     | +33.9 | +23.7 – +43.5 | 0.000 | 115 / 115 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 39 discordant of 115 pairs.

## disclosure-recorded

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval     | p     | n         | Power |
| --------- | ---------------------- | -------- | --------- | ----- | ------------ | ----- | --------- | ----- |
| executors | jev vs regex           | +69.6    | +85.2     | +15.7 | +4.8 – +26.1 | 0.000 | 115 / 115 | ok    |
| executors | jev-gate-0.80 vs regex | +69.6    | +85.2     | +15.7 | +4.8 – +26.1 | 0.000 | 115 / 115 | ok    |
| executors | jev-gate-0.90 vs regex | +69.6    | +85.2     | +15.7 | +4.8 – +26.1 | 0.000 | 115 / 115 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 22 discordant of 115 pairs.

## needs-met

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval      | p     | n         | Power        |
| --------- | ---------------------- | -------- | --------- | ----- | ------------- | ----- | --------- | ------------ |
| executors | jev vs regex           | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |
| executors | jev-gate-0.80 vs regex | +55.7    | +99.1     | +43.5 | +33.9 – +52.6 | 0.000 | 115 / 115 | underpowered |
| executors | jev-gate-0.90 vs regex | +55.7    | +99.1     | +43.5 | +33.9 – +52.6 | 0.000 | 115 / 115 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 50 discordant of 115 pairs.

## touches

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval       | p     | n         | Power |
| --------- | ---------------------- | -------- | --------- | ----- | -------------- | ----- | --------- | ----- |
| executors | jev vs regex           | 0.157    | 0.174     | 0.017 | -0.080 – 0.114 | 0.832 | 115 / 115 | ok    |
| executors | jev-gate-0.80 vs regex | 0.157    | 0.374     | 0.217 | 0.054 – 0.381  | 0.043 | 115 / 115 | ok    |
| executors | jev-gate-0.90 vs regex | 0.157    | 0.478     | 0.322 | 0.143 – 0.501  | 0.004 | 115 / 115 | ok    |

Method: difference of means, Welch interval at 95%; sign test over 22 non-tied of 115 pairs.

Digest `2c3bd95babb47b0b18d56458fdd50c79e3c1a6ac6c1199ac299c096496bcdf1a`.
