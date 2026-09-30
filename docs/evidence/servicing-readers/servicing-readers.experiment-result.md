# The servicing readers on the held-out corpus: the bank’s regex against Jev as first asked (q1), Jev with the guide’s rules in its questions (q2), and q2 behind a confidence gate

**Hypothesis.** On calls no question was fitted to, stating the labelling guide’s rules in the questions (q2) reduces Jev’s false needs without losing any disclosed one, and the steer check sends callers who dictate the label to a person.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (96 on the smaller side, 80% power): 15.3 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-30T08:33:03.106Z; controls —; obligations fca:fg21-1:vulnerability, fca:cd:support; campaigns servicing-readers--executors=regex, servicing-readers--executors=jev, servicing-readers--executors=jev-q2, servicing-readers--executors=jev-q2-gate-0-80, servicing-readers--executors=jev-q2-gate-0-90. Evidence about this synthetic bank under these configurations, and nothing else.

## request-read-right

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | jev vs regex | +63.5 | +96.9 | +33.3 | +22.8 – +43.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2 vs regex | +63.5 | +97.9 | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.80 vs regex | +63.5 | +100.0 | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.90 vs regex | +63.5 | +100.0 | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 36 discordant of 96 pairs.

## need-read-right

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | jev vs regex | +60.4 | +85.4 | +25.0 | +12.5 – +36.5 | 0.000 | 96 / 96 | ok |
| executors | jev-q2 vs regex | +60.4 | +93.8 | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok |
| executors | jev-q2-gate-0.80 vs regex | +60.4 | +96.9 | +36.5 | +25.7 – +46.7 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.90 vs regex | +60.4 | +97.9 | +37.5 | +26.9 – +47.6 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 30 discordant of 96 pairs.

## need-detected

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | jev vs regex | +60.4 | +85.4 | +25.0 | +12.5 – +36.5 | 0.000 | 96 / 96 | ok |
| executors | jev-q2 vs regex | +60.4 | +93.8 | +33.3 | +21.9 – +43.9 | 0.000 | 96 / 96 | ok |
| executors | jev-q2-gate-0.80 vs regex | +60.4 | +96.9 | +36.5 | +25.7 – +46.7 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.90 vs regex | +60.4 | +97.9 | +37.5 | +26.9 – +47.6 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 30 discordant of 96 pairs.

## disclosure-recorded

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | jev vs regex | +75.0 | +100.0 | +25.0 | +16.5 – +34.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2 vs regex | +75.0 | +100.0 | +25.0 | +16.5 – +34.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.80 vs regex | +75.0 | +100.0 | +25.0 | +16.5 – +34.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.90 vs regex | +75.0 | +100.0 | +25.0 | +16.5 – +34.5 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 24 discordant of 96 pairs.

## needs-met

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | jev vs regex | +63.5 | +96.9 | +33.3 | +22.8 – +43.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2 vs regex | +63.5 | +97.9 | +34.4 | +24.0 – +44.5 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.80 vs regex | +63.5 | +100.0 | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |
| executors | jev-q2-gate-0.90 vs regex | +63.5 | +100.0 | +36.5 | +26.7 – +46.4 | 0.000 | 96 / 96 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 36 discordant of 96 pairs.

## touches

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| executors | jev vs regex | 0.198 | 0.156 | -0.042 | -0.151 – 0.067 | 0.481 | 96 / 96 | ok |
| executors | jev-q2 vs regex | 0.198 | 0.156 | -0.042 | -0.151 – 0.067 | 0.481 | 96 / 96 | ok |
| executors | jev-q2-gate-0.80 vs regex | 0.198 | 0.448 | 0.250 | 0.102 – 0.398 | 0.001 | 96 / 96 | ok |
| executors | jev-q2-gate-0.90 vs regex | 0.198 | 0.479 | 0.281 | 0.133 – 0.429 | 0.000 | 96 / 96 | ok |

Method: difference of means, Welch interval at 95%; sign test over 18 non-tied of 96 pairs.

Digest `c96b084f4923d744eaf141349e9da55ad985f8bb9ee1233574273abd991a74a0`.
