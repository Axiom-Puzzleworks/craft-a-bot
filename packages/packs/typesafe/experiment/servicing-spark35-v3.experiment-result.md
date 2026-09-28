# v3 (held out): the Sparks’ 35B chat model against the 122B and Jev, under both question sets

**Hypothesis.** A smaller, faster local model (Qwen3.6-35B-A3B, the Sparks’ chat mode) asked the same questions through the same contract reads the caller’s request and need nearly as well as the 122B and Jev, at a fraction of the latency.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (96 on the smaller side, 80% power): 16.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-28T10:22:51.207Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-spark35-v3--executors=regex, servicing-spark35-v3--executors=jev-q2, servicing-spark35-v3--executors=spark-q2, servicing-spark35-v3--executors=spark35, servicing-spark35-v3--executors=spark35-q2, servicing-spark35-v3--executors=spark35-q2-gate-0-80. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor    | Treatment vs baseline         | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ----------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev-q2 vs regex               | +63.5    | +97.9     | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | spark-q2 vs regex             | +63.5    | +95.8     | +32.3 | +21.5 – +42.6 | 0.000 | 96 / 96 | underpowered |
| executors | spark35 vs regex              | +63.5    | +96.9     | +33.3 | +22.8 – +43.5 | 0.000 | 96 / 96 | underpowered |
| executors | spark35-q2 vs regex           | +63.5    | +97.9     | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | spark35-q2-gate-0.80 vs regex | +63.5    | +100.0    | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 37 discordant of 96 pairs.

## need-read-right

| Factor    | Treatment vs baseline         | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ----------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev-q2 vs regex               | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok           |
| executors | spark-q2 vs regex             | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok           |
| executors | spark35 vs regex              | +60.4    | +84.4     | +24.0 | +11.4 – +35.6 | 0.000 | 96 / 96 | ok           |
| executors | spark35-q2 vs regex           | +60.4    | +92.7     | +32.3 | +20.7 – +43.0 | 0.000 | 96 / 96 | ok           |
| executors | spark35-q2-gate-0.80 vs regex | +60.4    | +95.8     | +35.4 | +24.4 – +45.7 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 36 discordant of 96 pairs.

## need-detected

| Factor    | Treatment vs baseline         | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ----------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev-q2 vs regex               | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok           |
| executors | spark-q2 vs regex             | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok           |
| executors | spark35 vs regex              | +60.4    | +84.4     | +24.0 | +11.4 – +35.6 | 0.000 | 96 / 96 | ok           |
| executors | spark35-q2 vs regex           | +60.4    | +92.7     | +32.3 | +20.7 – +43.0 | 0.000 | 96 / 96 | ok           |
| executors | spark35-q2-gate-0.80 vs regex | +60.4    | +95.8     | +35.4 | +24.4 – +45.7 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 36 discordant of 96 pairs.

## disclosure-recorded

| Factor    | Treatment vs baseline         | Baseline | Treatment | Δ     | Interval     | p     | n       | Power |
| --------- | ----------------------------- | -------- | --------- | ----- | ------------ | ----- | ------- | ----- |
| executors | jev-q2 vs regex               | +72.9    | +85.4     | +12.5 | +1.0 – +23.7 | 0.012 | 96 / 96 | ok    |
| executors | spark-q2 vs regex             | +72.9    | +86.5     | +13.5 | +2.1 – +24.6 | 0.004 | 96 / 96 | ok    |
| executors | spark35 vs regex              | +72.9    | +85.4     | +12.5 | +1.0 – +23.7 | 0.012 | 96 / 96 | ok    |
| executors | spark35-q2 vs regex           | +72.9    | +85.4     | +12.5 | +1.0 – +23.7 | 0.008 | 96 / 96 | ok    |
| executors | spark35-q2-gate-0.80 vs regex | +72.9    | +86.5     | +13.5 | +2.1 – +24.6 | 0.004 | 96 / 96 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 20 discordant of 96 pairs.

## needs-met

| Factor    | Treatment vs baseline         | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ----------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev-q2 vs regex               | +63.5    | +97.9     | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | spark-q2 vs regex             | +63.5    | +95.8     | +32.3 | +21.5 – +42.6 | 0.000 | 96 / 96 | underpowered |
| executors | spark35 vs regex              | +63.5    | +96.9     | +33.3 | +22.8 – +43.5 | 0.000 | 96 / 96 | underpowered |
| executors | spark35-q2 vs regex           | +63.5    | +97.9     | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | spark35-q2-gate-0.80 vs regex | +63.5    | +100.0    | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 37 discordant of 96 pairs.

## touches

| Factor    | Treatment vs baseline         | Baseline | Treatment | Δ      | Interval       | p     | n       | Power |
| --------- | ----------------------------- | -------- | --------- | ------ | -------------- | ----- | ------- | ----- |
| executors | jev-q2 vs regex               | 0.198    | 0.156     | -0.042 | -0.151 – 0.067 | 0.481 | 96 / 96 | ok    |
| executors | spark-q2 vs regex             | 0.198    | 0.125     | -0.073 | -0.178 – 0.032 | 0.143 | 96 / 96 | ok    |
| executors | spark35 vs regex              | 0.198    | 0.135     | -0.063 | -0.169 – 0.044 | 0.238 | 96 / 96 | ok    |
| executors | spark35-q2 vs regex           | 0.198    | 0.156     | -0.042 | -0.151 – 0.067 | 0.481 | 96 / 96 | ok    |
| executors | spark35-q2-gate-0.80 vs regex | 0.198    | 0.615     | 0.417  | 0.207 – 0.626  | 0.002 | 96 / 96 | ok    |

Method: difference of means, Welch interval at 95%; sign test over 18 non-tied of 96 pairs.

Digest `1bc616e355ed272f5f9dfc13f8aee453700c822a93db8fbe97d5870e7eab9ede`.
