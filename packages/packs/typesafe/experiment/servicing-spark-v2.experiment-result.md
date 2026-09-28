# v2 (harder): the DGX Spark’s local LLM against Jev and the regex, same questions

**Hypothesis.** A local 122B LLM on the DGX Sparks, asked the same questions through the same contract, reads the caller’s request and need about as well as Jev, and its log-probability confidence routes its errors to a person as well as Jev’s calibrated confidence does.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (115 on the smaller side, 80% power): 15.5 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-28T09:44:39.223Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-spark-v2--executors=regex, servicing-spark-v2--executors=jev, servicing-spark-v2--executors=spark, servicing-spark-v2--executors=spark-gate-0-80. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval      | p     | n         | Power        |
| --------- | ------------------------ | -------- | --------- | ----- | ------------- | ----- | --------- | ------------ |
| executors | jev vs regex             | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |
| executors | spark vs regex           | +55.7    | +95.7     | +40.0 | +29.7 – +49.4 | 0.000 | 115 / 115 | ok           |
| executors | spark-gate-0.80 vs regex | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 50 discordant of 115 pairs.

## need-read-right

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval      | p     | n         | Power |
| --------- | ------------------------ | -------- | --------- | ----- | ------------- | ----- | --------- | ----- |
| executors | jev vs regex             | +59.1    | +93.0     | +33.9 | +23.4 – +43.7 | 0.000 | 115 / 115 | ok    |
| executors | spark vs regex           | +59.1    | +93.0     | +33.9 | +23.4 – +43.7 | 0.000 | 115 / 115 | ok    |
| executors | spark-gate-0.80 vs regex | +59.1    | +94.8     | +35.7 | +25.4 – +45.2 | 0.000 | 115 / 115 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 41 discordant of 115 pairs.

## need-detected

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval      | p     | n         | Power |
| --------- | ------------------------ | -------- | --------- | ----- | ------------- | ----- | --------- | ----- |
| executors | jev vs regex             | +60.9    | +93.0     | +32.2 | +21.7 – +41.9 | 0.000 | 115 / 115 | ok    |
| executors | spark vs regex           | +60.9    | +93.0     | +32.2 | +21.7 – +41.9 | 0.000 | 115 / 115 | ok    |
| executors | spark-gate-0.80 vs regex | +60.9    | +94.8     | +33.9 | +23.7 – +43.5 | 0.000 | 115 / 115 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 39 discordant of 115 pairs.

## disclosure-recorded

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval     | p     | n         | Power |
| --------- | ------------------------ | -------- | --------- | ----- | ------------ | ----- | --------- | ----- |
| executors | jev vs regex             | +69.6    | +85.2     | +15.7 | +4.8 – +26.1 | 0.000 | 115 / 115 | ok    |
| executors | spark vs regex           | +69.6    | +85.2     | +15.7 | +4.8 – +26.1 | 0.001 | 115 / 115 | ok    |
| executors | spark-gate-0.80 vs regex | +69.6    | +87.0     | +17.4 | +6.8 – +27.6 | 0.000 | 115 / 115 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 22 discordant of 115 pairs.

## needs-met

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ     | Interval      | p     | n         | Power        |
| --------- | ------------------------ | -------- | --------- | ----- | ------------- | ----- | --------- | ------------ |
| executors | jev vs regex             | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |
| executors | spark vs regex           | +55.7    | +95.7     | +40.0 | +29.7 – +49.4 | 0.000 | 115 / 115 | ok           |
| executors | spark-gate-0.80 vs regex | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 50 discordant of 115 pairs.

## touches

| Factor    | Treatment vs baseline    | Baseline | Treatment | Δ      | Interval       | p     | n         | Power |
| --------- | ------------------------ | -------- | --------- | ------ | -------------- | ----- | --------- | ----- |
| executors | jev vs regex             | 0.157    | 0.174     | 0.017  | -0.080 – 0.114 | 0.832 | 115 / 115 | ok    |
| executors | spark vs regex           | 0.157    | 0.148     | -0.009 | -0.102 – 0.085 | 1.000 | 115 / 115 | ok    |
| executors | spark-gate-0.80 vs regex | 0.157    | 0.383     | 0.226  | 0.053 – 0.399  | 0.071 | 115 / 115 | ok    |

Method: difference of means, Welch interval at 95%; sign test over 22 non-tied of 115 pairs.

Digest `cfb0ed13d0a5445c0ef1ddebe840c9cfb47b505046f26bd766aaa57178d65863`.
