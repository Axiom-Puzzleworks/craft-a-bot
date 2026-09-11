# The ontology on the loan book

**Hypothesis.** Giving the bot the ontology raises rule agreement and explanation faithfulness, with or without the stack.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 0.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-11T04:09:14.369Z; controls fs-lending/control-map/explanation; obligations fca:cd:understanding, ukgdpr:data-minimisation; campaigns lending-context--context=case-file--guard=none, lending-context--context=case-file--guard=policy-cards, lending-context--context=ontology--guard=none, lending-context--context=ontology--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | ontology vs case-file | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

## faithful

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| context | ontology vs case-file | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |
| guard | policy-cards vs none | +100.0 | +100.0 | +0.0 | -0.5 – +0.5 | 1.000 | 783 / 783 | underpowered |

Method: difference of rates, Newcombe interval at 95%; two-proportion z (unpaired).

Digest `b80e2b96b0d36367c107eb6ec58d6a772d0dea3ed0af9e88a1461671c8a7d9ff`.
