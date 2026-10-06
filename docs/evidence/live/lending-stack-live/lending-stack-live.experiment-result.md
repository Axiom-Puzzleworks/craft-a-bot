# The policy-card stack on the loan book — with the 122B on the DGX Sparks as the brain

**Hypothesis.** The policy-card stack raises agreement with the lending rule and lowers over-approval across the reference configurations, at a stated approval-load cost. Here the decisions are made by a live model, `dgx-spark/giant-qwen` (Qwen3.5-122B-A10B-NVFP4 on the builder's DGX Sparks), at temperature 0 with a 1024-token reply limit, over a book of 800: a single sample, recorded once and replayed from its cassette. The design's scripted and fallible columns are `lending-stack`.

**Verdict: inconclusive.** minimum detectable difference of rates at the achieved n (51 on the smaller side, 80% power): 22.0 points against the 5.0 the design meant to see; one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)

Ran 2026-10-06T13:16:28.027Z; controls fs-lending/control-map/affordability-first; obligations fca:conc:affordability, fca:conc:creditworthiness; campaigns lending-stack-live--executors=rules-only--guard=none, lending-stack-live--executors=bot-with-a-person-at-the-decision--guard=none, lending-stack-live--executors=bot-everywhere--guard=none, lending-stack-live--executors=rules-only--guard=policy-cards, lending-stack-live--executors=bot-with-a-person-at-the-decision--guard=policy-cards, lending-stack-live--executors=bot-everywhere--guard=policy-cards. Evidence about this synthetic bank under these configurations, and nothing else.

## agreement

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +52.9 | +47.1 | -5.9 | -24.3 – +13.1 | 0.508 | 51 / 51 | ok |
| executors | rules-only vs bot-everywhere | +52.9 | +100.0 | +47.1 | +32.3 – +60.5 | 0.000 | 51 / 51 | underpowered |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +52.9 | +52.9 | +0.0 | -18.7 – +18.7 | 1.000 | 51 / 51 | ok |

Method: difference of rates, Newcombe interval at 95%; sign test over 9 discordant of 51 pairs.

## over-approval

| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |
|---|---|---|---|---|---|---|---|---|
| guard | policy-cards vs none | +0.0 | +0.0 | +0.0 | -7.0 – +7.0 | 1.000 | 51 / 51 | underpowered |
| executors | rules-only vs bot-everywhere | +0.0 | +0.0 | +0.0 | -7.0 – +7.0 | 1.000 | 51 / 51 | underpowered |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere | +0.0 | +0.0 | +0.0 | -7.0 – +7.0 | 1.000 | 51 / 51 | underpowered |

Method: difference of rates, Newcombe interval at 95%; sign test over 0 discordant of 51 pairs.

## Bill per case

| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |
|---|---|---|---|---|---|
| guard | policy-cards vs none (live tier) | 0.0612 | 0.0699 | 0.0699 | 0.0000 |
| executors | rules-only vs bot-everywhere (live tier) | 0.0612 | 0.4575 | 0.0000 | 0.4575 |
| executors | bot-with-a-person-at-the-decision vs bot-everywhere (live tier) | 0.0612 | 1.1766 | 0.0603 | 1.1163 |

Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.

Digest `2e4236fc2d939c115082afeb02020069ca8aa5500c6826a5187f4fe472314e64`.
