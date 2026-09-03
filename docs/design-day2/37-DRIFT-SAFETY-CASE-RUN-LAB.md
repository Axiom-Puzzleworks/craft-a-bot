# 37 — Drift, the safety case v2 and the live Run Lab (WP49)

> **Status:** design of record for WP49 (`27-DAY3-ROADMAP.md` Phase K's last row — the WP48 close-out called Phase K closed one row early; this WP closes it), written 2026-09-03 against the codebase after WP48. This is the map for `26-TARGET-DESIGN-V3.md` §6.15's three middle sentences (the `/telemetry` time axis, the Run Lab's breakpoints and live trailing) and §9's `/safety-case` and `/workshop` rows; where the two differ, §7 below says why and `26-…` §12 gets a dated note when the stage lands.

---

## 1. Purpose

Three things the Workshop's own docs record as not built. `/telemetry` is a current-state breakdown, not a series: `18-…` §7 item 28 says in as many words that `19-…` #23's "drift dashboard" asks for trend over time and stage A of WP34 did not ship it (gap G14). The safety case's trustworthiness section is run history and nothing else — "no eval-matrix figure ships — nothing yet ties a stored eval run back to one bot" (`17-…` §4.9) — while, since WP43 and WP38, evaluations sit beside every run and campaign reports sit in the store, neither of them quoted. And the Run Lab is read-only over stored runs: `17-…` §3's own note lists breakpoints and live-run trailing as wanting "a live session rather than a stored one" (gap G16). WP49 builds the three: a daily series with a drift flag, a safety case that quotes evaluation verdicts and campaign gates, and a Run Lab that can sit on the app's live bus, pause it at a breakpoint and resume it. The Bench Dashboard gains campaign tiles on the way.

---

## 2. Where the code actually is

**`governance/src/reports/telemetry.ts`** — `telemetryByCard`, `telemetryByCartridge`, `guardrailMixFromSummaries`, `autonomyTelemetryFromSummaries`; every count over `RunRecord` rows and `RunSummary` rows (WP36 stage C), the pre-summary signatures kept as wrappers. **`governance/src/reports/safety-case.ts`** — `safetyCaseFromSummaries(agent, capabilities, world, tools, runs, summaries)` returning `SafetyCase { inability, reach, guardrails, trustworthiness, hostedScreening, egress }`. **`core/src/schemas/records.ts`** — `RunSummary { guardrailTrips, approvals…, findings, decisions, hostedPreActScreens, egress? }`, `StoredCampaignReport` (the envelope; the report inside is opaque to core). **`core/src/schemas/evaluation.ts`** — `EvaluationRecord { runId, evaluatorId, campaignId?, result { verdict?, score?, … } }`, on all three stores. **`evals/src/campaign.ts`** — `campaignReportSchema { cells[{ build, outcome?, … }], gates[{ id, where?, required, observed?, passed }] }`; a build's base is `'starter-default'` or a kit file, and the report names builds by id only. **`core/src/session/agent-session.ts`** — `start(mode)` calls `startRun` unconditionally: a paused run told to play starts again from tick 0 with a second `run.started`; `pause()` sets `pauseRequested` and the play loop honours it after the tick in hand. **`workbench/lib/state/session.svelte.ts`** — `createSessionView`, one per Playroom page, absorbing every event into the shared projection. **`routes/play/[agentId]`** — the Playroom, where every live solo run lives. **`routes/workshop/runs/[runId]`** — the Run Lab, loading a stored run and its events once. **`routes/workshop/telemetry`, `/safety-case`, `/campaigns`, `/` (Bench)** — the screens this WP touches. **`harness/src/commands/report.ts`** — `reportTelemetry`, `reportSafetyCase`, calling the same folds.

---

## 3. Design principles

1. **Drift is arithmetic over rows the store already keeps.** A day's bucket is a fold over `RunRecord.startedAt` and the run's `RunSummary`; a flag is a comparison between a bucket and the buckets before it. No new record, no clock read inside the fold.
2. **Evidence is quoted, never re-derived.** The safety case names the evaluator and its verdict count, the campaign and its gate verdict, as they were stored. A gate scoped to another build is not this bot's evidence and is not shown.
3. **A campaign knows its bots.** The report gains `builds[{ id, agentId?, agentName? }]` — the one field that lets a stored report be held against a shelf bot. Additive with a default, so every stored report parses.
4. **A breakpoint is host state, and a pause is the engine's existing pause.** The host decides to pause on an event it has just absorbed; the engine's `pause()` does what it always did. Resuming is the one engine change: `start()` on a paused run continues it rather than starting a second one.
5. **Live trailing is the same projection over the same bus.** The Run Lab renders the live session's `events` through the fold it already uses for stored ones; nothing is read from the session's world.

---

## 4. The design

### 4.1 The series and the drift flag (governance, stage A)

`telemetrySeries(runs, summaries)` returns `TelemetryBucket[]`, one per UTC day from the first run's day to the last, contiguous (an empty day is a bucket with `runs: 0` and `undefined` rates — a gap is a fact about the fleet):

```ts
interface TelemetryBucket {
	day: string; // YYYY-MM-DD, UTC
	runs: number;
	finishedRuns: number;
	successRate: number | undefined; // over finished
	loopRate: number | undefined; // OUT_OF_STEPS over finished — the loop score the roadmap names
	trips: Record<string, number>; // guardrail id → trips, from the summaries
	tripsPerRun: number | undefined; // total trips over runs with a summary
}
```

`driftIn(series, options?)` returns `DriftFlag[]`. A bucket with at least `minRuns` (3) finished runs is held against the baseline made of the previous `window` (3) buckets that had any runs, pooled — a baseline needs `minRuns` finished runs too, or the bucket is skipped. Two comparisons, each its own flag kind:

- `trip-mix` — the total-variation distance between the two normalised trip mixes, `½ Σ |p − q|` over the union of guardrail ids; flagged at `≥ mixThreshold` (0.5). Two mixes with no trips at all are the same mix; one with trips against one without is distance 1.
- `loop-rate` — `|loopRate − baselineLoopRate|`; flagged at `≥ loopThreshold` (0.3).

A flag is `{ day, kind, magnitude, detail }` where `detail` names the two things compared ("`safety/action-blocklist` 90% → 10%; `safety/step-budget` 10% → 90%"). Pure; the thresholds are options with defaults so a test can plant a smaller drift. Exported from `@craftabot/governance/reports` beside the other folds; `reportTelemetry` in the harness gains `series` and `drift`.

### 4.2 The safety case v2 (governance, evals — stage A)

`SafetyCase` gains two sections:

```ts
evaluations: Array<{ evaluatorId: string; pass: number; fail: number; inconclusive: number; unscored: number; meanScore: number | undefined }>;
campaigns: CampaignEvidence[];
```

`safetyCaseFromSummaries` takes a seventh and eighth argument, both optional so every caller compiles unchanged: `evaluations: readonly EvaluationRecord[]` (the caller passes the store's rows; the fold keeps only those whose `runId` is one of this bot's runs) and `campaigns: readonly CampaignReportLike[]`.

`CampaignReportLike` is the structural slice of a campaign report governance needs — `{ id, campaignTitle, createdAt, passed, builds?, cells[{ build, outcome? }], gates[{ id, required, observed?, passed, where?: { build? } }] }` — so `@craftabot/evals`' `CampaignReport` satisfies it without governance importing evals (the ESLint rule keeps governance on core). `campaignEvidenceFor(agentId, reports)` finds every build whose `agentId` is this bot and returns, per report and build:

```ts
interface CampaignEvidence {
	reportId: string; title: string; createdAt: string; passed: boolean; buildId: string;
	cells: number; outcomes: Record<string, number>; // this build's cells, by outcome
	gates: Array<{ id: string; required: string; observed: number | undefined; passed: boolean; scoped: boolean }>;
}
```

A gate is quoted when its `where.build` is this build (`scoped: true`) or when it names no build (it applied to every build, this one included). A gate scoped to another build is left out. The evals report gains `builds: z.array({ id, agentId?, agentName? }).default([])`, filled by `runCampaign` from each build's kit file (`kit.agent.id`/`name`); a `starter-default` build has neither.

The Workshop's campaigns page gains **"Add a shelf bot as a build"** — a picker over the shelf that appends a `kit` build made with `buildKitFile` from the record, so a bot can run in a campaign without leaving the app. The safety-case page renders the two sections (`evaluations`, `campaigns`), each with its honest empty state; the harness's `reportSafetyCase` passes the store's evaluations and its parsed reports.

### 4.3 Resume, breakpoints and the live bus (core, workbench — stage B)

**Core.** `start(mode)` on a session whose run has begun and is `'paused'` resumes: the mode is updated, and in play mode the loop continues from the tick in hand; `run.started` is not emitted again and the tick count is kept. `start()` on an idle session is unchanged. `02-…` §7 needs no new event: a pause has never been an event, and the resume is the absence of a second `run.started`.

**Breakpoints** are a Workshop preference (`settings.breakpoints: BreakpointKind[]`, `BreakpointKind = 'guardrail-trip' | 'tool-call' | 'action-failure'`, default none), read live by the session view through a getter. In `absorb`, after the projection is updated: in play mode, while running, an event that matches an armed kind — `guardrail.tripped`; `tool.executed`; `action.performed` with `result.ok === false` — calls `session.pause()` and records `state.breakpoint = { kind, tick, eventIndex }`. The run pauses after the tick in hand, as every pause does. `SessionView` gains `breakpoint` (cleared on `start`) and `resume()` (`start('play')`). The Playroom shows a notice (`breakpoint-notice`: "Paused at a breakpoint — a safety rule tripped on turn 3") with a Resume button; the lamp says Paused, as it does for any pause.

**The live bus.** `lib/state/live-run.svelte.ts` is a module-level store (safe for the same reason `appStorage` is: the app is client-rendered) holding the current live solo session: `attach(view, { agentId, agentName })`, `current` (`{ view, agentId, agentName }` or `undefined`, reactive), `release()`. The Playroom attaches after building its view and releases when the page is left or reset. The Run Lab, given a `runId` that matches `current.view.runId`, renders the live view's `events` instead of the store's, shows a `LIVE` chip with the session's status, trails the head (the scrubber follows the last tick until a person moves it; a "Follow" button re-follows), offers the breakpoint checkboxes and Pause / Resume, and re-runs the integrity check when the run finishes. The Playroom, when the Workshop door is open, links to the Run Lab for the running run. The harness's sink streaming into the Run Lab (§6.15's "once the harness's sink can stream to it") is not built — it wants a listening socket in the browser or a relay, and neither exists; §5.

### 4.4 The screens (stage B)

- `/telemetry` — a "Over time" section: one row per bucket (day, runs, success, looped, trips per run, the busiest guardrail), the bars single-hue, and a "Drift" list above it (`telemetry-drift`) naming each flag's day, kind and detail — or "No drift flagged" with the thresholds stated, or "Not enough history" when no bucket qualifies.
- `/safety-case` — "Evaluation evidence" (`evaluation-evidence`, one row per evaluator with pass/fail/inconclusive counts and a mean score) and "Campaign results" (`campaign-evidence`, one block per report and build quoting the gates), each with its empty state.
- `/workshop` — "Campaigns" tiles (`campaign-tiles`): the newest reports, each with verdict, gates passed of total, cells and when, linking to `/workshop/campaigns`.
- `/workshop/campaigns` — the shelf-bot build picker (§4.2).

---

## 5. Non-goals

Fork-from-tick (`27-…` §3's "not scheduled" list). Group episodes on the live bus — the duo page keeps its own view; the Run Lab trails solo runs only. The harness streaming into the Run Lab (§4.3). A charting library — bars are CSS, the table is always there (`17-…` §4.6's rule). A cost figure of any kind. Breakpoints on stored runs — a stored run has nothing to pause.

---

## 6. Stages

- **A — folds and the report's builds.** `telemetrySeries`/`driftIn` with the two-week fixture (the drift planted on day 11: the trip mix flips and the loop rate jumps; a quiet corpus flags nothing); `SafetyCase.evaluations`/`campaigns` with `campaignEvidenceFor`; `builds` on the evals report; `reportTelemetry`/`reportSafetyCase` widened. Gate: governance 100% on the folds' files as before, evals, harness.
- **B — the app.** Core resume with its tests; breakpoints in the session view; the live-run store; the Playroom's notice, Resume and Run Lab link; the Run Lab's live mode; the four screens. E2e: the telemetry series over a seeded two-week corpus flags the planted drift (seeded straight into IndexedDB, the same rows the app writes); a bot added to the baseline as a build and run in the campaigns page is quoted on its safety case; a breakpoint on guardrail trip pauses a live run at the first `guardrail.tripped`, the Run Lab trails it live, and Resume finishes it.
- **C — close-out.** This doc's stage notes; `26-…` §12; `27-…` row and §8 item 18 (and the Phase K correction); `17-…` §3, §4.6, §4.9; `CLAUDE.md`; the README.

---

## 7. Divergences from `26-…` §6.15 and §9, with reasons

- **Resume is a core change §6.15 did not list.** Breakpoints without a resume are a stop button with extra steps; the change also retires a latent defect — a paused Kit run told to play again started a second run inside the same trace.
- **The campaign report names its builds' bots.** §6.9's report shape had no way to hold a report against a shelf bot; `builds` is the smallest addition that does, and the Workshop's build picker is what makes the DoD's "a bot that ran in a campaign" reachable without a file round trip.
- **The live bus is the app's own session, not a harness stream.** §6.15 tied breakpoints and trailing to the harness's sink streaming into the Run Lab; the Run Lab trails the Playroom's session instead, which needs no socket, and the harness half is left recorded rather than approximated.
- **`egress summary` on the Bench (§9) is not added** — the safety case already carries the egress rows per bot (WP41), and a fleet-wide list of hosts with no bot beside it says nothing a person can act on. Campaign tiles are added as §9 and the WP row say.
