# v1: the Sparks’ 35B chat model against the 122B, Jev and the regex

**Hypothesis.** A smaller, faster local model (Qwen3.6-35B-A3B, the Sparks’ chat mode) asked the same questions through the same contract reads the caller’s request and need nearly as well as the 122B and Jev, at a fraction of the latency.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (95 on the smaller side, 80% power): 17.3 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-28T10:22:44.921Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-spark35--executors=regex, servicing-spark35--executors=jev, servicing-spark35--executors=spark, servicing-spark35--executors=spark35, servicing-spark35--executors=spark35-gate-0-80. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | -------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex               | +53.7    | +98.9     | +45.3 | +34.5 – +55.3 | 0.000 | 95 / 95 | underpowered |
| executors | spark vs regex             | +53.7    | +93.7     | +40.0 | +28.2 – +50.5 | 0.000 | 95 / 95 | ok           |
| executors | spark35 vs regex           | +53.7    | +94.7     | +41.1 | +29.4 – +51.5 | 0.000 | 95 / 95 | ok           |
| executors | spark35-gate-0.80 vs regex | +53.7    | +97.9     | +44.2 | +33.2 – +54.3 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 43 discordant of 95 pairs.

## need-read-right

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | -------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex               | +62.1    | +97.9     | +35.8 | +25.3 – +46.0 | 0.000 | 95 / 95 | underpowered |
| executors | spark vs regex             | +62.1    | +98.9     | +36.8 | +26.6 – +46.9 | 0.000 | 95 / 95 | underpowered |
| executors | spark35 vs regex           | +62.1    | +96.8     | +34.7 | +24.0 – +45.0 | 0.000 | 95 / 95 | underpowered |
| executors | spark35-gate-0.80 vs regex | +62.1    | +98.9     | +36.8 | +26.6 – +46.9 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 34 discordant of 95 pairs.

## need-detected

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | -------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex               | +62.1    | +97.9     | +35.8 | +25.3 – +46.0 | 0.000 | 95 / 95 | underpowered |
| executors | spark vs regex             | +62.1    | +98.9     | +36.8 | +26.6 – +46.9 | 0.000 | 95 / 95 | underpowered |
| executors | spark35 vs regex           | +62.1    | +96.8     | +34.7 | +24.0 – +45.0 | 0.000 | 95 / 95 | underpowered |
| executors | spark35-gate-0.80 vs regex | +62.1    | +98.9     | +36.8 | +26.6 – +46.9 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 34 discordant of 95 pairs.

## disclosure-recorded

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval      | p     | n       | Power |
| --------- | -------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ----- |
| executors | jev vs regex               | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |
| executors | spark vs regex             | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |
| executors | spark35 vs regex           | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |
| executors | spark35-gate-0.80 vs regex | +63.2    | +86.3     | +23.2 | +10.9 – +34.6 | 0.000 | 95 / 95 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 22 discordant of 95 pairs.

## needs-met

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | -------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex               | +53.7    | +98.9     | +45.3 | +34.5 – +55.3 | 0.000 | 95 / 95 | underpowered |
| executors | spark vs regex             | +53.7    | +93.7     | +40.0 | +28.2 – +50.5 | 0.000 | 95 / 95 | ok           |
| executors | spark35 vs regex           | +53.7    | +94.7     | +41.1 | +29.4 – +51.5 | 0.000 | 95 / 95 | ok           |
| executors | spark35-gate-0.80 vs regex | +53.7    | +97.9     | +44.2 | +33.2 – +54.3 | 0.000 | 95 / 95 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 43 discordant of 95 pairs.

## touches

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ      | Interval       | p     | n       | Power |
| --------- | -------------------------- | -------- | --------- | ------ | -------------- | ----- | ------- | ----- |
| executors | jev vs regex               | 0.126    | 0.168     | 0.042  | -0.060 – 0.144 | 0.424 | 95 / 95 | ok    |
| executors | spark vs regex             | 0.126    | 0.116     | -0.011 | -0.104 – 0.083 | 1.000 | 95 / 95 | ok    |
| executors | spark35 vs regex           | 0.126    | 0.137     | 0.011  | -0.087 – 0.108 | 1.000 | 95 / 95 | ok    |
| executors | spark35-gate-0.80 vs regex | 0.126    | 0.232     | 0.105  | -0.015 – 0.226 | 0.134 | 95 / 95 | ok    |

Method: difference of means, Welch interval at 95%; sign test over 14 non-tied of 95 pairs.

Digest `17da61165a9b5f01609f6344d932f7a389ffa3484ae67ac8096ee1ae1de9be29`.
