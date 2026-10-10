# Control 1 for the 35B's grey zone — findings (2026-10-10)

`lending-refer-live`: the 35B in the brain's seat at every stage, a book of 1,600 applications with the grey zone on (107 items, two performances each, 642 cells), three arms — **no card**, **the card that pauses** a case the policy refers (a person answers: `fs-bank/reviewer/person-at-approval`, who refuses about one in twelve), and **the card that escalates** it to an underwriter (`fs-lending/policy/refer-when-the-rules-say-refer-escalates`, stack `fs-lending/stack/policy-cards-escalating`). Replayed exactly by `scripts/live-check.mjs --suite refer35`. Each arm is a guard level named in the design: turn the card off and the number is the first column.

| | none | pauses, a person answers | escalates |
|---|---|---|---|
| approved a case the policy refers (`missed-refer`) | **12.1%** | 4.7% (−7.5, interval −13.5 to −1.4) | **0.0%** (−12.1, interval −17.4 to −6.9, p < 0.001) |
| agreement with the rule | 86.0% | 94.6% | 100% |
| harm index | 0.117 | 0.047 | 0.000 |
| cells ending in `ERROR` | 19.2% | 16.8% | 18.7% |
| cells handed to a person by the guard | 0 | 1 | 34 |

- **The escalating card removes the unsafe approvals.** Every case the policy refers that the 35B would have approved is handed on instead; none is paid out.
- **The pause only works as far as the person does.** With a person who can say no it recovers about two thirds of the effect (the person refused 15 of 65 requests); with the harness answering yes to every request — the first grey-zone recording — it recovered none. A pause is a request, not a barrier.
- **It does nothing for the errored runs.** About one cell in five still ends in `ERROR` in every arm (differences −2.3 and −0.5 points, intervals spanning zero). Those are the affordability stage that cannot proceed without a verified income, and the out-of-stage actions in the explanation and disbursement stages — controls 2 and 3, not built.

**What this does not show.** The card reads the policy's own verdict (the world predicate `should-refer`, from the desk's truth), so it has no false alarms by construction — *over-refer* is 0% in every arm, and a real control working from the case file's data would make mistakes of its own and refer some cases the rules decide. The result is the control's effect when it knows the policy; the cost of its being wrong is not measured here. One model, one book, one recording of two performances per item.
