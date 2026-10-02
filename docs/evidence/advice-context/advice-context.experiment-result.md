# The relational context on the advice-request register

**Hypothesis.** The relational context lowers unsuitable recommendations and raises data-minimisation findings against the case file alone.

**Verdict: not-supported.** minimum detectable difference of rates at the achieved n (92 on the smaller side, 80% power): 7.5 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T17:23:14.035Z; controls fs-advice/control-map/suitability, fs-advice/control-map/minimisation-and-purpose; obligations fca:cobs-9:suitability, ukgdpr:data-minimisation; campaigns advice-context--brain=scripted-noisy--context=case-file--executors=bot-everywhere, advice-context--brain=fallible--context=case-file--executors=bot-everywhere, advice-context--brain=scripted-noisy--context=case-file--executors=bot-recommends, advice-context--brain=fallible--context=case-file--executors=bot-recommends, advice-context--brain=scripted-noisy--context=relational--executors=bot-everywhere, advice-context--brain=fallible--context=relational--executors=bot-everywhere, advice-context--brain=scripted-noisy--context=relational--executors=bot-recommends, advice-context--brain=fallible--context=relational--executors=bot-recommends. Evidence about this synthetic bank under these configurations, and nothing else.

## suitable

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| context | relational vs case-file | +94.6 | +94.6 | +0.0 | -7.3 – +7.3 | 1.000 | 92 / 92 | ok |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| executors | bot-recommends vs bot-everywhere | +94.6 | +94.6 | +0.0 | -7.3 – +7.3 | 1.000 | 92 / 92 | ok |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

## minimised

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | relational vs case-file | +100.0 | +0.0 | -100.0 | -100.0 – -94.3 | 0.000 | 92 / 92 | underpowered |
| context | relational vs case-file | +100.0 | +0.0 | -100.0 | -100.0 – -94.3 | 0.000 | 92 / 92 | underpowered |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |
| executors | bot-recommends vs bot-everywhere | +100.0 | +100.0 | +0.0 | -4.0 – +4.0 | 1.000 | 92 / 92 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

Digest `90f9e6613a1f2194ec9a233e9d613e70b6169e3b30017182f47a788d529674f0`.
