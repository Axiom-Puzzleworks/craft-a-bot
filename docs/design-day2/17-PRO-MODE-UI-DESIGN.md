# 17 — The Workshop: Professional Mode UI Design & Mock-up (Workstream 5)

> The design for the professional development & testing environment — the full-fidelity face of the same engine, specs, runs and traces. Includes the screen-by-screen design and the interactive HTML mock-up in `mockups/pro-mode-mockup.html`.
> Prerequisite reading: `15-UIUX-DUAL-MODE.md` (mode architecture and shared foundations), `14-BRICK-REFERENCE-DESIGNS.md` (the capabilities being exposed), `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` (the controls the Workshop exists to prove).

---

## 1. Personas & jobs

| Persona | Jobs the Workshop must serve |
|---|---|
| **Governance practitioner** (Andrew's proving-ground work) | Author policy cards; prove a control catches a violation; produce an audit-quality trace; demonstrate a control to stakeholders using the Kit view of the same run |
| **AI-safety researcher** | Run eval matrices across cartridges/configs/seeds; measure loop/success/cost; red-team scenarios; replay and fork incidents |
| **Educator / trainer** | Prepare guided sessions; author goal cards; inspect learners' exported kits/traces; explain any run step-by-step |
| **Engineer** | Debug bricks/packs; diff prompts; verify schema/trace contracts; develop new packs against the conformance kit |

## 2. Information architecture

```
/workshop
├── (home) Bench Dashboard      — fleet of bots, recent runs, telemetry tiles
├── /spec/[agentId]             — Spec Lab: bench + full config + JSON view
├── /runs                        — Run Browser: filter, pin, compare, import
├── /runs/[runId]               — Run Lab: world + timeline + inspector (the flagship)
├── /evals                       — Eval Matrix: configure, execute, scorecards, baselines
├── /policies                    — Policy Studio: author/test policy cards
├── /telemetry                   — Cross-run dashboards (Phase D+)
└── /export                      — Audit centre: traces, reports, cards, OTel export (Phase F)
```

Persistent left rail (instrument-panel styling); every screen has a "View in Kit" flip where a Kit equivalent exists. All screens are consumers of the same stores + event data (`15-…` §7 rule 1).

## 3. The flagship: Run Lab (`/runs/[runId]`)

Three-region layout (mock-up tab 1):

- **Left — World & Controls:** the same WorldView component (Workshop skin), seed + budget readouts, run controls plus **breakpoints** ("pause on: guardrail trip · tool call · action failure"), and a **time scrubber** over the stored/live event stream. In replay, the scrubber drives `createSessionView`; in live runs it trails the head.
- **Centre — Step Timeline:** the trace as **tick-grouped spans**, one row per event, lane-coloured exactly as the Kit (colour law, `15-…` §5) with icons + labels (never colour alone): sense/think/decide/act/memory/guardrail lanes, durations on think/tool rows, token cost per tick in the gutter. Toolbar: lane filter chips, free-text search, "only failures", "only guardrail activity", jump-to-tick. Rows link causally: a `decision` row highlights its `action.performed` and any `guardrail.*` between them.
- **Right — Inspector:** structured renderer per event type (readable renderers, `15-…` §3): `prompt.composed` with role/section chips, token estimate, and **"diff vs previous prompt"** toggle (the memory-window lesson made visible); `think.completed` with wire request/response raw views; guardrail verdicts with rule, reason, disposition, and policy-card link; world diffs as before/after cells on a mini-grid. Raw JSON is always one click away.

Header strip: outcome chip, cartridge + wire model, effective budgets (from the E8 trace fields), usage totals, digest-verified badge (`✓ trace integrity`), "Re-run with same seed" / "Fork from this tick" (Phase E) / "Open in Kit".

> **Built 2026-08-15 (WP20).** The Run Lab and the Run Browser are live at `/workshop/runs`, over stored runs, read-only. What is *not* built: breakpoints, live-run trailing, causal row linking, and "Re-run with same seed" / "Fork from this tick" — the last two are Phase E by this section's own note, and the first three want a live session rather than a stored one.
>
> **Two things this section did not anticipate.**
>
> 1. **The integrity badge needs three states, not two.** "Checking…" and a verdict is not enough: the check can *fail to run*, and a badge stuck on "checking integrity…" reads as "still working" rather than "you learned nothing here". That happened on the first build.
>
> 2. **The Kit's chrome had to be excluded explicitly.** The root layout wraps every route, and both of the things it renders are Kit-specific — a box-lid nav strip and a tutorial whose chapters describe the bench and the Playroom. A leaflet spotlight pointing at a Workshop table would be pointing at something it has never described.
>
> **`15-…` §7 rule 2 is honoured literally**: rows are labelled with the event type as the engine emits it (`approval.requested`) and carry the Kit's wording as the tooltip. The lane colours are the Kit's, untouched, and `contrast.test.ts` now audits the Workshop token layer to prove no brick colour was redefined and that `--cab-board`/`--cab-rug` are left alone — the Run Lab renders the same `WorldView` the Kit does, and a mode that recoloured the Playroom would make two views of one run disagree about what it looked like.

## 4. The other screens

### 4.1 Bench Dashboard (home)
Fleet table of bots (bricks fitted as colour-chip strip, last outcome, last run time) + telemetry stat tiles: runs this week, success rate, mean ticks-to-success, guardrail saves, spend estimate. Tiles are stat-tile-first (numbers, not charts) with 30-day sparklines where a trend exists. Quick actions: new bot, import kit/trace, open eval matrix.

### 4.2 Spec Lab (`/spec/[agentId]`)
The bench, grown up: same baseplate/sockets on the left (drag still works — the toy interaction *is* good UX); right side replaces the toy panel with the **full schema-driven form** for the selected brick (every `14-…` §4 field incl. strategies, autonomy dial, reasoning effort) plus a **JSON editor** view of the whole `AgentSpec` with inline Zod diagnostics and version/migration info. Bottom: build-checks (same component), plus "contract view" — which brick kinds/packs/versions this spec requires (kit-file `requires` made visible).

### 4.3 Run Browser (`/runs`)
Filterable table (bot, card, outcome, cartridge, date, pinned) over the run store; multi-select → **Compare** (side-by-side Run Labs with synced tick scrubbing — the Multi-Pack "compare" promise, `06-…` §8, delivered here first); import a `.craftabot-trace.json` to inspect foreign runs (digest verification surfaced).

### 4.4 Eval Matrix (`/evals`) (mock-up tab 2)
Configure a matrix — goal cards × cartridges × brick-config variants × seeds — over the 13 §8 harness; execute (scripted tiers free/local, live tiers behind key + spend cap with an explicit estimate); results as a **success-rate grid** (sequential single-hue fill, value labels in-cell, row/column summaries) with drill-down: cell → run list → Run Lab. Scorecard panel: success %, median ticks, loop score, wasted-tick ratio, naming misses, cost — with baseline diffs and a "promote to baseline" action. Every number links to the runs behind it (no unexplainable aggregates).

### 4.5 Policy Studio (`/policies`) (mock-up tab 3)
Author policy cards (`14-…` §4.6): a rule builder (hook → condition → disposition → reason) with the same card rendered in Kit style live (the toy face *is* the documentation); a **test bench**: run the card against (a) stored traces ("would this card have fired?") — instant, free, and the governance-forensics workflow in miniature — and (b) scripted adversarial runs (13 §L5 efficacy suite as a button). Library view: cards versioned, exportable, shareable; provenance shown.

### 4.6 Telemetry (`/telemetry`, Phase D+)
Cross-run trends: success/loop/cost per card per cartridge over time, guardrail trip mix, approval rates + interruption counts (autonomy telemetry, `19-…` #36). Charts follow the dataviz rules: one axis, single-hue sequential for magnitude, lane colours only where they mean lanes, tables always available.

## 5. Design language

Per `15-…` §5: the **bench instrument** skin — brushed panel greys, graph-paper cream surfaces, engraved uppercase labels, lane colours unchanged, oscilloscope-green reserved for live/telemetry accents. Density is higher (13px base in tables) but the accessibility bar is identical to the Kit. The mock-up demonstrates the skin, the three flagship screens, and the shared iconography.

## 6. Mock-up

`mockups/pro-mode-mockup.html` — single-file, static, no dependencies; three tabs (Run Lab · Eval Matrix · Policy Studio) populated with a realistic fake trace of a "Help the teddy get a snack" run (including a guardrail block and an approval), a 6×3 eval grid, and a worked policy card. It is a **wireframe of record**, not production code: layout, hierarchy, and vocabulary are the deliverables; components in the real build come from the shared library.

## 7. Build phasing (mirrors `18-DAY2-ROADMAP.md`)

| Phase | Workshop deliverable |
|---|---|
| C | Run Browser + Run Lab (read-only over persisted runs; replay + filters + inspectors) — the foundation everything else reuses |
| D | Spec Lab; Policy Studio v1 (author + test-against-traces); Eval Matrix over the harness; Bench Dashboard |
| E | Compare runs; fork-from-tick; group traces (multi-agent); telemetry v1 |
| F | Audit centre: OTel-mapped export, agent cards, safety-case worksheet (`19-…` #20, #28–30) |
