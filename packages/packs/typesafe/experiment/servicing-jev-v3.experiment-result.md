# Held-out v3: Jev with the guide’s rules in its questions (q2) against Jev as first asked (q1) and the regex

**Hypothesis.** On calls no question was fitted to, stating the labelling guide’s rules in the questions (q2) reduces Jev’s false needs without losing any disclosed one, and the steer check sends callers who dictate the label to a person.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (96 on the smaller side, 80% power): 16.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-28T08:48:29.005Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-jev-v3--executors=regex, servicing-jev-v3--executors=jev, servicing-jev-v3--executors=jev-q2, servicing-jev-v3--executors=jev-q2-gate-0-80, servicing-jev-v3--executors=jev-q2-gate-0-90. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor    | Treatment vs baseline     | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex              | +63.5    | +96.9     | +33.3 | +22.8 – +43.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2 vs regex           | +63.5    | +97.9     | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.80 vs regex | +63.5    | +100.0    | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.90 vs regex | +63.5    | +100.0    | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 36 discordant of 96 pairs.

## need-read-right

| Factor    | Treatment vs baseline     | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex              | +60.4    | +85.4     | +25.0 | +12.5 – +36.5 | 0.000 | 96 / 96 | ok           |
| executors | jev-q2 vs regex           | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok           |
| executors | jev-q2-gate-0.80 vs regex | +60.4    | +96.9     | +36.5 | +25.7 – +46.7 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.90 vs regex | +60.4    | +97.9     | +37.5 | +26.9 – +47.6 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 30 discordant of 96 pairs.

## need-detected

| Factor    | Treatment vs baseline     | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex              | +60.4    | +85.4     | +25.0 | +12.5 – +36.5 | 0.000 | 96 / 96 | ok           |
| executors | jev-q2 vs regex           | +60.4    | +93.8     | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok           |
| executors | jev-q2-gate-0.80 vs regex | +60.4    | +96.9     | +36.5 | +25.7 – +46.7 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.90 vs regex | +60.4    | +97.9     | +37.5 | +26.9 – +47.6 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 30 discordant of 96 pairs.

## disclosure-recorded

| Factor    | Treatment vs baseline     | Baseline | Treatment | Δ     | Interval     | p     | n       | Power |
| --------- | ------------------------- | -------- | --------- | ----- | ------------ | ----- | ------- | ----- |
| executors | jev vs regex              | +72.9    | +85.4     | +12.5 | +1.0 – +23.7 | 0.008 | 96 / 96 | ok    |
| executors | jev-q2 vs regex           | +72.9    | +85.4     | +12.5 | +1.0 – +23.7 | 0.012 | 96 / 96 | ok    |
| executors | jev-q2-gate-0.80 vs regex | +72.9    | +86.5     | +13.5 | +2.1 – +24.6 | 0.004 | 96 / 96 | ok    |
| executors | jev-q2-gate-0.90 vs regex | +72.9    | +86.5     | +13.5 | +2.1 – +24.6 | 0.004 | 96 / 96 | ok    |

Method: difference of rates, Newcombe interval at 95%; sign test over 18 discordant of 96 pairs.

## needs-met

| Factor    | Treatment vs baseline     | Baseline | Treatment | Δ     | Interval      | p     | n       | Power        |
| --------- | ------------------------- | -------- | --------- | ----- | ------------- | ----- | ------- | ------------ |
| executors | jev vs regex              | +63.5    | +96.9     | +33.3 | +22.8 – +43.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2 vs regex           | +63.5    | +97.9     | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.80 vs regex | +63.5    | +100.0    | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.90 vs regex | +63.5    | +100.0    | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 36 discordant of 96 pairs.

## touches

| Factor    | Treatment vs baseline     | Baseline | Treatment | Δ      | Interval       | p     | n       | Power |
| --------- | ------------------------- | -------- | --------- | ------ | -------------- | ----- | ------- | ----- |
| executors | jev vs regex              | 0.198    | 0.156     | -0.042 | -0.151 – 0.067 | 0.481 | 96 / 96 | ok    |
| executors | jev-q2 vs regex           | 0.198    | 0.156     | -0.042 | -0.151 – 0.067 | 0.481 | 96 / 96 | ok    |
| executors | jev-q2-gate-0.80 vs regex | 0.198    | 0.677     | 0.479  | 0.260 – 0.699  | 0.000 | 96 / 96 | ok    |
| executors | jev-q2-gate-0.90 vs regex | 0.198    | 0.740     | 0.542  | 0.319 – 0.765  | 0.000 | 96 / 96 | ok    |

Method: difference of means, Welch interval at 95%; sign test over 18 non-tied of 96 pairs.

Digest `4fc083afde68f64b60b9fb301200a5e1b5934981f0f837afb19d9c90c6d4f573`.
