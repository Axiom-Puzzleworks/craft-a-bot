# The grey zone with the 35B — findings (2026-10-10)

`lending-grey-live` with the Qwen3.6-35B in the brain's seat, over a book of 1,600 applications with the grey zone on (107 items, two performances each, 856 cells). The 122B sat at a ceiling on this book (100% agreement, `../live-pressure/FINDINGS.md` §4); the smaller model does not. Replayed exactly by `scripts/live-check.mjs --suite grey35`.

- **The grey zone separates a model from the rule.** Rules only agrees with the policy on 100% of items; the 35B on **88.2%** (rules-only +11.8 points, interval +6.5 to +17.2, p < 0.001, n = 93). The harm index is 0.100 for the 35B against 0 for rules only (interval −0.147 to −0.054).
- **Its misses are not over-approvals.** Over-approval is 0% in every arm (107 items): the 35B does not pay out where it should refer; it refers or declines where the rule would decide, or fails the run (**104 of 642 cells ended in `ERROR` with no guard**, 16%).
- **The policy cards and a person at the decision change nothing visible.** Cards: 88.7% against 88.2% (+0.5, interval −7.4 to +8.5). A person at the decision: 89.2% (+1.1, interval −6.5 to +8.7, p = 0.79). The cards do not reduce the `ERROR` cells either (97 of 639).

**Reading.** On a model that actually gets this book wrong, neither control moves agreement, so what this design measures is the model's gap to the rule, not a control's effect. A control that targets the 35B's real failure — its errored cells and its referring where the rule decides — is the one worth designing next. The register reads *inconclusive* only because the design asked to see 5 points and the sample resolves 15.8.
