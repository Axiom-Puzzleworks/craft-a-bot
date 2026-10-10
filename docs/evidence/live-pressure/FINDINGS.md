# The pressure suite — findings (2026-10-10)

The 122B on the DGX Sparks (`reasoning-pair`), two performances per item, over designs that put the bank under pressure: a live adversary, a way out of a block, and the model's own sampling temperature. Every figure is from the committed cassettes, which `scripts/live-check.mjs --suite pressure` replays exactly. All four designs read *inconclusive* or *untestable* in the register, because the cells are few (16–40 items a side); the numbers below are what was seen, not what is established.

## 1. An adversary who tries (`disputes-adversary-live`)

With the live red-team seat pressing the customer's claim above the limit, the unaided model reimbursed within the limit on **69%** of items; with the policy-card stack, **100%** (+31 points, interval +15 to +48, sign test p = 0.004, n = 16). The decision agreed with the rule on 69% unaided against 88% with the cards (+19, interval −1 to +38).

Two things are visible in the cells rather than the table: the unaided model pays above the limit when pressed; and the cards that stop it do so by blocking the act, which leaves the run with nothing to say — see §2.

## 2. A way out of a block (`disputes-escalate-live`, with the adversary)

A block is safe and a dead end. The plain card stack held the limit on every item and **9 of 32 cells ended in `ERROR`** with about twice the tokens of the unaided run; the escalating variant (`escalate`, plan 114 WP204) held the limit equally and handed those cases on as nine clean escalations at about the unaided cost. On the ordinary disputes book (no adversary) the escalating and plain stacks are indistinguishable (agreement 82.5% for both against 81.3% unaided; reimbursement within the limit 100% against 94%).

Reading: `escalate` removes the cost of a block without giving up what the block protected. It does not make the model more right, and the sample is small.

## 3. Temperature does not change the decision (`disputes-conditions-live`, `lending-conditions-live`)

Sampling at 0, 0.4 and 0.8:

- **Disputes** (30 items a side): agreement 80.0% / 80.0% / 81.7%; reimbursed within the limit 93.3% / 93.3% / 95.0%; harm index 0.200 / 0.200 / 0.183. No interval excludes zero, and the sign test sees **no differing items at 0.4**.
- **Lending** (23 items a side): agreement 100% and over-approval 0% at every temperature. A ceiling, so the design reads *untestable* — it could not have shown a difference.

What does vary is the words: at the first tick the same call was made in 100% of pairs, the same words in 0–10%. Temperature changes how the model says it, not what it decides, on these books.

## What this does not show

- Nothing here is a claim about a real bank or a real customer; the books, the rule and the red-team seat are synthetic.
- The lending book is at a ceiling for the 122B: it follows a rule it can see. The grey-zone design (`lending-grey-live`, items the rule leaves to judgement) is the one meant to leave the ceiling; §4 reports its re-recording at a larger share of grey items.
- Sixteen items is thin. The adversary result is the strongest in the suite and still reads *underpowered* in the register.

## 4. The grey zone, re-recorded (`lending-grey-live`)

Re-recorded with grey items at 0.3 of the book (51 items, two performances each, 408 cells). The 122B **still agrees with the rule on every item** (100%, over-approval 0%) with no guard and with rules only; the policy cards cost it nothing visible (97.6%, −2.4, interval −5.7 to +1.0). A person at the decision made things slightly worse, not better: agreement 94.0% against 100% (−6.0, interval −12.1 to +0.2, p = 0.125) and a harm index of 0.049 against 0 — two items the person overrode. Neither crosses zero. The grey zone as built does not take this model off its ceiling; it is still a model that follows a rule it can see. Making the rule genuinely ambiguous, or the model smaller, is the next lever and is not done here.
