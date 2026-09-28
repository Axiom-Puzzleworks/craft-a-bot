# v1: the DGX Spark’s local LLM against Jev and the regex, same questions

**Hypothesis.** A local 122B LLM on the DGX Sparks, asked the same questions through the same contract, reads the caller’s request and need about as well as Jev, and its log-probability confidence routes its errors to a person as well as Jev’s calibrated confidence does.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (95 on the smaller side, 80% power): 17.4 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-28T09:44:36.563Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-spark--executors=regex, servicing-spark--executors=jev, servicing-spark--executors=spark, servicing-spark--executors=spark-gate-0-80. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ------------------------ | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex             | +53.7    | +98.9     | +45.3 | +34.5 – +55.3 | 0.000 | 95 / 95 | underpowered |
| executors | spark vs regex           | +53.7    | +93.7     | +40.0 | +28.2 – +50.5 | 0.000 | 95 / 95 | ok           |
| executors | spark-gate-0.80 vs regex | +53.7    | +94.7     | +41.1 | +29.4 – +51.5 | 0.000 | 95 / 95 | ok           |

Method: difference of rates, Newcombe interval at 95%; sign test over 43 discordant of 95 pairs.

## need-read-right

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ------------------------ | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex             | +62.1    | +97.9     | +35.8 | +25.3 – +46.0 | 0.000 | 95 / 95 | underpowered |
| executors | spark vs regex           | +62.1    | +98.9     | +36.8 | +26.6 – +46.9 | 0.000 | 95 / 95 | underpowered |
| executors | spark-gate-0.80 vs regex | +62.1    | +100.0    | +37.9 | +28.0 – +47.9 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 34 discordant of 95 pairs.

## need-detected

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ------------------------ | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex             | +62.1    | +97.9     | +35.8 | +25.3 – +46.0 | 0.000 | 95 / 95 | underpowered |
| executors | spark vs regex           | +62.1    | +98.9     | +36.8 | +26.6 – +46.9 | 0.000 | 95 / 95 | underpowered |
| executors | spark-gate-0.80 vs regex | +62.1    | +100.0    | +37.9 | +28.0 – +47.9 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 34 discordant of 95 pairs.

## disclosure-recorded

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval      | p     | n       | Power |
| --------- | ------------------------ | -------- | --------- | ----- | ------------- | ----- | ------- | ----- |
| executors | jev vs regex             | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |
| executors | spark vs regex           | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |
| executors | spark-gate-0.80 vs regex | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 22 discordant of 95 pairs.

## needs-met

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ------------------------ | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex             | +53.7    | +98.9     | +45.3 | +34.5 – +55.3 | 0.000 | 95 / 95 | underpowered |
| executors | spark vs regex           | +53.7    | +93.7     | +40.0 | +28.2 – +50.5 | 0.000 | 95 / 95 | ok           |
| executors | spark-gate-0.80 vs regex | +53.7    | +94.7     | +41.1 | +29.4 – +51.5 | 0.000 | 95 / 95 | ok           |

Method: difference of rates, Newcombe interval at 95%; sign test over 43 discordant of 95 pairs.

## touches

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ      | Interval       | p     | n       | Power |
| --------- | ------------------------ | -------- | --------- | ------ | -------------- | ----- | ------- | ----- |
| executors | jev vs regex             | 0.126    | 0.168     | 0.042  | -0.060 – 0.144 | 0.424 | 95 / 95 | ok    |
| executors | spark vs regex           | 0.126    | 0.116     | -0.011 | -0.104 – 0.083 | 1.000 | 95 / 95 | ok    |
| executors | spark-gate-0.80 vs regex | 0.126    | 0.242     | 0.116  | -0.032 – 0.264 | 0.359 | 95 / 95 | ok    |

Method: difference of means, Welch interval at 95%; sign test over 14 non-tied of 95 pairs.

Digest `8a85fcc2b354b218903492b978f21e09d5578ff5233d98f6d192c22dbd0e1031`.
