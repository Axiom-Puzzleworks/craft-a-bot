# v2 (harder): the Sparks’ 35B chat model against the 122B, Jev and the regex

**Hypothesis.** A smaller, faster local model (Qwen3.6-35B-A3B, the Sparks’ chat mode) asked the same questions through the same contract reads the caller’s request and need nearly as well as the 122B and Jev, at a fraction of the latency.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (115 on the smaller side, 80% power): 15.6 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-28T10:22:48.009Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-spark35-v2--executors=regex, servicing-spark35-v2--executors=jev, servicing-spark35-v2--executors=spark, servicing-spark35-v2--executors=spark35, servicing-spark35-v2--executors=spark35-gate-0-80. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval      | p     | n         | Power        |
| --------- | -------------------------- | -------- | --------- | ----- | ------------- | ----- | --------- | ------------ |
| executors | jev vs regex               | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |
| executors | spark vs regex             | +55.7    | +95.7     | +40.0 | +29.7 – +49.4 | 0.000 | 115 / 115 | ok           |
| executors | spark35 vs regex           | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |
| executors | spark35-gate-0.80 vs regex | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 50 discordant of 115 pairs.

## need-read-right

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval      | p     | n         | Power |
| --------- | -------------------------- | -------- | --------- | ----- | ------------- | ----- | --------- | ----- |
| executors | jev vs regex               | +59.1    | +93.0     | +33.9 | +23.4 – +43.7 | 0.000 | 115 / 115 | ok    |
| executors | spark vs regex             | +59.1    | +93.0     | +33.9 | +23.4 – +43.7 | 0.000 | 115 / 115 | ok    |
| executors | spark35 vs regex           | +59.1    | +90.4     | +31.3 | +20.4 – +41.3 | 0.000 | 115 / 115 | ok    |
| executors | spark35-gate-0.80 vs regex | +59.1    | +92.2     | +33.0 | +22.4 – +42.9 | 0.000 | 115 / 115 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 41 discordant of 115 pairs.

## need-detected

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval      | p     | n         | Power |
| --------- | -------------------------- | -------- | --------- | ----- | ------------- | ----- | --------- | ----- |
| executors | jev vs regex               | +60.9    | +93.0     | +32.2 | +21.7 – +41.9 | 0.000 | 115 / 115 | ok    |
| executors | spark vs regex             | +60.9    | +93.0     | +32.2 | +21.7 – +41.9 | 0.000 | 115 / 115 | ok    |
| executors | spark35 vs regex           | +60.9    | +91.3     | +30.4 | +19.7 – +40.4 | 0.000 | 115 / 115 | ok    |
| executors | spark35-gate-0.80 vs regex | +60.9    | +92.2     | +31.3 | +20.7 – +41.1 | 0.000 | 115 / 115 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 39 discordant of 115 pairs.

## disclosure-recorded

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval     | p     | n         | Power |
| --------- | -------------------------- | -------- | --------- | ----- | ------------ | ----- | --------- | ----- |
| executors | jev vs regex               | +69.6    | +85.2     | +15.7 | +4.8 – +26.1 | 0.000 | 115 / 115 | ok    |
| executors | spark vs regex             | +69.6    | +85.2     | +15.7 | +4.8 – +26.1 | 0.001 | 115 / 115 | ok    |
| executors | spark35 vs regex           | +69.6    | +84.3     | +14.8 | +3.9 – +25.3 | 0.000 | 115 / 115 | ok    |
| executors | spark35-gate-0.80 vs regex | +69.6    | +84.3     | +14.8 | +3.9 – +25.3 | 0.000 | 115 / 115 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 22 discordant of 115 pairs.

## needs-met

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ     | Interval      | p     | n         | Power        |
| --------- | -------------------------- | -------- | --------- | ----- | ------------- | ----- | --------- | ------------ |
| executors | jev vs regex               | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |
| executors | spark vs regex             | +55.7    | +95.7     | +40.0 | +29.7 – +49.4 | 0.000 | 115 / 115 | ok           |
| executors | spark35 vs regex           | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |
| executors | spark35-gate-0.80 vs regex | +55.7    | +97.4     | +41.7 | +31.8 – +51.0 | 0.000 | 115 / 115 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 50 discordant of 115 pairs.

## touches

| Factor    | Treatment vs baseline      | Baseline | Treatment | Δ      | Interval       | p     | n         | Power |
| --------- | -------------------------- | -------- | --------- | ------ | -------------- | ----- | --------- | ----- |
| executors | jev vs regex               | 0.157    | 0.174     | 0.017  | -0.080 – 0.114 | 0.832 | 115 / 115 | ok    |
| executors | spark vs regex             | 0.157    | 0.148     | -0.009 | -0.102 – 0.085 | 1.000 | 115 / 115 | ok    |
| executors | spark35 vs regex           | 0.157    | 0.148     | -0.009 | -0.102 – 0.085 | 1.000 | 115 / 115 | ok    |
| executors | spark35-gate-0.80 vs regex | 0.157    | 0.304     | 0.148  | 0.006 – 0.289  | 0.215 | 115 / 115 | ok    |

Method: difference of means, Welch interval at 95%; sign test over 22 non-tied of 115 pairs.

Digest `d3d89d3065499a40fcc8adc502ddb126e4c3724ef5c1cd3479b11d77452a81ba`.
