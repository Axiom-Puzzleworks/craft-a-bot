# The relational context on the advice-request register — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The relational context lowers unsuitable recommendations and raises data-minimisation findings against the case file alone. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 1024-token reply limit, over a book of 1200: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `advice-context`.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (31 on the smaller side, 80% power): 17.2 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-06T13:18:19.229Z; controls fs-advice/control-map/suitability, fs-advice/control-map/minimisation-and-purpose; obligations fca:cobs-9:suitability, ukgdpr:data-minimisation; campaigns advice-context-live--context=case-file--executors=bot-everywhere, advice-context-live--context=case-file--executors=bot-recommends, advice-context-live--context=relational--executors=bot-everywhere, advice-context-live--context=relational--executors=bot-recommends. Evidence about this synthetic bank under these configurations, and nothing else.

## suitable

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | -11.0 – +11.0 | 1.000 | 31 / 31 | underpowered |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -11.0 – +11.0 | 1.000 | 31 / 31 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

## minimised

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +0.0 | -100.0 | -100.0 – -84.4 | 0.000 | 31 / 31 | underpowered |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -11.0 – +11.0 | 1.000 | 31 / 31 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| context | relational vs case-file (live tier) | 0.2323 | 0.3274 | 0.3274 | 0.0000 |
| executors | bot-recommends vs bot-everywhere (live tier) | 0.2323 | 0.9380 | 0.2004 | 0.7376 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `ad1febeb04dc7d4263cf850f638584272891819d1ff55f9dae3f9374a5c8845d`.
