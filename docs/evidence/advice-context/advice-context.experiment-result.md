# The relational context on the advice-request register

**Hypothesis.** The relational context lowers unsuitable recommendations and raises data-minimisation findings against the case file alone.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (92 on the smaller side, 80% power): 4.4 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-07T10:58:49.163Z; controls fs-advice/control-map/suitability, fs-advice/control-map/minimisation-and-purpose; obligations fca:cobs-9:suitability, ukgdpr:data-minimisation; campaigns advice-context--brain=scripted-noisy--context=case-file--executors=bot-everywhere, advice-context--brain=fallible--context=case-file--executors=bot-everywhere, advice-context--brain=scripted-noisy--context=case-file--executors=bot-recommends, advice-context--brain=fallible--context=case-file--executors=bot-recommends, advice-context--brain=scripted-noisy--context=relational--executors=bot-everywhere, advice-context--brain=fallible--context=relational--executors=bot-everywhere, advice-context--brain=scripted-noisy--context=relational--executors=bot-recommends, advice-context--brain=fallible--context=relational--executors=bot-recommends. Evidence about this synthetic bank under these configurations, and nothing else.

## suitable

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| context | relational vs case-file | +95.7 | +95.7 | +0.0 | -6.8 – +6.8 | 1.000 | 92 / 92 | underpowered |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| executors | bot-recommends vs bot-everywhere | +95.7 | +95.7 | +0.0 | -6.8 – +6.8 | 1.000 | 92 / 92 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

## minimised

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| context | relational vs case-file (scripted-noisy tier) | 0.1119 | 0.1377 | 0.1377 | 0.0000 |
| context | relational vs case-file (fallible tier) | 0.0907 | 0.1117 | 0.1117 | 0.0000 |
| executors | bot-recommends vs bot-everywhere (scripted-noisy tier) | 0.1119 | 1.3749 | 0.1017 | 1.2732 |
| executors | bot-recommends vs bot-everywhere (fallible tier) | 0.0907 | 1.3286 | 0.0808 | 1.2478 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `8b63e99fe52e8933b246b25028cc5d3b3720e12be09203db54e00d5923f5aa64`.
