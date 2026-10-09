# A person who says no, at a bank decision: the oversight suite (2026-10-09)

Plan 114 WP198 (`docs/design-day2/114-DECISIONS-UNDER-PRESSURE-PLAN.md`). The lending and complaints journeys re-performed with the 122B (`Qwen3.5-122B-A10B-NVFP4`) in the brain's seat and **a person at the decisions who sometimes says no** (`fs-bank/reviewer/person-at-approval`: refuses an approval one time in twelve, asks a question first one time in eight, is late one time in ten), **two performances** each, 848 cells, 85 minutes of Spark time (`reasoning-pair`, no pattern switch). Every recording is held to its committed result by `node scripts/live-check.mjs --suite oversight`. One sample of one model on a synthetic bank, never a statement about the model in general.

| Design | Arms | Cells | Calls | Wall time |
|---|---|---:|---:|---:|
| `lending-oversight-live` | person at the decision / bot everywhere, each with no guard and with the policy cards | 408 | 2,718 | 80 min |
| `complaints-oversight-live` | person at approval / bot everywhere, the same two guards | 440 | 1,183 | 21 min |

## What the person did

From the live stores' `reviewer.drew` events (`scripts/oversight-draws.mjs` → `person.json`; the stores are local, the counts committed).

| Arm | Reached the person | Approved | Refused | Asked first | Late | Person time |
|---|---:|---:|---:|---:|---:|---:|
| lending, person at the decision, **cards** | 311 | 258 | 24 (7.7%) | 29 (9.3%) | 31 (10.0%) | 909 min |
| lending, bot everywhere, cards | 11 | 10 | 1 | 0 | 3 | 26 min |
| complaints, person at approval, cards | 42 | 36 | 2 | 4 | 6 | 104 min |
| complaints, bot everywhere, cards | 46 | 38 | 4 | 4 | 6 | 115 min |
| **any arm with no guard** | **0** | | | | | |

The draws reproduce the stated rates (7.7% against one in twelve, 9.3% against one in eight, 10% against one in ten), so the person is the person the design names.

## Findings

1. **The person appears only where the stack asks for them.** With no guard, no decision reaches the reviewer on either journey, at any level: lending's *person at the decision* is the configuration `fourEyes: 'all'`, and the four eyes are carried by the `disbursement-is-four-eyes` policy card, which only exists in the card arm. So the executors factor, without the cards, compares two arms with the same behaviour. A reader of the executors effect alone would think a person had been put at the decision; none was.
2. **The person's price is the whole of the cost.** Per case (the bill, at the stated rates): lending £0.05 bot-everywhere against £1.68 with the person (33×; 210 person-seconds, 1.2 approvals); complaints £0.016 against £0.59 (37×; 74 person-seconds). The model's own spend goes slightly *down* with the person (12.6k to 11.4k tokens a lending case), because a refusal ends the work sooner. On lending, 909 person-minutes of reviewing for 102 cells: about 9 minutes of a person's time to a case.
3. **What the person caught is not visible, because there was nothing to catch.** Agreement with the lending rule: bot everywhere 100%, person at the decision 98% (difference −2.0 points, interval −4.7 to +0.8); over-approval 0% in every arm; complaints 440 of 440 cells succeed and every outcome is at 100% except *redress within bounds* with the person at approval, 98% (−1.8 points, −5.5 to +1.8). Both verdicts are *inconclusive*. The model made no consequential error for the person to stop, so four-eyes reads as a cost without a measured benefit on this bank: the accurate statement is *not shown*, not *not useful*. The plan's next steps (the grey zone, the arguing adversary) are what give the person something to catch.
4. **A refusal is not yet an outcome.** The 24 refusals on lending did not change a cell's outcome (the cells that ended in `ERROR` are 4 and 2 in the guard arms, the same order as without a person); a refused disbursement is recorded on the trace but the journey carries on. Whether a refusal should stop the case, send it back or escalate is `escalate`'s question (WP204), and this suite is the evidence that today a no is a draw on the trace and little else.
5. **Lateness has no effect on a book run.** Late answers cost person-seconds (already in the bill) but not the journey, which is not on a clock in a book. The clock's `stage.overdue` (WP146) would read it; no book here sets a deadline.

## Limits

One sample, two performances; the intervals are wide (n = 51 items per arm on lending, 55 on complaints); the reviewer's rates are assumptions pending review (`fs-bank/reviewer`), not a measurement of any person; the person answers by a draw and not by reading the case, so what they would have caught is not tested here. Complaints' approvals come from the policy cards in both arms, so its two levels differ only in who does the work between them.

## Reproduction

```bash
node scripts/live-check.mjs --suite oversight        # both designs replayed from their cassettes, held to the committed result
node scripts/live-designs.mjs --suite oversight --check   # the designs derived from their base designs
node scripts/oversight-draws.mjs                     # person.json, from the local stores (needs recordings/oversight/)
node scripts/live-record.mjs --suite oversight --all --resume   # the run (needs the Sparks in reasoning-pair)
```
