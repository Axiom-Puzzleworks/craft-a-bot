# 87 — The Journey Canvas and its twin (WP100)

> **Status:** WP100's design of record, opened 2026-09-12 (Phase Z, `84-DAY6-ROADMAP.md`; `83-TARGET-DESIGN-V6.md` §6.1, decision D12, tenets 29 and 30, G63 and G68-part). Stage A is this note — the layout algorithm, the keyboard model, the twin's tables. Stages B and C follow on the same footing; each stage's note is at the end.

## 1. Where the code is

- **`packages/core/src/types/journey.ts`** — `JourneyLayout`, `JourneyLane`, `JourneyNode`, `JourneyEdge`, `JourneyPoint`, `JourneyLit`: the drawing as data, so a package that cannot import the layout (`governance`) can carry one.
- **`packages/workflow/src/journey.ts`** — `journeyLayout(spec, config?, run?, options?)` (the fold, pure), `journeyGeometry(layout)` (where each thing sits on the page, pure), `renderJourneySvg(layout)` (the one SVG string the export, the pack and the manual use).
- **`apps/workbench/src/lib/components/control-room/JourneyCanvas.svelte`** — the drawing on the Control Room grammar, over `journeyGeometry`; **`JourneyList.svelte`** — the twin, two tables from the same layout.
- **`packages/harness/src/commands/journey.ts`** — `craftabot journey render --workflow <id> [--config <name>] [--run <workflow-run.json>] --svg <out.svg>`.
- **Pages** — `/workshop/playground/journeys` and `/workshop/playground/journeys/[...workflowId]`; the Pipeline (`/workshop/workflows/[runId]`) beneath the rail; the Monitor per desk; the assurance pack's §3 figure.
- **Tests** — `workflow/src/journey.test.ts` (the enumeration rules over hand-built specs, the geometry invariants, the SVG); `harness/src/journey.test.ts` (the three shipped journeys byte-stable as snapshots, every `next` outcome the lending decision admits); `fs-lending/src/journey.test.ts` (the lit path over the golden workflow run equals its stage records); `workbench/src/lib/components/control-room/journey-twin.test.ts` (the twin's rows equal the layout's nodes, edges and points, one case per workflow); `e2e/journey.spec.ts` (the keyboard walk, axe, reduced motion).

## 2. Principles

1. **The layout is data, the drawing is a function of it, the twin is another** (D12, tenet 29). `journeyLayout` returns plain JSON — no coordinates in pixels, no colours, no component ids of the Workshop's — and both the canvas and the list are folds over it. What one shows and the other does not is a bug a test catches.
2. **Nothing drawn that the spec does not say.** An edge exists because `next` returned it for an outcome the output schema admits; a lane exists because an executor sits on it; a point exists because a stack, a stage or the loop puts a component there. Where the spec cannot be read without a case, the drawing says *depends on the case* rather than guessing.
3. **The run is the truth.** A lit run adds only facts: the path it took, the edges it took (drawn if the enumeration missed them), the verdicts on their points, the executor a stage actually had. It never removes an edge the spec admits.
4. **Byte-stable.** The same spec, configuration and run give the same layout, the same geometry and the same SVG, on every platform; the three shipped journeys are held as snapshots.
5. **The pack does not draw.** `governance` carries the layout and the SVG a host hands it (`AssurancePackInput.journeys`); it never imports `workflow`.

## 3. The layout

```ts
type JourneyLaneId = 'counterpart' | 'assistant' | 'colleague' | 'rules' | 'systems';

interface JourneyLayout {
  schemaVersion: 1;
  workflowId: string; name: string;
  lanes: Array<{ id: JourneyLaneId; label: string }>;                  // in drawing order, top to bottom
  nodes: Array<{ stageId: string; name: string; lane: JourneyLaneId; x: number; y: number;
                 executor: 'rule' | 'agent' | 'human' | 'line';
                 irreversible: boolean; obligations: string[]; guards: string[] }>;   // guards: the point ids on this node
  edges: Array<{ id: string; from: string; to: string | { end: true } | { handoff: string };
                 label: string; kind: 'enumerated' | 'case' | 'observed'; taken?: boolean }>;
  points: Array<{ id: string; kind: PointKind; at: string | 'loop' | 'group' | 'egress'; components: string[] }>;
  lit?: { path: string[]; edges: string[];
          verdicts: Array<{ pointId: string; componentId?: string; guardrailId: string; verdict: string; tick: number }> };
}
```

### 3.1 Lanes

A stage's lane is its **effective executor**: the configuration's `executors[stage.id]` when set, else the spec's — `rule` → *rules*, `agent` → *assistant*, `human` → *colleague*, `line` → *systems*. Over a lit run the stage record's executor wins, since that is what happened. The lanes drawn are the ones in use, in the fixed order *counterpart, assistant, colleague, rules, systems*; an unused lane is omitted so a rules-only journey is one band. The **counterpart** lane is drawn when the run's events seat one (`group.started.memberRoles` with a `counterpart`) or when the caller says so (`options.counterpart`); it carries no stage nodes. `83-…` §6.1.1 asks for the transcript's turns as ticks along it; a workflow run's `events` are the workflow's own (`69-…` §6), and the counterpart's lines are on the member runs' traces the run only names by id — so the lane is drawn empty, and the turns are a finding (§9). An unlit page draws no counterpart lane: the spec does not say whether the desk seats one.

### 3.2 Order and position

Nodes are placed by a **breadth-first walk from `first`** along the enumerated edges, a stage's column being the first column it is reached in; stages the walk never reaches (a stage no `next` names) follow in spec order, so nothing is lost. `x` is the column, `y` the lane's index among the lanes drawn. Two stages in one column and one lane (a decision that fans to two stages on the same lane) take successive columns — the walk assigns columns per stage, not per depth, so the drawing is a strict left-to-right sequence and every node has its own column. This is the grid the geometry maps to pixels; the layout never holds pixels.

### 3.3 Edges: the enumeration

For each stage the layout **enumerates the outcomes its output admits**:

- a `human` executor (effective) → one outcome per `options` entry, as `{ decision: option }` — the shape `runWorkflow` records for a person's choice;
- otherwise the first property of the output schema (in declaration order) whose schema is an `enum` → one outcome per value, as `{ [property]: value }`; a `const` property (or a one-value enum) is one outcome, unlabelled — a value the schema admits alone is not a choice;
- otherwise one outcome, `{}`.

Each outcome is handed to `next(outcome, state, input)` with a **state that throws on any read** (a `Proxy` refusing every property) and an empty input, inside a `try`. When every call returns a string the stage's edges are those results, one edge per distinct target with the outcomes that reach it joined by ` / ` as the label (`approve / refer` on one edge, `decline` on another) — an empty label for the single unlabelled outcome. When any call throws, or returns something that is not a string, the stage is **not enumerable**: its `next` reads the case. It gets one edge, kind `case`, label *depends on the case*, to the next stage in spec order (the way a journey is written down), or to *end* when it is the last. The lit run then adds the edge actually taken (§3.5) if the case edge did not already name it.

`'end'` is the end node; a target of the form `handoff:<workflowId>` is a handoff edge to another journey's intake (`83-…` §6.5.3 — WP102 lands the convention; the layout reads it now so the drawing needs no change then). Any other string that names no stage is an error the layout throws, since the spec is broken.

Why arity is not the test: `(out, state) => …` is what a `next` that reads the case looks like, but a `next` that reads only `out` and happens to declare `state` is enumerable, and one that reads `state` is caught by the throw. The refusing state is the proof: a `next` that returns without touching it is a function of its outcome alone.

### 3.4 Points

A **point** is where a component decides, with the components that sit there:

- **the loop's three hooks** (`pre-think`, `pre-act`, `post-act`) on every *assistant* node — one point per hook per node, id `loop:<stageId>:<kind>`, listing the stack's loop fits (`stackLoopFits` over the configuration's `stack` and the stage's `stageStacks` entry) — the safety brick's own guardrails are not components and are not listed; the ring is drawn even when empty, since the loop always has its hooks;
- **a stage boundary** (`stage-in`, `stage-out`) on any node whose stage declares `guards.components` at that point, whose `guards.policyCards` is non-empty (drawn at `stage-in` as the cards' ids), or whose stacks fit a boundary component naming this stage or no stage — id `boundary:<stageId>:<point>`;
- **the group chokepoint** (`group`) once, `at: 'group'`, when a stack has a `group` half — the components are the Watchbot's evaluators, named `evaluator:<id>`;
- **the egress gate** (`egress`) once, `at: 'egress'`, when a stack fits an egress component.

A node's `guards` lists its points' ids in this order. Stacks are read through `options.registry.getStack`; without a registry only the stage's own guards and the loop's empty rings are drawn.

### 3.5 The lit run

With a `run`, `lit.path` is its stage records' ids in order; `lit.edges` the ids of the edges between consecutive records — where the enumeration has no edge between two consecutive stages (a `case` edge to a different target, or a `next` the walk did not foresee) an edge of kind `observed` is added with label *taken* and `taken: true`; every lit edge is marked `taken`. `lit.verdicts` are the stage records' `guards.verdicts` mapped to their point (`boundary:<stageId>:<point>`) with the stage's `endedTick` as the tick, in record order; a loop verdict is not on the stage record (it is on the agent run's trace) and is not lit here — stage C's Pipeline shows them on the rail as before. The lit run's executor per stage replaces the configuration's (§3.1).

## 4. The geometry and the SVG

`journeyGeometry(layout)` maps the grid to a page: lane bands of fixed height stacked in lane order with a gutter; a column width; a node as a roundel of fixed radius centred in its cell; an edge as an orthogonal route — out of the node to the right, a vertical to the target lane in the gutter between columns, into the target from the left; an edge to a target left of its source (a return) leaves from the bottom and enters from the top; the end node as a small bar in the last column plus one; a handoff as a labelled arrow leaving the page at the right. A loop point is a small ring on the node's right shoulder; a boundary point a gate on the edge into (`stage-in`) or out of (`stage-out`) the node; the group point a bar across the counterpart and assistant lanes at the left margin; the egress point a gate at the systems lane's right margin. Labels sit above their edge's horizontal run; an edge label that would overlap a node is moved to the vertical run. Everything is integer arithmetic over the constants in `journey.ts`, so the geometry is byte-stable.

`renderJourneySvg(layout)` writes the geometry as one `<svg>` with a `<title>` sentence, `class` names from the Control Room's vocabulary and **no colours** — the SVG carries `currentColor` and the six class names (`lane`, `node`, `node--lit`, `edge`, `edge--taken`, `point`) and inherits the stylesheet of whatever holds it; standalone it is monochrome, which is what a printed manual wants. The workbench component draws the same geometry with the tokens.

## 5. The drawing (`JourneyCanvas.svelte`)

On the Control Room grammar: lane bands in the lane's tint (`--cab-counterpart`, `--cab-blue` for the assistant, `--cab-green` for a colleague, `--cab-ink-muted` for rules, `--cab-purple` for systems), nodes as roundels with the executor's instrument (`journey` for the node, the executor's kind as the label's word), irreversible stages with the Boundary's hazard mark, obligations as tags beneath the name, edges with their labels, points as gates. A lit run draws the path in `--cab-scope` and the verdicts on their points in the lane colour of the verdict (`allow` pass, `block`/`stop` fail, else inconclusive), **in order** — each verdict appears after the one before it, 120 ms apart, under `prefers-reduced-motion: no-preference`; under `reduce` the final state is drawn at once. Selecting a node calls `onSelect(stageId)`; selecting a point calls `onPoint(pointId)` (the Studio, WP101 — until then the Pipeline's rail).

### 5.1 The keyboard model

The canvas is one `role="group"` with the twin as its accessible description. Each node is a focusable element (`tabindex` roving: the first node, or the selected one, at `0`, the rest at `-1`). **Right arrow** moves focus along the first outgoing edge, **Left** along the first incoming; **Down** / **Up** to the next outgoing edge's target when there are several (cycling); **Home** / **End** to the first and last node in journey order; **Enter** selects (opens the Pipeline's panes for that stage); **g** moves focus to the node's first point, and from a point **Right** / **Left** cycle its siblings, **Escape** returns to the node. Every node's accessible name is the twin's row for it read as a sentence (*Decision — assistant — fairness — pre-act, post-act; ok, took approve*), so the walk announces the facts without the picture.

## 6. The twin (`JourneyList.svelte`)

Two tables from the same `JourneyLayout`, beside the canvas at every width (a tab on narrow screens, never removed):

- **Stages** — one row per node in journey order: stage, lane, executor, irreversible, obligations, guards (the points' kinds), and for a lit run the status, the verdicts (`componentId: verdict`) and the edge taken.
- **Edges** — one row per edge: from, to, label, kind, and *taken* when lit.

`journeyTwin(layout, run?)` is the fold (in `lib/control-room/journey-twin.ts`) and the test asserts its rows equal the layout's nodes, edges and points, one case per shipped workflow.

## 7. Where it appears

- **`/workshop/playground/journeys`** lists the registry's journeys (name, world, stages, configurations) with a link each; **`/workshop/playground/journeys/[...workflowId]`** draws one unlit with a configuration selector — the lanes change as the executors change — its points listed and its obligations glossed; the twin beside it.
- **The Pipeline** draws the canvas lit by the run beneath the rail, in place of the Boundary's ring; selecting a node selects the rail's stage. The Boundary map stays on the Spec Lab and the Run Lab, where there is no journey.
- **The Monitor** draws one small unlit canvas per chosen desk with the queue's *waiting* count as a badge on the intake node, and the last *n* runs' paths faded in (the heat: an edge's opacity rises with the share of runs that took it).
- **The assurance pack** carries `development.journeys` — the layout and the SVG per journey the bot's world runs — rendered as the figure in §3 with the points and their components beneath, in both renderers.
- **`craftabot journey render`** writes the SVG for the manual and the site.

## 8. Tests (the acceptance in `84-…` §3, restated)

1. The layout over the three shipped workflows is byte-stable (snapshots in `harness`) and the lending decision fans out to *approve*, *decline* and *refer* under the default configuration and under `bot-recommends` (where it is a person's choice).
2. The lit path over the golden lending workflow run equals its stage records' ids, and every consecutive pair is joined by a lit edge.
3. The twin's rows equal the layout's nodes, edges and points, one case per workflow.
4. The keyboard walk reaches every node and reads its name (e2e, the lending journey).
5. Axe green on the four pages (the journeys list, a journey, the Pipeline, the Monitor).
6. The reduced-motion snapshot: the Pipeline under `prefers-reduced-motion: reduce` draws the final state (visual baseline `ws-pipeline-reduced`).
7. The SVG export is byte-stable (snapshot) and well-formed (parsed by the XML parser in the test).
8. Visual baselines over the fixture corpus (the golden workflow run).

## 9. Divergences and findings

- **`schemaVersion` on the layout** (not in `83-…`'s sketch): the pack carries it and the manual embeds it, so it is versioned like every other artefact.
- **Edge `id` and `kind`** (not in the sketch): the twin needs a key per edge, and *depends on the case* is a kind, not a label alone.
- **The counterpart lane needs a run or a caller's word** — a spec does not know whether the desk seats a person. Recorded rather than guessed.
- **The counterpart's turns are not drawn**: they are on the member runs' traces, which the workflow run names by `runIds` and does not carry. A host that has the traces can draw them later; the lane is there.
- **Loop verdicts are not lit** on the canvas: they are on the agent run's trace, not the stage record. The Pipeline's rail shows them. A later WP may join the two through `runIds`.
- **The pack takes the figure from the host** (`AssurancePackInput.journeys`) because `governance` cannot import `workflow` without making the 1.0 tarball carry it. Both hosts (`craftabot assurance`, `/workshop/assurance`) fold it the same way.

## 10. Stage notes

> **Stage A — 2026-09-12.** This note: the layout as data (§3), the enumeration with the refusing state (§3.3), the points (§3.4), the lit run (§3.5), the geometry and the monochrome SVG (§4), the keyboard model (§5.1), the twin (§6), where it appears (§7), the tests (§8), the divergences (§9).

> **Stage B — 2026-09-12.** `JourneyLayout` and its parts in `core/types/journey.ts`; `journeyLayout`, `journeyGeometry`, `renderJourneySvg`, `journeySentence`, `edgesOf`, `outcomesOf`, `laneOf` in `workflow/src/journey.ts` with `journey.test.ts` over a hand-built journey (eleven tests); the three shipped journeys and their SVGs held byte for byte in `harness/src/__snapshots__/journey-*.{json,svg}` (`harness/src/journey.test.ts` — the lending decision fans out to *approve / decline / refer* as the bot's and as a person's under `bot-recommends`); the lit path over the golden run in `fs-lending/src/journey.test.ts` (the run ended after *four-eyes*, an `observed` edge the enumeration could not foresee); `JourneyCanvas.svelte` and `JourneyList.svelte` over `lib/control-room/journey-twin.ts` (`journeyTwin`, `stageSentence`) with `journey-twin.test.ts` (one case per workflow); `craftabot journey render`. Two decisions on the way: a `const` or one-value enum is an unlabelled outcome, not a choice; the probe state is a `Proxy` refusing every read, since a frozen empty object let a `next` reading a top-level property through as `undefined`.

> **Stage C — 2026-09-12.** `/workshop/playground/journeys` and `/workshop/playground/journeys/[...workflowId]` with the configuration selector, the selected stage's facts and points, the twin and the obligations glossed; the Pipeline's canvas lit by the run in place of the Boundary's ring (the run's `source.build` names the configuration), selecting a node selecting the rail's stage; the Monitor's small canvas per desk with the queue's *waiting* on the first stage and the heat over the kept runs; `AssurancePackInput.journeys` folded into `development.journeys` for the bot's world, drawn on `/workshop/assurance` and rendered in both renderers (the SVG in the HTML, the points as a list in the markdown) with both hosts laying the journeys out the same way; the `journey` and `point` roundels (`63-…`'s dated note); `e2e/journey.spec.ts` (the list and the selector, the keyboard walk over every lending node with its name read, the Pipeline lit under `prefers-reduced-motion: reduce`); the two journey routes on the axe sweep; three visual baselines (`ws-journeys`, `ws-journey-lending`, `ws-pipeline-golden` — the Pipeline over the fixture corpus for the first time); the manual's §45.2 and §45.4. The chart lint rule lists `JourneyCanvas.svelte` as the fourth instrument that draws with an `<svg>`.

