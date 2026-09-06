# 57 — The harness at scale (WP68)

> **Status (2026-09-06):** the design of record for WP68 (`42-DAY4-ROADMAP.md` §3 Phase P; `41-TARGET-DESIGN-V4.md` §6.10, retiring G28 and the "harness-side live trailing" part of G35). Written before stage A; the stage notes at the foot say what landed.

## 1. Purpose, and who this is for

A campaign is a regression suite as a file, and every desk baseline runs in CI in seconds — because every cell is scripted. The corpus `41-…` §1 promises is different: a thousand live cases, an overnight job, on one machine or several, that a person must be able to stop and pick up again without paying twice, and whose ten thousand runs a store must list without opening ten thousand directories. This note gives the harness four things it does not have — a worker pool, shards with a merge, a resume, and an index — with one small seam in `evals`, and gives the Workshop the half of live trailing WP49 left recorded: a run the harness is still writing, read from the file sink's own lines.

## 2. Where the code actually is — and what the contract test found

Read for this note: `evals/src/campaign.ts` (`runCampaign`: the registry, `campaignCells` in scenario × build × guard × brain × seed order with an `ordinal`, one `for` loop over `runCell`, the gates and the report; `RunCampaignOptions` — `onTrace`, `onCell`, `betweenCells`; `ID_STRIDE` so a cell's ids depend on its position alone), `harness/src/commands/campaign.ts` (`runCampaignFile`: the config's packs, the sinks, `onTrace` writing each run through `createFileStorage` and a `writing` chain, the report and renderings), `harness/src/storage/file-storage.ts` (the layout; `listRunIds` by `readdir`, `readRuns` and `listRunSummaries` opening every directory; `runExists` by `stat`), `harness/src/cli.ts` (the `campaign` case and its flags; `configFrom`), `telemetry/src/node.ts` (`telemetry/file`: `{ kind: 'run', record }` then one event per line, appended as the run goes), `37-…` §5 and §7 ("the harness streaming into the Run Lab" left recorded), the Run Browser's trace import (`routes/workshop/runs/+page.svelte`, WP20), `.github/workflows/ci.yml` (the campaign job's four baselines).

What the contract test found, numbered as the earlier notes number theirs:

1. **`runCampaign` runs every cell itself, one after another.** The loop is the runner's; a host cannot say *how* a cell runs or how many at once. Fixed in `evals` — the one change there: `RunCampaignOptions.execute?: (cell: CampaignCellSpec) => Promise<CellResult>` and `concurrency?: number`. The runner still owns the cells, the budget, the gates and the report; a host that supplies `execute` runs the cell wherever it likes, up to `concurrency` at a time, and the runner places each result by its ordinal so the report reads the same whatever the scheduling. `runCampaignCell(spec, prepared)` and `prepareCampaign(campaign, options)` are exported so a host's worker runs exactly what the runner would have run.
2. **A cell does not know its number.** `CampaignCell` carries the five axes and no ordinal, so two partial reports cannot be interleaved back into cell order. Fixed in `evals`: `CampaignCell.ordinal?` (additive; absent on a report written before, which was whole and in order).
3. **A report cannot say it is a slice.** Fixed in `evals`: `CampaignReport.shard?: { index, of }` (additive); a shard's gates are evaluated over its own cells and say so; `merge` recomputes them over the whole.
4. **Nothing on disk says which run was which cell.** A run directory holds `run.json`, `events.jsonl`, `summary.json`; the cell it came from is only in the report. Fixed in the harness: `<out>/cells.jsonl` — one line per finished cell, `{ ordinal, runId, digest, cell }`, appended as cells complete — which is what `--resume` reads and what a merge can check.
5. **The store opens every directory to list anything.** `readRuns` and `listRunSummaries` read `runs/*/run.json` and `summary.json` for every id `readdir` returns. Fixed in the harness: `<root>/index.jsonl`, one line per write (`{ id, agentId, agentName, goalCardId, outcome, summary: boolean, digest? }`, the last line for an id wins), maintained by `putRun`, `putRunSummary` and `deleteRun`; `listRuns` and `listRunSummaries` read it and open only what they return; `craftabot index --rebuild --out <dir>` writes it again from the directories, and a store with no index rebuilds it on first read.
6. **The trace digest is nowhere on disk for a campaign run.** `craftabot run` writes a `.craftabot-trace.json` with a digest; a campaign's runs have none. Decided: the digest goes on the `cells.jsonl` line and the index line — computed over the events as `buildTraceFile` computes it — so a resume verifies a cell's run without a trace file per run.
7. **Live trailing had no harness half.** `37-…` §7 left "the harness streaming into the Run Lab" recorded. Decided (§4.5): the file sink's JSONL *is* the stream; the Run Browser's import reads it — `{ kind: 'run', record }` and the events so far — and opens the Run Lab on a run that may still be going, with the record's `IN_PROGRESS` said plainly. Re-importing re-reads. No socket, no server: the browser is unchanged in kind, as §6.10 wants.

## 3. Design principles

- **The report reads the same however it was made.** Cells are placed by ordinal; ids and clocks inside a cell depend on its position alone (`ID_STRIDE`); the report's own id and stamp are the caller's. `--jobs 4` and `--jobs 1` produce the same bytes; shards merged equal the whole.
- **One writer.** Workers compute; the main thread writes. A worker returns the cell and its trace; the harness's `onTrace` writes the run, the summary and the index as it always has, in one ordered chain.
- **Spend is a property of the artefact, enforced at every join.** A live seat or brain needs `budget` (as before); `merge` refuses reports whose summed live cells exceed the campaign's `maxLiveCells`, and refuses two reports of the same campaign whose ordinals overlap.
- **Nothing is trusted that is not verified.** A resumed cell is reused only when its run's events on disk digest to what `cells.jsonl` recorded; otherwise it runs again.
- **The browser stays small.** No worker pool, no shards in the Workshop; its campaigns are scripted and small. The Run Lab gains one import format.

## 4. The design

### 4.1 The seam (`evals`, stage A)

```ts
interface RunCampaignOptions {
  …
  execute?: (cell: CampaignCellSpec) => Promise<CellResult>;   // the host runs it; the runner places it
  concurrency?: number;                                         // how many `execute`s in flight; 1 by default
}
interface CellResult { cell: CampaignCell; trace?: { events: EngineEvent[]; spec: AgentSpecV2 } }
export function prepareCampaign(campaign, options): PreparedCampaign      // the registry, the resolved campaign, the cells, the noise
export function runCampaignCell(spec, prepared, options): Promise<CellResult>
```

`runCampaign` prepares, guards the budget, then runs `execute` (or `runCampaignCell`) over the cells with `concurrency` in flight, writing each result into `results[spec.ordinal]`, calling `onTrace`/`onCell` as results land in *completion* order (a host that writes runs may write them in any order; the report is by ordinal). Every cell carries its `ordinal`.

### 4.2 `--jobs`, `--shard`, `merge` (harness, stage A)

- **`--jobs <n>`** — a pool of `n` `node:worker_threads`, each loading `campaign-worker.js` from the harness's own `dist` (the worker path is the same relative path from `src/commands` and `dist/commands`, so tests over `src` run the built worker; the harness's `test` script builds first). A worker owns its registry (from the same config path, content directory and scenario packs the main thread had), its plans and its credentials (the environment is inherited); it receives a cell spec and the resolved campaign, runs `runCampaignCell`, and posts the result back. The main thread's `execute` hands cells to idle workers. `--jobs 1` (the default) runs in-process, as today.
- **`--shard i/n`** — `campaignCells` filtered to `ordinal % n === i - 1`; the report carries `shard` and its gates say *over this shard*.
- **`craftabot merge --file <campaign.json> --out <dir> <report.json>…`** — the reports parsed, the campaign resolved against the registry (for the semantics), the cells concatenated and sorted by ordinal, the gates and the summary recomputed over the whole, `budget` summed, `shard` dropped; refused when the reports name different campaigns, when two carry the same ordinal, or when the summed live cells exceed `maxLiveCells`. Written as a report is written, with the same renderings.
- **`--seeds <a>-<b>`** — the file's seeds replaced by a range, so a scale run is one flag on a baseline rather than a file of a thousand seeds.

### 4.3 `--resume` (harness, stage B)

`cells.jsonl` under `--out`, one line per finished cell. With `--resume`, the harness reads it before running; a cell whose ordinal has a line, whose run directory exists and whose `events.jsonl` digests to the line's `digest` is *reused* — its stored `cell` returned by `execute` without running — and every other cell runs. `onCell` says which. The report is whole either way.

### 4.4 The index (harness, stage B)

`index.jsonl` beside `agents/` and `runs/`. `putRun` appends `{ id, agentId, agentName, goalCardId, outcome, summary: false }`; `putRunSummary` appends the same with `summary: true` and the events' `digest`; `deleteRun` appends `{ id, deleted: true }`. Readers fold the file (last line per id wins), then open only what they list. `craftabot index --rebuild --out <dir>` folds the directories into a fresh file; `listRuns` on a store with no index rebuilds it once. A test proves the rebuilt file equals the maintained one, line for line, over a campaign's runs.

### 4.5 Live trailing, the harness half (Workshop, stage C)

The Run Browser's import accepts the file sink's JSONL beside the trace file: the first `{ kind: 'run', record }` line is the record (its `outcome` `IN_PROGRESS` while the run goes), every other line an event; the import stores them as a run and opens the Run Lab, whose header says *still going — re-import to catch up* when the record has no end. `craftabot run --sink telemetry/file --sink-config '{"path":"…"}'` is the harness side, unchanged.

### 4.6 The scale check (stage C)

CI's campaign job gains one step: the injection baseline with `--seeds 1-125` (2,000 cells), `--jobs 4 --no-keep-runs`, timed; the figure is recorded in the stage note.

## 5. UX trajectory

Workshop only: one import format and one header line. No new screens.

## 6. Determinism

A cell's ids and clock depend on its ordinal (`ID_STRIDE`); the report's cells are placed by ordinal; the report's id and stamp are the caller's. Workers change when a cell runs, never what it produces. `merge` sorts by ordinal.

## 7. Non-goals

- No distributed queue, no remote workers: shards are a person's `for` loop across machines and `merge` is how they come back.
- No worker pool in the browser; no shards in the Workshop's campaigns page.
- No live *socket* into the Run Lab: the file sink's lines are the stream, and a re-import is the refresh.
- No resume for a single `craftabot run`; a run is one thing.

## 8. Divergences from `41-…` §6.10 and `42-…` §3, with reasons

| Doc says | This note does | Why |
|---|---|---|
| "each worker owns … a sub-directory" | Workers return the cell and its trace; the main thread writes every run into the one store | One writer keeps the index and `cells.jsonl` ordered; a worker's sub-directory would need a merge of its own |
| "`--resume` skips cells whose run directory holds a verified trace" | Verified against the digest on the `cells.jsonl` line, computed over `events.jsonl` | A campaign run writes no trace file; the digest is the same one `buildTraceFile` would stamp |
| `index.jsonl` "id, agent, scenario, outcome, digest" | `id, agentId, agentName, goalCardId, outcome, summary, digest?` | A run's scenario is the campaign's, not the run's; the card is what the run knows |
| "harness-side live trailing through the file sink" | The Run Browser imports the sink's JSONL, a run in progress included; re-import to catch up | No server in the browser; the file is the stream |

## 9. Risk register

| Risk | Mitigation |
|---|---|
| Workers drift from the in-process path | One function, `runCampaignCell`, run by both; `--jobs 4` byte-identical to `--jobs 1` over the desk baselines is the test |
| A worker dies mid-cell | The cell is recorded as an error, as a thrown cell is today; the campaign completes |
| The index goes stale under an external write | `--rebuild` from the directories; a missing index is rebuilt on first read; the equality test |
| Tests need the built worker | The harness's `test` script builds first; the worker path is the same from `src` and `dist` |

## 10. Implementation plan

- **Stage A — the seam, the pool, the shards.** `execute`/`concurrency`, `prepareCampaign`, `runCampaignCell`, `CampaignCell.ordinal`, `CampaignReport.shard`; the worker and `--jobs`; `--shard`; `craftabot merge`; `--seeds`; tests: jobs 4 = jobs 1 (bytes) over the injection baseline and a desk baseline, shards merged = whole, the merge's refusals.
- **Stage B — resume and the index.** `cells.jsonl` and `--resume` with its digest check; `index.jsonl` on the store with `--rebuild`; tests: a run stopped after k cells resumes with every cell present and none run twice; the rebuilt index equals the maintained one.
- **Stage C — the Workshop, the scale check, the close-out.** The JSONL import and the Run Lab's *still going* line; the CI step and its time; e2e; the close-out.

## 11. Acceptance criteria (WP68 as a whole)

1. `--jobs 4` produces a report byte-identical to `--jobs 1` on the injection baseline and the three desk baselines (the desks in the harness's own tests).
2. A `--shard` set merged with `craftabot merge` equals the whole; a merge over budget, of different campaigns, or with overlapping ordinals is refused.
3. A campaign stopped after some cells and run again with `--resume` finishes with every cell present and none run twice; a cell whose run was tampered with runs again.
4. An index rebuilt from disk equals the maintained one; the store lists ten thousand runs' summaries without opening their directories.
5. The Run Browser imports a file sink's JSONL of a run still in progress and the Run Lab says so.
6. A 2,000-cell scripted campaign completes under a stated time on the CI runner, recorded in the stage note.

> **Stage A landed 2026-09-06.** The seam (§4.1): `RunCampaignOptions.execute`, `concurrency` and `shard`; `prepareCampaign` (the registry, the resolved campaign, the cells, the noise), `runCampaignCell` (one cell exactly as the runner runs it, its trace returned rather than handed out), `shardCells`; the runner placing every result by ordinal and calling `onTrace`/`onCell` as results land; `CampaignCell.ordinal` and `CampaignReport.shard` (`docs/schemas` regenerated). The harness (§4.2): `campaign-worker.js` — its own registry from the config path, content directory and scenario packs the main thread had, its plans, its credentials from the environment it inherited, `runCampaignCell` per message — and `cell-pool.ts` over the harness's own built worker (the same relative path from `src/commands` and `dist/commands`; the harness's `test` script builds first); `--jobs <n>`, `--shard i/n`, `--seeds a-b`, the CLI saying a shard's gates want a merge; `craftabot merge` (`merge.ts`: `mergeCampaignReports` pure over parsed reports, the cells sorted by ordinal, the gates and the summary recomputed against the campaign file, the spend summed, `shard` dropped; refused for different campaigns, overlapping ordinals, a cell with no ordinal, and live cells over `maxLiveCells` or with no budget). The lending pack now exports its baseline builder as the other two do. The proofs (§11 items 1–2, `campaign-scale.test.ts`): `--jobs 4` byte-identical to `--jobs 1` over the injection baseline and the three desk baselines; three shards run on two workers each and merged in another order equal the whole in cells, gates, summary and budget; the four refusals; the CLI's `--shard`, `--seeds` and `merge`. Gate: root lint, every workspace's tests, the build, the evals baseline, the default e2e and the visual set.

