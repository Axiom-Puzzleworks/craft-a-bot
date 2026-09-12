# 80 — The Control Effectiveness Register and the reference experiments (WP90)

> **Status:** design of record for WP90 (`65-DAY5-ROADMAP.md` Phase V), opened 2026-09-11 on the `day5` branch after WP89. Stage A is this note; stage B `controlEffectiveness` in `governance/reports`, the Assurance entry's table and the pack's §5; stage C the eight reference experiments under `experiments/`, their results under `docs/evidence/`, the CI shape run.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.8.2–§6.8.3 (retires the rest of G49; tenet 19): the register is a pure fold over experiment results and the control maps — *for every control a full-scale bank might implement, what it did, at what cost, how sure, over which populations and workflows* — and the eight reference experiments are its first pages. A control no experiment has tested is `untested`, in the open.

---

## 1. Where the code is

1. **Experiments** (`72-…`): `ExperimentResult` in `core` — effects with `controlIds`, intervals, *n*, cost and run ids; the results on every store and in the evidence store.
2. **Control maps** (`53-…`): `ControlMap` rows per pack (`fs-lending/control-map` and the rest), each `mapId/ref` a control with its obligation tags and evidence items.
3. **The assurance pack** (`53-…` §4): `mitigants` is SS1/23's principle 5; the Assurance entry (`78-…` §4) renders an empty register that says *untested*.
4. **The harness** (`72-…` §4): `craftabot experiment run`; CI's campaign steps (`ci.yml`).

## 2. The fold

`governance/reports/control-effectiveness.ts`:

```ts
ControlEffectivenessRow {
  controlId: string;                                   // `<mapId>/<ref>`, or a bare id an experiment named
  controlMapRow?: { mapId; ref; title; obligation; status };
  obligations: string[];
  effects: EffectRecord[];                              // every effect that named this control
  headline?: { metricId; delta; interval; n; experimentId; resultId; underpowered };  // the largest-n effect on the control's primary metric
  cost: { tokensPerCase?; approvalsPerCase?; touchesPerCase? };                     // the treatment side's, averaged over the effects
  coverage: { experiments: number; populations: string[]; contexts: string[]; workflows: string[] };
  status: 'evidenced' | 'inconclusive' | 'untested';
}
controlEffectiveness(results, controlMaps): ControlEffectivenessRow[]
```

**Rules.** A control is every `mapId/ref` the maps list plus every id an effect names that no map lists. The *primary metric* is the first metric the experiment's effects name for that control. `evidenced` when the headline's interval excludes zero; `inconclusive` when the control has effects and none excludes zero; `untested` with no effect at all. Coverage counts distinct experiments, `populationDigest`s, the `context` factor's levels and the `workflowIds` the result carries (`ExperimentResult.workflowIds`, added here). Rows come map by map in the maps' order, the unlisted ids after, so the register reads as the control map does with a column added.

## 3. Where it shows

- **The Assurance entry** (`/workshop/assurance`): the register's `CaseTable` — control, obligation, what changed (the headline's metric and delta), by how much (the interval), how sure (*n*, underpowered), coverage, status — folded from the stored experiment results and the registry's control maps; a row opens `/workshop/experiments?result=<id>`. With no result stored the table says *untested* on every row and the line above says why.
- **The pack's §5.** `AssurancePack.mitigants.effects: ControlEffectivenessRow[]` (every row, `untested` ones included), rendered as a table in the markdown and the HTML — each mitigant's measured effect with the experiment and the run ids it rests on. `assurancePackFromStorage` reads `storage.listExperimentResults()`; `AssurancePackInput.experimentResults?` for a host that gathers its own.

## 4. The reference experiments

`experiments/<id>.json`, eight designs as `72-…` §3 states them, each over the pack's own book at the size the row names, each naming the control-map rows it tests; the `cost` metric gains `touches` and `breaches` (the workflow's account per cell) so `human-oversight` can pre-register the human-load figures.

| File | Factors | Metrics | Controls |
|---|---|---|---|
| `lending-stack` | guard {none, policy-cards} × executors {rules-only, bot-with-a-person-at-the-decision, bot-everywhere} | `fs-lending/decision-matches-rules` pass rate ↑; over-approve label rate ↓ | `fs-lending/control-map/affordability-first` |
| `lending-context` | context {case-file, ontology} × guard {none, policy-cards} | decision-matches-rules ↑; explanation-faithful ↑ | `…/explanation` |
| `lending-fairness` | guard {none, policy-cards} | demographic parity across ageBand ↓; equal opportunity ↓ | `…/cohort-blind` |
| `lending-knobs` | knob referRatioPercent {60, 45} × executors {bot-everywhere, bot-with-a-person-at-the-decision} | over-approve label rate ↓; escalation rate (cost) | `…/four-eyes` |
| `fraud-stack` | guard {none, policy-cards} × executors {bot-everywhere, bot-with-a-person-at-the-sar} | `fs-fraud/no-tip-off` ↑; alert-decision ↑ | `fs-fraud/control-map/tipping-off`, `…/verify-before-acting` |
| `advice-context` | context {case-file, relational} × executors {bot-everywhere} | recommendation-suitable ↑; data-minimised ↑ | `fs-advice/control-map/suitability`, `…/minimisation-and-purpose` |
| `human-oversight` | executors {the five levels} × guard {none, policy-cards} | touches per case ↓; breach rate ↓ (pre-registered as the thought experiment's figures) | `fs-lending/control-map/four-eyes` |
| `drift-day` | — | — | — |

`drift-day` is not a campaign-shaped experiment: its hypothesis is about the clock — a planted mid-day shift flagged by PSI within two simulated hours — and the Monitor's fold is where that is tested (`fs-lending/src/monitor.test.ts`, the PSI reference over the population). It is recorded under `docs/evidence/drift-day/README.md` as the test it is, not as a file the experiment runner can take; `64-…` §6.8.3's row stands as a hypothesis for a bank-day experiment kind a later WP can add.

**Full size and reduced.** Each file carries its full population (lending 10,000 customers, a loan book of 783; fraud 600, an alert book of 2,912; advice 3,000, a register of 92), and the noisy scripted bot where a guard or a context is the factor — the optimal one agrees with the rule on every row and nothing would move. `craftabot experiment run --size <n>` overrides the population's size for a shape run; CI runs every file at `--size 200` (*Run the reference experiments*) and `scripts/experiment-shape.mjs` compares each reduced result with the committed one for shape — the same metric ids, factors and levels, a verdict from the same three, every effect's *n* above zero — never for value. The committed results under `docs/evidence/<experiment>/` are the full-size runs with their digests and the wall time each took, and `docs/evidence/README.md` says what they are evidence *of*: this synthetic bank under these configurations, and not of any real book, customer or control.

## 5. Tests

`control-effectiveness.test.ts`: an untested control reads `untested`; the headline is the largest-*n* effect on the primary metric; `evidenced` and `inconclusive` from the intervals; coverage counts; a bare id after the maps. The pack test: §5 cites an effect's experiment and run ids in both renderings. The harness test: `--size` overrides the population. `experiments.spec.ts`: after the experiment runs, the Assurance entry's register shows the tested control with a status and the row opens the result. The shape script has its own test over two results. The eight files parse (`experiments.test.ts` in the harness), and `human-oversight`'s committed result holds touches per case falling monotonically from Level 3 to Level 5 with the breach rate rising.
