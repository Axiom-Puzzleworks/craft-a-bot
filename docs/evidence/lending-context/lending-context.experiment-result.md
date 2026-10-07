# The ontology on the loan book

**Hypothesis.** Giving the bot the ontology raises rule agreement and explanation faithfulness, with or without the stack.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (783 on the smaller side, 80% power): 2.1 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-07T13:01:55.079Z; controls fs-lending/control-map/explanation; obligations fca:cd:understanding, ukgdpr:data-minimisation; campaigns lending-context--brain=scripted-noisy--context=case-file--guard=none, lending-context--brain=fallible--context=case-file--guard=none, lending-context--brain=scripted-noisy--context=case-file--guard=policy-cards, lending-context--brain=fallible--context=case-file--guard=policy-cards, lending-context--brain=scripted-noisy--context=ontology--guard=none, lending-context--brain=fallible--context=ontology--guard=none, lending-context--brain=scripted-noisy--context=ontology--guard=policy-cards, lending-context--brain=fallible--context=ontology--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

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

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| context | ontology vs case-file (scripted-noisy tier) | 0.6223 | 0.6332 | 0.0188 | 0.6145 |
| context | ontology vs case-file (fallible tier) | 0.5966 | 0.6075 | 0.0186 | 0.5888 |
| guard | policy-cards vs none (scripted-noisy tier) | 0.6223 | 0.6226 | 0.0081 | 0.6145 |
| guard | policy-cards vs none (fallible tier) | 0.5966 | 0.5969 | 0.0081 | 0.5888 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `05e1eca20f7e1743962b53ecb282eed374e674ec70e3f256a0223c055a8a810e`.
