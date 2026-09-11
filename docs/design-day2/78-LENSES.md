# 78 — The lens system, the Assurance entry, Compare for reports, the guided paths (WP87)

> **Status:** design of record for WP87 (`65-DAY5-ROADMAP.md` Phase U), opened 2026-09-11 on the `day5` branch after WP86. Stage A is this note; stage B `lens.ts`, the rail regrouped with its switcher, Settings, the guided strip; stage C the Assurance entry, Compare for two reports, the tests and the docs.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.7 (retires part of G53 and G55; decision D9; tenet 25; GAP-2 and GAP-6): a lens is configuration over the existing routes and folds — it changes the rail's order and grouping, the entry page and the vocabulary, never the data. Four ship; the reader's is remembered; a three-step guided path opens each lens's entry until dismissed; the Assurance entry is re-cut as the board's landing; two campaign reports open side by side in Compare.

---

## 1. Where the code is

1. **The rail** (`WorkshopRail.svelte`): one hand-written list of twenty destinations in the engineer's order, the labels the engineer's; `+layout.svelte` derives `current` from the path.
2. **Settings** (`lib/state/settings.ts`, `preferences.svelte.ts`): the reader's preferences in `localStorage` under `cab.settings.v1` — the Workshop door, the run cap, the display name, the tutorial's chapter.
3. **The Assurance pack page** (`/workshop/assurance`, `53-…`): one bot's pack — the control maps' rows, the evaluations, the campaigns — with its three downloads. **Compare** (`/workshop/compare?a=&b=`, `54-…`): two agent runs under one scrubber, forked or not.
4. **The Control Effectiveness Register** is WP90's (`64-…` §6.8); nothing folds it yet.

## 2. Principles

- **A lens orders; it hides nothing.** Every destination is on every lens's rail, grouped for the reader's question with the reader's group first; every route stays reachable by URL under every lens.
- **The vocabulary is a map applied by one function**, `vocab(lens, term)` (and `speak` for a sentence), over a fixed list of the engineer's terms; a lens that has no other word gets the engineer's. The test holds that no lens maps a term to nothing and maps no unknown term.
- **The entry page is composed from existing folds.** The Assurance entry is the safety case's claims, the incidents fold, the drift fold and the pack's downloads, over the same stored facts; the register's table renders *untested* over an empty register until WP90 folds one, and says so.
- **The guided path is content**, three steps per lens rendered by one component on the lens's entry page until the reader dismisses it, once, remembered with the other preferences.

## 3. The lenses (`lib/workshop/lens.ts`)

`LensId = 'engineer' | 'assurance' | 'conduct' | 'model-risk'`; `Lens { id, name, question, entry, rail: RailGroup[], vocabulary, firstRun: FirstRunStep[] }`; `LENSES`, `lensById`, `vocab`, `speak`, `railLabel`, `VOCABULARY_TERMS`. The engineer's rail is one group in today's order; the Assurance lens groups *Assurance* (assurance, safety case, incidents, audit), *Evidence* (campaigns, workflows, evidence), *The bank* (playground, monitor), *Everything else*; the Conduct lens *Conduct* (incidents, playground, workflows, campaigns), *The rules* (policies, evaluators, scenarios, guards); the Model-risk lens *Model risk* (telemetry, campaigns, evals, evaluators), *Evidence*, *The bank*. The Conduct and Model-risk entries are WP88's pages; until they land, the lenses open on Incidents and Telemetry, the pages that hold their facts today.

Settings: `lens` (default `engineer`) and `firstRunDismissed: LensId[]`; `preferences.lens`/`setLens`, `firstRunDismissed`/`dismissFirstRun`. The rail reads the lens, draws its groups with a heading each (none for the engineer's one group), labels each destination through `railLabel` (*Experiments*, *Treatment failures*), and carries the switcher at its head; Settings offers the same picker under the Workshop door.

## 4. The guided path and the entry pages

`FirstRun.svelte`: a Strip with the lens's name and question, its three steps as links, and *Got it*. `+layout.svelte` mounts it when the path is the lens's entry and the lens is not in `firstRunDismissed`.

**The Assurance entry** (`/workshop/assurance`, the picker kept): a Strip at the head — the four claims of the safety case as Lamps (*inability stated*, *reach named*, *guardrails installed*, *runs finished*), incidents this period, drift flags, and the pack's downloads — over the selected bot; beneath it the **register** as a `CaseTable` (control, what it changed, by how much, how sure) rendering *untested* with the sentence that WP90 folds it; then the pack's rows as before; and **Compare two reports** — two pickers over the stored reports into `/workshop/compare?reportA=&reportB=`.

**Compare for reports** (GAP-6): with `reportA` and `reportB`, Compare loads two stored reports and draws them side by side — cells, verdict, gates passed as readouts, then one table with the union of gate ids as rows and each report's verdict lamp and observed value as columns (aligned by id; a gate one report lacks reads *not in this report*), then the fairness rows likewise. The run panels are untouched; `a`/`b` still compare two runs.

## 5. Tests

- `lens.test.ts`: four lenses, every destination once per lens, three steps each, every term answered under every lens, no unknown term, the engineer's rail as it was, `speak` and `railLabel`.
- `settings.test.ts` / `preferences.svelte.test.ts`: the lens and the dismissals round-trip and default.
- `lenses.spec.ts` (e2e): the matrix — every rail destination renders under every lens with the lens's groups on the rail; the guided strip shows on the entry, dismisses, and stays dismissed across a reload; the Assurance entry renders for a bot with no experiment and says *untested*; two reports side by side in Compare with the gate rows aligned; axe over the entry under each lens.

## 6. Divergences from `64-…` §6.7

- The Conduct and Model-risk entries point at Incidents and Telemetry until WP88 lands their pages; the lenses, their groups and their words are complete now. **Amended 2026-09-11, later (WP88, `79-…` §5):** resolved — the entries are `/workshop/conduct` and `/workshop/model-risk`, both destinations lead their lens's first group and sit after the Monitor on the engineer's rail.
- The register renders as a `CaseTable` with no rows and the word *untested* rather than a stub fold: WP90 owns the fold and its schema, and an empty table that says why is honest where a fabricated row would not be.
- **A finding on the way (Svelte 5):** a `$state` created lazily *inside* a `$derived` is not tracked by that derived — the rail's first read of `preferences.lens` built the preferences singleton inside its own derived and never re-drew. The shared preferences are now built at module load (`preferences.svelte.ts`), outside every reactive context, with a unit test (`preferences-lens.svelte.test.ts`) holding the lens reactive.
