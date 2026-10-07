# The policy-card stack on the complaints book

**Hypothesis.** The complaints desk’s policy-card stack (fs-advice/stack/complaints-policy-cards) changes nothing a scripted bot at Level 5 does wrong on the complaints book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (886 on the smaller side, 80% power): 2.2 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-07T14:27:38.873Z; controls —; obligations —; campaigns complaints-stack--brain=scripted-optimal--guard=none, complaints-stack--brain=fallible--guard=none, complaints-stack--brain=scripted-optimal--guard=policy-cards, complaints-stack--brain=fallible--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## complaint-acknowledged

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.4 – +0.4 | 1.000 | 886 / 886 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.4 – +0.4 | 1.000 | 886 / 886 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 886 pairs.

## root-cause-named

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.4 – +0.4 | 1.000 | 886 / 886 | underpowered |
| guard | policy-cards vs none | +88.6 | +88.6 | +0.0 | -3.0 – +3.0 | 1.000 | 886 / 886 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 886 pairs.

## redress-within-bounds

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.4 – +0.4 | 1.000 | 886 / 886 | underpowered |
| guard | policy-cards vs none | +100.0 | +88.6 | -11.4 | -13.7 – -9.4 | 0.000 | 886 / 886 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 886 pairs.

## ombudsman-disclosed

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.4 – +0.4 | 1.000 | 886 / 886 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.4 – +0.4 | 1.000 | 886 / 886 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 886 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (scripted-optimal tier) | 0.0035 | 0.0035 | 0.0035 | 0.0000 |
| guard | policy-cards vs none (fallible tier) | 0.0035 | 0.0043 | 0.0043 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `fcdcb4c76d587a5f28a56a6bab7e66a0a5b565e5e267e453d4c696a1b839880d`.
