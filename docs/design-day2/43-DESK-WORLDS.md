# 43 — Desk Worlds (WP53): the view seam and `@craftabot/desk`

> **Status:** design of record for WP53 (`42-DAY4-ROADMAP.md` Phase M), written 2026-09-05 against the codebase as it stands after WP56 (`main` at `7855b0c`, `@craftabot/core` 1.0.0). This is the map for `41-TARGET-DESIGN-V4.md` §6.1 (with §6.2's `truth` and §6.3's counterpart deliberately left to WP54 and WP55); where the two differ, §8 below says why and `41-…` §12 gets a dated note when the stage lands. Every contract quoted here is quoted from a file, not from memory of one.

---

## 1. Purpose, and who this is for

Every world the product has ever drawn is a room with a rug. That was the right first world and it is the wrong only one: the Retail Financial Services Playground (`41-…` §6.5) is three journeys — a conversation, a queue of decisions, a decision about a person — and none of them is a grid. Two gaps stand between today's engine and a business world (`41-…` §3):

- **G21 — a non-grid world cannot be shown.** `WorldView` takes a `GridWorldState`; every host types the world it hands over as a grid; `WorldDefinition` says nothing about what a world looks like. A world whose state is not a grid has no way to appear on any screen.
- **G22 — writing a world costs a pack 5k lines.** The Playroom is 4,479 lines with its tests; the Workshop world, which reuses the Playroom's grid, is 987. Both hand-write `observe`/`perform`/`test`/`reset`/`inject`/`forAgent`. A third world would too, and a fourth would copy the third.

WP53 retires both with one seam and one package: a `view` on the world definition with a second drawable vocabulary beside the grid's, a `WorldStage` that chooses the renderer, and `@craftabot/desk`, the runtime that turns records, a transcript, a queue and a handful of handlers into a `WorldDefinition`. It is for the desk authors of WP59–WP63 first, who must be able to ship a journey as content and rules; for the Control Room (WP57), which draws the Desk with real components; and for the reader of `41-…` §6.1 who wants to know exactly which lines change.

WP53 is the first of Phase M's four contract WPs and the one the other three stand on: truth (WP54) is a door on the desk runtime, the counterpart (WP55) is a seat in it, service lines (WP58) are what its tools reach.

## 2. Where the code actually is (the load-bearing facts)

Verified against `main` at `7855b0c`.

**The world contract** (`packages/core/src/types/world.ts`). `WorldDefinition` is `{ id, name, layouts, actions, senses, predicates, create(layoutId) }`. `WorldInstance` is `snapshot/observe/perform/test/reset` plus five optional doors, each added additively and each implemented by the Playroom: `receiveInput?(text)`, `describeProgress?(predicate, channels)`, `forAgent?(handle)`, `configure?(config)`, `inject?(injection)`. `WorldState` is `Record<string, unknown>` — "an opaque, JSON-serialisable blob … its real shape is defined by each world". `WorldActionDefinition` carries `riskTier?` and `progress?`. `AgentHandle` is `{ agentId, name }`.

**The drawable vocabulary** (`packages/core/src/types/grid-world.ts`). `GridWorldState` is "the minimal vocabulary a room needs to be *drawn*, not the whole of what a world's state is" — `width/height/bot/furniture/containers/characters/items/agents?`. The Playroom's `PlayroomState` and the Workshop's `WorkshopState` are each declared so they are *structurally* a `GridWorldState` plus their own fields; neither pack imports the other. This is the pattern `DeskWorldState` copies.

**Rendering is grid-only, in exactly these places:**

| Where | What it says | Change |
|---|---|---|
| `core/src/projection/run-projection.ts:26` | `RunProjection.world: GridWorldState \| undefined` | the union |
| `core/src/projection/run-projection.ts:102` | `state.world = event.payload.state as GridWorldState` | the union (the fold stays blind) |
| `workbench/src/lib/state/session.svelte.ts:50` | `readonly world: GridWorldState \| undefined` | the union |
| `workbench/src/lib/state/session-group.svelte.ts:64,159,216` | the same type, the same cast | the union |
| `workbench/src/lib/components/play/WorldView.svelte:34` | `world: GridWorldState \| undefined` | unchanged — it draws grids |
| `routes/play/[agentId]/+page.svelte:517`, `routes/play/duo/+page.svelte:350`, `routes/replay/[runId]/+page.svelte:138`, `routes/workshop/compare/+page.svelte:134`, `routes/workshop/runs/[runId]/+page.svelte:349` | `<WorldView world={…} saying expression outcome events />` | `<WorldStage …>` |

`WorldView`'s own guard is `{#if !world} … data-testid="world-waiting" … {:else} … data-testid="world-view"`; the e2e suite reads both ids on every screen above.

**Where the world reaches a screen.** Never from the engine's world object (hard rule 3). `agent-session.ts:997` emits `world.changed { state: world.snapshot() }` as the opening scene and `:684` after every successful action; `events.ts:318` types the payload as `z.record(z.string(), z.unknown())`. `projectThrough(events, throughTick)` folds those into `RunProjection.world` for the replay, the Run Lab and Compare; the live session view folds the same way through `applyEvent`. A Desk needs no new event: its snapshot rides the same payload.

**How a session finds its world.** `agent-session.ts:280` — `registry.getWorld(card.worldId)` from the spec's goal card, then `definition.create(card.layoutId)`. `goalCardDefinitionSchema` (`pack-manifest.ts:91`) is `{ id, title, goalText, worldId, layoutId, successCondition, hints, teachesConcepts, par?, expert?, coop? }`. The bench's rack is `registry.listGoalCards().filter((card) => !card.coop)` (`routes/bench/[agentId]/+page.svelte:106`) — every registered non-coop card, from every installed pack, including the Workshop world's two. Authored policy cards are gated behind the Workshop door (`:108`, `preferences.workshop`); brick kinds have `audience?: 'kit' | 'workshop'` (WP35). Goal cards have no such gate.

**What a world costs today.** The Playroom's `createPlayroomInstance` (`playroom.ts:150–276`) hand-writes the ten methods twice — once for the shared instance, once inside `facadeFor(handle)` — over `state.ts` (356 lines), `senses.ts` (322), `predicates.ts` (179) and its tools. The Workshop world (`workshop.ts`, 92 lines) hand-writes five of them over a state that is a grid. Both advance `state.tick` inside `perform` and copy `structuredClone(state)` out of `snapshot`; both return `{ ok, narration, stateDiff }`.

**Conformance.** `pack-testkit`'s `checkWorld(world, fixture)` (`checks/world.ts`) proves layouts load, actions' arguments validate against their advertised JSON Schema (Ajv 2020), illegal actions never throw and never mutate outside `volatileStateKeys`, scripts replay to byte-identical snapshots, and every predicate is reachable. `checkGoldenTrace` drives a real session with a mock provider and parses every event through `engineEventSchema`. The starter's golden trace (`trace.say-hello.v1.json`) and the geap armour trace are asserted byte-identical by their own tests.

**Packages that depend on `core` only** — `governance`, `telemetry`, `pack-testkit` — are each held there by an `eslint.config.js` `no-restricted-imports` block naming what they may not import. `@craftabot/desk` joins that list with the same block.

## 3. Design principles

1. **The seam is one optional field.** `WorldDefinition.view?` defaults to the only value that has ever existed. No existing world, host, trace or golden fixture changes by one byte.
2. **A Desk's drawable state is a vocabulary, not the world's whole state** — exactly as `GridWorldState` is to the Playroom. `DeskWorldState` is what a renderer reads; a desk's real state is that plus whatever the desk keeps (its case files, its script cursor, its ledgers), structurally assignable.
3. **The renderer is chosen from what is on the trace.** A stored run from an edition that does not install the world still draws: `WorldStage` decides by the shape of the `world.changed` payload, and takes the registry's `view` as a hint, never as a requirement.
4. **The runtime owns the mechanism; the desk owns the content.** `createDeskWorld` supplies every method of `WorldInstance`; a desk supplies records, generators, handlers, senses, predicates. A desk never implements `observe`, `perform`, `inject` or `forAgent` (`41-…` §14.1).
5. **No new event.** A transcript line, a revealed record, a queue decision are `world.changed`; the bot's speech is `action.performed`. What the Desk view shows is a projection of the trace, never a side channel (hard rule 3).
6. **The Kit does not change.** A desk's cards reach the Kit's rack only through the gate this WP adds (§4.4) and, later, the Playground's box (WP59/WP60). The leaflet, the chapters and the copy registry are untouched; a Desk run in the Kit renders through the same `WorldStage` with the Kit skin.
7. **Byte-stable through every stage.** Both golden traces stay identical at every commit; the desk's own golden trace (stage B) becomes the runtime's oracle from then on.

## 4. The design

### 4.1 The view seam (`core`, stage A)

```ts
// types/world.ts — one optional field on the definition
export type WorldViewKind = 'grid' | 'desk';

export interface WorldDefinition {
  …
  /**
   * How a host draws this world's state. `'grid'` is every world written
   * before this field existed (`GridWorldState`); `'desk'` is a business
   * world (`DeskWorldState`). A host that knows neither draws the snapshot
   * as JSON and says so. Optional; absent means `'grid'`.
   */
  view?: WorldViewKind;
}
```

```ts
// types/desk-world.ts — new, beside grid-world.ts: the minimal vocabulary a Desk needs to be *drawn*
export type DeskRecordClassification = 'public' | 'personal' | 'special-category';
export type DeskRecord = {
  id: string; kind: string; title: string;
  fields: Record<string, string | number | boolean | null>;
  classification?: DeskRecordClassification;      // UK GDPR's vocabulary; read by WP54's purpose gate and WP60's data-minimised
};
export type DeskTranscriptLine = {
  seq: number; tick: number;
  speaker: 'agent' | 'counterpart' | 'system'; speakerName: string;
  text: string; channel?: string;
};
export type DeskQueueItem = {
  id: string; title: string;
  status: 'open' | 'in-progress' | 'decided' | 'escalated';
  decision?: string; recordIds: string[];
};
export type DeskAlert = { id: string; severity: 'info' | 'warning' | 'critical'; text: string; tick: number };
export type DeskWorldState = {
  desk: { title: string; role: string };           // "The Advice Desk" · "Investment adviser"
  records: DeskRecord[];                           // what the bot may see, as the world has revealed it
  transcript: DeskTranscriptLine[];
  queue: DeskQueueItem[];
  alerts: DeskAlert[];
  activeCaseId?: string;
};

/** The two drawable vocabularies a host knows. */
export type WorldViewState = GridWorldState | DeskWorldState;
/** Structural: a desk has a `desk` and a `transcript`; a grid has a `width` and a `bot`. */
export function isDeskWorldState(state: unknown): state is DeskWorldState;
export function isGridWorldState(state: unknown): state is GridWorldState;
```

`RunProjection.world` becomes `WorldViewState | undefined` and the `world.changed` fold stays blind (`state.world = event.payload.state as WorldViewState`): the projection never decides what a world is, it carries what the trace said. The two guards are the only code in `core` that looks inside; they are pure, exported, and 100%-covered because `WorldStage` and the testkit both lean on them.

**Why a union and not a discriminant on the state.** `GridWorldState` has no `kind` field and every stored trace in every browser carries snapshots without one; adding a discriminant would mean a trace-format migration for a rendering choice. The two shapes are already disjoint (`desk`/`transcript` versus `width`/`bot`), so a structural guard is exact today and stays exact as long as neither vocabulary grows a field the other has — which the guards' own test asserts.

### 4.2 `WorldStage` and the hosts (`workbench`, stage A)

`src/lib/components/play/WorldStage.svelte`:

```svelte
<script lang="ts">
  interface Props {
    world: WorldViewState | undefined;
    /** The registry's answer when the host has one; a hint the shape confirms. */
    view?: WorldViewKind | undefined;
    saying?: string | undefined; expression?: BotExpression; outcome?: RunOutcome | undefined; events?: readonly EngineEvent[];
  }
</script>
{#if world === undefined}          → WorldView with world undefined (its own "Press STEP" waiting state, data-testid="world-waiting")
{:else if isDeskWorldState(world)}  → DeskView {world} {saying} {outcome} {events}
{:else if isGridWorldState(world)}  → WorldView {world} {saying} {expression} {outcome} {events}
{:else}                             → <pre data-testid="world-unknown"> JSON, with the line "This run's world is one this build cannot draw."
```

`view` is passed where the host knows it — the Play and duo routes have the spec's goal card; the Run Lab, Compare and the replay have the run record's `goalCardId` and look the world up if it is installed — and is used only to pick the waiting-state copy before the first `world.changed` arrives ("Press STEP to send your bot into the Playroom" versus "Press STEP to open the desk"). The shape decides the renderer. A hint that contradicts the shape is a bug the stage reports through the console in dev and ignores in production: the trace is the truth.

The five mounts named in §2 become `<WorldStage …>` with the same props. `SessionView.world` and `SessionGroupView.world` are typed `WorldViewState | undefined`; the one cast in `session-group.svelte.ts:216` becomes the same union. After stage A, `grep -n GridWorldState apps/` finds `WorldView.svelte`, the union's own import, and nothing else.

`DeskView.svelte` in stage A is the **first cut**: three plain panes — the transcript (one `<p>` per line, `data-testid="desk-line-{seq}"`, `data-speaker`), the revealed records grouped by `kind` (`data-testid="desk-record-{id}"`), the queue with a status chip (`data-testid="desk-queue-{id}"`) — plus an alerts strip and the "FOR SIMULATION ONLY" strip (`data-testid="desk-simulation-only"`), under `data-testid="world-view"` so every existing e2e that waits for the world keeps its selector. It uses tokens only; the speaker lanes use `--cab-red` for the agent (the Actions colour, what a bot *does*) and `--cab-ink-muted` for system lines; the counterpart lane uses ink until WP57 mints `--cab-counterpart`. Stage C makes it proper (§4.7); WP57 rebuilds it on `Transcript`/`CaseFile`/`Queue`.

### 4.3 The test-only desk (`pack-workshop`, stage A) and the goal-card gate (`core`, stage A)

Stage A must show a Desk on every screen before the runtime exists (stage B). The desk is hand-written, small, and lives in the Workshop pack, whose job is Workshop-only content:

- **World `workshop/the-desk`** — "The Front Desk", role "Receptionist". One layout, `a-visitor`. Two records: a visitor (`kind: 'visitor'`, `personal`) and a house rule (`kind: 'notice'`, `public`). Queue: one item, "Sign the visitor in". Actions: `say` (`observe`; appends a transcript line as `agent`), `look-up` (`observe`; reveals the visitor's record and narrates it), `sign-in` (`reversible`, `progress`; decides the queue item), `escalate` (`reversible`; marks it `escalated` and adds a `warning` alert). Senses: `conversation` (the transcript's last lines), `case-file` (the revealed records), `queue`. Predicates: `visitor-signed-in`, `escalated`, `conversation-started`. `receiveInput` appends a `counterpart` line named "Visitor". `inject`: `heard` → a counterpart line; the other three kinds are refused with a narration. No `forAgent` (a single seat; WP55 adds seats through the runtime, not here).
- **Goal card `workshop/sign-the-visitor-in`** — "Find out who has come to see us and sign them in", `successCondition: 'visitor-signed-in'`, `par: 3`, and the new field below.

Stage B rewrites this world on `createDeskWorld` (§4.5) and keeps its ids, its card and its e2e — the proof that the runtime replaces hand-written code without a screen noticing.

```ts
// schemas/pack-manifest.ts — goalCardDefinitionSchema, one optional field
/**
 * Who the card is for (WP53, `43-…` §4.3): `'workshop'` keeps it off the
 * Kit's rack until the Workshop door is open — the gate brick kinds
 * (`audience`, WP35) and authored content (`local/`, WP46) already use,
 * applied to goal cards. Absent means `'kit'`: every card written before
 * this field existed.
 */
audience: z.enum(['kit', 'workshop']).optional()
```

The bench's rack becomes `listGoalCards().filter((card) => !card.coop && (card.audience !== 'workshop' || preferences.workshop))`; the coop rack gains the same clause. That is the whole of the Kit change: a card a child never sees unless an adult opened the Workshop door, which is the rule every Workshop-only thing already follows (`15-…` §7). The Playground's cards (WP60) will use `audience: 'workshop'` too, until the box on the shelf (WP59) gives them a Kit-side gate of their own.

### 4.4 `@craftabot/desk` — the business-world runtime (stage B)

A new package at `packages/desk`, `@craftabot/desk`, depending on `@craftabot/core` and `zod` only, browser- and Node-safe, ESLint-restricted with the block `telemetry` uses (`eslint.config.js`), built and tested like `telemetry` (`tsc -p tsconfig.build.json`; vitest with coverage). Not published in this WP; `governance`'s 1.0 path (`38-…`) is the template for when it is.

```ts
export interface DeskCase<Extra = Record<string, never>> {
  revealed: DeskRecord[];            // what the bot may see from the start
  hidden?: DeskRecord[];             // revealed by a sense or a look-up, never in the opening observation
  queue: DeskQueueItem[];
  alerts?: DeskAlert[];
  activeCaseId?: string;
  /** Whatever else the desk keeps beside the drawable state. Opaque to the runtime; serialised into the snapshot under `extra`. */
  extra?: Extra;
}

export interface DeskWorldSpec<Extra = Record<string, never>> {
  id: string; name: string;
  desk: { title: string; role: string };
  /** The purpose this desk reads records for (`41-…` §6.5.1). WP54 gates `special-category` records on it; in WP53 it is carried and shown. */
  purpose?: string;
  /** Layouts are cases: each layout id names a generated case. `(random)` is the session's own dice (hard rule 5). */
  layouts: Array<{ id: string; name: string; case: (random: () => number) => DeskCase<Extra> }>;
  actions: DeskActionSpec<Extra>[];
  senses: DeskSenseSpec<Extra>[];
  predicates: Record<string, { description: string; test(state: DeskState<Extra>): boolean }>;
  /** One line of progress per predicate, if the desk can say (mirrors `WorldInstance.describeProgress`). */
  progress?: Partial<Record<string, (state: DeskState<Extra>) => string | undefined>>;
  /** Who the `receiveInput` speaker is ("Visitor", "Customer"). Default "Customer". */
  counterpartName?: string;
}

export interface DeskActionSpec<Extra> {
  id: string; name: string; description: string;
  parameters: JsonSchema;
  riskTier: RiskTier;                // required here, optional on WorldActionDefinition: a desk never leaves it unsaid (checkDesk)
  progress?: boolean;
  /** `say` is special-cased by the runtime (the transcript, the counterpart); every other action is this. */
  perform(state: DeskState<Extra>, args: unknown, ctx: DeskActionContext): DeskActionOutcome;
}
export interface DeskActionContext { tick: number; random(): number; reveal(recordId: string): DeskRecord | undefined; alert(severity, text): void; decide(queueItemId: string, decision: string, status?: 'decided' | 'escalated'): void }
export type DeskActionOutcome = { ok: boolean; narration: string; stateDiff?: ActionResult['stateDiff'] };

export interface DeskSenseSpec<Extra> {
  id: string; name: string; description: string;
  /** What this channel reveals, as observation text over the current state. */
  reveal(state: DeskState<Extra>): string | undefined;
}

/** The runtime's own state: the drawable vocabulary plus what the desk keeps. Structurally a `DeskWorldState`. */
export type DeskState<Extra> = DeskWorldState & { tick: number; hidden: DeskRecord[]; extra: Extra; heardCursor: number };

export function createDeskWorld<Extra>(spec: DeskWorldSpec<Extra>): WorldDefinition;
```

**What the runtime supplies** — every method of `WorldInstance`, once:

| Method | What the runtime does |
|---|---|
| `snapshot` | `structuredClone` of the state: a `DeskWorldState` plus `tick`, `hidden`, `extra`, `heardCursor`. The drawable fields are the first six keys; `hidden` is the one thing a renderer must not draw and `DeskView` never reads it. (Truth proper is WP54's; `hidden` is "not yet revealed", not "never revealed".) |
| `observe(channels)` | For each channel the spec declares and the bot has, the sense's `reveal(state)` text; `summary` is the last transcript line and the queue's counts ("2 open, 1 decided"). A channel the desk lacks is skipped, as the Playroom does. The built-in `conversation` sense returns the transcript lines since the bot's `heardCursor` and advances it — the Playroom's `heardFor` discipline (`senses.ts:233`), one seat. |
| `perform(call)` | `tick += 1` first (a turn is a turn, as both grid worlds do — `volatileStateKeys: ['tick']`). Unknown action → `{ ok: false, narration }` with `didYouMean` (the field `ActionResult` already carries and the projection already shows) over the desk's action names, then over record titles for a `look-up`-style miss — a closest-match of the runtime's own, since core exports none (the Playroom keeps its own too). `say` → validate `{ text }`, append `{ seq, tick, speaker: 'agent', speakerName: 'You' }`, `ok: true`. Anything else → the spec's `perform` with a `DeskActionContext` whose `reveal` moves a record from `hidden` to `records`, `decide` updates the queue, `alert` appends. Arguments are validated against the action's JSON Schema before the handler runs, so a handler never sees a malformed call (the testkit's Ajv, at runtime — `zod`'s `toJSONSchema` is the other direction; the runtime keeps a small validator of its own over the subset of JSON Schema the desks use, tested against Ajv in the testkit). |
| `test(predicate)` | The spec's predicate, or `false` for an unknown id — never a throw. |
| `reset` | Regenerate the case from the layout with the same `random` the instance was created with, so a reset run is byte-identical. |

**Where the case's `random` comes from — one additive core seam (stage B).** `WorldDefinition.create(layoutId)` takes no randomness today, and `SessionOptions.random` (`agent-session.ts:90`) reaches the dice tool and the brick runtimes but never the world; the grid worlds' layouts are static so nothing missed it. A desk's case must vary by seed (WP59's "same seed → identical bank", a campaign's `seeds` axis), so `create` gains an optional second argument: `create(layoutId, options?: { random?: () => number })`. `agent-session.ts:286` passes the session's own `random`; a caller that passes nothing (every existing test, the testkit's `checkWorld`) gets a desk generated from a fixed default seed, so a desk is deterministic with or without the session. The Playroom and the Workshop world ignore the argument. Recorded in §8.
| `receiveInput(text)` | Append a `counterpart` line named `spec.counterpartName`. |
| `describeProgress(predicate, channels)` | `spec.progress[predicate]?.(state)` — only when the bot has `conversation` or `queue` (progress is perception, `world.ts`'s own rule). |
| `inject(injection)` | `heard` → a counterpart line (scheduled `atTick` honoured, released on the next `observe`, as the Playroom does); `manual-entry` → a record `{ id: 'manual/<key>', kind: 'manual', title: key, fields: { text } }` into `records`; `tool-result` → stored in `extra.toolOverrides[toolId]` for WP58's lines to read (in WP53 it is carried and narrated, not consumed); `radio` → a `system` line on `channel`. Nothing is silently dropped; a kind a desk has switched off (`spec.injections?: Injection['kind'][]`, default all four) returns without effect and the session's existing `world-cannot-inject` check refuses it before the run. |
| `forAgent(handle)` | **Not in WP53.** The seat model is WP55's; a desk world created here hosts one seat and `SessionGroup` refuses it with its existing plain error. Recorded so it is a decision. |
| `configure(config)` | Stored in `extra.config`; nothing reads it yet (the Radio brick's channel, if ever fitted to a desk, is WP55's). |

`createDeskWorld` returns `{ id, name, view: 'desk', layouts, actions (ids qualified `<worldId>/<action>`, the Playroom's convention), senses (likewise), predicates (descriptions), create }`. `create(layoutId)` refuses an unknown layout with the same message shape the grid worlds use.

**What a desk author writes** for the Front Desk of §4.3: the spec — two records, one queue item, four `DeskActionSpec`s of five to ten lines each, three senses of one line each, three predicates. Around ninety lines; the stage-A hand-written version is around two hundred and fifty. The Advice Desk (WP60) will be the same shape over the bank's generators.

### 4.5 The desk golden trace (stage B)

`packages/desk/src/fixtures/trace.desk-minimal.v1.json`: a scripted run over a two-record desk defined *inside the desk package's own tests* (not the Workshop's Front Desk — the oracle must not move when a pack's content does), through `createSession` with the mock provider and the test clock, exactly as `pack-starter`'s `trace-fixture.test.ts` and `pack-geap`'s `golden-trace.test.ts` do: `say`, `look-up`, `sign-in`, done. The test asserts the events byte-identical to the fixture and that every event parses through `engineEventSchema` (`checkGoldenTrace`'s own check). From stage B on, a change to the runtime that moves a byte of this trace is a version change with a fixture (`14-…` §7).

### 4.6 What the trace says (all stages)

Nothing new. A Desk's first frame is the same `world.changed` the Playroom's is (`agent-session.ts:997`); every successful action's is `:684`. A transcript is `DeskWorldState.transcript` on the latest `world.changed`; the bot's own line is also on `action.performed` (`say`); a revealed record is the difference between two snapshots' `records`. `02-…` §7's catalogue is unchanged and this note says so rather than adding an entry.

### 4.7 `DeskView` proper (stage C, `workbench`)

The stage-A first cut becomes the real screen for the Kit skin and the Workshop layer, still on tokens, still three panes plus two strips:

- **Transcript** — speaker lanes with a label and a shape per lane (never colour alone): agent right-aligned in the Actions red, counterpart left-aligned in ink, system centred in muted ink; `channel` shown as a small chip when present; the newest line scrolled into view; the whole pane `role="log"` with `aria-live="polite"` while a run is live, `aria-live="off"` in replay.
- **Case file** — records grouped by `kind`, each a definition list of its fields; a `classification` badge (`personal`, `special-category`) with a title, never a colour; records revealed since the previous frame briefly highlighted (`fxCue`'s beat, reused, not a second mechanism).
- **Queue** — items with a status chip, the decision when made, and the records they name as links that scroll the case file.
- **Alerts strip** — `severity` as icon plus text.
- **"FOR SIMULATION ONLY"** — a strip on every Desk view in every mode, the copy in the pack's `strings.ts`, `data-testid="desk-simulation-only"` (`41-…` §13's risk row; `42-…` §5 rule 5).

The Kit skin uses the Kit's surface tokens; the Workshop's `[data-mode='workshop']` token layer densifies it as it does every other screen. Geometry is WP57's to change; `contrast.test.ts` gains the two lanes on both grounds. The keyboard path: the transcript is a focusable region, records and queue items are focusable rows, the strip is not.

### 4.8 `checkDesk` (stage C, `pack-testkit`) — first cut

```ts
export function checkDesk(world: WorldDefinition, fixture: DeskConformanceFixture): ConformanceIssue[];
```

Over a world with `view: 'desk'`, for every layout and for `fixture.seeds` (default `[1..25]`; WP54 raises it to 100 with the truth property):

| Check | Fails when |
|---|---|
| `desk.snapshot-shape` | `create(layout).snapshot()` is not a `DeskWorldState` by the guard, or `records`/`transcript`/`queue`/`alerts` are missing or not arrays |
| `desk.action-tier` | any action lacks a `riskTier` |
| `desk.perform-pure` | `perform` of any action reads `Date`, `Math.random`, `crypto` or `performance` — checked by running the fixture's scripts with those globals replaced by throwing stubs, the way the egress guard's throwing `fetch` is checked |
| `desk.injections` | `inject` is absent, or refuses a kind the fixture says the desk accepts, or accepts one it says it does not |
| `desk.purpose-classification` | a `special-category` record appears in `snapshot().records` at creation, or is revealed by a sense, on a desk whose `purpose` does not name it — WP53's cut checks the opening snapshot and the senses only; the `truth`-aware property is WP54's |
| `desk.reset-identical` | `reset()` then `snapshot()` differs from a fresh `create(layout).snapshot()` for the same seed |

Plus everything `checkWorld` already proves — `checkDesk` calls it with `volatileStateKeys: ['tick', 'heardCursor']` before its own checks. `describeConformance` runs `checkDesk` for every desk world a manifest ships, so the Workshop pack's Front Desk is under it from stage C.

### 4.9 The Play route's Playroom slot and the other four screens (stage A)

No screen gains a Desk-specific code path beyond `WorldStage`. The Play route's `SayToBot` already calls `receiveInput`; on a desk it appends a counterpart line, which is the right thing and the first hint of WP55. The end card, the Flight Recorder, the story strip and the Scrapbook read events, not the world, and need nothing. The Run Lab's inspector, the scrubber, Compare's synced scrubbers and the replay's stepping all go through `projectThrough`, which carries the union. `trace-style.ts` reads `world.changed` only to colour a row.

## 5. UX trajectory

Stage A: a Desk appears wherever a room did, plainly. Stage C: it looks like a desk. WP57: it is drawn with `Transcript`, `CaseFile` and `Queue` from the Control Room's set and the Run Lab gets the Boundary pane beside it. WP59/WP60: the Playground's own desks, with the box on the shelf and the cards in the rack. The Kit's copy never mentions a desk until then.

## 6. Determinism

A desk's case is generated from the `random` handed to `create` (the session's own, seeded — §4.4's seam — or a fixed default when none is given), and only from it; the runtime holds no clock and no randomness of its own. `reset` regenerates with the same source. `perform` is pure over `(state, args, ctx)`; `ctx.random` is the session's. `checkDesk`'s `perform-pure` check is the proof; the golden trace is the oracle. A stored Desk run replays byte-identically through `projectThrough` because `world.changed` carries whole snapshots, exactly as a room's does.

## 7. Non-goals (recorded so they are decisions)

- **Truth.** `WorldInstance.truth?()`, `run.finished.truth`, `EvaluationInput.truth` — WP54. `DeskState.hidden` is not truth: it is what a look-up has not yet revealed.
- **The counterpart as an actor.** Scripted rules, `pressure`, `AgentHandle.role`, `forAgent` for two seats — WP55. WP53's counterpart is `receiveInput` and `heard`, one seat, exactly what the Playroom has.
- **Service lines and cassettes** — WP58. `tool-result` injections are carried, not consumed.
- **The Control Room components** — WP57. Stage C's `DeskView` is tokens and plain markup.
- **A desk in the Kit's leaflet, a chapter, a side quest** — never in this roadmap (`42-…` §1.1).
- **Publishing `@craftabot/desk`** — not in WP53; its README says so.

## 8. Divergences from `41-…` §6.1, with reasons

| `41-…` §6.1 says | This note does | Why |
|---|---|---|
| "`WorldStage.svelte` … reads `registry.getWorld(worldId).view` and mounts `WorldView` or the new `DeskView`" | `WorldStage` decides by the shape of the `world.changed` payload (`isDeskWorldState`/`isGridWorldState`); the registry's `view` is a hint for the waiting-state copy | A stored or imported trace from a build that does not install the world must still draw (editions, WP69, will make this common); the shape is on the trace and the registry may not be |
| `DeskWorldSpec` has `cases: DeskCaseGenerator` — "(seed, random) → { revealed, queue, truth }" | `layouts: Array<{ id, name, case(random) }>`; `truth` absent | A world's `create(layoutId)` is the contract the session already calls; a layout *is* a case generator, and naming it `layouts` keeps a desk a `WorldDefinition` without a second mechanism. `truth` is WP54's door |
| `DeskWorldSpec.senses[].reveal: (state) → Partial<DeskWorldState>` | `reveal(state) → string \| undefined` — observation text | `observe` returns an `Observation` (`schemas/shared.ts`), which is text per channel; the drawable state reaches the screen through `world.changed`, not through a sense. A sense that returned state would be a second channel for the same facts |
| "the golden `trace.desk-minimal.v1.json`" over "a test-only two-record desk" | Two desks: the golden trace's own, inside `packages/desk`'s tests; and the Workshop pack's Front Desk, which stage A hand-writes and stage B rewrites on the runtime | The oracle must not move when a pack's content does; the app must show a Desk before the runtime exists |
| The test-only desk appears "in the Kit's Playroom slot" | Through a goal card with `audience: 'workshop'` — on the Kit's rack only while the Workshop door is open | Any registered non-coop card is on every child's rack today (`bench/[agentId]/+page.svelte:106`); a gate is the smallest change that keeps `42-…` §1.1's "no Kit change" true, and it is the gate brick kinds and authored content already use |
| `WorldDefinition.create(layoutId)` unchanged | `create(layoutId, options?: { random? })`, the session passing its own | The session's seeded `random` never reached a world before because no world needed it; a desk's case does, and an optional argument is smaller than a new door |
| `forAgent` "(seats: `agent` and `counterpart`, §6.3)" listed among the runtime's doors | Not in WP53; WP55's | `42-…` §3 WP53 says "(`forAgent` is WP55's)"; this note agrees with the roadmap over the design's summary |
| `DeskRecord.classification` and `purpose` are "WP53 stage B's" | Both land in stage B and `checkDesk` reads them in stage C, but the *gate* — a sense refusing to reveal a `special-category` record outside the purpose — is WP54's with truth | The gate is meaningless without the tenet-13 property, which needs truth to say what "outside" means |

## 9. Risk register

| Risk | Handling |
|---|---|
| A stored trace's snapshot matches neither guard (a world from a pack this build never had) | `WorldStage`'s fourth branch: JSON and a sentence; an e2e imports such a trace and reads the sentence |
| The union leaks a grid assumption somewhere `grep` cannot see (a `world.bot` read in a component) | `svelte-check` over the union fails every such read; stage A's DoD is `check` clean with the union in place |
| The Front Desk's card reaches a child's rack | The `audience` filter's own component test, plus the leaflet-coverage test unchanged, plus a Kit e2e that opens the bench with the door closed and asserts the card absent |
| The runtime's JSON-Schema validator and the testkit's Ajv disagree on an argument | The testkit's `checkDesk` validates every fixture call both ways and reports a disagreement as its own issue |
| The desk golden trace pins an accident of ordering (record ids, transcript `seq`) | Ordering is specified: records in the order the case revealed them, `seq` monotonic from 1, queue in case order — written in `createDeskWorld`'s TSDoc and tested |
| `structuredClone` of `extra` carrying something unclonable | `create` clones the generated case once at creation and refuses (with the desk's id) if it cannot; a desk learns at registration, not mid-run |

## 10. Implementation plan

Stage-gated as `23-…` §10 / `25-…` §11: every stage lands green on the full gate (unit suites, `check`, `lint`, build with the budget and schema checks, all e2e, both golden traces, the baseline campaign), independently committable, one dated note here per stage.

**Stage A — the seam, the union, the stage, the gate, the hand-written desk.** `core`: `WorldViewKind`, `view?`, `types/desk-world.ts` with the guards and their tests, `RunProjection.world` as `WorldViewState`, `audience?` on goal cards (fixture + test), exports. `pack-workshop`: `workshop/the-desk` hand-written, `workshop/sign-the-visitor-in` with `audience: 'workshop'`, its world conformance fixture, unit tests. `workbench`: `WorldStage.svelte` (with its component tests over all four branches), the first-cut `DeskView.svelte`, the five mounts, the two session views' union, the bench's two racks gated, the waiting-state copy. e2e: with the Workshop door open, build a bot on the Front Desk card, step it, read a transcript line (`desk-line-1`) in the Play route and the Run Lab; with the door closed, the card is absent from the rack. Docs: `02-…` §4 dated note (the `view` field, no event change), `14-…` §4.x note on the goal-card field, `03-…` §5.1 note (the Desk beside the Playroom), `41-…` §12 the divergences above, `42-…` §8 the stage entry.

**Stage B — `@craftabot/desk`.** The package (`package.json`, tsconfigs, the ESLint block, the workspace), `createDeskWorld` with every door of §4.4, the JSON-Schema argument validator, `didYouMean`, the injections mapping, unit tests to the coverage bar `telemetry` carries; the Front Desk rewritten on it (same ids, same card, same e2e); `trace.desk-minimal.v1.json` and its byte-identity test; `pack-workshop` gains the dependency. Docs: `01-…` §2 note (the package in the map), `05-…` §3 note, the README.

**Stage C — `DeskView` proper and `checkDesk`.** The Kit-skin and Workshop-layer `DeskView` of §4.7 with `contrast.test.ts` rows and the a11y e2e over the Play route and the Run Lab on a Desk run; `checkDesk` of §4.8 in the testkit with fixtures for each failing check (a desk whose action lacks a tier, one whose `perform` reads `Date`, one whose sense reveals a `special-category` record outside its purpose — `42-…` WP53's DoD, verbatim), `describeConformance` running it; `DeskConformanceFixture` on the manifest fixture type. Docs: `13-…` §7 note (the desk row of the conformance kit), `11-…` note if a placeholder is drawn, `42-…` §8's close-out.

## 11. Acceptance criteria (WP53 as a whole)

1. The Front Desk runs `say-hello`-style through the real engine and appears in the Kit's Playroom slot (door open), the Run Lab, Compare and the replay with no cast anywhere: `grep -n GridWorldState apps/` shows `WorldView.svelte` and the union's import only.
2. Both golden traces byte-identical at every stage; `trace.desk-minimal.v1.json` byte-identical from stage B on and parsed clean by `engineEventSchema`.
3. `checkDesk` rejects a desk whose action lacks a tier, one whose `perform` reads `Date`, and one whose sense reveals a `special-category` record outside its purpose; `describeConformance` runs it over the Workshop pack.
4. An e2e opens a Desk run and reads a transcript line; another proves the Front Desk's card is off the Kit's rack with the door closed and on it with the door open; the leaflet coverage test is unchanged.
5. The Front Desk as a `DeskWorldSpec` contains no `observe`/`perform`/`inject`/`forAgent` implementation (checked by reading the diff at stage B).
6. `@craftabot/desk` imports `@craftabot/core` and `zod` only, held by ESLint; its coverage bar is `telemetry`'s.
7. `docs/schemas/` is unchanged (no new boundary artefact); `02-…` §7 is unchanged and this note says why.

*(Stages append dated notes here as they land, per `10-…` §7.)*

> **Stage A landed 2026-09-05** as §10 describes, with two things worth writing down. (1) The stored-run screens (the Run Lab, Compare, the replay) pass no `view` hint at all: they always have a first frame, so the waiting-state copy never shows there, and reaching the registry from those routes for a hint the shape makes redundant would have been plumbing for nothing. Only the Play and duo routes pass it. (2) The starter Sense and Actions bricks default to the Playroom's ids (`brick-kinds.ts:647,670`), so a bot on the Front Desk — or on the Workshop room, which no e2e had ever played through the Kit — does nothing until the player ticks the world's own channels and actions in the brick panels. `desk.spec.ts` does exactly that, as a child would; whether the bench should re-default those bricks when the card's world changes is a Kit question for the Phase M exit review, not this WP's. Gate as `42-…` §8 item 4 records.
