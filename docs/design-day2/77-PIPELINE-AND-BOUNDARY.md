# 77 — The Pipeline view and the Boundary rewrite (WP86)

> **Status:** design of record for WP86 (`65-DAY5-ROADMAP.md` Phase U), opened 2026-09-11 on the `day5` branch after the Phase T exit review. Stage A is this note; stage B the stored workflow run, the Workflows list and the Pipeline with its *What if*; stage C the Boundary rewrite with the workflow ring and the label engine; the tests and the docs.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.2.4–§6.2.5 (retires G54 and part of G45; UX-7): a workflow run as a screen — the stage rail, every stage's input and output, the bot's run at each stage, a what-if from any stage into a side-by-side — and the Boundary map drawn again: a radial layout whose labels never collide, with the workflow's stages as a second ring lit by the run and each stage drawn as its actor.

---

## 1. Where the code is

1. **Workflow runs** (`69-…`, `73-…`, `76-…`): `runWorkflow` returns a `WorkflowRun` — every stage's executor, status, duration, guard tally, input and output (the value when small, always the digest) and the agent run it seated; `fromStage` re-runs from a stage under the origin's config and seeds for the stages before it. The harness writes a run as `<out>/workflows/<id>/workflow-run.json`; the Worker's book and bank jobs post traces and, since WP84, `workflow-run` replies for a bank day — but a book campaign's runs reach nothing on the main thread, and no store keeps a workflow run.
2. **The Boundary** (`44-…` §4.5, `60-…`): `boundaryMapFor` folds the map from a spec, the registry and a trace; `Boundary.svelte` draws it with the outside nodes fanned 22° apart by kind and every label at a fixed offset — the collisions UX-7 recorded on the bank's page (`SERVICE-LINE · THE CRM` over `CORE BANKING`).
3. **The fork pattern** (`54-…`): `forkSession` from a tick, `craftabot fork`, the Run Lab's *Fork from this tick* into Compare with `from=` synchronising the scrubber.

## 2. Principles

- **A workflow run is a record the store keeps.** `StoredWorkflowRun` wraps the run with the item it worked (so a what-if can re-run it), where it came from, and the run it was forked from. Every store has it; the harness's bare `workflow-run.json` reads as one.
- **The Pipeline reads the record and the registry, never the engine** (`44-…` principle 4): the stage names from the spec, the executor from the record, the panes from the record's values.
- **What-if is the fork pattern lifted to stages.** The Worker re-runs `fromStage` under one change — a configuration, one stage's executor, a knob, the context rung — stores the result as its own run forked from the original, and the Pipeline shows the two rails side by side, synchronised on the selected stage.
- **The map's labels never overlap.** The layout is a pure function the component draws and a test asserts the invariant over; a label that had to move is leader-lined to what it names.
- **The ring is the workflow.** Every workflow the host asks for is a ring outside the boundary, its stages in order from the top; a stage is drawn as its actor — the bot's mark, a cog for a rule, the person, a line's socket — and lit by the run when the map is over one.

## 3. The stored run

`core/schemas/workflow-run.ts`: `storedWorkflowRunSchema = { run: WorkflowRun; item?: WorkItem; source?: { kind: 'campaign' | 'bank' | 'import' | 'what-if' | 'harness'; id?; build?; desk? }; forkedFrom?: { runId; stageId }; createdAt; schemaVersion: 1 }`. `Storage` gains `putWorkflowRun` / `getWorkflowRun` / `listWorkflowRuns` (newest first by the run's start) / `deleteWorkflowRun`; the memory store keeps a map, IndexedDB a seventh object store (`workflowRuns`, keyed by `run.id`, database version 7), the file store `<root>/workflows/<id>/stored-workflow-run.json` beside the bare `workflow-run.json` the commands write — a directory with only the bare run reads as one stored from the harness.

`RunCampaignOptions.onWorkflowRun` (evals) hands a book cell's run over with its item and agent runs; the Worker posts it as the `workflow-run` reply the bank job already had, and the campaign runner persists it with its agent runs (`persistWorkflowRun`, `lib/state/what-if-app.svelte.ts`) — so the Books panel fills the Workflows list.

## 4. The screens

- **`/workshop/workflows`:** a `CaseTable` of every stored run — the workflow, the item, the outcome as a lamp, the stages as a strip (`●` ok · `◐` escalated · `■` blocked · `✕` error), the touches, where it came from, when it started (simulated); a row opens the Pipeline. An import takes a `workflow-run.json` the harness wrote (no item — no what-if) or a stored run with its item.
- **`/workshop/workflows/<runId>`, the Pipeline:** the strip (run, item, stages, configuration, started, the outcome lamp, *forked from* when it is a what-if); the **stage rail** — a card per stage with the executor's roundel (`chain` the bot, `cassette` a rule, `desk` a person, `deck` a line), the status lamp, the executor in a sentence, the duration and the guard tally, the approval and the finding when there are any; the **In** and **Out** panes on `CaseFile` for the selected stage, the value flattened to dotted fields with the digest beside it; the Run Lab link for a bot stage when its run is in the store (`/workshop/runs/<id>?tick=0&stage=<id>`; the Run Lab honours `tick`), and a plain sentence when it is not; the **What if** drawer — a configuration, the executor at the selected stage (the spec's default, every configuration's, every rule of the stage's), a knob, the context rung — re-running from the selected stage into `?against=<original>`; with `against`, a second rail beneath the first and a third pane, the rails synchronised on the selected stage; the **Boundary** beneath with this run's ring.
- **The rail** gains *Workflows* after *Campaigns*.

## 5. The Boundary rewrite

`lib/control-room/boundary-layout.ts` — `layoutBoundary(map, lit)`: the outside nodes evenly around the circle in kind order from the top (provider first, the lines last), on a radius grown to fit their boxes; one ring per workflow outside the boundary, its stages in order from the top; every label placed beside its anchor, then tested against every box placed before it and pushed outward along its own angle in 16px steps (leader-lined) when it would overlap; a long stage name wrapped. `overlappingLabels(layout)` is the invariant's witness. The component draws what the layout placed and nothing else. `boundaryMapFor` gains `options.workflows` and the map `workflows?: BoundaryWorkflow[]`; `workflowRing(spec, { executors?, run? })` folds one ring. The bank's page draws every registered workflow's ring; each desk's page its own; the Pipeline the run's, lit.

## 6. Tests

- `boundary-layout.test.ts`: the crowded map (fifteen outside nodes, three rings, twenty-five stages) has no overlapping labels and leader-lined the ones it moved; a map with no workflows keeps the classic canvas; a lit and a flagged edge come through.
- `boundary.test.ts` (governance): `workflowRing` reads the configuration's executors over the spec's and the run's statuses.
- `campaign-host.test.ts`: a what-if from the decision reproduces the stages before it and seats the rule at it. `campaign-runner.svelte.test.ts`: a book's runs are persisted with their items. `memory.test.ts`: the store's four methods.
- `fs-lending/src/workflow-fixture.test.ts`: `fixtures/lending-workflow-run.v1.json`, a stored run with its item held byte-equal.
- `pipeline.spec.ts` (e2e): the fixture imported, the Pipeline opened, the panes rendered, the missing run said plainly; a what-if from the decision with the rule deciding, two rails synchronised, the new run's bot stage opening the Run Lab at tick 0; and no overlapping labels on the bank's page, on each desk's, and on the Pipeline's. Axe and the visual pass over `/workshop/workflows`.

## 7. Divergences from `64-…` §6.2.4–§6.2.5

- The what-if opens beside the original on the Pipeline itself (`?against=`), not in Compare: Compare is two agent runs with one scrubber, and a workflow run has stages, not ticks. The rails synchronise on the stage; Compare stays for the bot's runs.
- The outside nodes are placed evenly around the circle in kind order rather than fanned at a kind's angle: a fan of ten service lines wrapped the circle and collided with the provider; the kinds keep their order instead of their bearing.
- The workflow rings live outside the boundary ring, not on it: a person at a `human` stage is drawn at the ring as the design says, but the stage marks themselves sit on their own circle so the safety stack's label keeps its place.

> **Amended 2026-09-12 (WP95, `69-…` §10).** The Pipeline's stage pane lists the stage's boundary verdicts (`StageRecord.guards.verdicts`) under its trips — `point · guardrailId — verdict (reason)`, `data-testid="pipeline-verdicts"` — so a `rule` or `human` stage a guard blocked reads as such.
