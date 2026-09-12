# 75 — The Monitor and the ingest seam (WP84)

> **Status:** design of record for WP84 (`65-DAY5-ROADMAP.md` Phase T), opened 2026-09-11 on the `day5` branch after WP83. Stage A is this note; stage B the fold in `@craftabot/evals`, the Worker's streamed messages, `/workshop/monitor`; stage C the evidence-store `MonitorSink` and its reader, the two evidence kinds, the tests and the docs.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.5.3 (retires part of G51; tenets 20 and 25): the bank's day, live, on the Control Room system — every number the same fold the campaign report uses, the Monitor adding only a window and a clock — with Play/Pause/Step/Replay, and an ingest seam designed and stubbed so a feed of the same artefacts from bots running elsewhere would draw on the same screen.

---

## 1. Where the code is

1. **The day** (`71-…`): `runBank` works a clock's arrivals through desks and hands every workflow run, every agent run and the `BankRun` to a `MonitorSink`; the Worker's `bank` job (`campaign-host.ts`) runs it off the main thread and posts every agent run as a `trace`, progress as counts, and `bank-done` with the `BankRun` and the workflow runs — nothing arrives on the main thread run by run.
2. **The folds** (`74-…`, `68-…`): the campaign summary's human-load row (`touchedCaseOf` → `touchesPerCase`/`unattendedRate`, `wilson` over breaches), the `parity` gate (`fairnessMetric` over `cohortOf(truth)` × `decisionOf(events, truth)`), the `drift` gate (`psiCategorical` over an outcome mix), the incident log (`summariseRun` → `findings`).
3. **The instruments** (`44-…`, `60-…`): `Strip`, `Readout`, `Tape` (no reference line yet), `Meter` with its `range` band, `Queue` over `DeskQueueItem`s, `Lamp` through `outcome.ts`.
4. **The evidence store** (`58-…`): four kinds (`bundle`, `campaign-report`, `assurance-pack`, `content`); `pull` by kind, id, `since` and limit; the memory and Supabase stores.

## 2. Principles

- **One fold.** `foldMonitor` in `@craftabot/evals` reads the same functions the report reads — never a second definition of an approval rate, a touch, a fairness metric or a PSI. Its test holds each readout equal to the report's fold over the same runs.
- **A window and a clock are all the Monitor adds.** The readouts are over the rolling window (the last *n* runs, default 200); the tapes bucket the day by simulated hour; *underpowered* is the metric's own flag, and the fairness pane greys until the window holds its minimum.
- **Pausing freezes the numbers.** The Worker streams; the page folds. Play folds each run as it lands; Pause holds them in a buffer; Step folds one; Replay clears the fold and re-folds the runs it has kept, in arrival order — the same picture, because a fold is a function of its inputs. A re-run of the same seed in the Worker draws the same runs (WP83's digest), so Replay never spends the day's time twice.
- **The seam is the sink.** `MonitorSink` has a second implementation writing to an evidence store (`workflow-run`, `bank-run`, and the agent run as a `bundle`), and a reader pulling the same kinds back by workspace and date into the fold's input. Designed, stubbed and tested against the memory store; never connected to a live feed by this WP.
- **For simulation only.** The Strip says so; every clock on the screen is the simulated one.

## 3. The fold (`packages/evals/src/monitor.ts`)

```ts
export interface MonitorRun { desk: string; item: WorkItem; run: WorkflowRun; agentEvents: EngineEvent[] }
export interface MonitorReference { approvalRate?: number; outcomeMix?: Record<Decision, number> }
export interface MonitorOptions {
	from: string; to: string;                         // the day(s): the tapes' buckets, one per simulated hour
	window?: number;                                  // rolling: the last n runs (default 200); the tapes read every run
	minimum?: number;                                 // the window's floor before the fairness pane wakes (default 40)
	across?: string;                                  // the cohort attribute fairness reads (default 'sex')
	metrics?: FairnessMetricId[];                     // default demographic-parity, disparate-impact, equal-opportunity
	reference?: MonitorReference;                     // the hairline; `referenceFromItems` reads the population's expectation
	decisionKindOf?: WorkflowSpec['decisionKindOf'];  // per workflow id, for breaches
	desks?: Array<{ id: string; concurrency: number }>;
	arrivals?: Array<{ desk?: string; itemId: string; kind: WorkItemKind; at: string }>;  // for the queue view
	now?: string;                                     // the simulated clock, for the oldest item's age
}
export function foldMonitor(runs: readonly MonitorRun[], options: MonitorOptions): MonitorState;
export function referenceFromItems(items: readonly WorkItem[]): MonitorReference;   // the truth's verdict mix
export function outcomeOfRun(run: MonitorRun): Decision | undefined;               // the report's decisionOf, then the stages' output
```

`MonitorState`: `readouts` (arrivals by kind, decisions by outcome, approval rate with its Wilson band, referral rate, escalations, guardrail trips per decision, approvals per decision, mean stage duration by stage, tokens per decision, incidents open, touches per case, unattended rate, ceiling-breach rate); `buckets` (one per simulated hour: the same counts and rates); `fairness` (one row per metric over the window: value, interval, *n*, underpowered); `drift` (PSI of the window's outcome mix against the reference; flagged when the reading is not `stable`); `incidents` (every stopped or blocked run and every agent-run finding, with the workflow run's id beside it); `queues` (per desk: waiting, in progress, done, the oldest waiting item's age in simulated minutes).

Every rate is the report's: `wilson` for the bands, `touchesPerCase`/`unattendedRate` over `touchedCaseOf`, `fairnessMetric` over the same `DecidedCase`s the `parity` gate builds, `psiCategorical` as the `drift` gate's, `summariseRun` as the incident log's.

## 4. The Worker

`RunBankOptions.onArrival?(arrival, desk)` in `@craftabot/workflow` — the scheduler names the desk an item was routed to (or none) as it takes it. The Worker's `bank` job posts two new replies: `arrival` (`{ desk?, itemId, kind, at }`) and `workflow-run` (`{ desk, item, run, events }` — the run's agent events attached, so the main thread never joins), before `bank-done`. `runBankIn` gains `onArrival` and `onWorkflowRun`.

## 5. The screen (`/workshop/monitor`)

- **Strip:** the simulated clock, the acceleration chosen (`∞`, `600×`, `60×`), the population digest, the desks with their concurrency, *for simulation only*; Play/Pause/Step/Replay as its actions.
- **Set-up:** the day, the population seed and size, the desks (the lending desk with its configuration; more desks as WP85 ships their workflows).
- **Readouts** and **Tapes** with the reference hairline (`Tape.reference`); **Fairness now** on `Meter`s with bands, greyed *underpowered*; **Drift now** as a table of PSI readings with a `Lamp`; **Incidents**; **Queues** per desk.
- The runs are kept on the page for Replay and for the incidents' links; nothing is written to storage — the Monitor watches, the Campaigns screen keeps.

## 6. The ingest seam (`packages/workflow/src/evidence-sink.ts`)

```ts
export function evidenceMonitorSink(store: EvidenceStoreInstance, options?: { principal?; now?; exportedBy? }): MonitorSink;
export async function* monitorRunsFromEvidence(store, query: { from: string; to: string; since?: string }): AsyncIterable<MonitorRun>;
```

Two evidence kinds join `core` (`workflow-run` over `workflowRunSchema`, `bank-run` over `bankRunSchema`), with their Supabase tables in `docs/evidence-setup.md`. The sink pushes each workflow run under its id, each agent run as a one-run `bundle` under its run id, and the `BankRun` under its id; the reader pulls `workflow-run` items, keeps those whose `startedAt` date falls in `[from, to]`, and attaches the events of the bundles named by `runIds`. A `BankRun` pushed and pulled is the same bytes.

## 7. Tests

- `monitor.test.ts`: over a bank day on the lending desk (`runBank`, `memorySink`), the fold's touches per case, unattended rate, breach rate and approval band equal the campaign-summary row over the same runs' cells; the fairness rows equal `fairnessMetric` over the gate's `DecidedCase`s; the PSI equals `psiCategorical`; the fold is a pure function (twice the same); a window smaller than the minimum is underpowered.
- `bank.test.ts`: `onArrival` names the desk for every routed item and none for an unrouted one.
- `evidence-sink.test.ts`: a day through the sink into the memory store; `monitorRunsFromEvidence` returns the runs with their events, by date; the `BankRun` round-trips byte-equal.
- `campaign-host.test.ts`: the `arrival` and `workflow-run` replies land before `bank-done`.
- `monitor.spec.ts` (e2e): a simulated day at `Infinity` on a small population, Pause, a Readout equal to the fold's count, the rail answering a click mid-run, Replay drawing the same picture; axe over the route; the visual shot `ws-monitor` with the clock pinned.

## 8. Divergences from `64-…` §6.5.3

- Replay re-folds the kept runs rather than re-running the day: a fold is a function of its inputs and the runs are the same bytes by WP83's digest; a re-run would draw the same picture a day later.
- *Drift now* reads one feature — the outcome mix against the population's expected verdicts — since the only reference the Monitor holds is the day's own items; per-feature PSI over the population's attributes waits for the register (WP90), which holds a reference window.
- The queue view infers *in progress* from concurrency (arrived − done, capped), since the scheduler reports arrivals and finishes and not the lane's take.
