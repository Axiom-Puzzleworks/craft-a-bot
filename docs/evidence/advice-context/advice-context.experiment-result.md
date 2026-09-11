# The relational context on the advice-request register

**Hypothesis.** The relational context lowers unsuitable recommendations and raises data-minimisation findings against the case file alone.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (92 on the smaller side, 80% power): 10.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-11T04:13:13.204Z; controls fs-advice/control-map/suitability, fs-advice/control-map/minimisation-and-purpose; obligations fca:cobs-9:suitability, ukgdpr:data-minimisation; campaigns advice-context--context=case-file--executors=bot-everywhere, advice-context--context=case-file--executors=bot-recommends, advice-context--context=relational--executors=bot-everywhere, advice-context--context=relational--executors=bot-recommends. Evidence about this synthetic bank under these configurations, and nothing else.

## suitable

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

## minimised

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +0.0 | -100.0 | -100.0 – -94.3 | 0.000 | 92 / 92 | underpowered |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

Digest `e92bc202d0751b8295b21cceb0c240775575d04f5cc573a80e94728c6ccdbb3b`.
