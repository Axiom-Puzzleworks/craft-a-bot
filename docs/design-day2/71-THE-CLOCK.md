# 71 — The clock, the scheduler and `BankRun` (WP83)

> **Status:** design of record for WP83 (`65-DAY5-ROADMAP.md` Phase T), opened 2026-09-11 on the `day5` branch after the Phase S exit review. Stage A is this note; stage B the clock in the bank, the scheduler and the sink in `@craftabot/workflow`, `bank-run.schema.json`, `craftabot bank run`, the Worker's `bank` job.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.5.1–§6.5.2 (retires G51; tenet 24 — *a day at the bank is reproducible from its `BankRun` alone*): work items arriving on a simulated clock at calibrated rates with an hour-of-day shape, routed by kind to desks that work them through `runWorkflow` up to a concurrency, every run and trace reaching a sink, and the day recorded as an artefact with a digest. The Monitor that watches it is WP84's; the fraud and advice workflows that give the other desks something to do are WP85's.

---

## 1. Where the code is

1. **The population** (`66-…`) is the bank at a seed: customers with accounts, bureau files and complaints (`Complaint.openedDay`), and a lazy transaction stream with a calendar (`dateOf`/`indexOf`, `between(from, to)`).
2. **The books** (`67-…`): `loanBook`/`lendingBook` gives applications dated on the calendar (`applicationItem`, `arrivedAt` at 09:00); `alertBook(pop, { from, to })` gives alerts timed to the transaction that raised them. Both are `Book`s of `WorkItem`s with truth.
3. **A workflow draws its own book** (`WorkflowSpec.book`, WP80) and runs one item through `runWorkflow` (`69-…`); a book campaign runs many, one cell each.
4. **The calibration table** (`66-…`) has no arrival rows: `66-…` §2 lists `arrival-rates` as WP83's, a stated assumption inheriting the cited daily volumes.
5. **The harness** writes an agent run as `run` does (the record, the events, the summary, the trace file) and a workflow run beside it (`craftabot workflow run`, WP79); **the Worker** (`64-…` §6.6, WP77) has a `bank` job stubbed in its protocol.

## 2. Principles

- **The clock schedules books; it does not generate.** What arrives is what the books already hold — an application at its date, an alert at its transaction's time, a complaint at its opening day, an advice request from the customers who hold savings — placed within its day by an hour-of-day profile drawn from the item's own seed. The transactions never arrive: they are the stream.
- **A day's arrivals are one list, whatever the acceleration.** `arrivals(options)` is a pure function of the population, the books, the window and the seed; `bankClock` only paces it. Two clocks from one seed emit the same arrivals at `Infinity` and at 60.
- **Scheduling never reaches a result.** A desk's concurrency changes when items are worked, never how: each item's clocks are seeded from the bank's seed and the item's ordinal, so a `WorkflowRun` is the same bytes at concurrency 1 and 4, and the `BankRun`'s digest is over the runs in arrival order.
- **Every run reaches the sink.** The scheduler owns no storage; a `MonitorSink` takes every workflow run, every agent run's events and the `BankRun` — the file store in the harness, the Worker's messages in the browser, an array in a test.
- **The day is an artefact.** `BankRun` records the clock's options, the desks' assignments, the population digest, the counts by kind and desk, the incidents and every run's id and digest, so the day is reproducible from it alone.

## 3. The clock (`fs-bank/src/clock.ts`)

```ts
export type HourProfile = number[];                      // 24 weights, normalised by the clock
export interface ArrivalRates { application: { profile: HourProfile; scale: number }; alert: …; complaint: …; 'advice-request': … }
export interface ClockOptions {
	population: Population; from: string; to: string;   // ISO dates inside the population's period
	books: Book[];                                       // what arrives; drawn by the host from the population
	rates?: Partial<ArrivalRates>;                       // per kind: the hour profile and a thinning scale (1 = every item)
	acceleration: number;                                // simulated seconds per wall second; Infinity = as fast as possible
	seed: number;
}
export interface Arrival { at: string; ordinal: number; item: WorkItem }
export function arrivals(options): Arrival[];            // the deterministic list, by `at` then id
export function bankClock(options): AsyncIterable<Arrival>;
export const DEFAULT_ARRIVAL_RATES: ArrivalRates;         // from the calibration row `arrival-rates`
```

Each item's day is its `arrivedAt` date (an alert keeps its transaction's time; the rest are placed by the profile); an item outside the window is dropped; thinning keeps an item when a draw from its seed is under `scale`. The hour is drawn from the profile's cumulative weights, the minute uniformly, from `seededRandom(mix(seed, item.id))`. `bankClock` yields the list in order, sleeping `(Δsimulated seconds) / acceleration` wall seconds between arrivals, none at `Infinity`.

**The registers.** `complaintBook(pop, { from, to })` — every customer's complaints opened in the window, as `complaint` items (`payload: { complaint, customer }`, truth: the category and whether the complaint is upheld by the register's own rule); `adviceRequestBook(pop, { from, to })` — the calibrated share (`advice-request-incidence`, a stated assumption) of customers holding savings above the row's threshold, one `advice-request` item each on a day drawn from the seed (`payload: { customer, savingsBalance, topic }`). Two rows join the table as stated assumptions: `arrival-rates` (the hour profile, read off the clock's arrivals in its test) and `advice-request-incidence`; the shipped population digest moves once for them, as `67-…`'s rows moved it.

## 4. The scheduler (`@craftabot/workflow/src/bank.ts`)

```ts
export interface DeskAssignment { id: string; workflowId: string; kinds: WorkItemKind[]; configuration?: string; config?: WorkflowConfig; concurrency: number; build: string }
export interface MonitorSink {
	workflowRun(entry: { desk: string; item: WorkItem; run: WorkflowRun }): void | Promise<void>;
	agentRun(entry: { desk: string; itemId: string; runId: string; spec: AnyAgentSpec; events: EngineEvent[] }): void | Promise<void>;
	bankRun(record: BankRun): void | Promise<void>;
}
export function memorySink(): MonitorSink & { workflowRuns; agentRuns; bankRuns };
export function runBank(clock: AsyncIterable<Arrival>, desks: DeskAssignment[], sink: MonitorSink, options: RunBankOptions): Promise<BankRun>;
```

`RunBankOptions` carries what `runWorkflow` needs per desk — `packs`, `specFor(desk)`, `providerFor(desk, stage, goalCardId)`, `guardrailsFor?`, `human?` — the bank's `seed`, `now`/`newId`, the clock's options as data (`clock: { from, to, seed, acceleration, rates }`), `populationDigest`, `stopAfter?` (items), `onProgress?`, `onIncident?`. Routing: an item goes to the first desk whose `kinds` include its kind; none → counted `unrouted`. Each desk has a queue and `concurrency` lanes; a lane takes the next item, runs the workflow with clocks seeded from `(seed, ordinal)`, hands the run and its agent runs to the sink, and takes the next. The bank ends when the clock is exhausted and every lane is idle. An **incident** is a run that stopped (`outcome !== 'completed'`), with the stage and its finding.

`BankRun` (`core/schemas/bank-run.ts`, `docs/schemas/bank-run.schema.json`, the twelfth artefact): `{ schemaVersion: 1; id; clock; populationDigest?; desks; counts: { arrivals: Record<kind, n>; routed; unrouted; completed; stopped; byDesk: Record<desk, { worked; completed; stopped }> }; incidents: Array<{ runId; itemId; desk; stageId?; status?; finding? }>; runs: Array<{ ordinal; itemId; kind; desk; runId; digest; outcome }>; startedAt; finishedAt; digest }` — `digest` over the runs' digests in arrival order, so a re-run is checkable run by run; `startedAt`/`finishedAt` are the clock's, never the wall's.

## 5. The hosts

- **`craftabot bank run --day <YYYY-MM-DD> --desks <desks.json> [--population <seed> --size <n>] [--acceleration <n|inf>] [--brain …] [--out ./runs]`**: the population at the seed and size; the books drawn for the desks' kinds (the loan book through the lending workflow's `book`, the alert book, the registers); the desks file `[{ id, workflowId, kinds, configuration?, concurrency, build?, kit? }]`; every agent run written as `run` writes one, every workflow run under `<out>/workflows/`, the `BankRun` under `<out>/bank-runs/<id>/bank-run.json`; the wall time printed and on the report (`wallMs`, outside the digest).
- **The Worker's `bank` job** (`StartBank.bank: { population: { seed, size }, from, to, desks, acceleration? }`): the host draws the books from the edition's packs, runs the bank with the scripted brains, posts every agent run as a `trace`, and finishes with `bank-done` carrying the `BankRun` and the workflow runs. The Monitor (WP84) reads them; this WP proves the road through the in-process Worker.

## 6. Tests (WP83's DoD)

- Two clocks from one seed emit the same arrivals at `Infinity` and at a finite acceleration; the arrivals are by `at`; thinning at 0.5 keeps about half; the `arrival-rates` row is read off a year of arrivals.
- `runBank` over one day with `rules-only` desks is byte-stable by `BankRun` digest across two runs and across concurrency 1 and 4; every workflow run and agent run reaches the sink; no item is worked twice; an unrouted kind is counted.
- The harness's day at `Infinity` over a 2,000-customer population, its wall time recorded in `65-…`.
- The Worker's `bank` job through the in-process Worker: the traces and the `BankRun` arrive.

## 7. Divergences from `64-…` §6.5

- The clock takes `books` rather than drawing them: the loan book needs the lending rule, which the bank cannot import (`67-…` §8), so the host draws the books and the clock schedules them.
- `DeskAssignment` routes by an explicit `kinds` list rather than by the workflow (a workflow declares no kind); `brain` is the host's `providerFor`, since the brains live in `evals` and `workflow` may not depend on it.
- `BankRun.runs` carries each run's id and digest, not the runs themselves — they reach the sink; the `BankRun` is the index.
