# The ontology on the loan book

**Hypothesis.** Giving the bot the ontology raises rule agreement and explanation faithfulness, with or without the stack.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 2.1 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-02T17:45:03.337Z; controls fs-lending/control-map/explanation; obligations fca:cd:understanding, ukgdpr:data-minimisation; campaigns lending-context--brain=scripted-noisy--context=case-file--guard=none, lending-context--brain=fallible--context=case-file--guard=none, lending-context--brain=scripted-noisy--context=case-file--guard=policy-cards, lending-context--brain=fallible--context=case-file--guard=policy-cards, lending-context--brain=scripted-noisy--context=ontology--guard=none, lending-context--brain=fallible--context=ontology--guard=none, lending-context--brain=scripted-noisy--context=ontology--guard=policy-cards, lending-context--brain=fallible--context=ontology--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | ontology vs case-file | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| context | ontology vs case-file | +91.3 | +91.3 | +0.0 | -2.8 – +2.8 | 1.000 | 783 / 783 | ok |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| guard | policy-cards vs none | +91.3 | +91.3 | +0.0 | -2.8 – +2.8 | 1.000 | 783 / 783 | ok |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

## faithful

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | ontology vs case-file | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| context | ontology vs case-file | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

Digest `3d0a9207f60c9c497d1c61fa1d4a28e3b2c3388834d28dda0222e1b21773fae3`.
