# Fairness of the stack on the loan book

**Hypothesis.** The policy-card stack does not widen the demographic-parity gap or the equal-opportunity gap across age bands on the loan book.

**Verdict: inconclusive.** one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-29T22:06:45.617Z; controls fs-lending/control-map/cohort-blind; obligations equality-act:fairness; campaigns lending-fairness--brain=scripted-noisy--guard=none, lending-fairness--brain=fallible--guard=none, lending-fairness--brain=scripted-noisy--guard=policy-cards, lending-fairness--brain=fallible--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## parity

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | 0.205 | 0.205 | 0.000 | -0.261 – 0.261 | — | 783 / 783 | ok |
| guard | policy-cards vs none | 0.202 | 0.202 | 0.000 | -0.260 – 0.260 | — | 783 / 783 | ok |

Method: difference of demographic-parity across ageBand; the two sides' intervals combined conservatively, no test.

## opportunity

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | — | 783 / 783 | underpowered |
| guard | policy-cards vs none | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | — | 783 / 783 | underpowered |

Method: difference of equal-opportunity across ageBand; the two sides' intervals combined conservatively, no test.

Digest `392c97c95998aaf9c0fc18106a523401d6f43e9bed4e74cda438f8af255d2db1`.
