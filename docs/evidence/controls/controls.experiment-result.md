# The agent-security controls, each against none

**Hypothesis.** Each agent-security component holds the line it was built for on the scenario that carries its attack (since WP151–WP152, one per component), read per scenario as well as pooled, and costs the scripted-optimal bot nothing but where its price is the point; marking alone changes nothing a scripted bot does.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (180 on the smaller side, 80% power): 14.7 points against the 10.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T17:27:45.095Z; controls —; obligations ASI02, ASI03, ASI06, ASI07, ASI10, pra:ss1-23:mitigants; campaigns controls--brain=scripted-optimal--guard=none, controls--brain=scripted-adversary--guard=none, controls--brain=scripted-optimal--guard=no-progress, controls--brain=scripted-adversary--guard=no-progress, controls--brain=scripted-optimal--guard=marking, controls--brain=scripted-adversary--guard=marking, controls--brain=scripted-optimal--guard=memory-provenance, controls--brain=scripted-adversary--guard=memory-provenance, controls--brain=scripted-optimal--guard=privilege-scopes, controls--brain=scripted-adversary--guard=privilege-scopes, controls--brain=scripted-optimal--guard=peer-auth, controls--brain=scripted-adversary--guard=peer-auth, controls--brain=scripted-optimal--guard=secret-scan, controls--brain=scripted-adversary--guard=secret-scan, controls--brain=scripted-optimal--guard=argument-validation, controls--brain=scripted-adversary--guard=argument-validation, controls--brain=scripted-optimal--guard=cost-cap, controls--brain=scripted-adversary--guard=cost-cap. Evidence about this synthetic bank under these configurations, and nothing else.

## ran-out-of-steps

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | no-progress vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | marking vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | memory-provenance vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | privilege-scopes vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | secret-scan vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | no-progress vs none | +55.6 | +44.4 | -11.1 | -21.1 – -0.8 | 0.000 | 180 / 180 | ok |
| guard | marking vs none | +55.6 | +55.6 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | memory-provenance vs none | +55.6 | +55.6 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | privilege-scopes vs none | +55.6 | +55.6 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | peer-auth vs none | +55.6 | +44.4 | -11.1 | -21.1 – -0.8 | 0.000 | 180 / 180 | ok |
| guard | secret-scan vs none | +55.6 | +55.6 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | argument-validation vs none | +55.6 | +55.6 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | cost-cap vs none | +55.6 | +0.0 | -55.6 | -62.6 – -48.0 | 0.000 | 180 / 180 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 180 pairs.

## kept-the-ball

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | no-progress vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | marking vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | memory-provenance vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | privilege-scopes vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | secret-scan vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | no-progress vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | marking vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | memory-provenance vs none | +66.7 | +77.8 | +11.1 | +1.9 – +20.1 | 0.000 | 180 / 180 | ok |
| guard | privilege-scopes vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | peer-auth vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | secret-scan vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | argument-validation vs none | +66.7 | +77.8 | +11.1 | +1.9 – +20.1 | 0.000 | 180 / 180 | ok |
| guard | cost-cap vs none | +66.7 | +77.8 | +11.1 | +1.9 – +20.1 | 0.000 | 180 / 180 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 180 pairs.

## kept-the-code

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | no-progress vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | marking vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | memory-provenance vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | privilege-scopes vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | secret-scan vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | no-progress vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | marking vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | memory-provenance vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | privilege-scopes vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | peer-auth vs none | +66.7 | +77.8 | +11.1 | +1.9 – +20.1 | 0.000 | 180 / 180 | ok |
| guard | secret-scan vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | argument-validation vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |
| guard | cost-cap vs none | +66.7 | +66.7 | +0.0 | -9.7 – +9.7 | 1.000 | 180 / 180 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 180 pairs.

## sent-no-alert

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | no-progress vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | marking vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | memory-provenance vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | privilege-scopes vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | secret-scan vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | no-progress vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | marking vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | memory-provenance vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | privilege-scopes vs none | +88.9 | +100.0 | +11.1 | +6.8 – +16.5 | 0.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | secret-scan vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | argument-validation vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | cost-cap vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 180 pairs.

## kept-the-key

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | no-progress vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | marking vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | memory-provenance vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | privilege-scopes vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | secret-scan vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | no-progress vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | marking vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | memory-provenance vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | privilege-scopes vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | peer-auth vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | secret-scan vs none | +88.9 | +100.0 | +11.1 | +6.8 – +16.5 | 0.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | cost-cap vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 180 pairs.

## no-malformed-give

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | no-progress vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | marking vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | memory-provenance vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | privilege-scopes vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | secret-scan vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | no-progress vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | marking vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | memory-provenance vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | privilege-scopes vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | peer-auth vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | secret-scan vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |
| guard | argument-validation vs none | +88.9 | +100.0 | +11.1 | +6.8 – +16.5 | 0.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +88.9 | +88.9 | +0.0 | -6.6 – +6.6 | 1.000 | 180 / 180 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 180 pairs.

## reached-the-goal

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | no-progress vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | marking vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | memory-provenance vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | privilege-scopes vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +100.0 | +88.9 | -11.1 | -16.5 – -6.8 | 0.000 | 180 / 180 | underpowered |
| guard | secret-scan vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +100.0 | +100.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | no-progress vs none | +44.4 | +44.4 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | marking vs none | +44.4 | +44.4 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | memory-provenance vs none | +44.4 | +33.3 | -11.1 | -20.9 – -1.0 | 0.000 | 180 / 180 | ok |
| guard | privilege-scopes vs none | +44.4 | +44.4 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | peer-auth vs none | +44.4 | +44.4 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | secret-scan vs none | +44.4 | +44.4 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | argument-validation vs none | +44.4 | +44.4 | +0.0 | -10.2 – +10.2 | 1.000 | 180 / 180 | ok |
| guard | cost-cap vs none | +44.4 | +33.3 | -11.1 | -20.9 – -1.0 | 0.000 | 180 / 180 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 180 pairs.

## stopped

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | no-progress vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | marking vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | memory-provenance vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | privilege-scopes vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +0.0 | +11.1 | +11.1 | +6.8 – +16.5 | 0.000 | 180 / 180 | underpowered |
| guard | secret-scan vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | no-progress vs none | +0.0 | +11.1 | +11.1 | +6.8 – +16.5 | 0.000 | 180 / 180 | underpowered |
| guard | marking vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | memory-provenance vs none | +0.0 | +11.1 | +11.1 | +6.8 – +16.5 | 0.000 | 180 / 180 | underpowered |
| guard | privilege-scopes vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | peer-auth vs none | +0.0 | +11.1 | +11.1 | +6.8 – +16.5 | 0.000 | 180 / 180 | underpowered |
| guard | secret-scan vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | argument-validation vs none | +0.0 | +0.0 | +0.0 | -2.1 – +2.1 | 1.000 | 180 / 180 | underpowered |
| guard | cost-cap vs none | +0.0 | +66.7 | +66.7 | +59.2 – +73.1 | 0.000 | 180 / 180 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 180 pairs.

## tokens

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | no-progress vs none | 1667.4 | 1667.4 | 0.000 | -65.0 – 65.0 | 1.000 | 180 / 180 | ok |
| guard | marking vs none | 1667.4 | 1824.3 | 156.9 | 87.9 – 225.8 | 0.000 | 180 / 180 | ok |
| guard | memory-provenance vs none | 1667.4 | 1824.3 | 156.9 | 87.9 – 225.8 | 0.000 | 180 / 180 | ok |
| guard | privilege-scopes vs none | 1667.4 | 1667.4 | 0.000 | -65.0 – 65.0 | 1.000 | 180 / 180 | ok |
| guard | peer-auth vs none | 1667.4 | 1461.1 | -206.3 | -305.9 – -106.8 | 0.000 | 180 / 180 | ok |
| guard | secret-scan vs none | 1667.4 | 1667.4 | 0.000 | -65.0 – 65.0 | 1.000 | 180 / 180 | ok |
| guard | argument-validation vs none | 1667.4 | 1667.4 | 0.000 | -65.0 – 65.0 | 1.000 | 180 / 180 | ok |
| guard | cost-cap vs none | 1667.4 | 1667.4 | 0.000 | -65.0 – 65.0 | 1.000 | 180 / 180 | ok |
| guard | no-progress vs none | 6871.7 | 6071.6 | -800.1 | -1458.1 – -142.1 | 0.000 | 180 / 180 | ok |
| guard | marking vs none | 6871.7 | 7648.0 | 776.4 | 88.4 – 1464.3 | 0.000 | 180 / 180 | ok |
| guard | memory-provenance vs none | 6871.7 | 6820.9 | -50.8 | -806.3 – 704.8 | 0.000 | 180 / 180 | ok |
| guard | privilege-scopes vs none | 6871.7 | 6876.3 | 4.639 | -642.8 – 652.1 | 0.000 | 180 / 180 | ok |
| guard | peer-auth vs none | 6871.7 | 5859.7 | -1012.0 | -1718.8 – -305.2 | 0.000 | 180 / 180 | ok |
| guard | secret-scan vs none | 6871.7 | 6873.1 | 1.444 | -646.7 – 649.6 | 0.000 | 180 / 180 | ok |
| guard | argument-validation vs none | 6871.7 | 6869.9 | -1.778 | -650.3 – 646.8 | 0.000 | 180 / 180 | ok |
| guard | cost-cap vs none | 6871.7 | 3695.4 | -3176.2 | -3655.8 – -2696.6 | 0.000 | 180 / 180 | ok |

Method: difference of means, Welch interval at 95%; sign test over 0 non-tied of 180 pairs.

Digest `d7af558bdfbe3788e838d8defef8b73f115a448c47e8ba5c58aab35833f0c31e`.
