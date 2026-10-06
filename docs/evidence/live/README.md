# The live tier, recorded

Written by `node scripts/live-column.mjs` from the committed results and cassettes; do not edit by hand. Each design here is its reference design with the brain a live model: `dgx-spark/giant-qwen`, **Qwen3.5-122B-A10B-NVFP4** on the builder's two DGX Sparks (D1), at temperature 0 with a 1,024-token reply limit, a single sample per design. Every figure is a measurement of **this synthetic bank at the size stated, under that one sample**; it is evidence about a model a bank could run inside its own boundary, never about a frontier model or about any real book (`../README.md`, "What these are not evidence of").

## How it was set up

- **The model** is `Qwen3.5-122B-A10B-NVFP4` through `dgx-spark/giant-qwen`, on whichever of the two Sparks was less loaded (both in `puzzle` mode, 8 streams each, MTP speculative decoding on), 16 cells at a time (`record --concurrency auto`).
- **Temperature 0, and a 1,024-token reply limit.** The stage agents inherit the starter's 256-token limit. The first lending recording, made at 256 (2026-10-06, since replaced), found 35 of its 791 replies, 4.4%, cut off by the limit with no call made, and agreement of 10 of 23: a measurement of the cap, not of the model. The live designs set `maxTokens: 1024` on every build (a scripted brain never reads it), and no reply in a recording below was cut off.
- **Temperature 0 is not repeatable here.** The same prompt is not always answered the same way: the serving stack batches requests and speculates tokens, so even at temperature 0 the numerics move with what else is in flight. That is the live tier's variance, and it is measured below, not assumed away.
- **Each design is a book of its own size** (the table below), one live brain, the design's other factors as in its reference design; the committed scripted and fallible columns are the full-size results one folder up.

## The first finding: the live tier's own error rate against the bank's assumption

`ERROR_RATES` (`fs-bank`) assumed one decision in ten wrong on every desk, so an agreement of 90%. The live column is what the 122B did.

| Design              | What is measured                      | Live (95% interval, n) | Assumed | Assumption inside the interval? |
| ------------------- | ------------------------------------- | ---------------------- | ------- | ------------------------------- |
| `lending-stack`     | lending decision matches the rule     | 53% (40%–66%, n 51)    | 90%     | **no**                          |
| `servicing-stack`   | the caller’s need is met              | 94% (80%–98%, n 33)    | 90%     | yes                             |
| `disputes-stack`    | dispute decision matches the rule     | 68% (52%–80%, n 40)    | 90%     | **no**                          |
| `collections-stack` | repayment plan matches the rule       | 72% (56%–84%, n 36)    | 90%     | **no**                          |
| `onboarding-stack`  | onboarding decision matches the rule  | 100% (90%–100%, n 33)  | 90%     | yes                             |
| `complaints-stack`  | the root cause is named               | 25% (16%–38%, n 55)    | 90%     | **no**                          |
| `fraud-stack`       | alert decision is the right one       | 93% (77%–98%, n 27)    | 90%     | yes                             |
| `advice-context`    | the recommendation suits the customer | 100% (89%–100%, n 31)  | 90%     | yes                             |

The live side is the reference configuration with no guard (`bot-everywhere` where a design has executors), the figure the fallible tier's assumed rate stands in for.

## What each recording cost

| Design                   | Recorded   | Book size | Cells | Cassette entries | Wall time | Stories |
| ------------------------ | ---------- | --------- | ----- | ---------------- | --------- | ------- |
| `lending-stack-live`     | 2026-10-06 | 800       | 306   | 1238             | 30 min    | 18      |
| `lending-stack-live-b`   | 2026-10-06 | 800       | 306   | 1099             | 27 min    | 18      |
| `servicing-stack-live`   | 2026-10-06 | 200       | 66    | 260              | 9 min     | 4       |
| `disputes-stack-live`    | 2026-10-06 | 400       | 80    | 265              | 6 min     | 4       |
| `collections-stack-live` | 2026-10-06 | 300       | 74    | 839              | 20 min    | 10      |
| `onboarding-stack-live`  | 2026-10-06 | 400       | 66    | 289              | 6 min     | 2       |
| `complaints-stack-live`  | 2026-10-06 | 200       | 110   | 302              | 7 min     | 5       |
| `fraud-stack-live`       | 2026-10-06 | 6         | 108   | 2490             | 54 min    | 16      |
| `advice-context-live`    | 2026-10-06 | 1200      | 124   | 1502             | 46 min    | 8       |

## The live tier's own variance

`lending-stack` was recorded twice, with nothing changed between the recordings. A recording is one sample, so the difference between the two is the live tier's own noise, the floor under any effect a control is credited with.

- **Answers to the same prompt:** of 488 prompts both recordings were asked, 305 (63%) were answered with the same call (the same tool, the same arguments) and 39 (8%) with the same words as well. 1361 prompts were asked by only one recording, because a different answer earlier in a case leads to a different next prompt.
- **The same case, decided twice:** of 306 cases both recordings decided, 278 (91%) reached the same verdict from the design's evaluators in both.
- **The figure that matters:** agreement with the rule, reference configuration, was 53% (40%–66%, n 51) in the first recording and 53% (40%–66%, n 51) in the second: a difference of 0.0 points between two samples of the same model.
- **Finish reasons**, first recording: {"tool_call":1238}; second: {"tool_call":1097,"stop":2}. A `length` is a reply cut off by the 1,024-token limit.
