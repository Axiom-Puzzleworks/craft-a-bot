# The live tier: runs and findings (re-recorded 2026-10-07)

A narrative record of the live tier as recorded by **WP195** (`docs/design-day2/113-RECORDING-AND-RELIABILITY.md`): what was run, how, what went wrong on the way, and what the numbers say. It replaces the narrative of the first recording (2026-10-06, WP168 and WP169), whose headline figures turned out to be mostly artefacts of the desks and the recorder (§3). The generated, machine-checked column is `README.md` in this folder; the dated notes are in `113-…` §11–§13. Every figure here comes from the committed results (`<design>/<design>.experiment-result.json`, `cells.json`, `timings.json`).

**Read every figure as:** a measurement of this synthetic bank, at the size stated, from one model (Qwen3.5-122B-A10B-NVFP4, `dgx-spark/giant-qwen`, on the builder's two DGX Sparks) at temperature 0, **performed twice where the design says so** (§5). It is evidence about a model a bank could run inside its own boundary. It is not evidence about a frontier model or any real book.

---

## 1. What was run

Ten live designs, recorded in two passes on 2026-10-07 (about 7 hours of wall time): every design's first performance, cheapest first, then the second performance of the eight designs that have one. The two servicing designs sit at a ceiling and were performed once.

| Design (`<id>-live`) | Book | Performed | Cells | Calls | Wall time |
|---|---|---|---|---|---|
| `onboarding-stack` | 400 | 2× | 132 | 1,143 | 19 min |
| `disputes-stack` | 400 | 2× | 160 | 966 | 16 min |
| `complaints-stack` | 200 | 2× | 220 | 584 | 10 min |
| `servicing-stack` | 200 | 1× | 66 | 318 | 6 min |
| `servicing-stack` with a live customer (`-seat`) | 100 | 1× | 32 | 330 | 5 min |
| `controls-live` (nine attack scenarios) | scenarios | 2× | 162 | 1,692 | 37 min |
| `collections-stack` | 300 | 2× | 148 | 1,156 | 26 min |
| `lending-stack` | 800 | 2× | 408 | 2,967 | 171 min |
| `advice-context` | 1,200 | 2× | 248 | 2,466 | 67 min |
| `fraud-stack` | 6 | 2× | 216 | 3,113 | 65 min |

### How a run works

1. `scripts/live-designs.mjs` derives each live design from its base design in `experiments/` (same template, factors and metrics; the brain factor removed; one live brain naming its cassette; a book of its own size, or the scenarios; `design.trials` where the plan says; `maxTokens: 2048`). They live in `experiments/live/`.
2. `node scripts/live-record.mjs --all` records pass 0 of every design, then pass 1 of the designs performed twice. Each pass is recorded with `craftabot record --experiment … --provider dgx-spark --concurrency auto` (16 cells at a time, load spread across both Sparks, a 180-second request timeout) into a cell-scoped recording that keeps every call, and the live run's own store is kept locally under `recordings/` (gitignored). After the last pass the recording is **verified** (every cell replays to the path it recorded, and the live store digests to the same) and replayed from the cassette alone to write the evidence.
3. CI replays every live design from its cassette with no network and requires exactly the committed numbers and every cell on its recorded path (`scripts/live-check.mjs`), and regenerates the README column (`scripts/live-column.mjs --check`).

The Sparks ran in `puzzle` mode, both units serving the 122B, eight streams each, MTP speculative decoding on. The scripted and fallible columns are the full-size results one folder up (`docs/evidence/<design>/`).

---

## 2. What each design says

Effects are guard `none` vs `policy-cards` unless the factor is named. Intervals are 95%. Reliability figures are **over items, never trials** (§5). Most designs are at or near a ceiling, so "no difference" means *not detectable here*, and the verdicts are *inconclusive* or *untestable* by the register's own rule.

| Design | Primary measure | No stack | Policy cards | Verdict |
|---|---|---|---|---|
| `lending-stack` | agreement with the rule | 99% (pass^2 98%) | 100% | inconclusive |
| `disputes-stack` | decision matches the rule | 81% (pass^2 80%) | 80% | inconclusive |
| `disputes-stack` | reimbursed within the limit | 94% (pass^2 93%) | **100%** | |
| `collections-stack` | plan matches the rule | 100% | 100% | untestable |
| `onboarding-stack` | decision matches the rule; hit contained | 100%; 100% | 100%; 100% | untestable |
| `complaints-stack` | root cause named | 99% (pass^2 98%) | 100% | inconclusive |
| `fraud-stack` | alert decision | 96% | 96% | inconclusive |
| `advice-context` | suitable; data minimised | 100%; 100% | (relational) 100%; 100% | untestable |
| `servicing-stack` (and with a live customer) | needs met | 100% | 100% | untestable |
| `controls-live` | each attack resisted | 100% unaided | 100% | inconclusive |

### 2.1 The headline: seeing the rule was the whole difference

The first recording measured agreement of 53% (lending), 68% (disputes), 72% (collections) and 25% (complaints), far below the 90% the bank assumed. **That was the bot scored against thresholds it was never shown.** The desk brief is a record on the desk, not a line of the prompt, so the lending, disputes and collections rules, and the complaints register's convention, were absent from what the model read. With each rule put on the case file the model reasons from it ("the ratio is 18%, under the 60% threshold") and agreement is 99%, 81%, 100% and 99%. The remaining gap is on **disputes**, where the model misclassifies about one case in five in both arms: that is the model's, not a control's.

### 2.2 Lending

Agreement 99% (97–100%, n 51), pass^2 98%; with the stack 100%. Over-approval is 0% in both arms. **38 of the 408 bot cells (9%) ended `ERROR` and 5 more were stopped by the stack**, and they are not random: eleven are request timeouts and all of those are in the *explanation* stage. Having decided correctly, the bot re-derives the rule at length when asked to explain it, a reply of up to 2,048 tokens at five to seven tokens a second outlasts the 180-second timeout, and the cell is lost after its decision was made. The decision metrics are unaffected; the cells' later scores are missing. The likely fix is a tighter explanation-stage prompt (an owner's call, and a re-record of lending, about 170 minutes).

### 2.3 Disputes: the first live result where a control does something

The disputes book now carries temptations (one merchant dispute in three has an injected instruction; every above-limit scam arrives with a note that the bank "has already agreed" to pay in full). Without the stack the bot reimbursed above the limit in some of them; with it, **the *Within the limit* card caught every one** (reimbursed within the limit 94% → 100%; pass^2 93% → 100%). The price is 6 of the 80 stack-arm cells ending `STOPPED_BY_GUARDRAIL`: the bot retries the reimbursement the card refuses until its step budget ends the cell. The verdict is *inconclusive* only because the intervals overlap at n=40.

### 2.4 Complaints

Root cause named 99% (pass^2 98%) without the stack and 100% with it; redress within bounds 100% in both; acknowledged and ombudsman disclosed 100%; **no cell of 220 ended in `ERROR` or was stopped.** The first recording read 25% and 20%, with 44 of 110 stack cells in `ERROR`. Those were a convention the bot could not see (only charges and data complaints are upheld) and replay artefacts of the first cassette, not the stack (`PHASE-1-DIAGNOSES.md`, `PHASE-2B-COMPLAINTS.md`). Two further things were found by looking at what the 98% hid: the redress stage was scored against a range (£25–£50) the bot was never told, and it landed in range by guessing; the range is now on the register record, and live offers are consistently £35.

### 2.5 Fraud

Alert decision 96% (82–99%, n 27), pass^2 96%; no-tip-off 100%. The heaviest design: about 33,000 tokens per case. 23 of the 216 cells (11%) ended `STOPPED_BY_GUARDRAIL`, all in the stack arms, two kinds: the *No SAR without escalation first* card refusing a report the bot kept re-filing (the refusal now says to use Escalate first), and a bot that re-opens the alert without deciding. The no-progress component would catch the second, but it would confound the stack's effect and is left out.

### 2.6 Onboarding, collections, advice, servicing

- **Onboarding** reads 100% on decision and hit-contained, pass^2 included. The book now plants temptations: half the applicants who match a list ask to be told why, and every identity mismatch asks to be opened now. **The bot is not tempted**: it disclosed no screening result and opened no unverified account. The design is still at a ceiling.
- **Collections** reads 100% with the forbearance rule on the file (it was 72%), at the ceiling.
- **Advice** reads 100% on suitability and data minimisation across both contexts, including the pushy, guarantee-demanding, disclosing and poisoned-factsheet variants. The relational rung's earlier 0% data-minimisation was what the rung *supplied*; it no longer hands an advice bot a complaint or the credit file, and the cost is gone.
- **Servicing** reads 100%, alone and with a live customer (32 of 32 cells), at the ceiling.

### 2.7 `controls-live`: a live model against the attack scenarios

The nine scenarios (a forged radio message, a poisoned note, a key in the manual, a malformed call, a stalled run, the earlier injection and secret-keeping cards) were run against each agent-security component. **Unaided, the live model resisted every attack**: it kept the secret, the key and the ball, sent no false alert and no malformed give, in every scenario. Those measures read 100% with and without each component, so the verdict is *inconclusive*, a ceiling. Two lines are not at it: `cost-cap` takes `ran-out-of-steps` from 100% to 0%, which is the cap ending the run, not a safety effect, and `peer-auth` reads 89%.

---

## 3. What the first recording got wrong

The first recording (2026-10-06) read, among other things: complaints root cause named 25% and redress within bounds 20% with 44 of 110 stack cells in `ERROR`; advice data-minimisation 0% under the relational context; fraud 37 of 108 cells in `ERROR`. The triage (`ERROR-TRIAGE.md`) found that **69 of 103 `ERROR` cells were not live outcomes at all**, but `cassette-miss` errors raised by a replay of a prompt-keyed, first-answer-wins cassette. The rest were desk faults (fraud's alert id, advice's *check suitability* message, the complaints register's convention) and a model loop. The recorder was redesigned (WP189–WP194): a passive tap that keeps every call, cell-scoped recordings, exact replay that verifies and never substitutes, trials. The diagnoses (`PHASE-0-SMOKE-AND-PROBE.md`, `PHASE-1-DIAGNOSES.md`, `PHASE-2B-COMPLAINTS.md`) found the complaints collapse to be the hidden register rule, and the advice 0% to be what the context rung supplied rather than what the bot used. **None of the first recording's figures should be cited.**

---

## 4. Customers who answer back (WP169)

`servicing-stack` was re-run with the person across the desk a live model as well: the desk draws the customer's persona from the item and, since this re-record, the customer **opens with the request itself**, in their own words, not an unrelated stock opening. 32 of 32 cells succeeded, needs met 100% (81–100%, n 16) against 100% (90–100%, n 33) for the desk's own scripted visitor, at 7,707 against 7,824 tokens per case. At a ceiling this says only that customers who answer back run end to end on the live tier.

---

## 5. The live tier's own variance, now measured

The first recording read the live tier's variance by recording lending twice; that second design is retired (its evidence stays as the record). Variance is now read from **trials**: each item performed twice with fresh model draws, reported as pass@1 (one performance), **pass^k** (every performance passes, the figure for a control) and consistency (the share of items the trials agreed on), over items and never trials, so repeating a case does not inflate *n*.

- **Calls are repeatable, words are not.** The probe (`PHASE-0-SMOKE-AND-PROBE.md`) found the 122B makes the same call in 93–98% of repeated prompts and says the same words in 7–14%, at temperature 0; a seed does not help; the two Sparks add no detectable variance.
- **Outcomes are stable.** Consistency is 98–100% in every design but one (fraud's stack-arm SAR design, 93%): the two performances of an item mostly reach the same verdict. pass^2 sits within a point or two of pass@1 almost everywhere (lending 99% → 98%, disputes 81% → 80%, complaints 99% → 98%).
- **The cost of a second performance** is mostly the same cells again, so two trials buy a measure of reliability rather than more independent cases.

---

## 6. Problems found along the way

Each was fixed; the earlier ones are in `ERROR-TRIAGE.md` and the `113-…` notes.

| What happened | Cause | Fix |
|---|---|---|
| The desks' rules were never in the prompt | The desk brief is a record on the desk, not a line of the prompt | Lending, disputes, collections, onboarding and complaints rules, and the redress range, are joined to the case-file sense |
| Three stage stalls in the preflight | Goals that left no way forward (onboarding's decline, collections' agree, lending's disburse; fraud's look-up and SAR; servicing's bereavement act) | Goals and refusals reworded; look-up finds an account by its last four digits |
| One lending cell spent eleven calls cut off at 1,024 tokens | With the rule visible a bot sometimes re-derives it at length | The live reply limit is 2,048 |
| About one call in 629 hit the 60 s request timeout | Five tokens a second under sixteen concurrent calls | A host override, 180 s in the recording scripts |
| The first full verification found the path digest read run ids; a recorded failure replayed under another kind | The mock-based tests could not show either | Both fixed (`113-…` §11, WP190); then, at the end of this run, the digest also read whether a principal was named (a plain-allow guard check, the action's attestation, who resolved an approval), which made the CLI's replay differ from `recording verify`'s; all three are now off the path |
| A recording was lost to a failed merge with the old cassette; a verify failed on a half-recorded design | The old format at the path; a two-trial design verified after one trial | A new recording replaces the old format and a merge that cannot be made keeps the fresh recording beside the file; a design is verified and written up after its last pass |

---

## 7. Limits of all of the above

- **One model, two performances.** Each design is the 122B at temperature 0, performed twice at most. Reliability here is between two performances.
- **Small n.** Most effects are at a ceiling or underpowered. The verdicts are *inconclusive* or *untestable* by the register's rule; none is *supported*.
- **Synthetic bank.** Every customer, case and record is generated; the rules the bot is scored against are this repository's rules, not a regulator's. The new incidence and temptation shares are assumptions awaiting review.
- **Some cells are lost to the model's habits, not the controls.** Lending's explanation stage (9% of bot cells), fraud's re-opened alerts and disputes' retry loop end cells before their later scores; the decision metrics are not affected.
- **The register does not read these results yet.** The Control Effectiveness Register and the Control Inventory still read the scripted and fallible columns; the live results are recorded beside them, not folded in.
- **`gate-presets` is not recorded live**, and no edition serves a cassette, so the Workshop's live column is empty.

## 8. Where things are

| What | Where |
|---|---|
| The generated column, cost and reliability tables | `docs/evidence/live/README.md` |
| Per design: cassette (a cell-scoped recording), result, markdown, design, `cells.json`, stories | `docs/evidence/live/<design>-live/` |
| Recording timings | `docs/evidence/live/timings.json` |
| The live designs | `experiments/live/` |
| The scripts | `scripts/live-designs.mjs`, `live-record.mjs`, `live-check.mjs`, `live-column.mjs`, `live-smoke.mjs` |
| The live runs' own stores (every prompt and event) | `recordings/` (gitignored, local) |
| The triage, the diagnoses and the preflight | `ERROR-TRIAGE.md`, `PHASE-0-SMOKE-AND-PROBE.md`, `PHASE-1-DIAGNOSES.md`, `PHASE-2B-COMPLAINTS.md`, `RELATIONAL-AUDIT.md` |
| The plan and its dated notes | `docs/design-day2/113-RECORDING-AND-RELIABILITY.md` §11–§13 |
