# 72 — Experiments (WP89)

> **Status:** design of record for WP89 (`65-DAY5-ROADMAP.md` Phase V), opened 2026-09-11 on the `day5` branch after WP88. Stage A is this note; stage B the schemas, the expansion, the analysis and `craftabot experiment`; stage C `/workshop/experiments`.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.8.1 (retires G49; decision D8; tenet 19): an **experiment** is a campaign-shaped artefact with a pre-registered hypothesis, a factorial design over the campaign's own axes, and an analysis that states each control's effect as a difference with an interval and *n* — never a pass/fail per gate. The register (WP90) folds experiments by control; this WP makes the experiments.

---

## 1. Where the code is

1. **Campaigns** (`28-…`, `73-…`, `70-…`, `78-…`): builds (with `overrides.configuration` and `overrides.knobs`), guards, brains, contexts and seeds are the axes a campaign already has; a book campaign's cells are one per work item; the report's cells carry outcome, evaluator verdicts and labels, case metrics, the cohort, the decision, the workflow's account and the tokens spent.
2. **`@craftabot/metrics`** (`68-…`): `newcombe` for a difference of rates, `welch` for a difference of means, `signTest` for matched pairs, `twoProportionZ`, `wilson`, `fairnessMetric`; every interval at a stated confidence.
3. **The runner** (`77-…`, `57-…`): `runCampaignFile` in the harness with `--jobs`; the Worker and the runner store in the browser, one report stored per campaign.
4. **Evidence** (`58-…`): a closed union of kinds; the Supabase store's tables per kind (`docs/evidence-setup.md`).

## 2. Principles

- **A campaign-shaped artefact.** An experiment's design carries a campaign *template* — the scenarios or the book source, the builds, guards, brains, evaluators — and factors over the template's own axes. `expandExperiment` writes one campaign per level combination, sharing seeds, each a file CI could run; nothing runs that is not a campaign.
- **Effects, not verdicts.** `analyseExperiment` folds the campaigns' reports into `EffectRecord`s: for each metric and each factor, every treatment level against the baseline level with the other axes at baseline — the main effects. The verdict is a rule over the intervals, never over a p-value (`64-…` §6.4.1): *supported* when every effect's interval excludes zero in the stated direction, *not-supported* when one excludes it the other way, *inconclusive* otherwise; the note states the minimum detectable effect at the achieved *n*.
- **Paired where the design pairs.** Campaigns share seeds and work items, so a cell on one side has its twin on the other; the sign test over the discordant pairs is the test where pairs exist, the two-proportion z where they do not, and the method says which.
- **Nothing measured twice.** The page reads the reports the runner stored; `analyse` reads the reports `run` wrote; the result carries the report and run ids so every number opens the cells behind it.

## 3. The artefacts

`packages/evals/src/experiment.ts` (the design needs the campaign schema) and `packages/core/src/schemas/experiment.ts` (the result needs nothing but numbers, so the register in `governance` reads it without `evals`):

```ts
Experiment {                                    // docs/schemas/experiment.schema.json
  schemaVersion: 1; id; title; hypothesis;      // one sentence, pre-registered
  controls: string[]; obligations: string[];    // control-map row / policy-card / guard / evaluator ids under test
  design: {
    template: {                                 // the campaign minus id, title, seeds and gates
      scenarios?; source?; builds; guards; brains; contexts?; evaluators?; assertionCards?; counterpart?; noise?
    };
    factors: Array<{ axis: 'guard' | 'context' | 'executors' | 'knob' | 'brain'; levels: string[]; knob?: string }>;
    baseline: Record<axis, string>;
    metrics: Array<
      | { kind: 'outcome-rate'; id; outcome; direction }
      | { kind: 'evaluator-pass-rate'; id; evaluatorId; direction }
      | { kind: 'label-rate'; id; evaluatorId; label; direction }
      | { kind: 'case-metric'; id; name; direction }              // the mean of `caseMetrics[name]`
      | { kind: 'cost'; id; of: 'tokens' | 'approvals' | 'escalations'; direction }
      | { kind: 'fairness'; id; metric; across; stratify?; direction }
    >;                                          // direction: 'lower-is-better' | 'higher-is-better'
    seeds: number[]; replicates: 1; confidence: 0.95; minimumDetectableEffect?
  };
  campaigns: string[];                          // the ids `expandExperiment` produces, in order
}
EffectRecord { experimentId; metricId; controlIds; factor: { axis; baseline; treatment };
  baseline: { value; n; interval }; treatment: { value; n; interval };
  delta; interval; p?; method; underpowered; slices?; cost; runIds; reportIds }
ExperimentResult { schemaVersion: 1; id; experimentId; ranAt; populationDigest?; effects; verdict; note; digest }
```

**Levels.** A `guard` level is a guard id in the template; a `brain` level a brain id; a `context` level a rung (`minimal` … `ontology`) or a template context's id; an `executors` level a workflow configuration id (every build gets it as `overrides.configuration`); a `knob` level a value of `factor.knob` (every build gets it as `overrides.knobs[knob]`, parsed as the sweep parses one). The campaign for a combination is `<experiment>--<axis>=<level>--…`, its seeds the design's seeds × replicates (`seed × replicates + r`), its one gate always passing (a measurement, not a judgment).

**The analysis per metric kind.** Rates (`outcome-rate`, `evaluator-pass-rate` over the judged cells, `label-rate`): *k*/*n* per side, Newcombe's interval for the difference, the sign test over discordant pairs when the cells pair (else the two-proportion z). Means (`case-metric`, `cost`): Welch's interval, the sign test over the paired differences. `fairness`: the metric per side over the cells' decisions, the difference with the bounds' interval (the metric's own interval on each side, combined conservatively) and no test. **Underpowered:** fewer than 30 cells on a side, or fewer than 5 events either way for a rate. **Slices:** the same delta and interval per cohort attribute value both sides carry. **Cost** on every effect: tokens per case, approvals per case and the escalation rate (escalated stages over stages) on each side.

**The verdict** as §2 states it. **The note:** the minimum detectable effect at the achieved *n* — for rates `(z₁₋α/₂ + z₀.₈)·√(2·p̄(1−p̄)/n)` over the smallest side — beside the design's `minimumDetectableEffect` when it named one.

## 4. The harness and the store

`craftabot experiment run --file <experiment.json> [--out ./campaign-out] [--jobs n] [--egress …]` expands the design, writes every campaign as `<out>/<campaign-id>.campaign.json`, runs each as `campaign` runs one, analyses the reports and writes `<out>/<experiment-id>.experiment-result.json` and `.md`. `craftabot experiment analyse --file <experiment.json> --out <dir>` re-folds the reports already there; `craftabot experiment render --result <file>` prints the markdown. `Storage` gains `putExperimentResult`/`getExperimentResult`/`listExperimentResults`/`deleteExperimentResult` on every store (memory, IndexedDB v8 — store `experimentResults`, keyPath `id` — and the file store under `<root>/experiments/<id>.json`). Two evidence kinds: `experiment` (the design, opaque to `core`) and `experiment-result` (typed); the Supabase tables `evidence_experiments` and `evidence_experiment_results`.

## 5. The page

`/workshop/experiments`: **author** over a book — the workflow, one factor (the configurations, a knob's values, or the context rungs), the baseline level, the metrics from a short list the pack answers (the success rate, each evaluator's pass rate, each case metric, tokens per case), the size and seed — the design shown as the file it is; **queue** expands it and puts every campaign on the runner; when every report of a design has landed the page analyses, stores the result and renders it: one `Matrix` per metric (treatment levels × *all* + the cohort slices, the delta with its band in the cell), the verdict as a Lamp with the note, every effect's runs opening the Run Lab. A stored result is listed and reopens. The page holds no arithmetic (`pages-no-arithmetic.test.ts` covers it).

## 6. Tests

`experiment.test.ts` in `evals`: a two-level design expands to two campaigns sharing seeds and ids; `analyse` recovers a planted 6-point effect with the right sign and an interval containing it; a null design over 200 seeds is *inconclusive* at least 95% of the time (synthetic reports, seeded); matched pairs use the sign test and the method says so; the schemas validate fixtures. The harness's `experiment.test.ts` runs a tiny design end to end and reads the result back. The storage contract test covers the four methods on every store. `experiments.spec.ts` authors a two-configuration design over a small lending book, queues it, waits for the result, reads a Matrix and the verdict, and opens a run. The result pushes to and pulls from the memory evidence store with its digest verified.

## 7. Stage notes

> **Stage A, 2026-09-11.** This note.
>
> **Stage B, 2026-09-11.** The result schema in `core` with its digest; the experiment schema, `expandExperiment`, `analyseExperiment` and the markdown in `evals`; `craftabot experiment run | analyse | render`; the four store methods on every store (IndexedDB v8); the two evidence kinds and their tables; the sign test in log space past a thousand pairs (it read NaN on 4,000 shared items). One finding: `z.record` over an enum key is exhaustive in Zod 4 — the baseline is a `partialRecord`.
>
> **Stage C, 2026-09-11.** `/workshop/experiments` and `lib/workshop/experiments.ts`; the rail; `experiments.spec.ts`; the docs. The null-design test holds the inconclusive share to 5% plus the Wilson margin at 200 seeds, as the validation suite states its bound (`68-…` §3.3) — a hard 95% over 200 draws fails one run in three by chance alone.

## 8. Divergences from `64-…` §6.8.1

- The design carries a campaign *template* rather than a bare `source`: the guards, builds, brains and evaluators a factor's levels refer to must come from somewhere, and a campaign is the shape that already names them.
- `fairness` metrics carry no test statistic: the difference of two fairness metrics has no standard test the package ships; the interval is the conservative combination of each side's own, and the method says so.
- Main effects only: a factorial with two factors reports each factor's levels against the baseline with the other at baseline, not the interactions; the campaigns for the interactions are written and run, so a later analysis can read them.
