# Triage of the live `ERROR` cells

_2026-10-07. Covers the three designs with the most `ERROR` cells in `RUNS-AND-FINDINGS.md`: `complaints-stack-live` (44 of 110), `fraud-stack-live` (37 of 108) and `advice-context-live` (22 of 124). Each design was replayed from its committed cassette with `--egress none` and every `ERROR` cell's events were read. No Spark was used and nothing was recorded._

## The short version

Of 103 `ERROR` cells, **69 (67%) are not live outcomes at all.** They are `cassette-miss` errors raised by the replay, because the replay walked a different history from the one the model lived through. The other 34 are real behaviour, and they split into a desk fault (the interface lied or said too little), a model fault, and a mix.

| Cause | Complaints | Fraud | Advice | Total |
| --- | ---: | ---: | ---: | ---: |
| **Recording** — replay asked a prompt the live run never recorded (`cassette-miss`) | 42 | 9 | 18 | **69** |
| **Desk** — the tool's accepted ids or its failure message hides what to do | 2 ¹ | 16 | 4 | **22** |
| **Model, with the prompt and desk contributing** — the brief is plain and the model loops anyway | – | 12 | – | **12** |
| Total | 44 | 37 | 22 | 103 |

¹ Complaints' two loops are listed under desk because the register the card enforces is never shown to the bot. See "Real behaviour" below.

## 1. Recording: 69 cells that never happened

**What the cell shows.** An `error` of kind `cassette-miss: the provider cassette holds no answer for prompt …`. The run stops there. No model was called.

**Why it happens.** The cassette is keyed by prompt digest and occurrence, and `mergeProviderEntries` keeps the first answer for a key. Many cells share a first prompt: the same complaint reaches the bot under `guard=none` and under `policy-cards`, and the same advice case reaches it under four builds. At temperature 0 the 122B does not give the same words twice (`RUNS-AND-FINDINGS.md` §5: 8% same words, 63% same call across two lending recordings). So:

1. The first cell to ask a prompt has its answer kept.
2. A later cell with the same prompt lived on a different answer. Its second prompt contains its own earlier words, and its answer to that was recorded under a digest that the replay will never ask.
3. On replay the later cell is given the first cell's answer instead. If that takes it to a second tick (for example after a guard block), the replay asks a prompt that was never put to the model. That is the `cassette-miss`.

**Evidence.**

- Every first-tick prompt replays: 256 of 256 hits in complaints, 313 of 313 in fraud. Divergence starts only after a recorded answer has been substituted.
- A large share of what was recorded is never asked on replay: **47% of complaints entries (142 of 302), 34% of fraud (847 of 2,490), 40% of advice (605 of 1,502)**, by exact digest. Those are live answers to prompts the replay does not reproduce.
- For one complaints cell (a `fraud-handling` complaint whose account detail is a monthly fee) the cassette holds a live turn-2 answer that quotes the earlier block ("The safety rule previously stopped me from identifying 'charges'"). The replay's turn-2 prompt for that cell is a different digest.
- I tried eleven mutations of the missed prompts (whitespace, apostrophes, the refusal line, the tools list, the token cap). None reproduced a recorded digest, so the difference is in the words the model gave, not in formatting the replay changed.

**Not proven.** I did not call the model twice with one prompt to show the divergence directly; the Sparks are in `puzzle` mode, and I did not switch them. The inference rests on the first-prompt/second-prompt pattern above and on the earlier variance measurement. One live re-record of a single complaints item would settle it.

**What it does to the findings.**

- **Complaints "redress-within-bounds 100% → 20%" is these cells.** `guard=none`: 55 of 55 pass. `policy-cards`: 11 pass and 44 fail, and the 44 are exactly the `ERROR` cells, which never reached the redress stage. 42 of those 44 are `cassette-miss`. The finding in `RUNS-AND-FINDINGS.md` §3 should not stand as written.
- The `ERROR` counts for all three designs overstate live failure by about two thirds.
- The live result that would have shown each cell's true outcome was written to a work directory that was not kept, so those 69 outcomes are unknown.
- Every cell that shares a first prompt with another also shares its first answer, which lowers the effective n below the cell count.

## 2. Real behaviour: 34 cells that replay completely

All 34 end `OUT_OF_STEPS`: the bot repeats a call that cannot succeed until the turn budget runs out (30 to 60 turns).

### Desk: 22 cells

**Fraud, 16 cells: the queue says "Alert 1", the tools want `alert-1` or `1`.**

- The queue and the alert detail show the alert as "Alert 1". The tool parameter reads "The alert id." and nothing more.
- `Number("Alert 1")` is `NaN`, so the desk looks for `alert-NaN` and answers `No alert “Alert 1” in the queue.` (`packages/packs/fs-fraud/src/world/desk.ts:174`, `:227`).
- Across the run, `file-sar` and `open-alert` were called with the displayed label 756 times and failed every time. Calls using `alert-N` or a bare number succeeded.
- Twelve cells stall in the `sar` stage, four in `triage`. The failure message gives no hint of the accepted form, unlike `look-up`, which lists what is on file and lets the bot recover.

**Advice, 4 cells: `check-suitability` will not say what is missing.**

- The stage needs five required topics: `goal`, `amount`, `horizon`, `risk-appetite` and `emergency-fund`. The bot asked five topics, but swapped `amount` (already stated in the request) for `existing-investments`, which is not required.
- `check-suitability` answers `Suitability is not gathered yet: ask the five questions first.` seventeen times. It never names the missing topic, and the bot never reaches for `run-fact-find`, which would ask whatever is missing.
- The model contributed (it trusted the request over the checklist), but a message that named the topic would have ended the loop on the first retry.

**Complaints, 2 cells: the card enforces a register the bot cannot see.**

- `fs-advice/policy/root-cause-on-the-register` blocks any root cause that the register does not give for the complaint's category. The block message says only that the cause is "not the one the register gives".
- The bot repeats the same blocked answer (`service`) four times. It has no way to learn the allowed cause, and in its own words it assumes "the register confirms the category".
- This is also why the file is awkward to read: the summary and category (for example `data`) often disagree with the account detail (for example an overdraft fee), and the truth follows the detail.

### Model, with prompt and desk contributing: 12 cells (fraud, `contact` stage)

- The brief is plain: "Tell the customer, in plain words, that a payment is being looked at." The stage is complete when the agent has spoken (`packages/packs/fs-fraud/src/workflow.ts:163`, `contacted`).
- The bot instead tries `verify-caller` first ("I should first verify the caller's identity before discussing the payment review") and is told `There is no one on the line.` Eight cells repeat that sixty times. Four move on to `look-up` and `open-alert`, then loop on `write-note`.
- Verifying before disclosing is a defensible instinct, so I would not call the model plainly wrong. Two things make it worse: `verify-caller` is on offer at a stage where no call exists until the agent speaks, and the failure message does not say how a call begins.
- The data cannot separate model from prompt here. A change to the brief or to the message, then one re-record of these twelve items, would.

## 3. What to fix, in order

> **Status 2026-10-07.** Items 1–3 and 5 are built (WP189–WP193) and the smoke read 24 of 24 loops gone (`PHASE-0-SMOKE-AND-PROBE.md`). Item 4 is half done: WP193 put the register rule on the case file, and `PHASE-2B-COMPLAINTS.md` measured it (the complaints `ERROR` cells fell from 44 to 2); what the card's refusal should say, and the root cause's structure, are decided below and not yet built. Item 6 (no-progress in the live stacks) is still open. The "redress collapse" in §1 and the §3.7 finding are restated in `RUNS-AND-FINDINGS.md`.

1. **The recorder** (largest effect, 69 cells, and it distorts every live design, not only these three). Keep each live cell's own outcome as a first-class result, or scope cassette entries to the cell so a replay reproduces that cell's live path exactly. Until then, treat replay-derived live outcomes as indicative.
2. **Fraud's alert id** (16 cells): accept the displayed label, and have the failure message list the ids on the desk.
3. **Advice's `check-suitability`** (4 cells): name the missing topics in the message.
4. **Complaints' register** (2 cells): show the bot the register entry for its complaint, or at least the allowed cause, when the card blocks.
5. **Fraud's contact stage** (12 cells): say in the failure message that a call begins when the bot speaks, and re-record to see whether the model follows.
6. **Loop limit**: all 34 real failures burn 30 to 60 turns repeating one failing call. The `governance/no-progress` component exists (WP141) but is not in these stacks.

After items 1 to 5, re-record the three designs and re-read the register. Items 2 to 5 change prompts or desk text, so they change the cassettes' digests and need a fresh recording in any case.

## How this was done

Each design was replayed from `docs/evidence/live/<id>/<id>.provider-cassette.json` with `--egress none` into the session scratchpad. The events of every `ERROR` cell were read from the run store, and the built cassette provider was temporarily instrumented to log each prompt it was asked and whether it hit (the build file was restored afterwards; the repository is unchanged apart from this document). No result, cassette or design file was modified.
