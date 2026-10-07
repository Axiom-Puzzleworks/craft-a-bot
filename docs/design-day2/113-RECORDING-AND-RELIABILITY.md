# 113 — The recording and the reliability: traceable runs, exact replay, and pass@k

> **Status (2026-10-07):** a plan, decided with the owner, awaiting build. Nothing in it is built. It continues `112-REAL-ENOUGH-PLAN.md`'s numbering: Phase AZ, WP189–WP195, gaps G166–G174. It runs on one branch (`phase-az`), one commit per WP, with a PR when the phase closes. §8's decisions are settled; the build starts on them. It exists because the live tier's first recording (WP168, `112-…` §11) was triaged on 2026-10-07 (`docs/evidence/live/ERROR-TRIAGE.md`) and the triage found that the recorder, not the model, produced two thirds of the `ERROR` cells.
>
> **Numbering:** `112-…` WP176 reserved the name `113-FS-PAYMENTS.md` for the payments desk. This plan takes 113; the payments desk's note becomes `114-FS-PAYMENTS.md` (a dated note in `112-…` says so).

## 0. The ask, and the answer in one paragraph

A cassette has to serve two different purposes, and the first recorder served only one of them well. **Traceability:** for every cell, the full transcript of how its decisions and outcome came about, kept exactly as it happened. **Reperformance:** running the cell again with the same inputs and asking whether the same outcomes come out, where the language model is non-deterministic and the non-determinism is itself a quantity to measure and manage, not a defect to hide. The answer is to keep the two apart and make each exact in its own way. Recording becomes a **passive tap** that keeps everything the live run produced, cell by cell, including the calls that failed. **Exact replay** is then a *verification*: given the recorded answers, today's desk, guards and evaluators must reproduce each cell's recorded path and outcome, or say loudly where they do not. **Reperformance** is a separate capability: **trials**, the same cell run `k` times with fresh model draws, with pass@k, pass^k, consistency and path-divergence measured, intervals clustered by item, and a probe that isolates the model's own non-determinism from the way it compounds over a journey. Before any of it is recorded again, the desk faults the triage found are fixed and tested, so the re-record (two trials, `k = 2`) is made once.

## 1. What the first recording got wrong

The numbers are from replaying `complaints-stack-live`, `fraud-stack-live` and `advice-context-live` from their cassettes on 2026-10-07; `ERROR-TRIAGE.md` has the method and the evidence.

| Finding | Where it comes from |
| --- | --- |
| **69 of 103 `ERROR` cells were never live outcomes.** They are replay-time `cassette-miss` errors: the replay asked a prompt the live run had never put to the model. | The cassette is keyed by prompt and merged first-answer-wins (`mergeProviderEntries`). Cells that share a first prompt lived on different answers (the model does not repeat its words at temperature 0), but replay them on the first cell's. |
| **34–47% of recorded answers are never used on replay** (complaints 47%, advice 40%, fraud 34%). | The live answers to prompts the replay does not reproduce. |
| **Complaints "redress-within-bounds 100% → 20%" is the `ERROR` cells.** `guard=none` 55 of 55; `policy-cards` 11 of 55 pass and the 44 failures are exactly the `ERROR` cells. | `RUNS-AND-FINDINGS.md` §3 must be re-stated. |
| The live run's own store (prompts in full, events, per-cell outcomes) was deleted after recording. | `scripts/live-record.mjs` ends with `rmSync(work)`. |
| Failed and timed-out live calls are in no artefact. | They were `error` events in the deleted store; the cassette holds successes only. |
| Nothing says which Spark answered, or how many answers the merge dropped. | Both units serve the 122B; the count is printed by `craftabot record` and lost. |
| The recorder is not fully passive. | `recordingProvider`'s `slim` removes the raw wire chunks from what the *session* sees as well as from the file (`provider-cassette.test.ts`). |
| The 34 real failures are desk faults, a model fault and a loop with no exit. | §2. |

## 2. The 34 real `ERROR` cells

All end `OUT_OF_STEPS`: a call that cannot succeed is repeated for 30–60 turns. They replay completely, so they are real model-with-desk behaviour.

| Cause | Cells | What the cell shows | Fix (WP193) |
| --- | ---: | --- | --- |
| **Desk: fraud's alert id** | 16 (12 in `sar`, 4 in `triage`) | The queue shows "Alert 1"; the tools accept `alert-1` or `1`. `Number("Alert 1")` is `NaN`, the desk looks for `alert-NaN`, and says `No alert “Alert 1” in the queue.` The displayed label was used 756 times and failed every time. | Accept the displayed label (and the full queue line); on a miss, list the alert ids on the desk, as `look-up` already does. |
| **Desk: advice's `check-suitability`** | 4 | Five topics asked, `amount` swapped for the optional `existing-investments`; `check-suitability` says `ask the five questions first` seventeen times without naming what is missing; `run-fact-find` is never tried. | Name the missing topics in the message. |
| **Desk: complaints' register** | 2 | `root-cause-on-the-register` blocks a root cause, but the register is on no screen the bot reads; the bot repeats the blocked answer four times. | Put the register's entry for the complaint's category on the case file as a record the bot can read. The block message does not name the allowed cause (D8). |
| **Model, with prompt and desk contributing: fraud's `contact` stage** | 12 | The brief says to tell the customer; the bot tries `verify-caller` first ("verify the caller's identity before discussing"), is told `There is no one on the line.`, and repeats it (8 cells) or loops on `write-note` (4). `verify-caller` is on offer where no call exists until the bot speaks. | The `call` sense says there is no call connected and that speaking places it. Re-record to see whether the model follows; model and prompt are not separable from this data. |

## 3. The target

Two qualities, each with its own guarantee and its own limit.

| | **Traceability** | **Reperformance** |
| --- | --- | --- |
| The question | How did this cell reach this decision and outcome? | If this cell is performed again, do the same outcomes come out? |
| The artefact | The recording: every call, in order, with failures, the unit that answered, the manifest, and the live run's own event store | A trial: one performance of a cell. `k` trials per cell. |
| Guarantee | The record is the live run, unaltered, complete, and attributable to its cell | **Exact**, for replay: the recorded answers reproduce the recorded path digest. **Statistical**, for live: reliability measured with intervals |
| Does not guarantee | That a re-run goes the same way (it will not) | That a live re-run matches the recording (it is measured, not required) |
| Determinism | Deterministic by construction (nothing is regenerated) | Replay: deterministic. Live: not, by design, and measured |

Three rules follow, and every WP is held to them.

1. **The recorder is a tap.** It never alters a request or a response, never feeds anything back to the session, and never decides what is kept. The one intervention is the existing credential stop (a leaked secret ends the run at the cell boundary, hard rule 2), and it is named as such. A test runs one session with and without the tap and compares trace digests.
2. **Replay verifies; it never substitutes.** A replay asks exactly what the live run asked. A different prompt at any call is a `replay-diverged` error with both prompts to hand, not a nearest match and not a quiet miss. CI fails on one.
3. **Non-determinism is a measured input.** A design may ask for `trials`; the analysis treats the trials of one item as one cluster; a report says how often a model repeats itself before it says what the model decided.

## 4. The design

### 4.1 The recording

A recording is the product of one `craftabot record` over one design. It has two parts with different homes (D1).

**Committed (the derivation base): the cell-scoped cassette, format version 2.** One file per design, `docs/evidence/live/<id>/<id>.provider-cassette.json`:

- `manifest`: the design's digest and each campaign's, pack and core and harness versions, the model id, the sampling parameters (temperature, token cap, and the request `seed` if the probe in WP192 shows the server honours one), the serving units seen, the recorder's version, `trials`, the egress it ran under, the recording date.
- `cells[]`: one record per cell and trial, with the cell's identity (§4.3), the original run id, the outcome, and a **path digest** (§4.4). Each carries `calls[]`: every call in order, per role (`agent`, `seat`), with the stage, the request digest, the model, the response *or* the error (kind and message), the latency, the attempt number and the unit that answered.

Responses are stored once by hash and referenced from calls, so a prompt answered the same way twice costs a reference. The file stays a plain JSON file `redactSecrets` and `checkSynthetic` sweep as now. A budget test holds the committed cassettes to a stated total (WP190 measures the first and sets it).

**Not committed (gitignored): the live run's own store**, `recordings/<id>/trial-<n>/`: the harness's ordinary run store as the live run wrote it, with every prompt in full, every event, every cell's result. `recordings/` is in `.gitignore` and a test asserts `git check-ignore` holds for it. It is the original; the cassette is what the original is replayed from.

The committed cassette is enough to regenerate the transcript. Replaying it with the code at the manifest's versions rebuilds every cell's full event store deterministically (`craftabot replay`, WP190). A reader without the Sparks, or without the gitignored store, can therefore read any decision's derivation. The ignored original is the audit copy: `craftabot recording verify` compares a regenerated store against it and against the path digests.

### 4.2 The tap

A provider wrapper at the `providerFor` seam, given the cell's identity (§4.3) and the role through the context, which gains `cellKey`, `trial`, `role` and `stage` (additive, in `evals`). It writes each call to the cell's call list as it happens, flushes the cell at the cell boundary (so a crash keeps every finished cell; `--resume` already skips what `cells.jsonl` holds), and records:

- a successful call: request digest, response (with `raw` removed from the **written entry only**; the session receives the provider's response untouched), latency, the unit (`transport` already knows which unit it used and reports it);
- a failed call: the error's kind and message, the latency to failure, and whether it was a timeout, so a replay can raise the same error and the session's own retry path runs as it did;
- a retry: each attempt is a call of its own.

It adds no event to the bus. Hard rule 3's catalogue change is nil, because every behaviour the tap records is already an event (`think.started`, `think.completed`, `error`, `provider.retried`, `prompt.composed`); what it adds is the layer beneath the events, the wire.

### 4.3 Cell identity

`cellKey` is the cell's inputs, not its position: campaign id, scenario, build, guard, brain, context, item id, seed, and `trial`. It is stable across a re-ordering of the cells and across the Worker's chunking, and it is the join between a recording, a replay and a `reperform`. A `trial` is a performance of the same inputs; `replicates` stays what it is, a different seed (a different case) per replicate. The two do not share a name in a design's file and a design may set both.

### 4.4 The path digest

A hash over the decision-relevant events of a cell in order — `prompt.composed` (the messages), `decision`, `action.performed` (name, arguments, ok), `guardrail.checked`/`tripped`, `approval.*`, `stage.*`, `seat.said`, `run.finished` (outcome) — with wall-clock fields (`timestamp`, `durationMs`) left out. Replay recomputes it. The recorder runs that check itself before it reports success (WP190): a recording that does not replay to its own digests fails at the record step, with the Sparks still up, not in CI weeks later.

### 4.5 Exact replay

`createCassetteProvider` is replaced for version 2 by a cell-scoped provider: it is handed the cell's `calls[]` and answers them in order, checking each request digest. A recorded error replays as that error. A mismatch raises `replay-diverged { cellKey, seq, expected, got }`, which the session writes as an `error` of that kind with the recorded and the asked prompts in the payload's detail; the cell's outcome is `ERROR` and the campaign report counts it separately from a model error. The version 1 provider stays, unchanged, for the cassettes already committed; their replays carry `replay: 'keyed-merged'` on the bundle (the place `112-…` D13 chose for replay provenance) and a story says so in its header. They are retired as WP195 replaces them.

### 4.6 Trials

`design.trials: k` (default 1, and at 1 every existing result is byte-identical; an identity test over the sixteen reference designs and the ten live ones holds it). Expansion repeats each cell `k` times with the same item, seed and build and a `trial` index. In replay, trial *t* replays trial *t*'s recorded calls. In a live recording, the trials of a design may be recorded in separate invocations (`craftabot record … --trial 0`, later `--trial 1`) into the same recording, so a design can be run overnight in passes and `k` raised later (to 3, D2) by appending a trial, not by redoing the first two. A design's `budget` is per recording and must be stated for `trials × cells`; `guardBudget` already refuses a design that would exceed it.

### 4.7 The reliability measures

In `@craftabot/metrics`, each with a known-answer fixture in the validation suite (`68-METRICS.md`), per item (the unit; a case, not a cell) over its `n` trials with `c` passes of the design's binary primary metric:

| Measure | Per item | Reads as |
| --- | --- | --- |
| **pass@1** | `c / n` | The expected rate for one performance |
| **pass@k** | `1 − C(n−c, k) / C(n, k)` (at `n = k`: `1` if `c ≥ 1`) | Capability: some performance succeeds |
| **pass^k** | `C(c, k) / C(n, k)` (at `n = k`: `1` if `c = n`) | Reliability: every performance succeeds. **The headline for a control** (D3): a control that holds some of the time is not a control |
| **Consistency** | `1` if all trials reach the same outcome | How often the bot repeats its verdict |
| **First-tick agreement** | Same call, and same words, at the first tick of two trials | The prompts are identical, so any difference is the model's own non-determinism, unamplified |
| **First divergence** | The tick at which two trials' calls first differ | How soon a journey forks |
| **Path distance** | Edit distance between two trials' action sequences | How far it forks |

Aggregates are over items. An interval is **clustered by item**: a Wilson interval on items for a per-item indicator, a seeded percentile bootstrap over items for a fraction, so that `k` trials do not inflate `n`. The analysis's verdicts (*inconclusive*, *untestable*, *not-supported*) read the clustered intervals. A report gains a **reliability pane** (per level: pass@1, pass@k, pass^k, consistency, first-tick agreement, first divergence) and the register's effect row reads pass^k beside the effect on the rate. Reliability is reported for binary primary metrics only; a continuous metric (tokens, seconds) is summarised by its spread across trials.

### 4.8 `reperform` and the determinism probe

**`craftabot reperform --recording <id> --trials k [--cells <filter>]`** reruns the recorded cells' inputs live, `k` times, and reports against the original: outcome agreement, decision agreement per stage, first divergence, path distance. It reconstructs a cell's inputs from the manifest's design and the `cellKey`, and refuses when the design's or a pack's digest has moved, unless `--allow-drift` is given and said in the output. Its results are written to `recordings/` (ignored) with a summary table that may be committed.

**`craftabot probe determinism --provider dgx-spark --prompts <n> --repeat <r>`** sends the same first-tick prompts from a recording `r` times to each unit and across the pair, in three arms: temperature 0 with no seed, temperature 0 with a fixed `seed`, and a stated temperature with a fixed `seed`. It reports same-text and same-call rates per arm, the character at which two answers first differ, and the length spread. It answers three questions the first recording could not: how much of the variance is the model's and how much is the journey's, whether the pair adds variance beyond one unit, and whether a request `seed` makes a live run repeatable. If it does, a trial's seed joins the manifest and a live `reperform` can match the recording exactly where batching allows; if it does not, that is recorded as a property of the serving stack. The transport gets a `pin` option to hold a probe to one unit.

## 5. The gaps

| ID | Gap | Closed by |
| --- | --- | --- |
| G166 | The live run's own store is deleted after recording; the transcript of how a live cell decided is in no artefact | WP189 |
| G167 | Failed and timed-out live calls are recorded nowhere, and neither is the unit that answered | WP189 |
| G168 | The cassette is prompt-keyed and merged first-answer-wins, so a cell replays a path it did not live: 34–47% of answers unused, 69 of 103 `ERROR` cells replay artefacts, and a headline finding rests on them | WP190 |
| G169 | A recording has no manifest (design digest, versions, sampling, units); the number of answers the merge dropped is not kept | WP189, WP190 |
| G170 | The recorder is not fully passive: `slim` changes what the session sees | WP189 |
| G171 | There is no way to run a cell `k` times: `replicates` varies the case, nothing measures pass@k or consistency, and cells that share a prompt share an answer | WP191 |
| G172 | The model's own non-determinism, and what the second unit adds, are unmeasured; whether a `seed` makes a live run repeatable is unknown | WP192 |
| G173 | Fraud, advice and complaints have desk faults that turn one model slip into a 30–60 turn loop | WP193 |
| G174 | The live evidence and `RUNS-AND-FINDINGS.md` rest on replay-derived outcomes | WP195 |

## 6. The phased plan — Phase AZ, WP189–WP195

| WP | What | Definition of done | Size |
| --- | --- | --- | --- |
| **WP189** | **The tap and the bundle** | The `providerFor` context gains `cellKey`/`trial`/`role`/`stage`; a passive tap in `harness` records every call (success, error, retry, unit) per cell and flushes at the cell boundary; `slim` applies to the written entry only; the live run's store is kept under `recordings/<id>/trial-<n>/` and `.gitignore` names `recordings/`; `live-record.mjs` stops deleting it; a manifest is written. Tests: a session with and without the tap has one trace digest; a recorded failure appears in the call list; the credential stop still ends a run at the cell boundary and writes nothing; `git check-ignore recordings/x` holds | M |
| **WP190** | **Exact replay** | Cassette format version 2 in `core` (`schemas/provider-cassette.ts`, `docs/schemas/` regenerated) with the version 1 reader kept; the cell-scoped provider and `replay-diverged`; the path digest; `craftabot replay` and `craftabot recording verify`; the record step's own replay check; `live-check.mjs` reading both versions and failing on any `replay-diverged`; a size budget for the committed cassettes. Tests: a mock-recorded design replays to its digests; a planted prompt change fails with both prompts shown; a recorded timeout replays as a timeout; version 1 cassettes replay as before and are labelled | L |
| **WP191** | **Trials and the reliability measures** | `design.trials` and the cell's `trial`; `--trial n` on `record`; `passAtK`, `passHatK`, `consistency`, `firstTickAgreement`, `firstDivergence`, `pathDistance` in `@craftabot/metrics` with known-answer fixtures in the validation suite; item-clustered intervals; the report's reliability pane and the register's pass^k beside the effect; `docs/metrics.md` regenerated. Tests: the identity test (every existing result byte-identical at `trials: 1`); a hand-computed `n = 3, c = 2` item for each measure; the clustered interval wider than the naive one on correlated trials | L |
| **WP192** | **`reperform` and the determinism probe** | `craftabot reperform` and `craftabot probe determinism`; the transport's `pin`; the probe's three arms; both write under `recordings/`. Tests: `reperform` of a mock recording agrees with itself, refuses on a moved design digest, and says `--allow-drift` when used; the probe over a scripted non-deterministic stub reports the rate it was built with | M |
| **WP193** | **The desk fixes** | The four fixes in §2 in `fs-fraud`, `fs-advice` and `fs-advice/complaints`, each with a test built from the failing call the triage found (`file-sar` with `"Alert 1"` now succeeds; `check-suitability` names `amount`; the register entry is on the complaints case file and the block message still does not name the cause; the `call` sense reports no connected call). Every pack's golden traces re-blessed in the same commit and the diff read | M |
| **WP194** | **Verification before the re-record** | The full suite green. A dry run of the whole recorder on the mock provider at `trials: 2`, replayed and verified. One live smoke on the Sparks (with the owner's go-ahead to switch them out of `puzzle` mode): the 34 real-failure items and eight controls, once each, to read whether the loops are gone; the probe's report. The three affected live designs marked *pending re-record* in `live-check.mjs` so the branch's CI stays green and says so | M |
| **WP195** | **The re-record, and the findings corrected** | **Not started until the pre-re-record findings (D11) are addressed and the owner has said so.** All ten live designs recorded at `trials: 2` in two passes (`--trial 0`, then `--trial 1`), about 7 hours of Spark time by the first recording's 3.5; each recording self-checked; every design's evidence regenerated (`docs/evidence/live/`, the register's live column, `timings.json`); `lending-stack-live-b` retired, its variance question answered from the trials; `RUNS-AND-FINDINGS.md` rewritten from the new results with the complaints finding re-stated and the error classes re-triaged; the manual's note; the Phase AZ exit review | L |

## 7. Order, dependencies and cost

```
WP189 ── WP190 ── WP191 ── WP192
                    │         │
WP193 ──────────────┴─────────┴── WP194 ── WP195
```

WP189 and WP190 are one change to the recorder and land together in review. WP191 needs WP190's cell identity. WP192 needs WP189's tap and WP191's measures. WP193 is independent of the recorder and may be built in parallel, but its prompts change the cassettes' digests, so the three affected designs fall out of CI replay until WP195 (named in WP194). WP194 gates WP195: the long recording starts only when every fix has a test and the smoke has been read.

| | |
| --- | --- |
| Spark time | about 7 hours for WP195 (3.5 hours per pass); about 20 minutes for WP194's smoke; about 30 minutes for the probe |
| Raising `k` to 3 later | one more pass (`--trial 2`), about 3.5 hours, appended to the same recordings |
| Local disk | the uncompressed live store was 7 MB (complaints), 34 MB (fraud) and 25 MB (advice) at `k = 1` from a replay that stopped early; budget about 0.5 GB for the ten designs at `k = 2`, ignored by git |
| Repository growth | the committed cassettes only, held by the size budget |

## 8. Decisions

Settled with the owner on 2026-10-07 (D11 added the same day, when the owner asked that the re-record wait on other findings).

- **D1 — Where the full transcripts live. The live run's store is gitignored, never committed** (`recordings/`). The committed cassette is the derivation base: it holds every call and its metadata and regenerates the transcript by replay. A transcript is therefore reproducible by anyone and the bulky original stays local.
- **D2 — How many trials. `k = 2` to start** (an immediate, coarse test of reliability). **Where a design adopts pass@k properly, `k = 3`.** Volume and wall time grow with `k`, so a third trial is an append, not a redo, and is chosen per design.
- **D3 — The reliability headline. pass^k is the primary figure for a control; pass@k is reported as capability.**
- **D4 — Order. The recorder and reliability work first (WP189–WP192), then every fix (WP193), then testing (WP194), then the re-record (WP195).** "Twice" is read as two trials per cell, recorded as two passes; if it was meant as two whole re-records at `k = 1`, WP195's passes are the same work with the trials taken as separate recordings, and nothing before it changes.
- **D5 — What a trial is. Same item, same seed, same build, fresh model draws; the world is identical across trials** (the world is deterministic, hard rule 5), so any difference is the model's or the journey's. `replicates` keeps meaning a new seed.
- **D6 — The old cassettes. They stay readable (version 1), labelled `keyed-merged` and indicative,** until WP195 replaces them. They are not reinterpreted as exact.
- **D7 — The one intervention. The credential stop stays** (hard rule 2: a leaked secret ends the run at the cell boundary and nothing is written). It is the only way the tap changes a run, and it is named in the manifest when it fires.
- **D8 — The desk fixes do not hand the bot the answer.** The complaints register is shown as a record on the case file, the way a handler would have it; the guard's block message still names no cause. A fix that made the guard an oracle would change what the experiment measures, and the redress finding would need re-stating for a different reason.
- **D9 — No loop limit in this plan.** `governance/no-progress` is not added to the live stacks: it would change the stack under test and turn `OUT_OF_STEPS` into another outcome. The turn budget stays. If loops persist after WP193 the question returns with the re-record's results.
- **D10 — Keys and infrastructure.** No key is needed. Switching the Sparks from `puzzle` mode to the `reasoning-pair` pattern changes the owner's infrastructure and is asked for at WP194, with the lease that restores it.
- **D11 — WP195 waits on the other findings.** A two-trial re-record is about 7 hours of Spark time, so every fault worth fixing before it is fixed first, including findings outside this phase. WP194 closes by proposing the list, drawn from `RUNS-AND-FINDINGS.md` §2–§6 and the triage (the persona openings that do not match the request, the `ERROR_RATES` assumption of 90% agreement that four desks contradict, the advice relational context's data-minimisation, fraud's token cost, and the rest the owner adds); the owner chooses what goes in; each item is fixed and tested; only then does WP195 start. Items that change prompts are done now, because they change the cassettes.

## 9. What "done" looks like

1. A live recording leaves, for every cell, the unaltered transcript of the live run (locally) and a committed cassette holding every call including failures, the unit, the manifest and the path digest.
2. Every live design replays in CI with no `cassette-miss` and no `replay-diverged`, and a replayed cell's path digest equals its recorded one. A prompt changed by a code edit fails with both prompts shown.
3. Nothing under `recordings/` is tracked, and a test says so.
4. The tap is passive: one session, with and without it, has one trace digest; `slim` touches only what is written.
5. Every existing result is byte-identical at `trials: 1`; the version 1 cassettes still replay.
6. All ten live designs recorded at `k = 2`, each with a reliability pane: pass@1, pass@2, pass^2, consistency, first-tick agreement, first divergence; intervals clustered by item.
7. The probe's report for both units and its three arms, and the answer to whether a `seed` makes a live run repeatable.
8. The four desk fixes, which cover the 34 real failures, each tested; the smoke's reading recorded whether or not the loops are gone.
9. `RUNS-AND-FINDINGS.md` regenerated from the new recordings, the complaints redress finding re-stated, the error classes re-triaged with the new data.
10. The docs say it: `103-…` §3 (the cassette) and `112-…` §11 amended with dated notes, `02-AGENT-MODEL.md` unchanged (no new event), the manual's note, `CLAUDE.md`'s chain and table.

## 10. Out of scope, said so it is not implied

- A frontier-model comparison brain (`112-…` D8) and the hosted keys (Phase AS): untouched.
- The Workshop recording or replaying live cassettes in the browser (`112-…` D7, D10): the format is the harness's; the Worker reading version 2 is a later change.
- Raising the live designs' sizes. They are recorded at their present sizes; a larger size is a separate decision on volume.
- Temperature as a reported design axis. The probe measures what temperature does to repetition; whether a design sweeps it is decided after the probe.
- Correcting the six other live designs' findings by hand. They are regenerated from the new recordings, not patched.

## 11. Work-package notes

_Empty until the build starts. Each WP appends a dated note here, as `112-…` §11 does, with what it built, what diverged and what it found._

> **WP189 — 2026-10-07 (the tap and the bundle).** Built on `phase-az`; needs no key. `recordingProvider` is now the tap: `slim` drops `raw` from the **entry written only** (the session sees the provider's response whole), `onCall` is told every call — a failed one with its kind, message and retry hint — and the error is rethrown unchanged; `RecordingTape`/`CellTape` in `core` number a cell's calls across roles and count which time each stage's provider was made (`segment`). `ChatOptions.onServed` (additive, ignored by every provider but one) lets the Spark provider say which unit answered; `unitKeyOf` is exported from the transport. Format version 2 is in `core` (`providerRecordingFileSchema`, `kind: 'provider-recording'`, `parseAnyProviderCassette`, `cellKeyOf`; `docs/schemas/craftabot-provider-recording.schema.json`). `evals` hands `providerFor` a `ProviderContext` (`cellKey`, `trial`, `role`, beside `goalCardId`) at all five provider sites, and `CampaignCellSpec` gains `trial`. `craftabot record` writes the v2 recording **beside** the v1 cassette (`<id>.recording.json`) with a manifest (design digests, pack versions, models, samplings, units, the credential stop if it fired); the v1 merge is untouched, so every committed replay still passes, and WP190 switches replay to v2. `recordings/` is gitignored (a test asserts it) and `live-record.mjs` records into `recordings/<id>/trial-0/` and refuses to overwrite it, so the live run's store is kept. The synthetic sweep covers `*.recording.json`. **Diverged:** §4.1 said responses are stored once by hash; nothing repeats a response, so the saving would be nil and it is dropped. The `pathDigest` field exists on the cell and is filled by WP190. A duo cell's seat (`counterpart`, no cassette of its own) is still not recorded, as before. **Found:** the recorder's old `slim` altered what the session saw (the test asserted it); that test now asserts the opposite.

> **WP190 — 2026-10-07 (exact replay).** Built on `phase-az`; needs no key. `craftabot record` now writes **only** the cell-scoped recording (format version 2) at the brain's cassette path; the merged, first-answer-wins cassette is no longer written, and the version 1 reader and `createCassetteProvider` stay for the ten committed cassettes (`live-check.mjs` reproduces all ten exactly). `core/recording-replay.ts`: `createRecordingReplay` hands each cell a cursor over *its own* calls, answered in order and held to each prompt's digest — a different prompt is `ReplayDiverged` (`kind: 'replay-diverged'`, the cell, the call's position, both digests and the last message asked), a call recorded as an error replays as that error (`RecordedProviderError`, with its kind and retry hint, so the session\'s own retry path runs as it did), and the replay says how many recorded calls it never asked for. `pathDigestOf` digests a cell\'s decision-relevant events (prompts, decisions, actions, guard verdicts, approvals, seat lines, stages, errors, the outcome) over the events as a store reads them back (`12-…` D21), with timestamps, `durationMs`/`latencyMs` and the wire's `raw` left out; for a journey it covers every agent run and the workflow\'s own events and stage digest. `evals` holds a per-cell `CellScope`, writes `CampaignCell.replay` (`match` / `mismatch` / `diverged` / `unrecorded`, `unused`, `divergedAt`) only for a cell replayed from a version 2 recording — so no existing report changes — and tells `onPathDigest` each live cell\'s digest, run ids and workflow run id, which the recorder files beside the cell\'s calls. `craftabot recording verify --recording … --file … [--live-store <dir>]` replays the design from the recording alone and names every cell diverged, off its path, unrecorded, missing or with calls left unasked, and with `--live-store` re-digests each cell\'s runs read back from the live run\'s own store; `live-record.mjs` stops before writing any evidence if its recording does not verify, and `live-check.mjs` fails on any replay that is not a `match` (`PENDING_RE_RECORD` lists a design a desk fix has changed on purpose). **Found, and fixed here:** a journey cell\'s `onTrace` carries only its **last** agent run, and nothing stored the earlier stages\' runs or the workflow run, so even the live run\'s own store held a fraction of a fraud journey; the harness now keeps every agent run and the workflow run (`onWorkflowRun`). Run ids repeat across the campaigns of one design, so a store is read per campaign. **Left for later WPs:** `live-column.mjs` reads version 1 `entries` and must read version 2 (WP195, with the variance section replaced by trials); the Worker still reads version 1 only and says so; `trial` is written as 0 until WP191.
