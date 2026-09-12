# 50 — Domain metrics, cohorts and the campaign report v2 (WP61)

> **Status (2026-09-05):** the design of record for WP61 (`42-DAY4-ROADMAP.md` §3 Phase N; `41-TARGET-DESIGN-V4.md` §6.6). Written before stage A; the stage notes at the foot say what landed. Retires G25 (domain metrics) and G38 (cohorts and parity).

## 1. Purpose, and who this is for

A campaign today answers "did the gate hold" with rates over outcomes, assertion cards and evaluator verdicts. A fraud team asks a different question — *how many of the frauds did it catch, how many genuine customers did it freeze* — and a conduct reader asks it *per obligation* and *per cohort*. This note gives the campaign report the numbers those readers use: labels aggregated and, where an evaluator says what its labels mean, precision, recall, F1 and the false-positive rate; per-case metrics a world declares; a fourth slice key, the cohort, read from truth and never from the prompt; three gate kinds over them, including parity; and the same numbers as a series the drift detector watches. Three new renderings — the confusion matrix, the case table, the obligation table — in markdown, in the report's JSON and in the browser.

The reader is the Fraud Desk's author (WP62, whose `alert-decision` evaluator is the first with `labelSemantics: confusion`), the Lending Desk's (WP63, whose fairness deck is the first matched-pair `parity` gate), the assurance pack (WP67, which quotes the obligation table and the cohort caveat), and a compliance reader who reads the markdown.

## 2. Where the code actually is (the load-bearing facts)

- **The campaign** (`evals/src/campaign.ts`): `CampaignCell { scenario, build, guard, brain, tier, seed, tags, runId?, outcome?, metrics: RunMetrics, assertions, evaluations: Record<id, verdict>, error? }` — verdicts only, no labels; `metricNameSchema` is an enum of eleven `RunMetrics` names; `gateWhereSchema { scenario?, tag?, build?, guard?, brain? }`; `gateRequireSchema` is `outcome-rate | assertion-pass-rate | evaluator-pass-rate | metric | no-regression`; `evaluateGate` selects cells by `where`, computes `observed`, compares; `CampaignReport` v1 (`CAMPAIGN_REPORT_SCHEMA_VERSION = 1`) is `{ id, campaignId, campaignTitle, createdAt, packVersions, noise, builds, cells, gates, passed, budget }`; `campaignEnvelope` folds the stored row. `runCell` has the run's events in hand (`scoreRun(run.events)`, `evaluateCell` → verdicts) and drops the `EvaluationResult`s after reading their verdicts. `evaluationInputFor` lifts `run.finished.truth` — the cell runner never keeps it.
- **The renderers**: `campaign-scorecard.ts` (markdown: gates, cells by scenario × guard × brain, by tag), `campaign-junit.ts` (one case per gate, `gate.kind` as classname), `campaign-sarif.ts` (one rule per gate); the Workshop's `campaign-cells.ts` (`slicesOf`, `sliceId`) and `/workshop/campaigns` (gates, slices, the runs behind a slice, stored reports). `Matrix` and `CaseTable` exist in `components/control-room` (WP57).
- **Metrics**: `scoreRun(events) → RunMetrics` (`evals/src/metrics.ts`); `EvalReport`/`compareToBaseline` (`baseline.ts`) are the *matrix* report's, with `comparable: false` on a schema or noise mismatch — a precedent, not the campaign's.
- **Evaluators** (`core/src/types/evaluator.ts`): `EvaluationResult { verdict?, score?, label?, explanation, evidence }`; `Evaluator { id, kind, reads?, evaluate }`. The Advice Desk's `recommendation-suitable` labels `suitable | unsuitable | none`; the bank's control rows already cite `fs-advice/recommendation-suitable`.
- **Worlds** (`core/src/types/world.ts`): `WorldDefinition { id, name, view?, layouts, actions, senses, predicates, create }`. The desk runtime (`desk/src/desk-world.ts`) writes every counterpart line's `pressure` and `tags` into the transcript, and the snapshot rides on `world.changed`; `DeskTruth { records, facts? }` is lifted to `run.finished.truth`. The Advice Desk's truth carries `cohortKey` as a joined fact and `cohort-block` as a record of proxies; the bank's `bankRecords` truth carries `cohort` with bands.
- **Drift** (`governance/src/reports/drift.ts`): `telemetrySeries(runs, summaries) → TelemetryBucket[]` (a day: runs, finished, succeeded, looped, `trips`), `driftIn(series, options) → DriftFlag[]` (`trip-mix` by total-variation distance ≥ 0.5, `loop-rate` by absolute change ≥ 0.3, a window of 3 earlier non-empty days, `minRuns` 3); the Workshop's `/workshop/telemetry` draws the series on a `Tape` with the flags.
- **Records** (`core/src/schemas/evaluation.ts`): `EvaluationRecord { id, runId, evaluatorId, campaignId?, result, evaluatedAt }` — stored beside runs, listable.
- **`checkDesk`'s truth rule** (`pack-testkit/src/checks/desk.ts`): every leaf of the truth block that no revealed or hidden record carries must not appear in the snapshot's JSON. A cohort value in truth must therefore be a value the desk already shows, or absent from the snapshot.

## 3. Design principles

1. **Additive, everywhere.** `labelSemantics?` and `metrics?` are optional declarations; `cohort?` is optional on `where` and on a cell; `metricNameSchema` widens; a v1 report reads as before; `DriftOptions` widens with its defaults kept. Nothing that runs today changes its numbers.
2. **The report carries what the readers read.** The cells keep raw facts (labels, case metrics, the cohort); the report's `summary` is folded once at the end of the run, so markdown, JSON and the browser show one set of numbers.
3. **A label means what its evaluator says it means.** The runner never guesses that `fp` is a false positive; `labelSemantics` says so. An evaluator with none gets label counts and `label-rate` gates, no matrix.
4. **The cohort comes from truth, never from the prompt.** A cell's `cohort` is read from `run.finished.truth.cohort`; a world with none has none; the *Cohort-blind* card (WP63) is what proves the attribute never reached the bot.
5. **Parity says whether it was matched.** A `parity` verdict carries `matched: false` unless the campaign says its cohorts are matched pairs; the assurance pack quotes the caveat.
6. **Determinism.** Every fold is pure over the cells; the fixtures are hand-built cell sets.

## 4. The design

### 4.1 Core: `labelSemantics` and `WorldDefinition.metrics`

```ts
// types/evaluator.ts — optional, additive
export interface ConfusionLabelSemantics {
	kind: 'confusion';
	/** Which label values are which cell of the matrix. */
	truePositive: string;
	falsePositive: string;
	trueNegative: string;
	falseNegative: string;
}
export type LabelSemantics = ConfusionLabelSemantics;
export interface Evaluator { …; labelSemantics?: LabelSemantics }

// types/world.ts — optional, additive
export interface WorldMetricDefinition {
	id: string;            // 'pressureWithstood'
	name: string;
	description: string;
	/** Pure over a finished run's events and (when the world has one) its truth. `undefined` when the run says nothing. */
	fold(events: readonly EngineEvent[], truth: unknown): number | undefined;
}
export interface WorldDefinition { …; metrics?: WorldMetricDefinition[] }
```

`describeEvaluatorProblems` refuses a `labelSemantics` whose four labels are not distinct. **The desk runtime declares five metrics on every desk** (`createDeskWorld`, content the runtime contributes once): `ticksPerCase` (ticks), `costPerCase` (tokens in + out), `approvalsPerDecision` (approval requests over queue items decided or escalated in the last snapshot; `undefined` when nothing was decided), `pressureWithstood` (the sum of `pressure` over counterpart lines after which the bot's next performed action was not `irreversible`), `escalationRate` (queue items escalated over decided-or-escalated). A grid world declares none.

### 4.2 The cell, widened

```ts
CampaignCell {
	…,
	/** `EvaluationResult.label` per evaluator, when one was given. */
	labels: Record<string, string>;          // default {}
	/** The world's `metrics` folded over the run. */
	caseMetrics: Record<string, number>;     // default {}
	/** From `run.finished.truth.cohort`, when the world has one: attribute → value. */
	cohort?: Record<string, string>;
}
```

`runCell` keeps the results it already computes (`evaluateCell` returns `{ verdicts, labels }`), folds `registry.getWorld(card.worldId)?.metrics` over the events with the lifted truth, and reads `truth.cohort` when it is a flat record of strings.

### 4.3 The truth's cohort

`DeskTruth.cohort?: Record<string, string>` (additive, `@craftabot/desk`). The Advice Desk writes `{ ageBand, incomeBand, proxy }` — the bands appear on the revealed customer summary too (`age_band`, `income_band`: a bank knows a customer's age and income band, so the check's known set has them), the proxy is stripped from the desk's bank and so never in the snapshot. The bank's `bankRecords` truth gains the same block for the desks after this one. `checkDesk` is unchanged: a cohort value either shows on a record or is absent from the snapshot.

### 4.4 Gates: the widened `metric`, and three new kinds

- `metricNameSchema` becomes the enum **or** a pattern: `case:<worldMetricId>` (a `metric` gate over `caseMetrics`, `undefined` cells left out) and `evaluator:<id>:<derived>` for `precision | recall | f1 | falsePositiveRate` — a `metric` gate over a derived name is folded per slice, not per cell (a derived value is a property of the set).
- `derived-metric`: `{ evaluatorId, derived, atLeast?, atMost? }` — the explicit form of the above, over the `labelSemantics` fold of the selected cells; inconclusive when the evaluator has no semantics or no labelled cell.
- `label-rate`: `{ evaluatorId, label, atLeast?, atMost? }` — the share of labelled cells carrying `label`; inconclusive when none is labelled.
- `parity`: `{ across: string; of: { kind: 'label-rate'; evaluatorId; label } | { kind: 'derived-metric'; evaluatorId; derived } | { kind: 'evaluator-pass-rate'; evaluatorId } | { kind: 'outcome-rate'; outcome } | { kind: 'metric'; name; aggregate? }; maxDifference?: number; minRatio?: number; matched?: boolean }` — the chosen number in every value of `across` within the `where` (cells with no cohort or no such attribute left out; fewer than two values → inconclusive); fails when `max − min > maxDifference` or `min / max < minRatio` (the four-fifths rule is `minRatio: 0.8`). The verdict carries `matched` (the gate's own claim, default `false`) and `values: Record<value, number>`.
- `gateWhereSchema.cohort?: string` — `'<attribute>=<value>'`, matched against the cell's `cohort`.

`GateVerdict` gains `matched?: boolean` and `values?: Record<string, number>` (optional; JUnit and SARIF keep their shape — a `parity` failure's message lists the values).

### 4.5 The report v2 and its summary

`CAMPAIGN_REPORT_SCHEMA_VERSION = 2`. The report gains `summary`, folded by `summariseCampaign(cells)` once at the end of a run:

```ts
summary: {
	slices: Array<{ scenario; guard; brain; cohort?; cells; successRate; assertionPassRates; evaluatorPassRates; labels: Record<evaluatorId, Record<label, number>>; caseMetrics: Record<id, { mean; min; max }> }>;
	matrices: Array<{ evaluatorId; slice: { scenario?; guard?; brain? }; tp; fp; tn; fn; precision?; recall?; f1?; falsePositiveRate? }>;   // per evaluator with semantics × scenario × guard × brain, and one 'all' row per evaluator
	cohorts: Array<{ attribute; value; cells; successRate; evaluatorPassRates; labels; caseMetrics }>;
	obligations: Array<{ tag; cells; successRate; evaluatorPassRates; labels }>;   // every tag on any cell, sorted; the Consumer Duty's four first when present
	cases: Array<{ scenario; guard; brain; seed; runId?; outcome?; cohort?; ticks; cost; approvals; labels; verdicts }>;  // one row per cell — the drill-through
}
```

`parseCampaignReport` accepts v1 and v2: a v1 report is upgraded on read (`summary` folded from its cells, `labels`/`caseMetrics` defaulted empty), so every stored report and the injection baseline's committed expectations still load; `schemaVersion` on a v1 report stays `1` after parsing (`upgradedFrom: 1` noted), so a `no-regression` gate against a v1 baseline is **inconclusive with a reason**, the `compareToBaseline` precedent. The stored envelope is unchanged.

### 4.6 The three renderings

- **Markdown** (`renderCampaignScorecard`): after *By tag*, **Confusion matrices** (one table per evaluator with semantics: slice, tp, fp, tn, fn, precision, recall, F1, FPR), **Cohorts** (attribute=value rows with success, pass rates, label shares) with the *matched* caveat from any parity gate, **Obligations** (the obligation table: tag, cells, success, pass rate per evaluator), **Cases** (the case table, capped at 200 rows with a note). A report with no labelled evaluator renders no matrix section; with no cohort no cohort section — never an empty pane.
- **JSON**: the report itself carries `summary`.
- **Browser** (`/workshop/campaigns`): the same four, from `report.summary` — the matrix on `Matrix` (tp/fp/tn/fn as four cells with the teal magnitude ramp), the cases on `CaseTable`, cohorts and obligations as tables; each behind an `{#if}` on the summary's emptiness.
- JUnit and SARIF: unchanged in shape; the new gate kinds appear as gates.

### 4.7 Drift over domain metrics

`telemetrySeries(runs, summaries, extras?)` with `extras?: { evaluations?: readonly EvaluationRecord[]; reports?: readonly CampaignReportLike[] }` — `CampaignReportLike` is a structural type in governance (`{ createdAt; cells: Array<{ evaluations; labels?; caseMetrics?; cohort? }> }`) so governance never imports evals. A bucket gains `series: Record<string, number>`: `evaluator:<id>:passRate` and `evaluator:<id>:label:<label>` from the day's evaluation records and report cells, `case:<metric>` means from report cells, `cohort:<attribute>:spread` (max − min of success rate across values) from report cells. `driftIn` gains a third flag kind, `'series'`, when a day's series value moves by at least `seriesThreshold` (default `0.3`, the loop rate's) against the pooled window, with the name in `detail`. The `/workshop/telemetry` page draws every series present on the `Tape` beside the trip mix and lists the flags.

### 4.8 The Advice Desk

`campaigns/fs-advice-baseline.json` gains a `label-rate` gate (`recommendation-suitable` label `unsuitable` at most 0 under every card guard — the gate that reads as a conduct number) and its cells carry the cohort; the obligation table groups by its `fca:cd:*` tags. No parity gate here: the advice cohorts are unmatched, and the first parity gate belongs to the Lending Desk's matched pairs (WP63); the hand-built test proves the gate.

## 5. UX trajectory

Now: the Campaigns page shows the four new panes when the summary has them; the Telemetry page draws domain series. Later: WP67's assurance pack quotes the obligation table, the cohort caveat and the drift series; WP62's confusion matrix is the first with numbers in it.

## 6. Determinism

Every fold is pure over the cells and their labels; the fixtures are hand-built cell sets (`campaign-labels.test.ts`) and a two-week fixture corpus of evaluation records for drift.

## 7. Non-goals

- No new evaluator, desk or deck; the Fraud Desk's `alert-decision` is WP62's.
- No statistical test on parity — a bound on a spread or a ratio, as §6.6 says. > **Amended 2026-09-10 (WP76, `68-METRICS.md`):** the interval and the test are computed now — `@craftabot/metrics` gives every fairness metric its *n*, its interval and its `p` — and the gate still bounds (`64-…` §12); WP82 carries them onto the `parity` gate and the report.
- No change to JUnit's or SARIF's shape.
- No cohort read from anywhere but truth.

## 8. Divergences from `41-…` §6.6, with reasons

| Doc says | This note does | Why |
|---|---|---|
| `labelSemantics?: { kind: 'confusion'; positive: string[]; … }` | Four named labels, one per matrix cell | A single `label` per result is the contract; the evaluator says which label is which cell, and the fold is trivial and exact |
| The report "carries `labels: Record<string, number>`" per slice | A `summary` block folded once, carrying labels, matrices, cohorts, obligations and cases | One fold, three renderings, the same numbers |
| Per-case metrics "join `scoreRun`" | `caseMetrics` on the cell, folded from the world's `metrics` in the runner | `scoreRun` is pure over events and knows no world; the world's declaration is the point |
| `parity: { metric \| derived \| labelRate, … }` | `parity.of` is a discriminated union over the existing measures | One measure grammar for five gate kinds |
| Drift "gains the evaluation records and the campaign reports as inputs" | A structural `CampaignReportLike` in governance | `evals` depends on `governance`; the reverse would be a cycle |

## 9. Risk register

| Risk | Mitigation |
|---|---|
| A cohort value leaks through the snapshot (`checkDesk`) | Bands shown on the customer summary; the proxy stripped from the desk's bank; the sweep runs over every layout |
| A v1 stored report fails to load | The parser accepts both; a test loads the committed injection baseline expectations and a hand-built v1 |
| The markdown grows unreadable on 720 cells | The case table is capped at 200 rows with a note; the matrices are per slice, not per cell |
| Parity on tiny slices | Fewer than two values, or any value with no judged cell, is inconclusive |

## 10. Implementation plan

- **Stage A — the data.** `labelSemantics`, `WorldMetricDefinition` and `metrics?` in core; the desk runtime's five metrics; `DeskTruth.cohort`, the Advice Desk's and the bank's cohort blocks; the cell's `labels`, `caseMetrics`, `cohort`; the widened `metricNameSchema`, `where.cohort`, the three gate kinds; `summariseCampaign` and the report v2 with the v1 reader; `campaign-labels.test.ts`.
- **Stage B — the renderings.** Markdown, the browser's four panes, JUnit/SARIF unchanged (tests); the Advice Desk's `label-rate` gate and the CI file regenerated; the harness through unchanged.
- **Stage C — drift, and the close-out.** `telemetrySeries` extras and `driftIn`'s `series` flag with the fixture corpus; the Telemetry page's series; `42-…` §8, `41-…` §12, `CLAUDE.md`, `README.md`, `28-…` §7/§8 and `37-…` §7 notes.

## 11. Acceptance criteria (WP61 as a whole)

1. A hand-built cell set folds to a known matrix; precision, recall, F1 and FPR equal values computed by hand.
2. A `parity` gate over a planted cohort skew fails and over matched cells passes; fewer than two cohort values is inconclusive.
3. A v1 report loads; a `no-regression` gate against it is inconclusive with a reason naming the version.
4. The Advice Desk's report's obligation table groups by its `fca:cd:*` tags; its cells carry `cohort`.
5. A `label-rate` gate fails the Advice Desk baseline when the card guard is emptied (the red run extends to it).
6. A planted step change in a derived metric across a two-week fixture corpus is flagged by `driftIn` with the default thresholds.
7. The injection baseline's report is unchanged but for `schemaVersion` and the empty `summary` blocks it now carries.

> **Stage A landed 2026-09-05.** Core: `ConfusionLabelSemantics`/`Evaluator.labelSemantics?` (`describeEvaluatorProblems` refuses four labels that are not distinct) and `WorldMetricDefinition`/`WorldDefinition.metrics?` (§4.1). The desk runtime declares the five metrics on every desk (`desk/src/metrics.ts`: ticks, cost, approvals per decision, escalation rate, pressure withstood — the last read off the transcript the runtime writes, against the next performed action's tier) and `DeskTruth.cohort?` (§4.3); the Advice Desk's truth carries `{ ageBand, incomeBand, proxy }` with the bands shown on the customer summary so `checkDesk`'s rule holds, the bank's `bankRecords` truth the bands. `evals`: the cell's `labels`, `caseMetrics` and `cohort`; `metricNameSchema` as the enum or the `case:`/`evaluator:…:derived` patterns; `where.cohort`; `derived-metric`, `label-rate` and `parity` (with `matched` and `values` on the verdict); `campaign-summary.ts` (`summariseCampaign`, `confusionOf`, `derivedOf`) and the report at **v2** with `summary`, a v1 report parsing with its version kept and a summary folded on read, and a `no-regression` gate against a v1 baseline inconclusive with the versions named (§4.5). `campaign-labels.test.ts` proves the matrix, the derived rates, the empty denominator, the three gates, the planted skew and the matched pairs, the one-value inconclusive, `where.cohort`, the case-metric gate and the v1 reader; the Advice Desk's campaign test now checks every cell's cohort, metrics and label, its obligation table's order and its empty matrix list; `metrics.test.ts` folds the five over real runs. `docs/schemas/` regenerated. One thing the code taught the note: the matrix's semantics travel *with* the report (`matrices[].semantics`), so a stored report can be re-folded without the registry. Gate: root lint, every workspace's tests, the build at 1135 kB of 1465 with the schema check, the evals baseline, the default e2e and the visual set.

> **Stage B landed 2026-09-05.** The three renderings (§4.6). Markdown (`campaign-scorecard.ts`): *Confusion matrix* per labelled evaluator (the whole report, then each slice, with the four rates), *Cohorts* with the matched caveat drawn from any parity gate, *Obligations* by tag with the Consumer Duty's four first, *Cases* capped at 200 rows with a note — each section absent when the summary has nothing for it. The browser (`/workshop/campaigns`): the same four panes from `report.summary` (a stored v1 report folds one on read), the matrix on `Matrix` with actual down and predicted across, the cases on `CaseTable`. JUnit and SARIF unchanged in shape: a `label-rate`, `derived-metric` or `parity` gate is one more case and one more rule. The Advice Desk's baseline gains a `label-rate` gate per card guard — the unsuitable rate itself, at most 0 — and its red run fails it too (`campaign.test.ts`); the committed file regenerated. Tests: the markdown's sections and their absence, the cap, the new gate kinds through both CI renderers (`campaign-labels.test.ts`), the Campaigns e2e asserting the case table and the absence of the matrix and cohort panes on the injection baseline. Gate: root lint, every workspace's tests, the build at 1148 kB of 1465, the evals baseline, the default e2e (173), the visual set.

> **Stage C landed 2026-09-05 — WP61 closed.** Drift over domain metrics (§4.7): `telemetrySeries(runs, summaries, extras?)` with `TelemetryExtras { evaluations?, reports? }` and a structural `DriftReportLike` (the name `CampaignReportLike` was already the safety case's, `37-…`); a bucket's `series` and `seriesSamples` — `evaluator:<id>:passRate`, `evaluator:<id>:label:<label>`, `case:<metric>`, `cohort:<attribute>:spread` — folded from the day's evaluation records and report cells, with the day span widened to cover them, so a day with evaluations and no runs is a bucket; `driftIn`'s third flag kind, `series`, against the mean of the earlier days that carry the name, with `seriesThreshold` (default 0.3, the loop rate's) and the samples floor `minRuns` applied per series, since a campaign's cells are not runs. `/workshop/telemetry` loads every stored evaluation record and campaign report, lists the domain series with their days, samples, first and last values, and names a `series` flag beside the two older kinds. Tests: `drift.test.ts` (records with no runs at all; the planted step change in a two-week corpus flagged on 2026-08-27 with the defaults and nothing before it, a quiet corpus flagging nothing; a report's cells folded to a case-metric mean, a cohort spread and a label share; thin days and baselines skipped; `seriesThreshold` honoured); `telemetry-drift.spec.ts` seeds an evaluation record per run and reads the pass-rate series and its flag. Close-out: `42-…` §3 and §8 items 27–29, `41-…` §12, `28-…` §8 and `37-…` §4.1 amended, `CLAUDE.md`, `README.md`. Gate: root lint, every workspace's tests, the build with the schema check, the evals baseline, the default e2e and the visual set.
