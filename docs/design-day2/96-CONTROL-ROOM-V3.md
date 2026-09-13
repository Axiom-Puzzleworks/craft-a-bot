# 96 — Control Room v3: power and richness (WP109)

> **Status:** WP109's design of record, opened 2026-09-13 (Phase AB, `84-DAY6-ROADMAP.md`; `83-TARGET-DESIGN-V6.md` §6.7.1–§6.7.2; G69, G70; tenet 32). Stage A is *power* (the palette, saved views, density, cross-links); stage B is *richness* (the roundels and the wave-2 seams, the journey covers, the tapes' band, the glyph test). Access — the twins, the keyboard models, the screen-reader walk, the snapshots — is WP110's (`83-…` §6.7.3). Everything here is `apps/workbench` but for one deliberate `core` change (§3.2: a fifth content kind).

## 1. Where the code is

- **`apps/workbench/src/lib/workshop/palette.ts`** — the palette's fold, pure: `routeEntries(lens)` (every rail destination in the lens's words), `artefactEntries(store, lens)` (every stored run, campaign report, workflow run, experiment result, stack and saved view, by id and title), `rankPalette(entries, query, limit)` (a subsequence match that prefers a word start, ties broken by kind then title). **`palette.test.ts`.**
- **`apps/workbench/src/lib/workshop/actions.svelte.ts`** — the action registry: a screen registers the actions it exposes (`registerActions([...])` in an effect, unregistered on leave) and the palette lists them beside the routes and artefacts.
- **`apps/workbench/src/lib/components/workshop/CommandPalette.svelte`** — the dialog: `Ctrl+K` / `⌘K` from any Workshop route (and the rail's *Go to…* button); a combobox over a listbox; `↑`/`↓`, `Enter`, `Escape`; keyboard-only from the first keystroke; the artefacts loaded from the store when it opens.
- **`packages/core/src/schemas/view.ts`**, **`schemas/content.ts`** — **`SavedView`** and the fifth content kind `view` (`local/views/<slug>`): a lens, a route and a search string — *a view is a URL*. `localPackFrom` ignores it (a view is the Workshop's, never a pack's).
- **`apps/workbench/src/lib/workshop/views.ts`** — `viewFromUrl(lens, url, title)`, `viewHref(view)`, `viewsFor(records, lens)`; the rail's *Views* section (`WorkshopRail.svelte`) lists the lens's views beneath its groups and saves the current URL as one.
- **`apps/workbench/src/lib/state/settings.ts`**, **`preferences.svelte.ts`**, **`lib/workshop/lens.ts`** — **density**: `comfortable` / `dense`, remembered per lens (`density: Record<lens, Density>`), the analyst's lenses (`engineer`, `model-risk`) dense by default and the board's (`assurance`, `conduct`) comfortable (`DEFAULT_DENSITY`); `data-density` on the Workshop's root (`routes/workshop/+layout.svelte`) and the one rule in its style: every table's cell and every rail row tighter under `dense`, nothing else — a fold is not a layout.
- **`apps/workbench/src/lib/workshop/referrers.ts`** — **`referrersOf(target, store)`**: what links to an artefact — a run's campaign cell, workflow stage, fork; a campaign report's experiment and the workflow runs it sourced; a workflow run's handoffs and forks; a stack's campaign reports and experiment results. **`referrers.test.ts`** (a test per artefact kind). **`components/workshop/LinkedFrom.svelte`** renders the list on the Run Lab, the Pipeline and the Campaigns screen's open report; every id it prints is a link.
- **`apps/workbench/src/routes/workshop/runs/+page.svelte`** — the Run Browser's filter mirrored to the URL (`?text=&bot=&card=&outcome=&provider=&pinned=`), so a saved view of it round-trips.
- **`apps/workbench/src/lib/assets/instruments.ts`** — the roundel family gains `catalogue` and `domain` (with `journey`, `point` and `stack` from WP100–101, the five of `83-…` §6.7.2), placeholders to the wave-2 brief (`63-…` §5.2's dated note); the Catalogue page's strip and the journeys page's coverage strip wear them.
- **`apps/workbench/src/lib/assets/covers.ts`**, **`components/control-room/JourneyCover.svelte`** — **the journey covers**: one illustration per shipped journey on the swap-in seam (`coverFor(workflowId)`: a delivered SVG when the commission lands, the in-house placeholder — the journey's roundel on a graph-paper card with the lanes as bands — until then), on the journeys page's cards and the Playground box.
- **`apps/workbench/src/lib/components/control-room/Tape.svelte`** — `reference.band?: { low, high }` drawn as a shaded region behind the hairline; the Monitor's tapes pass the interval.
- **`apps/workbench/src/lib/control-room/dataviz.test.ts`** — **the glyph test**: every `STATUS` state's glyph differs from every other's, and its token too — the colour-vision-safe pair.
- **`e2e/palette.spec.ts`**, **`e2e/views.spec.ts`**, **`e2e/density.spec.ts`** — the palette reaching every route and a stored artefact; a saved view round-tripping through the URL; density changing no screen's text (a test per route).

## 2. Power (`83-…` §6.7.1)

### 2.1 The palette

Every route the lens's rail lists, labelled as the rail labels it; every stored artefact by id and title — a run (its bot and card), a campaign report (its title), a workflow run (its workflow and item), an experiment result (its title), a stack (its title), a saved view; every action a screen has registered while it is on screen (*Run campaign*, *Fork from this tick*, *Explain this decision*, *Open in the Studio*). The fold is pure over its inputs and the query; the ranking is a subsequence match — every character of the query in order — scored higher for a match at a word start and for a shorter title, so `ru` finds *Runs* before *The Run Lab: 3f2…* and an id's first hex digits find the run. Twelve rows at most. The dialog is keyboard-only from the first keystroke: `Ctrl+K` opens it with the input focused, `↑`/`↓` move, `Enter` goes, `Escape` returns focus to where it was.

### 2.2 Saved views

A view is a URL: the route and its search string, with the lens it was saved under and a title. Saving reads the page's URL as it stands — which is why every filter worth saving must live in the URL (the Run Browser's now does; the Campaigns screen's `?baseline=`/`?stack=`, the Experiments screen's `?result=`/`?guard=`, Compare's `?a=&b=`, the Pipeline's `?stage=` and `?against=` already did). The rail lists the current lens's views beneath its groups; opening one is a navigation; removing one is a click. Views live in the content store as the kind `view` and never reach a pack, an evidence store or a kit file.

### 2.3 Density

Two values, remembered per lens: *dense* for the analyst (the engineer and model-risk lenses), *comfortable* for the board (assurance and conduct). Density changes padding and type size on tables and the rail and nothing else — no column, no row, no number, no order. The e2e holds every route's text equal under both.

### 2.4 Cross-links

Every id on the four artefact screens is a link to its artefact, and each lists *Linked from*: for a run, the campaign report whose cell it is (by seed and build), the workflow run whose stage it ran, the runs forked from it; for a workflow run, the runs that handed off to it and the ones forked from it; for a campaign report, the experiment results that fold it and the workflow runs it sourced; for a stack, the reports that ran under it. The fold is pure over the store's lists; the pages call it with what they already load.

## 3. Decisions

1. **The palette's actions are registered, not discovered.** A screen says what it exposes in one line; nothing scrapes buttons. The registry is a rune store because the palette must see a screen's actions the moment the screen mounts.
2. **A view is a URL, so the URL must carry the state.** The Run Browser's filter moved into the URL for this; the other screens' selections were already there. A screen whose state is not in the URL cannot be saved, and that is the rule, not a gap.
3. **`view` is a core content kind** — a deliberate `core` change (hard rule 4), because the content store's envelope enumerates its kinds and validates each inner record. The inner schema is three strings; `localPackFrom` skips it; the registry never sees one. `34-CONTENT-STORE.md` gains the dated note.
4. **Density is remembered per lens, not per screen.** A reader wearing the board's lens wants the same air everywhere.
5. **The covers are placeholders on the seam**, like every wave-2 asset: `coverFor` returns the delivered file when it exists and the in-house card otherwise, and the test holds every shipped journey to a cover.

## 4. Richness (`83-…` §6.7.2)

- **Roundels**: `catalogue` (a bound register) and `domain` (a map pin over a card) join the family, placeholders to the brief; nineteen becomes twenty-one. The Studio's verdict flow and the Journey Canvas are the two new drawings, both landed (WP100, WP101).
- **Journey covers**: one per shipped journey, in the Kit's voice, on the journeys page's cards and the Playground box's strip. The placeholder is drawn from the journey's layout — its lane count as bands, its roundel — so no two are alike.
- **The tapes' reference band**: `Tape.reference.band` as a shaded region (the interval) with the hairline at its centre; the Monitor passes the baseline's interval where it has one.
- **The pass/fail pair**: the glyph test over `STATUS`.
- **Not here**: the lit ring's replay control and reduced-motion twin (`83-…` §6.7.2's fourth bullet) go with WP110's reduced-motion snapshots, where the twin is tested.

## 5. Tests

- `palette.test.ts` — routes in the lens's words, artefacts by id and title, the ranking's order, the cap.
- `referrers.test.ts` — a test per artefact kind over a fixture store.
- `views.test.ts` — from a URL and back; the lens filter.
- `preferences.svelte.test.ts` — density per lens with the lens's default.
- `dataviz.test.ts` — the glyph test.
- `covers.test.ts` — a cover per shipped journey; the placeholder's determinism.
- `Tape.svelte.test.ts` — the band's region within the plot box.
- e2e: `palette.spec.ts` (every route reachable from the palette by name; a stored run reachable by id), `views.spec.ts` (save on the Run Browser with a filter, open from the rail on another route, the filter restored), `density.spec.ts` (a test per route: the stage's text equal under both densities).

## 6. Budgets

The palette, the views, the referrers and the covers are small; the budgets move where the build says (`01-…` §8's dated note).

## 7. Stage notes

> **Stage A — 2026-09-13.** Power, as §2: the palette (`palette.ts`, `actions.svelte.ts`, `palette-state.svelte.ts`, `CommandPalette.svelte`; `Ctrl+K` on the layout, *Go to…* on the rail; the Run Lab, the Pipeline and the Campaigns screen registering their actions), saved views (`core`'s `view` kind and `SavedView`, `views.ts`, the rail's *Views* section saving the browser's URL — `location`, not `page.url`, which a screen's `replaceState` does not move first), density (`settings.density` per lens, `preferences.density`/`setDensity`, `DEFAULT_DENSITY`, `data-density` and the one rule on the layout, the rail's switch), cross-links (`referrers.ts`, `LinkedFrom.svelte` on the Run Lab, the Pipeline and the open stored report; the Campaigns screen taking `?report=`; the Run Browser's filter in the URL, written from its handlers — an effect that wrote it died on the router's first tick). Found on the way: a screen registering actions from an effect must read the registry untracked or re-run itself for ever (`untrack` in `registerActions`); `resolve()` drops a query, so a view's or a referrer's search goes back on after it, under the Pipeline's lint exception; `page.keyboard.press('Control+k')` reaches the page in Chromium. Budgets +40 kB, the Worker +10 kB (`01-…` §8). Stage B next.
