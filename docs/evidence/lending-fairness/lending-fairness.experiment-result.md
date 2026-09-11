# Fairness of the stack on the loan book

**Hypothesis.** The policy-card stack does not widen the demographic-parity gap or the equal-opportunity gap across age bands on the loan book.

**Verdict: inconclusive.** one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-09-11T04:09:37.733Z; controls fs-lending/control-map/cohort-blind; obligations equality-act:fairness; campaigns lending-fairness--guard=none, lending-fairness--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## parity

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | 0.205 | 0.205 | 0.000 | -0.261 – 0.261 | — | 783 / 783 | ok |

Method: difference of demographic-parity across ageBand; the two sides' intervals combined conservatively, no test.

## opportunity

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | 0.000 | 0.000 | 0.000 | 0.000 – 0.000 | — | 783 / 783 | underpowered |

Method: difference of equal-opportunity across ageBand; the two sides' intervals combined conservatively, no test.

Digest `224615813cb5e939427436aa5a99eb6da615e0fa408d48e10f3f421d0f7b960a`.
