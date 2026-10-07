# The live tier: runs and findings (2026-10-06)

A narrative record of WP168 and WP169: what was run, how, what went wrong on the way, and what the numbers say. The generated, machine-checked column is `README.md` in this folder; the plan notes are in `docs/design-day2/112-REAL-ENOUGH-PLAN.md` §11. This document explains and interprets them; where a number appears here it comes from the committed results (`<design>/<design>.experiment-result.json`, `cells.json`, `timings.json`).

**Read every figure as:** a measurement of this synthetic bank, at the size stated, under **one sample** from one model (Qwen3.5-122B-A10B-NVFP4, `dgx-spark/giant-qwen`, on the builder's two DGX Sparks). It is evidence about a model a bank could run inside its own boundary. It is not evidence about a frontier model or any real book, and temperature 0 does not make it repeatable (see §5).

---

## 1. What was run

Eight reference designs that have a book were re-run with the brain a live model, and the lending design was recorded twice. A ninth design (WP169) re-ran servicing with the *customer* a live model as well.

| Design (`<id>-live`) | Book size | Cells | Cassette entries | Wall time |
|---|---|---|---|---|
| `lending-stack` | 800 | 306 | 1,238 | 30 min |
| `lending-stack` (second recording, `-b`) | 800 | 306 | 1,099 | 27 min |
| `servicing-stack` | 200 | 66 | 260 | 9 min |
| `disputes-stack` | 400 | 80 | 265 | 6 min |
| `collections-stack` | 300 | 74 | 839 | 20 min |
| `onboarding-stack` | 400 | 66 | 289 | 6 min |
| `complaints-stack` | 200 | 110 | 302 | 7 min |
| `fraud-stack` | 6 | 108 | 2,490 | 54 min |
| `advice-context` | 1,200 | 124 | 1,502 | 46 min |
| `servicing-stack` with a live customer (`-seat`) | 100 | 32 | 357 | 8 min |

Book sizes were chosen so each design records in one session, which is why they differ: desks' incidences differ widely (the fraud book draws nearly five alerts per customer, so six customers is already 108 cells).

### How a run works

1. `scripts/live-designs.mjs` derives each live design from its base design in `experiments/` (same template, factors and metrics; the brain factor removed; one live brain naming its cassette; a book of its own size; a budget for the live cells; `maxTokens: 1024` on every build). They live in `experiments/live/`.
2. `scripts/live-record.mjs` checks the Sparks serve the cartridge (`craftabot spark verify`), records with `craftabot record --experiment … --provider dgx-spark --concurrency auto` (16 cells at a time, load spread across both Sparks), then replays the design from the cassette alone with `--egress none`.
3. The replay's result, markdown, per-case `cells.json` and a sample of runs as stories are committed beside the slim cassette.
4. CI replays every live design from its cassette with no network and requires exactly the committed numbers (`scripts/live-check.mjs`), and regenerates the README column (`scripts/live-column.mjs --check`).

The Sparks ran in the `reasoning-pair` pattern: both units serving the 122B in `puzzle` mode, eight streams each, MTP speculative decoding on. The scripted and fallible columns of each design are the full-size results one folder up (`docs/evidence/<design>/`).

---

## 2. Problems found along the way

These cost time and are worth knowing; each was fixed.

| What happened | Cause | Fix |
|---|---|---|
| 35 of the first lending recording's 791 replies (4.4%) were cut off; agreement read 10 of 23 | The stage agents inherit the starter's 256-token reply limit. That measured the cap, not the model | Live designs set `maxTokens: 1024`; no reply in any recording below was cut off. The 256-token recording was discarded |
| 28 minutes of lending recording discarded at the end | The credential guard refused to write: a 3-character `LAKERA_GUARD_KEY` placeholder in `.env` matched ordinary words in model replies | A smoke variable shorter than 8 characters is treated as a placeholder, `keys check` says so, and a recorder now stops at the first response that carries a held credential. `.env` was not edited |
| Cassettes were about 14 MB each | Raw wire chunks recorded with every answer | `slim` recording drops them (about 1 MB per cassette); session-visible responses are slimmed identically so replay matches |
| A live brain asked its provider for the model `"mock"` (found in the earlier Spark session) | The brain's `cartridgeId` never reached the agent's brain slot | The campaign now applies it, with a test |
| With a live customer, 26 of 32 cells ended `ERROR` on replay (`cassette-miss`) | The recorder only captures brains it maps to a cassette; the customer's brain id was different, so none of its answers were recorded | The customer shares the brain's id, so a recording writes both into one cassette |
| Synthetic-data sweep flagged Luhn-valid 16-digit floats in result JSON | Statistics, not card numbers | The live sweep covers cassettes and stories only |

---

## 3. What each design says

Effects are guard `none` vs `policy-cards` unless the factor is named. "Interval" is a 95% Wilson interval; effect intervals are Newcombe. Most designs are underpowered at these sizes (fewer than 30 cells on a side, or a minimum detectable difference far above the 5 points the design aimed for), so "no difference" below means *not detectable here*.

### 3.1 The first finding: the live error rate against the assumed 90%

`ERROR_RATES` in `fs-bank` assumed one decision in ten wrong on every desk, an agreement of 90%. The live baseline (reference configuration, no guard):

| Desk | What is measured | Live (95% interval, n) | Assumed 90% inside the interval? |
|---|---|---|---|
| Lending | decision matches the rule | 53% (40–66%, n 51) | **no** |
| Disputes | decision matches the rules | 68% (52–80%, n 40) | **no** |
| Collections | repayment plan matches the rule | 72% (56–84%, n 36) | **no** |
| Complaints | root cause named | 25% (16–38%, n 55) | **no** |
| Servicing | caller's need met | 94% (80–98%, n 33) | yes |
| Fraud | alert decision right | 93% (77–98%, n 27) | yes |
| Onboarding | decision matches the rules | 100% (90–100%, n 33) | yes |
| Advice | recommendation suits the customer | 100% (89–100%, n 31) | yes |

The uniform 10% assumption is wrong in both directions: too optimistic by a wide margin for four desks, and too pessimistic for onboarding and advice. A single number per desk cannot stand in for the live model; the shape of its errors differs by desk. This is the finding the shaped error models (WP170) were provisional for, and the cassettes now hold the evidence to replace those assumptions.

**What this does not show:** *why* lending, disputes, collections and complaints are low. Not diagnosed here; the cases and stories are in each design's folder. The complaints figure in particular has a history (WP155 found the desk's truth and rule disagreeing with the register once); whether the 25% is the model, the desk, or the task as posed was not examined.

### 3.2 Lending (`lending-stack-live`, two recordings)

- Agreement with the rule, `bot-everywhere`, no guard: 53% (40–66%, n 51). Over-approval 0% (0–7%).
- Policy cards: 47% (34–60%), p 0.51; no detectable effect.
- Executors: `rules-only` reads 100% (93–100%) against 53%. Most likely that is the rule agreeing with itself rather than a model result (not separately checked). `bot-with-a-person-at-the-decision` reads 53%, the same as the bot alone at this n; why was not examined.
- Tokens per case about 15k (baseline), 17k with the stack in the first recording, 12.7k in the second.
- Outcomes: first recording 279 SUCCESS, 13 ERROR, 14 STOPPED_BY_GUARDRAIL; second 286, 18, 2.

### 3.3 Servicing

- Needs met 94% (80–98%, n 33), disclosure recorded 100% (90–100%). Stack changes nothing at this n. About 11.8k tokens per case.
- Verdict *inconclusive*; 62 SUCCESS, 2 ERROR, 2 STOPPED_BY_GUARDRAIL.

### 3.4 Disputes

- Decision matches the rules 68% (52–80%, n 40); reimbursed within the limit 100%. Stack identical to no stack (same numbers and tokens, 7.5k per case): the cards did not act on this book. All 80 cells SUCCESS.

### 3.5 Collections

- Plan matches the rule 72% (56–84%) without a guard and 76% (59–87%) with it, p 1.0: no detectable effect. Vulnerability actioned 100%.
- Tokens per case 30.4k without the stack and 23.3k with it. 60 SUCCESS, 8 ERROR, 6 STOPPED_BY_GUARDRAIL.

### 3.6 Onboarding

- Decision matches the rules 100% (90–100%, n 33); the tipping-off gate (`hit-contained`) 100%. Verdict *untestable*: a ceiling effect, there is nothing for a control to improve. All 66 cells SUCCESS.

### 3.7 Complaints

> **Restated 2026-10-07** (`PHASE-1-DIAGNOSES.md` §B, `PHASE-2B-COMPLAINTS.md`). The first recording's figures below this note were artefacts, and are replaced.

- **Superseded:** *root cause named 25%, redress within bounds 20% with the stack, 44 of 110 cells `ERROR`.* 42 of those 44 were replay artefacts of the first cassette (`ERROR-TRIAGE.md` §1); the other two, and the 25%, were the desk: the register's convention (only `charges` and `data` complaints upheld, every other category `no-error`) was not shown to the bot, so a natural answer (`service`, `advice`) was wrong in 17 of 17 such cases and the card blocked it. The card blocked exactly what the register rejects and nothing else, and the stack did not change how a live bot proposed redress.
- **Now (rule on the file, two trials, 220 cells, verified by exact replay):** root cause named **100%** without the stack (110 of 110) and 99% with it; redress within bounds 100% / 98% (pass^2 96%, 88–99%); acknowledged and ombudsman disclosed 100% in both. `policy-cards` cells ending `ERROR`: **2 of 110** (one root cause blocked four times, one 60-second request timeout). The stack's effect is inside its interval; the verdict is *inconclusive*, minimum detectable 2.8 points.
- **What remains a question about the desk, not the stack or the model:** "root cause named" now reads rule-following, because the convention is one a real bank would not hold (many service and advice complaints are upheld). The owner's decision is to give the root cause a structure of predetermined answers *and* room for reasons unique to the case (plan 113 §12, item 11).

### 3.8 Fraud

- Alert decision 93% (77–98%, n 27), no tipping-off 100%. A person at the SAR stage reads identically. Verdict *inconclusive* (small n).
- The heaviest design: about 107k tokens per case without the stack, 70k with it; 2,490 cassette entries. Outcomes: 42 SUCCESS, 37 ERROR, 29 STOPPED_BY_GUARDRAIL.

### 3.9 Advice (context ladder)

- Suitable recommendation 100% (89–100%, n 31) under both the case-file context and the relational context.
- **Data-minimisation**: 100% under the case file and **0% (0–11%) under the relational context** (p ≈ 3e-15). **Restated 2026-10-07** (`PHASE-1-DIAGNOSES.md` §A): the 0% is what the rung *supplies*, not what the bot *uses*. At the relational rung the desk puts six records on the bot's desk before its first move (including an open complaint about a health condition and the credit file); `data-minimised` scores those as reads, so it reads 0% by construction, and the scripted and fallible columns (no model in them) read 0% too. Across all 124 live cells the bot made **no CRM read of its own**; the new `fs-advice/unneeded-data-used` finds use in **2 of 50** finished relational cells (4%), both only in its reasoning. The finding stands as: the relational rung hands an advice bot data it does not need. The owner's decision is that it should not (plan 113 §12, item 12).
- Tokens per case rose from about 58k to 82k with the relational context (the extra records are in the prompt). 102 SUCCESS, 22 ERROR.

---

## 4. Customers who answer back (WP169)

Until WP169 a book's customer was either absent or the desk's scripted visitor. A book campaign whose counterpart is `live` now seats a second live model across the desk at each agent stage; each line it says becomes a `seat.said` on the bot's trace.

Servicing again, 100 customers, 32 cells, the 122B as both bot and customer:

| | Needs met | Tokens per case | Cells |
|---|---|---|---|
| the desk's own scripted visitor | 94% (80–98%, n 33) | 11,775 | 66 |
| a live customer | 100% (81–100%, n 16) | 8,735 | 32 |

All 32 cells complete. The intervals overlap and the books differ in size, so this is **no detectable difference**, not evidence that a talking customer helps. What it demonstrates is that conversation runs end to end on the live tier and replays exactly from one cassette.

One weakness is visible in the stories: the persona is general-purpose (the population draws one by cohort, not by what the request is), so its opening line can be about savings when the request is a lost card. The bot copes, but a persona matched to the request would be a better test.

---

## 5. The live tier's own variance

`lending-stack` was recorded twice with nothing changed.

- Same prompt, same answer: of 488 prompts both recordings were asked, 305 (63%) were answered with the same call and 39 (8%) with the same words as well. 1,361 prompts were asked by only one recording, because a different earlier answer leads to a different later prompt.
- Same case, decided twice: of 306 cases both decided, 278 (91%) reached the same verdict from the design's evaluators.
- The headline figure: agreement 53% (40–66%, n 51) in both recordings. A difference of 0.0 points.
- Finish reasons: first recording all `tool_call`; second all `tool_call` but two `stop`; none `length`.

Temperature 0 is not repeatable on this serving stack: batching and speculative decoding move the numerics with what else is in flight. The aggregate is stable here; individual calls and cases are not. Any control whose effect is smaller than this noise cannot be credited from one recording, and that is what the underpowered flags say.

---

## 6. Limits of all of the above

- **One sample, one model.** Each design is a single recording. The second lending recording shows the aggregate reproducing, but only for that design.
- **Small n.** Most effects are underpowered. The verdicts are *inconclusive*, *untestable* or *not-supported*, deliberately; none is *supported*.
- **Synthetic bank.** Every customer, case and record is generated; the rules the bot is scored against are this repository's rules, not a regulator's.
- **ERROR cells are not diagnosed.** Several designs have many (`complaints` 44 of 110, `fraud` 37 of 108, `advice` 22 of 124). They are scored as the evaluator sees them. Each is a stage that did not produce the output its schema asked for, which a live model can do for reasons that are about the model, the prompt or the desk. A sampled story per outcome is committed.
- **The register does not read these results yet.** The Control Effectiveness Register and the Control Inventory still read the scripted and fallible columns; the live results are recorded beside them, not folded in.
- **Not recorded:** the scenario designs (`controls`, `gate-presets`), and no edition serves a cassette, so the Workshop's live column is empty.

## 7. Where things are

| What | Where |
|---|---|
| The generated column and cost table | `docs/evidence/live/README.md` |
| Per design: cassette, result, markdown, design, `cells.json`, stories | `docs/evidence/live/<design>-live/` |
| Recording timings | `docs/evidence/live/timings.json` |
| The live designs | `experiments/live/` |
| The scripts | `scripts/live-designs.mjs`, `live-record.mjs`, `live-check.mjs`, `live-column.mjs` |
| The plan's notes | `docs/design-day2/112-REAL-ENOUGH-PLAN.md` §11 (WP168, WP169) |
| The Spark patterns and the lease | `docs/design-day2/99-DGX-SPARK.md` §9 |
