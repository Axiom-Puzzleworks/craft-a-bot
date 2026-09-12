# 74 — The gates and report v3 (WP82)

> **Status:** design of record for WP82 (`65-DAY5-ROADMAP.md` Phase S), opened and closed 2026-09-11 on the `day5` branch after WP81. No stage A note was planned for WP82 (an M-sized work package); this is the record written as the work was done.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.4.4 (retires G47 in part): `parity` gates that name a fairness metric from `@craftabot/metrics` and carry its interval, *n* and power; a `drift` gate against a reference window; the report's `fairness` and `drift` panes; `CAMPAIGN_REPORT_SCHEMA_VERSION = 3` with the v2 reader.

---

## 1. Where the code is

1. **`@craftabot/metrics`** (`68-METRICS.md`) has the nine fairness metrics over `DecidedCase { group, decision, verdict?, repaid?, stratum?, pairId? }`, each returning a value with its Wilson or Newcombe interval, *n* per group, `underpowered` under a floor of thirty, and a test's *p* where one applies; and the drift metrics — `psiCategorical`/`psiNumeric`, `ksDrift`, `outcomeMixDistance`, `agreementDrift`, `fairnessDrift`.
2. **A `parity` gate** (WP61) compared the spread of an `of` rate across a cohort attribute; its verdict carried `matched` and the per-cohort `values`.
3. **A cell** carries its `cohort` from truth (WP61), its `item` and `workflow` (WP80), its `context` (WP81) — but not its decision.
4. **The report** was v2 (WP61) with a v1 reader; `no-regression` refuses a baseline of another version.

## 2. What changed

- **A cell's decision.** `cell.decision?: { outcome: approve | decline | refer; verdict?; repaid? }` — the last `decide` performed with an `outcome` and `truth.facts.verdict` (`should-x` → `x`), `repaid` from `defaultedWithin12m` where a book's truth carries it. Written by every cell path; absent on a desk that decides nothing.
- **`parity` with a metric.** `metric?`, `stratify?`, `confidence?` (0.95), `power?` (`reported`; `required` makes an underpowered metric inconclusive). With a metric the gate folds the selected cells into `DecidedCase`s by `across` and calls `fairnessMetric`; `maxDifference` bounds a difference metric, `minRatio` bounds `disparate-impact`. The verdict carries `observed`, `interval`, `n`, `p`, `method`, `underpowered`, `values` (the per-group rates) and, when inconclusive, `reason`. `of` is optional when a metric is named (a refine on the gate). `counterfactual-flip` is inconclusive with a reason: it needs a flipped run per case, the Run Lab's fork. Without a metric the gate is exactly WP61's, plus `n`.
- **The `drift` gate.** `{ kind: 'drift'; feature?; metric: psi | ks | outcome-mix | agreement | fairness; reference: { kind: 'fixed', reportId? } | { kind: 'rolling', days } | { kind: 'population', digest? }; atMost }`. `fixed` compares the selected cells with the baseline report's cells under the same `where`; `population` compares them with the book's items' truth (a book campaign's, handed to the gates by the runner) — the verdict mix, the cohort attributes; `rolling` is inconclusive with a reason (a campaign is one point; the Monitor reads a series). `psi` takes a cohort attribute (categorical) or a case metric (numeric, against the baseline); `ks` a case metric against the baseline; `outcome-mix` the decisions; `agreement` P(decision = verdict); `fairness` a metric named as the `feature`, across `ageBand`, against the baseline. Every inconclusive verdict says why.
- **The summary's panes.** `summary.fairness[]` — one row per `parity` verdict with a metric: gate, metric, across, stratify, value, interval, n, underpowered, passed, inconclusive, slice; `summary.drift[]` — one row per `drift` verdict: gate, metric, feature, reference, value, bound, flagged, reason. Read off the verdicts (`fairnessRowsOf`, `driftRowsOf`), so the merge's recomputed gates make the same rows.
- **The report v3.** `CAMPAIGN_REPORT_SCHEMA_VERSION = 3`; the schema admits 1, 2 and 3; an earlier report keeps its version on read (WP61's rule: another schema is another instrument, so a `no-regression` gate against it says so) and reads with `fairness` and `drift` empty — the schema defaults them — and the scorecard and the Campaigns screen say why the panes are empty.
- **The renderings.** The scorecard gains *Fairness* and *Drift* sections; JUnit and SARIF are unchanged in shape (a gate is a testcase or a result whatever its statistics). The Campaigns screen gains a Fairness pane — the value on a `Meter` with the interval as a range band (a `Meter` gains `range?`), the verdict and the power as `Lamp`s — and a Drift table; a gate's own meter draws its interval when the verdict carries one.

## 3. Tests

- `evals/src/gates-v3.test.ts`: the parity metric's interval, *n* and method; twelve cells inconclusive under `power: 'required'` and twelve hundred a verdict; `disparate-impact` under the four-fifths rule; a stratified metric; the flip refused; the drift gate against a fixed baseline for `outcome-mix`, `agreement`, `psi` and `fairness`, and every reason it gives; a v2 report reading as v3 with the panes empty; the rows off the verdicts; JUnit and SARIF unchanged.
- `fs-lending/src/book-campaign.test.ts`: over the lending book — twelve cells inconclusive, twelve hundred a verdict; a `drift` gate over the `population` reference passing `rules-only` (distance 0: the rule's decisions are the book's verdicts) and failing a build whose knobs approve everything.
- The lending baseline's two parity gates keep their verdicts (`campaign.test.ts`, unchanged).

## 4. Divergences from `64-…` §6.4.4

- An earlier report is not rewritten to v3 on read (the design said "loads as v3"): it keeps its version so WP61's version rule holds, and reads with the v3 panes empty — the effect the design wanted, without a report claiming a version it was never written at.
- The `fairness` drift metric names its metric as the gate's `feature` and compares across `ageBand`; a campaign-level `across` for drift is a WP89 question.
- `driftIn` (`governance/reports/drift.ts`) keeps WP76's signature: the `psi:<feature>` series and the new flag kinds want a series of reports, which the Monitor (WP84) is the first to have; noted in `68-…`.
- The Campaigns screen's visual baseline did not move: the fixture report carries no metric verdict, so the new panes do not appear in the screenshot.
