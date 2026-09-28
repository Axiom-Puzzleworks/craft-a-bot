# v3 (held out): the DGX Spark’s local LLM against Jev, under both question sets

**Hypothesis.** A local 122B LLM on the DGX Sparks, asked the same questions through the same contract, reads the caller’s request and need about as well as Jev, and its log-probability confidence routes its errors to a person as well as Jev’s calibrated confidence does.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (96 on the smaller side, 80% power): 16.1 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-28T09:44:41.987Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-spark-v3--executors=regex, servicing-spark-v3--executors=jev-q2, servicing-spark-v3--executors=spark, servicing-spark-v3--executors=spark-q2, servicing-spark-v3--executors=spark-q2-gate-0-80. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor    | Treatment vs baseline       | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | --------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev-q2 vs regex             | +63.5    | +97.9     | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | spark vs regex              | +63.5    | +94.8     | +31.3 | +20.3 – +41.7 | 0.000 | 96 / 96 | ok           |
| executors | spark-q2 vs regex           | +63.5    | +95.8     | +32.3 | +21.5 – +42.6 | 0.000 | 96 / 96 | underpowered |
| executors | spark-q2-gate-0.80 vs regex | +63.5    | +99.0     | +35.4 | +25.4 – +45.4 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 37 discordant of 96 pairs.

## need-read-right

| Factor    | Treatment vs baseline       | Baseline | Treatment | Δ     | Interval      | p     | n       | Power |
| --------- | --------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ----- |
| executors | jev-q2 vs regex             | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok    |
| executors | spark vs regex              | +60.4    | +86.5     | +26.0 | +13.7 – +37.4 | 0.000 | 96 / 96 | ok    |
| executors | spark-q2 vs regex           | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok    |
| executors | spark-q2-gate-0.80 vs regex | +60.4    | +94.8     | +34.4 | +23.2 – +44.8 | 0.000 | 96 / 96 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 36 discordant of 96 pairs.

## need-detected

| Factor    | Treatment vs baseline       | Baseline | Treatment | Δ     | Interval      | p     | n       | Power |
| --------- | --------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ----- |
| executors | jev-q2 vs regex             | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok    |
| executors | spark vs regex              | +60.4    | +86.5     | +26.0 | +13.7 – +37.4 | 0.000 | 96 / 96 | ok    |
| executors | spark-q2 vs regex           | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok    |
| executors | spark-q2-gate-0.80 vs regex | +60.4    | +94.8     | +34.4 | +23.2 – +44.8 | 0.000 | 96 / 96 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 36 discordant of 96 pairs.

## disclosure-recorded

| Factor    | Treatment vs baseline       | Baseline | Treatment | Δ     | Interval     | p     | n       | Power |
| --------- | --------------------------- | -------- | --------- | ----- | ------------ | ----- | ------- | ----- |
| executors | jev-q2 vs regex             | +72.9    | +85.4     | +12.5 | +1.0 – +23.7 | 0.012 | 96 / 96 | ok    |
| executors | spark vs regex              | +72.9    | +86.5     | +13.5 | +2.1 – +24.6 | 0.004 | 96 / 96 | ok    |
| executors | spark-q2 vs regex           | +72.9    | +86.5     | +13.5 | +2.1 – +24.6 | 0.004 | 96 / 96 | ok    |
| executors | spark-q2-gate-0.80 vs regex | +72.9    | +86.5     | +13.5 | +2.1 – +24.6 | 0.004 | 96 / 96 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 20 discordant of 96 pairs.

## needs-met

| Factor    | Treatment vs baseline       | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | --------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev-q2 vs regex             | +63.5    | +97.9     | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | spark vs regex              | +63.5    | +94.8     | +31.3 | +20.3 – +41.7 | 0.000 | 96 / 96 | ok           |
| executors | spark-q2 vs regex           | +63.5    | +95.8     | +32.3 | +21.5 – +42.6 | 0.000 | 96 / 96 | underpowered |
| executors | spark-q2-gate-0.80 vs regex | +63.5    | +99.0     | +35.4 | +25.4 – +45.4 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 37 discordant of 96 pairs.

## touches

| Factor    | Treatment vs baseline       | Baseline | Treatment | Δ      | Interval       | p     | n       | Power |
| --------- | --------------------------- | -------- | --------- | ------ | -------------- | ----- | ------- | ----- |
| executors | jev-q2 vs regex             | 0.198    | 0.156     | -0.042 | -0.151 – 0.067 | 0.481 | 96 / 96 | ok    |
| executors | spark vs regex              | 0.198    | 0.115     | -0.083 | -0.187 – 0.020 | 0.077 | 96 / 96 | ok    |
| executors | spark-q2 vs regex           | 0.198    | 0.125     | -0.073 | -0.178 – 0.032 | 0.143 | 96 / 96 | ok    |
| executors | spark-q2-gate-0.80 vs regex | 0.198    | 0.594     | 0.396  | 0.180 – 0.612  | 0.004 | 96 / 96 | ok    |

Method: difference of means, Welch interval at 95%; sign test over 18 non-tied of 96 pairs.

Digest `b84196b4e7359691a8668fe8a949b4cbe8bb2fca796511cd1a6b5c76a214d74b`.
