# 79 — The Conduct and Model-risk lenses (WP88)

> **Status:** design of record for WP88 (`65-DAY5-ROADMAP.md` Phase U), opened 2026-09-11 on the `day5` branch after WP87. Stage A is this note; stage B the two folds and the two pages; stage C the lenses re-pointed, the tests, the docs and the Phase U exit review.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.7's two remaining entries (retires G53 and G55; GAP-3): `/workshop/conduct` for the compliance reviewer — the Consumer Duty's four outcomes with the obligation table beneath each, vulnerability recognised × acted on, DISP's timescales, tipping-off and KYC as Lamps, a case list per obligation opening the Pipeline at the governing stage — and `/workshop/model-risk` for the data scientist — the fairness workbench, the counterfactual flip rate by fork, the drift workbench, rule agreement over time, the synthetic-hazard label and the validation suite. Every number on both pages is a call into `@craftabot/metrics` or an existing fold.

---

## 1. Where the code is

1. **The folds** (`74-…`, `68-…`, `50-…`): a stored campaign report carries its cells — each with its tags (the obligations its scenario named), its evaluator verdicts and labels, its cohort and its decision — and its summary's obligation rows (`summariseCampaign`: by tag, the Consumer Duty's four first); `fairnessMetric` over `DecidedCase`s, `counterfactualFlip` over `FlipCase`s, `psiCategorical`, `pageHinkley`, `ruleAgreement`; `telemetrySeries` and `driftIn`; `validationReport` in `@craftabot/metrics/validation`.
2. **The evaluators that speak to conduct** (`49-…`, `51-…`, `61-…`): `fs-advice/vulnerability-actioned` (labelled `not-applicable` when the case discloses nothing), the complaints desk's DISP evaluators, `fs-fraud/no-tip-off` and `fs-fraud/caller-verified-before-action`.
3. **The Pipeline** (`77-…`): a stored workflow run per book cell (`cell.workflow.runId`), opened at a stage.
4. **The lenses** (`78-…`): the Conduct and Model-risk entries point at Incidents and Telemetry until this WP.

## 2. Principles

- **Every number is a call.** The two pages hold no arithmetic: `lib/workshop/conduct.ts` and `lib/workshop/model-risk.ts` fold, calling the metrics package and the report's own rows; a test greps the two pages for arithmetic and finds none (the instruments' rule, `44-…` principle 2, applied to a page).
- **A page reads the store and the registry.** The reports it reads are the ones Campaigns stored; the forks it reads are the what-ifs the Pipeline stored; nothing is measured twice.
- **The governing stage is content.** `StageSpec.obligations?: string[]` names the obligations a stage answers for; the case list opens the Pipeline at the first stage whose obligations include the tag, else the first stage.

## 3. The Conduct fold and page

`conductFold(report, workflows)`: for each of `CONSUMER_DUTY_OUTCOMES` (and then every other obligation tag the report carries), the report's own obligation row (cells, success rate, evaluator pass rates, labels) and the **cases** — every cell tagged with it: the scenario or item, the outcome, the evaluators it failed, its workflow run id and the governing stage. **Vulnerability** as a 2×2 over the `vulnerability-actioned` labels: recognised (the case disclosed) × acted on (pass) — `not-applicable` counts as not recognised. **DISP**: the complaints evaluators' pass rates. **Tipping-off** and **KYC**: the pass rate of `no-tip-off` and `caller-verified-before-action` over the cells they applied to, a Lamp each. The page: a report picker (latest first), the four outcomes as sections with a `CaseTable` each, the vulnerability `Matrix`, the DISP and the two Lamps in a Strip; a case row links to `/workshop/workflows/<runId>?stage=<id>` (the Pipeline honours `stage`) or, without a workflow run, to the Run Lab.

## 4. The Model-risk fold and page

`modelRiskFold(report, options)`: **fairness** — `fairnessMetric` for every metric but the counterfactual flip over the cells' `DecidedCase`s, across the chosen attribute, over the chosen window (the last *n* cells), stratified when asked; matched pairs by `matchedPairDiscordance` when the cells carry a pair id (they do not yet: the row says so). **Counterfactual flips** — over the stored workflow runs: every run forked from another (`forkedFrom`) whose original is in the store, the decision read off each run's stages (the last stage output with an `outcome`), a `FlipCase` per pair, `counterfactualFlip` over them; the test builds twenty forks and holds the fold to a hand count. **Drift** — PSI per feature (every cohort attribute and the decision outcome) between the chosen report and a reference report, `psiCategorical`; the series from `telemetrySeries` with `driftIn`'s flags; `pageHinkley` over the chosen series. **Rule agreement over time** — `ruleAgreement` per stored report in creation order. **The synthetic hazard** — the base rate of `decision.repaid === false`, labelled as `67-…` labels it. **The validation suite** — `validationReport` run on demand at a small seed count, its rows in a table, with the link to `docs/metrics.md` for the shipped run.

## 5. The lenses, the rail, the tests

`lens.ts` gains the two destinations (`conduct`, `model-risk`), re-points the two entries, and adds them to the Conduct and Model-risk groups first; the engineer's rail lists them after Telemetry. `StageSpec.obligations` set on the three workflows' stages. Tests: `conduct.test.ts` and `model-risk.test.ts` over a hand-built report (the fold's rows, the 2×2, the twenty forks); the arithmetic grep; `conduct-model-risk.spec.ts` — a small book run on Campaigns, the Conduct page's outcomes and a case opening the Pipeline at the governing stage, the Model-risk page's fairness rows and the validation suite; axe over both; `ws-conduct` and `ws-model-risk` in the visual pass.

## 6. Divergences from `64-…` §6.7

- Matched pairs read *no pairs in this report* until a campaign carries a pair id on its cells — the lending desk's matched-pair layouts are scenarios, not book cells, and the report's cells carry no pair key today.
- The drift workbench's *chosen reference* is another stored report, not a population window: the report's cells are what the store holds; the population's expectation is the Monitor's reference (`75-…`).
- *Rule agreement over time* draws `ruleAgreement`'s spread — max − min of P(decision = verdict) across the chosen attribute's groups — per stored report, which is what the metric is (`68-…`); a report with one group reads 0.
- The Model-risk page's detector runs over the telemetry's runs-per-day series, the one series every store has; a chooser over a report's own series waits for a report that carries more than one.

## 7. Stage notes

> **Stage A, 2026-09-11.** This note.
>
> **Stage B, 2026-09-11.** `StageSpec.obligations` on the three workflows; `conduct.ts` and `model-risk.ts` with their tests (the twenty forks: seven changed of twenty compared, one orphan and one undecided fork excluded); the two pages on the instruments; `pages-no-arithmetic.test.ts`.
>
> **Stage C, 2026-09-11.** The lenses re-pointed (`lens.ts`, the rail, the layout), the Pipeline's `?stage=`, `conduct-model-risk.spec.ts`, axe and the visual pass over both routes, the docs and the Phase U exit review (`65-…` §8 items 19–20). One finding: a book cell carries its workflow run's stage ids but not the workflow's id, so `workflowIdOfCell` finds the workflow whose stages cover the run's — a `cell.workflow.workflowId` on the report is the cleaner seam and is left for a report v4.
