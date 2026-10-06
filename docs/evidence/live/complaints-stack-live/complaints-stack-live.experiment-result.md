# The policy-card stack on the complaints book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The complaints desk’s policy-card stack (fs-advice/stack/complaints-policy-cards) changes nothing a scripted bot at Level 5 does wrong on the complaints book. Under the fallible tier (WP154), which errs at the desk's decision one time in ten, the stack is expected to catch what its cards check and nothing else. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 1024-token reply limit, over a book of 200: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `complaints-stack`.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (55 on the smaller side, 80% power): 20.9 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-06T13:17:42.149Z; controls —; obligations —; campaigns complaints-stack-live--guard=none, complaints-stack-live--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## complaint-acknowledged

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -6.5 – +6.5 | 1.000 | 55 / 55 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 55 pairs.

## root-cause-named

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +25.5 | +30.9 | +5.5 | -11.2 – +21.7 | 0.453 | 55 / 55 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 7 discordant of 55 pairs.

## redress-within-bounds

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +20.0 | -80.0 | -88.4 – -66.0 | 0.000 | 55 / 55 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 44 discordant of 55 pairs.

## ombudsman-disclosed

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -6.5 – +6.5 | 1.000 | 55 / 55 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 55 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0142 | 0.0134 | 0.0134 | 0.0000 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `ad8ea1ded1ec558c7e05f21993dde244a86a24daf4c600bf0bb411c1d21bed99`.
