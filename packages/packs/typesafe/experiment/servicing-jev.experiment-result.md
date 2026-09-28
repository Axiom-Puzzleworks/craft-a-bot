# Jev as the servicing journey’s reader, against the bank’s regex, on the labelled corpus

**Hypothesis.** Jev reads the caller’s request and support need more accurately than the bank’s regex rules; its confidence is calibrated, so a gate at 0.8 or 0.9 sends its errors to a person at a small human load.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (95 on the smaller side, 80% power): 17.1 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-28T08:11:19.090Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-jev--executors=regex, servicing-jev--executors=jev, servicing-jev--executors=jev-gate-0-80, servicing-jev--executors=jev-gate-0-90. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ---------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex           | +53.7    | +98.9     | +45.3 | +34.5 – +55.3 | 0.000 | 95 / 95 | underpowered |
| executors | jev-gate-0.80 vs regex | +53.7    | +100.0    | +46.3 | +35.9 – +56.3 | 0.000 | 95 / 95 | underpowered |
| executors | jev-gate-0.90 vs regex | +53.7    | +100.0    | +46.3 | +35.9 – +56.3 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 43 discordant of 95 pairs.

## need-read-right

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ---------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex           | +62.1    | +97.9     | +35.8 | +25.3 – +46.0 | 0.000 | 95 / 95 | underpowered |
| executors | jev-gate-0.80 vs regex | +62.1    | +100.0    | +37.9 | +28.0 – +47.9 | 0.000 | 95 / 95 | underpowered |
| executors | jev-gate-0.90 vs regex | +62.1    | +100.0    | +37.9 | +28.0 – +47.9 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 34 discordant of 95 pairs.

## need-detected

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ---------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex           | +62.1    | +97.9     | +35.8 | +25.3 – +46.0 | 0.000 | 95 / 95 | underpowered |
| executors | jev-gate-0.80 vs regex | +62.1    | +100.0    | +37.9 | +28.0 – +47.9 | 0.000 | 95 / 95 | underpowered |
| executors | jev-gate-0.90 vs regex | +62.1    | +100.0    | +37.9 | +28.0 – +47.9 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 34 discordant of 95 pairs.

## disclosure-recorded

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval      | p     | n       | Power |
| --------- | ---------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ----- |
| executors | jev vs regex           | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |
| executors | jev-gate-0.80 vs regex | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |
| executors | jev-gate-0.90 vs regex | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 22 discordant of 95 pairs.

## needs-met

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ---------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex           | +53.7    | +98.9     | +45.3 | +34.5 – +55.3 | 0.000 | 95 / 95 | underpowered |
| executors | jev-gate-0.80 vs regex | +53.7    | +100.0    | +46.3 | +35.9 – +56.3 | 0.000 | 95 / 95 | underpowered |
| executors | jev-gate-0.90 vs regex | +53.7    | +100.0    | +46.3 | +35.9 – +56.3 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 43 discordant of 95 pairs.

## touches

| Factor    | Treatment vs baseline  | Baseline | Treatment | Δ     | Interval       | p     | n       | Power |
| --------- | ---------------------- | -------- | --------- | ----- | -------------- | ----- | ------- | ----- |
| executors | jev vs regex           | 0.126    | 0.168     | 0.042 | -0.060 – 0.144 | 0.424 | 95 / 95 | ok    |
| executors | jev-gate-0.80 vs regex | 0.126    | 0.263     | 0.137 | -0.000 – 0.274 | 0.031 | 95 / 95 | ok    |
| executors | jev-gate-0.90 vs regex | 0.126    | 0.358     | 0.232 | 0.066 – 0.397  | 0.004 | 95 / 95 | ok    |

Method: difference of means, Welch interval at 95%; sign test over 14 non-tied of 95 pairs.

Digest `e35eeb41964b92de96b28842df8025c5a25c0f79840033a740a44bb4656d2fd4`.
