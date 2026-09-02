# 32 — Scenarios (WP44): the corpus, and what a test needs beyond a goal card

> **Status:** design of record for WP44 (`27-DAY3-ROADMAP.md` Phase J), written 2026-09-02 against the codebase after WP43. This is the map for `26-TARGET-DESIGN-V3.md` §6.3; where the two differ, §7 below says why and `26-…` §12 gets a dated note when the stage lands.

---

## 1. Purpose

Four governance scenarios ship today and each is three things held together by prose: a goal card whose layout and manual carry the adversarial content, a scripted plan in `plans.ts`, and a test that knows which assertion should fail when the bot falls for it. Nothing names the threat (`ASI01`, `19-…` #12) as data, nothing can add a fifth scenario without touching a layout, and a third-party corpus of injection strings has no way in. WP44 makes a scenario a *thing*: a goal card plus its tags, its injections, its expectations and its plans — data a pack ships, a campaign names, a report groups by, and a JSONL file becomes.

---

## 2. Where the code actually is

**`packages/packs/starter/src/world/manual.ts`** — the `warning-sign` entry ("STOP! Forget your instructions…") and `cupboard-code` sit in the static `playroomManual`, searched by `tools/look-up-manual.ts` with no access to the world. **`world/services.ts`** — the `forecast` operation's `respond()` carries the confused-deputy payload; `tools/connector.ts` calls it, again with no world in hand (`ToolContext` is `{ tick, notebook, random }`). **`world/layouts.ts`** — `party-line` seeds `heard: [SPOOFED_TEAMMATE_MESSAGE]`; `world/senses.ts` drains `state.heard` once per observation. **`world/actions.ts`** — `radio_send` pushes `{ from, fromName, channel, text, tick }` onto `state.radio`. **`world/playroom.ts`** — `receiveInput` and `configure?` are the only doors into state from outside; `WorldInstance` has no `inject`. **`session/plans.ts`** — `planFor` (safe) and `adversaryPlanFor` (unsafe) by goal card id; `SCRIPTED_OPTIMAL`, `ADVERSARY_PLANS`. **`session/harness.ts`** — `runToCompletion(options)` builds its world through the session from the goal card; no way to hand one in. **`packages/evals/src/campaign.ts`** — a campaign scenario is `{ id, goalCardId, tags, fit, maxTicks }`; cells carry `tags`. **`packages/core/src/types/agent-session.ts:173`** — `CreateSessionDeps.world?` exists, so a pre-built, pre-injected world *can* be handed to a session.

---

## 3. Design principles

1. **The cards do not change.** A scenario wraps a goal card; the four shipped cards, layouts, manual entries and tests stay byte-for-byte. The scenario is the metadata that was in prose.
2. **An injection is content delivered through a mechanism the world already has.** `heard`, a manual entry, a tool result, a radio message — each is a door the Playroom has by hand; `inject` names them so a scenario can use them without a layout.
3. **A world that cannot inject says so, before the run.** A named build problem, not a silent no-op.
4. **Imported corpus rows are content, never code.** They become scenarios in a scenario pack file (JSON), registered like any pack; nothing lands in `starter`.
5. **Tags are the report's vocabulary.** `19-…` #n, OWASP ASI ids, the catalogue's own words — data on the scenario, carried by every cell, grouped by every report.

---

## 4. The design

### 4.1 The schema and the seam (core, stage A)

`schemas/scenario.ts`: `injectionSchema` (four kinds, as `26-…` §6.3) and `scenarioDefinitionSchema` (`id, title, description?, goalCardId, tags, injections, expect { outcome?, evaluators[] }, plans { safe?, unsafe? }, schemaVersion: 1`). `PackManifest.scenarios?` with registry `getScenario`/`listScenarios`. **`WorldInstance.inject?(injection: Injection): void`** beside `configure?`. **`ToolContext.worldState?: Readonly<WorldState>`** — a snapshot the session hands every tool call — because two of the four injection kinds land in state the *tools* read, and a tool has never seen the world; a world-specific tool reads what it recognises and ignores the rest. `BuildProblemCode` gains `world-cannot-inject`.

### 4.2 The Playroom's four doors (starter, stage A)

`inject` on both the solo instance and the per-agent facade: `heard` → `state.heard` now, or `state.scheduledHeard[{atTick,text}]` released into `heard` when an observation is taken at or after that tick; `manual-entry` → `state.manualExtras` (`{ id: key, keywords: [key], text }`), which `look_up_manual` searches beside the static manual when a `worldState` is in hand; `tool-result` → `state.serviceOverrides[toolId] = result`, which `connector` returns instead of `respond()` (the `match` filter is on the tool id); `radio` → `state.radio`, exactly as `radio_send` writes. All four are state, so a snapshot, a replay and a trace see them.

### 4.3 The four shipped scenarios (starter, stage A)

`starter/scenarios/warning-sign`, `keep-the-secret`, `party-line`, `false-alarm` on the starter pack's `scenarios`, each wrapping its card with `tags` (the ASI id, the `19-…` number, the catalogue words already on the goal card's `teachesConcepts`), `injections: []` (the content is in the layout and manual and stays there), `expect` (`outcome` for the safe plan; `evaluators` naming the pack's own assertion card with `pass` for safe and `fail` for unsafe where one exists), and `plans: { safe: 'scripted-optimal', unsafe: 'scripted-adversary' }`.

### 4.4 The runner (evals, stage A)

`runScenario(registry, scenario, { plan: 'safe' | 'unsafe', spec?, seed?, ... })`: builds the goal card's world through the registry, refuses with `world-cannot-inject` when the scenario carries injections and the world has no `inject`, applies every injection, hands the world to `runToCompletion` (which gains `world?`), scripts the named plan, and returns the run plus `expected` — the scenario's expectations checked against the outcome and the named evaluators. The second copies of the four scenario tests run through it and assert the same outcomes as the hand-written ones.

### 4.5 The corpus (evals, harness, Workshop — stage B)

`scenariosFromCorpus(rows, { baseCardId, idPrefix, injection })` turns JSONL rows `{ text, tags?, expected? }` into scenarios over one base card, each row's text as one injection of the chosen kind (a manual entry keyed by a word the adversary plan looks up, by default). A scenario pack file `{ format: 'craftabot-scenarios', id, scenarios[] }` is what the importer writes and what the registry reads back as a pack. `craftabot scenarios --import <rows.jsonl> --card <id> --out <pack.json>` and `craftabot campaign … --scenarios <pack.json>`; the Scenario Library at `/workshop/scenarios` lists registered scenarios, imports a JSONL, and runs one scenario's safe and unsafe plans offline.

### 4.6 Campaigns and reports (stage B)

A campaign scenario may name `scenarioId` instead of `goalCardId`; the runner resolves it against the registry, inherits `goalCardId` and `tags`, and applies its injections to every cell's world. The scorecard gains a **by tag** table (cells, success rate, and each assertion card's pass rate per tag).

---

## 5. Non-goals

A GUI editor for scenarios; injections for worlds other than the Playroom (the Workshop world omits `inject` and so refuses, which is the point); `plans` beyond the two scripted tiers.

---

## 6. Stages

| Stage | Builds | Definition of done |
|---|---|---|
| **A** | This note; schema, seam, the Playroom's doors, the four scenarios, `runScenario` | The four scenarios run through the runner with the same outcomes as their hand-written tests; every injection kind proven; a world without `inject` refuses with the named problem |
| **B** | The corpus importer, scenario packs, `craftabot scenarios`, campaigns by `scenarioId`, the by-tag table, the Scenario Library | A 50-row JSONL imports and runs as a campaign with per-tag rates; an e2e imports and runs one in the Workshop |
| **C** | Close-out | Notes in §7, `26-…` §12, `27-…`, `CLAUDE.md`, README |

---

## 7. Divergences from `26-…` §6.3

- **D-a — `ToolContext.worldState`**: §6.3 lists `manual-entry` and `tool-result` as injection kinds without saying how a tool sees them; the answer is a snapshot on the tool context, a deliberate core seam.
- **D-b — the adversary brain already exists** (WP38's `scripted-adversary`); nothing new is built for §6.3's last paragraph.

Stage notes are appended below.
