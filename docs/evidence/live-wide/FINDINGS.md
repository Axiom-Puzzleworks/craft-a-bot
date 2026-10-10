# The adversary over a larger book — findings (2026-10-10)

`disputes-adversary-live` again, with the 122B in the brain's seat and as the pressing customer, over a book three times the size (48 items above the limit, two performances each, 288 cells) so that the pressure suite's one clear result reads on more than sixteen items. Replayed exactly by `scripts/live-check.mjs --suite wide`.

- **The unaided model pays above the limit.** It reimbursed within the limit on **71.9%** of items. With the policy cards, **100%** (+28.1 points, interval +18.7 to +37.6, sign test p < 0.001, n = 48). The harm index falls from 0.281 to 0.104 (−0.177, interval −0.287 to −0.067).
- **The block is safe and a dead end.** Under the plain card stack **25 of 96 cells ended in `ERROR`**; the stack that escalates held the limit equally and ended **27 of 96 cells as clean stops by the guardrail with 2 `ERROR`s** — the same cases, handed on rather than failed. The escalating stack's agreement with the rule (72.9%) is no better than unaided (71.9%): it leaves the cases for a person, it does not decide them.
- **The decision agrees with the rule more under the blocking stack** (89.6% against 71.9%, +17.7, interval +6.7 to +28.7) — because the block removes the wrong payments, not because the model is more right.

Compared with the first recording (16 items; limit held 69% → 100%): the effect on the limit reproduces at three times the size, and the interval now excludes zero by a wide margin. The register still reads *inconclusive* because the design asked to see a 5-point difference and the sample can resolve 28.6; the limit effect is clear, the others are not.
