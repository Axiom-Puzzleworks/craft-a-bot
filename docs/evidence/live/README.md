# The live tier, recorded

Written by `node scripts/live-column.mjs` from the committed results and cassettes; do not edit by hand. Each design here is its reference design with the brain a live model: `dgx-spark/giant-qwen`, **Qwen3.5-122B-A10B-NVFP4** on the builder's two DGX Sparks (D1), at temperature 0 with a 1,024-token reply limit, a single sample per design. Every figure is a measurement of **this synthetic bank at the size stated, under that one sample**; it is evidence about a model a bank could run inside its own boundary, never about a frontier model or about any real book (`../README.md`, "What these are not evidence of").

## How it was set up

- **The model** is `Qwen3.5-122B-A10B-NVFP4` through `dgx-spark/giant-qwen`, on whichever of the two Sparks was less loaded (both in `puzzle` mode, 8 streams each, MTP speculative decoding on), 16 cells at a time (`record --concurrency auto`).
- **Temperature 0, and a 2,048-token reply limit (1,024 in the first recordings; raised at plan 113's preflight).** The stage agents inherit the starter's 256-token limit. The first lending recording, made at 256 (2026-10-06, since replaced), found 35 of its 791 replies, 4.4%, cut off by the limit with no call made, and agreement of 10 of 23: a measurement of the cap, not of the model. The live designs set `maxTokens: 2048` on every build (a scripted brain never reads it), and the recordings below say how many replies were cut off.
- **Temperature 0 is not repeatable here.** The same prompt is not always answered the same way: the serving stack batches requests and speculates tokens, so even at temperature 0 the numerics move with what else is in flight. That is the live tier's variance, and it is measured below, not assumed away.
- **Each design is a book of its own size** (the table below), one live brain, the design's other factors as in its reference design; the committed scripted and fallible columns are the full-size results one folder up.

## The first finding: the live tier's own error rate against the bank's assumption

`ERROR_RATES` (`fs-bank`) assumed one decision in ten wrong on every desk, so an agreement of 90%. The live column is what the 122B did.

| Design              | What is measured                      | Live (95% interval, n) | Assumed | Assumption inside the interval? |
| ------------------- | ------------------------------------- | ---------------------- | ------- | ------------------------------- |
| `lending-stack`     | lending decision matches the rule     | 99% (97%–100%, n 51)   | 90%     | **no**                          |
| `servicing-stack`   | the caller’s need is met              | 100% (90%–100%, n 33)  | 90%     | yes                             |
| `disputes-stack`    | dispute decision matches the rule     | 81% (69%–93%, n 40)    | 90%     | yes                             |
| `collections-stack` | repayment plan matches the rule       | 100% (91%–100%, n 37)  | 90%     | **no**                          |
| `onboarding-stack`  | onboarding decision matches the rule  | 100% (90%–100%, n 33)  | 90%     | yes                             |
| `complaints-stack`  | the root cause is named               | 99% (97%–100%, n 55)   | 90%     | **no**                          |
| `fraud-stack`       | alert decision is the right one       | 96% (82%–99%, n 27)    | 90%     | yes                             |
| `advice-context`    | the recommendation suits the customer | 100% (89%–100%, n 31)  | 90%     | yes                             |

The live side is the reference configuration with no guard (`bot-everywhere` where a design has executors), the figure the fallible tier's assumed rate stands in for.

## What each recording cost

| Design                      | Recorded   | Book size | Performed | Cells | Cassette entries | Wall time | Stories |
| --------------------------- | ---------- | --------- | --------- | ----- | ---------------- | --------- | ------- |
| `lending-stack-live`        | 2026-10-07 | 800       | 2×        | 408   | 2967             | 171 min   | 14      |
| `lending-stack-live-b`      | 2026-10-06 | 800       | 1×        | 306   | 1099             | 27 min    | 18      |
| `servicing-stack-live`      | 2026-10-07 | 200       | 1×        | 66    | 318              | 6 min     | 2       |
| `disputes-stack-live`       | 2026-10-07 | 400       | 2×        | 160   | 966              | 16 min    | 6       |
| `collections-stack-live`    | 2026-10-07 | 300       | 2×        | 148   | 1156             | 26 min    | 4       |
| `onboarding-stack-live`     | 2026-10-07 | 400       | 2×        | 132   | 1143             | 19 min    | 4       |
| `complaints-stack-live`     | 2026-10-07 | 200       | 2×        | 220   | 584              | 10 min    | 3       |
| `fraud-stack-live`          | 2026-10-07 | 6         | 2×        | 216   | 3113             | 65 min    | 14      |
| `advice-context-live`       | 2026-10-07 | 1200      | 2×        | 248   | 2466             | 67 min    | 4       |
| `servicing-stack-live-seat` | 2026-10-07 | 100       | 1×        | 32    | 330              | 5 min     | 2       |
| `controls-live`             | 2026-10-07 | scenarios | 2×        | 162   | 1692             | 37 min    | 10      |

## Reliability over trials

Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate _n_. **pass^k** (every performance passes) is the figure for a control; **pass@1** is one performance; **consistency** is the share of items the trials agreed on.

| Design              | What is measured                      | Performed    | pass@1          | pass^k          | Consistency     |
| ------------------- | ------------------------------------- | ------------ | --------------- | --------------- | --------------- |
| `lending-stack`     | lending decision matches the rule     | 51 items × 2 | 99% (97%–100%)  | 98% (90%–100%)  | 98% (90%–100%)  |
| `disputes-stack`    | dispute decision matches the rule     | 40 items × 2 | 81% (69%–93%)   | 80% (65%–90%)   | 98% (87%–100%)  |
| `collections-stack` | repayment plan matches the rule       | 37 items × 2 | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |
| `onboarding-stack`  | onboarding decision matches the rule  | 33 items × 2 | 100% (90%–100%) | 100% (90%–100%) | 100% (90%–100%) |
| `complaints-stack`  | the root cause is named               | 55 items × 2 | 99% (97%–100%)  | 98% (90%–100%)  | 98% (90%–100%)  |
| `fraud-stack`       | alert decision is the right one       | 27 items × 2 | 96% (82%–99%)   | 96% (82%–99%)   | 100% (88%–100%) |
| `advice-context`    | the recommendation suits the customer | 31 items × 2 | 100% (89%–100%) | 100% (89%–100%) | 100% (89%–100%) |

## The customer answers back

`servicing-stack` again, with the person across the desk a live model as well (`112-REAL-ENOUGH-PLAN.md` WP169): the desk draws the customer's persona from the item and seats it at every agent stage, the seat takes the same cartridge as the bot and records into the same cassette, and each line it says is a `seat.said` on the bot's trace. Reference configuration, no guard:

|                                 | Needs met (95% interval, n) | Tokens per case | Cells |
| ------------------------------- | --------------------------- | --------------- | ----- |
| the desk's own scripted visitor | 100% (90%–100%, n 33)       | 7824            | 66    |
| a live customer                 | 100% (81%–100%, n 16)       | 7707            | 32    |

The two books are different sizes and the intervals overlap, so this reads as no difference at this n, not as a customer who makes the bot better. What it does show is that customers who answer back run end to end on the live tier. Since plan 113 §12 the drawn customer opens with the request itself, in their words; the stories in `servicing-stack-live-seat/stories/` show the conversation.
