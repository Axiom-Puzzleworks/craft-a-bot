# 97 — Control Room v3: access, the CI gates and the tail (WP110)

> **Status:** WP110's design of record, opened 2026-09-13 (Phase AB, the last of Day 6; `84-DAY6-ROADMAP.md`; `83-TARGET-DESIGN-V6.md` §6.7.3; tenets 29 and 32; G68, G71). Four stages: **A** the twins and the keyboard models; **B** landmarks, headings, skip links and focus return; **C** the CI gates — the screen-reader walk, the zoom and reduced-motion snapshots, the contrast test over the new tokens, every visual baseline over the fixture corpus; **D** the tail — the manual's Part H and the PDF with the journey figures, GAP-1 as review-as-content, GAP-5 folded into the Studio's bench, the UX register's third pass. Everything is `apps/workbench` but for GAP-1's content kind and the pack's review field (`core`, `governance`).

## 1. Where the code is

- **`apps/workbench/src/lib/control-room/boundary-twin.ts`**, **`components/control-room/BoundaryList.svelte`** — the Boundary's list twin as a fold over the same layout the drawing uses (`layoutBoundary`): one row per outside node, per ring element (the safety bricks, the egress gate, the approval crossing, the rules), per inside occupant and per workflow stage, each with the drawing's own facts (lit, flagged, hosts, executor, status); rendered always beneath the figure (the hand-written figcaption list it replaces), tested equal to the layout (`boundary-twin.test.ts`). The drawing gains a **keyboard model**: the outside nodes and the workflow stages are focus stops (`tabindex` roving, `←`/`→` around the ring, `Enter` selects, `Escape` leaves), each announced from its twin's row (`aria-labelledby` the row's id).
- **`apps/workbench/src/routes/workshop/workflows/[runId]/+page.svelte`** — the Pipeline rail's keyboard model (`↑`/`↓` between the stage cards, `Home`/`End`), its twin the `JourneyList` the page already draws beside the Canvas; **`pipeline-rail.test.ts`** holds the rail's cards equal to the twin's rows.
- **`apps/workbench/src/routes/workshop/studio/+page.svelte`** — the Studio's points gain the `JourneyList` twin beside the Canvas (the loop-alone mode is a list already).
- **`apps/workbench/src/routes/workshop/monitor/+page.svelte`**, **`lib/workshop/monitor-twin.ts`** — the Monitor's queue drawing (a Canvas per desk with the waiting count as a badge) gains a table twin over the fold's queues; **`monitor-twin.test.ts`**.
- **`apps/workbench/src/routes/workshop/+layout.svelte`** — the skip link (*Skip to the content*) as the first focus stop on every route, the stage as the landmark it reaches; the rail's groups as labelled sections. Every route without a `<main>` gets one (the Playground's ten pages, the Catalogue, the Armour and Guards redirects); every route keeps one `h1`.
- **`apps/workbench/src/lib/a11y/return-focus.ts`** — `returnFocus(opener)`: what every drawer does on close (the Pipeline's what-if, the Run Lab's Explain fold, the rail's save-view form; the palette already did).
- **`apps/workbench/e2e/access.spec.ts`** — the screen-reader walk: on the three canvases (the Journey Canvas on the journeys page, the Boundary in the Spec Lab, the Studio's points) `Tab` to the canvas and arrow through every focus stop, reading each stop's accessible name — non-empty, unique, and the twin's row; the skip link, the landmark and the heading on every Workshop route.
- **`apps/workbench/e2e/access-visual.spec.ts`** — the 320 px and 640 px (200 % of 1280) snapshots of the four canvases' routes, and the lit Pipeline under `reduced-motion: reduce` and `no-preference` settled equal.
- **`apps/workbench/src/lib/styles/contrast.test.ts`** — every Day 6 token (the lanes, the points, the verdict flow, the covers' tint) in the table.
- **`apps/workbench/e2e/workshop-visual.spec.ts`** — every shot over the fixture corpus: the Experiments, Workflows, Monitor and Studio shots seeded so no empty state is a figure.
- **`packages/core/src/schemas/content.ts`**, **`schemas/control-review.ts`** — **GAP-1**: the sixth content kind `control-review` (`local/reviews/<map>--<ref>`): a row's review as a record beside the pack's row — `status: 'reviewed' | 'disputed'`, `by`, `note`, `reviewedAt` — never a pack edit. **`packages/governance/src/reports/assurance-pack.ts`**: `AssurancePackInput.controlReviews?` and each filed row's `review?`; both renderers print it. **`apps/workbench/src/routes/workshop/assurance/+page.svelte`**: *Review* on every row, writing the record with the browser's principal; the table and the downloaded pack show it.
- **`apps/workbench/src/routes/workshop/studio/+page.svelte`**, **`lib/workshop/studio.ts`** — **GAP-5**: the bench's *Counterpart* — the desk's scripted persona or a live cartridge — on `stackTestCampaign` as the campaign's `counterpart`; *Talk to this desk* is a scenario with a live counterpart run through the stack.
- **`docs/manual/USER-MANUAL.md`** Part H — the Studio, the Catalogue, the journeys and handoffs, the blueprint, the Control Room v3 (§52–§53 join it); **`docs/manual/Craft-A-Bot-User-Manual.pdf`** rebuilt with the journey figures. **`docs/manual/UX-AND-GAPS.md`** §8 — the third pass.

## 2. Decisions

1. **The twin is a fold, not a second drawing.** `boundaryTwin(layout, map)` is what the figcaption renders and what the test compares to the layout; the drawing reads the same layout. Where a twin already exists (the Journey Canvas's `JourneyList`), the drawing's page renders it beside the canvas — the Pipeline did; the Studio now does.
2. **A focus stop announces its twin's row.** `aria-labelledby` on the stop, the row's id on the twin: one sentence, written once.
3. **Zoom is a viewport.** 200 % browser zoom on a 1280 px screen is a 640 px layout; the snapshot at 640 px is that figure, and at 320 px the twin takes over (the canvases hide behind their lists below 480 px).
4. **Review is content.** A control-map row is a pack's claim of relevance; a reader's review of it is the reader's record, saved beside it under the reader's principal, and the assurance pack carries both. Nothing edits the pack.
5. **A live counterpart on the bench is a campaign field.** The bench already runs a campaign through the Worker; `counterpart: 'live'` with a cartridge is the same seam the harness's `--counterpart` uses (WP64). No key, no live run — the lamp says so.

## 3. Tests

- `boundary-twin.test.ts`, `monitor-twin.test.ts`, `pipeline-rail.test.ts` — the twins equal their drawings (a test per canvas).
- `access.spec.ts` — the walk over the three canvases; the skip link, landmark and heading per route.
- `access-visual.spec.ts` — the zoom and reduced-motion snapshots.
- `contrast.test.ts` — the new tokens.
- `assurance.spec.ts` — a row reviewed, on the table and in the rendered pack; `governance`'s `assurance-pack.test.ts` — the review on the filed row.
- `studio.spec.ts` — the bench's counterpart on the campaign it builds.

## 4. Stage notes

_(added as the stages close)_
