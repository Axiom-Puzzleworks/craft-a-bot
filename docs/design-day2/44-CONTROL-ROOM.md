# 44 — The Control Room (WP57): the Workshop's visual system and the Boundary map

> **Status:** design of record for WP57 (`42-DAY4-ROADMAP.md` Phase M), written 2026-09-05 against the codebase as it stands after WP53 (`main` at `6d63936`). This is the map for `41-TARGET-DESIGN-V4.md` §6.12 stages A–B and §6.15; where the two differ, §8 below says why and `41-…` §12 gets a dated note when the stage lands. It carries the refreshed mock-up (`mockups/pro-mode-mockup.html`) as `17-…` §6 did: the picture comes before the component. The screens' re-cut on this system is WP71's, not this WP's.

---

## 1. Purpose, and who this is for

The Workshop has a token layer and no components (`41-…` §2.1, G32). `tokens.css` line 204 onward re-points four surface tokens, adds `--cab-panel` and `--cab-scope`, and densifies the type scale; `15-…` §5's "bench instrument" — brushed metal, graph paper, engraved labels, Braun restraint — was specified and never built. Every dashboard is stat tiles and tables; the campaign grid, the telemetry series and the drift flags each draw themselves (`routes/workshop/evals` has a `rampStep`, `routes/workshop/telemetry` a `.series-bar`, `routes/workshop/+page` a `.tile`). Nothing draws the *system* — the agent inside its boundary, and what is outside it (G41).

Decision D4 (`41-…` §2.1) moved this forward from the tail for two reasons that are about correctness, not polish: the Boundary map is the picture of the data model, and drawing it before the desks exist is what tells us which facts the trace must carry; and a published product is judged on its first screen. So WP57 is bounded and early: **the tokens, the components, one data-visualisation grammar, and one new instrument** — the map. It is for WP59–WP63's desk authors (every desk is drawn with these from its first stage), for WP71 (which re-cuts every Workshop screen onto them), and for the stakeholder who needs to see a bot's ecosystem as a picture rather than a list.

## 2. Where the code actually is (the load-bearing facts)

Verified against `main` at `6d63936`.

**Tokens.** `apps/workbench/src/lib/styles/tokens.css`: the Kit palette in `:root` (§2.1 of `04-…`, with the `-fill`/`-text` variants WP10 added and the two muted tokens WP17 added), the brick and slot mappings, and from line 204 the `[data-mode='workshop']` layer: `--cab-paper #d8d4cc`, `--cab-cream #ecebe6`, `--cab-ink #23211e`, `--cab-ink-muted #56524a`, `--cab-panel #4a453d` (dark, deliberately — the first mid grey measured 3.2:1), `--cab-scope #3a6124` (oscilloscope green, "this number is moving"), a denser type scale, square corners. `contrast.test.ts` holds every text pair at 4.5:1 and every non-text pair at 3:1, and audits the Workshop block separately by reading inside it.

**The colour law** (`04-…` §2.2): LLM blue, Memory green, Tools purple, Sense sky, Actions red, Safety yellow/black, Planner rose (WP30), If/Then indigo (WP30). Never reassigned. Every warm hue and every cool hue already carries a concept, which is the reasoning both amendments used to pick a new one; `--cab-teal` and `--cab-orange` are brand tints with no fixed concept.

**Components the Workshop reuses from the Kit:** `Panel`, `Dial`, `Rocker`, `GoLever`, `NavHeader` (`components/kit/`), the roundel icon set, `WorkshopRail`. `WorldStage` (WP53) chooses `WorldView` or the first-cut `DeskView` (`components/play/DeskView.svelte`: three plain panes, tokens only, test ids `desk-line-{seq}`, `desk-record-{id}`, `desk-queue-{id}`, `desk-simulation-only`, `world-view` with `data-world="desk"`).

**Where charts are drawn today, by hand:** the Eval Matrix's `success-grid` (a table whose cells set `--fill` from `rampStep(rate)` with an ink-or-cream label — the one place the "value in the cell, colour is magnitude" rule already lives), the campaign screen's `slices` table, the telemetry screen's `series-bar` (a width-percent span), the Bench Dashboard's `.tile` readouts, and the drift flags as table rows. None share a ramp, a legend or an axis.

**What the Boundary needs, and where it already is.** `capabilitiesOf(spec, registry)` (`core/capabilities.ts`) gives `filled` slots, `toolIds`, `actionIds`, `channels`, `cartridgeId`, `guardrailIds`. `describeFittedBricks(spec, registry)` names the bricks. `PackRegistry` lists brick kinds (with `egress?` and `credential?`), provider factories (`egress?`, `keyRequirement`), guardrail services (`egress`, `credential`), evaluators (`egress?`, `kind`), worlds (`view?`); sinks are **not** registry content — the Workshop's `sinksStore` (`state/sinks.svelte.ts`) holds configured `TraceSink`s from `@craftabot/telemetry`, each with `egress(config)` and `credential?`. On the trace: `run.started.egress?: { mode, hosts }` (WP41), `run.started.providerId/cartridgeId`, `guardrail.external` (an `ExternalCallRecord` — `service`, `endpoint` (a URL), `outcome`, `latencyMs` — plus `guardrailId` and `hook`), `tool.executed { name }`, `approval.requested/resolved`, `sense`, `group.started { memberAgentIds }`. The safety brick's config carries `approval: 'off' | 'everything' | 'risky'` (v2) and the spec `autonomy?` (WP52). A `RunRecord` carries `specSnapshot`, so a stored run has its spec.

**The Run Lab** (`routes/workshop/runs/[runId]/+page.svelte`, 978 lines): a header strip, then `.regions` — the world section (`WorldStage` over `projectThrough(events, tick)`, live controls, the `run-scrubber`), the timeline, the inspector. `tick` is one `$state`; everything reads it. **The Spec Lab** (`routes/workshop/spec/[agentId]`): build checks, the contract (goal card, packs, brick kinds required, the safety stack with `SLOT_CAPACITY`, the autonomy dial, policy cards), the spec as JSON; it has `createRegistry()` and the `AgentRecord`.

**The mock-up** (`docs/design-day2/mockups/pro-mode-mockup.html`, 355 lines, WP20-era): three tabs — Run Lab, Eval Matrix, Policy Studio — with its own `--wk-*` tokens for metal, graph paper and engraved ink that never became `--cab-*` tokens. It has no Desk and no Boundary.

**Screenshots.** None exist in the repo; `playwright.config.ts` has no projects and no `toHaveScreenshot` call.

## 3. Design principles

1. **One tokens file, one colour law, two skins.** Every new token is a dated amendment to `04-…` §2 and a row in `contrast.test.ts`; no brick colour is redefined; `--cab-board` and `--cab-rug` stay untouched (the Run Lab draws the same room the Kit does).
2. **The grammar owns every chart.** `dataviz.ts` holds the ramps, the lane order, the axis and legend rules and the "never colour alone" helper; `Meter`, `Tape`, `Matrix` and `Boundary` draw through it and nothing else draws a chart — a lint rule, not a review note.
3. **A component is geometry-neutral.** `15-…` §5 says "component geometry unchanged"; the Kit does not move by a pixel. The Control Room's components are new files under `components/control-room/`; the Kit never imports them.
4. **Every instrument reads events, records and the registry — never the engine.** Hard rule 3, applied to a gauge: a `Meter` is handed a number and a gate; a `Boundary` is handed a `BoundaryMap` folded from the spec, the registry and events.
5. **The map is a fold.** `boundaryMapFor` lives in `governance/reports` beside the safety case and the drift series, is pure, is snapshot-tested over the golden traces, and carries a property: every outside host is inside `run.started.egress.hosts` when a mode was named.
6. **The picture before the component.** The mock-up is refreshed first — with a Desk and a Boundary drawn in it — and stage B builds what it shows.
7. **Accessibility is not a mode.** Every lane has a glyph and a label; every lamp an icon; every meter a number; axe over every route and the contrast test hold the Workshop to the Kit's bar (`15-…` §7 rule 5).

## 4. The design

### 4.1 The token extension (stage A)

Eight tokens, all in `tokens.css`, all with `contrast.test.ts` rows against every ground they sit on, all recorded in `04-…` §2 by a dated amendment:

| Token | Value | Where it sits | Why this hue |
|---|---|---|---|
| `--cab-metal` | `#c9c4b6` | Panel headers, the Boundary ring, instrument bezels — the brushed panel | The mock-up's `--wk-metal`, adopted |
| `--cab-engrave` | `#4d463c` | Label ink on metal (engraved labels) | Darkened from the mock-up's `#5a5348` until it clears 4.5:1 on `--cab-metal` |
| `--cab-graph` | `#efe8d6` | Graph-paper cream — the reading ground inside an instrument; the 4-px rule is a CSS gradient over it, not a token | The mock-up's `--wk-graph`, adopted |
| `--cab-counterpart` | `#6e4a2f` | The transcript's other voice — lane border and speaker label | A new hue: every warm hue (red, yellow, orange, rose) and every cool one (blue, sky, teal, indigo, purple) already carries a concept; a leather brown is the person across the desk, and reads as neither brick nor room (`--cab-board`'s wood is `#7a5c3e`, lighter and yellower) |
| `--cab-truth` | `#5a2d5c` | The "Case file (truth)" flap (WP54) — border and label | A deep plum, distinct from Tools purple (`#6c4f9e`, bluer, lighter) and Planner rose (`#a8467a`, pinker); truth is a thing seen after the fact, and the flap should look like nothing the bot could see |
| `--cab-pass` | `#3a6e2c` | Lamps, verdict chips, gate rows | `--cab-green-text`'s value, named for what it means — a verdict, not a brick |
| `--cab-fail` | `#a72e24` | Lamps, verdict chips, gate rows | `--cab-red-text`'s value, likewise |
| `--cab-inconclusive` | `#7a5c00` | Lamps, verdict chips | The guardrail lane's dark yellow from the mock-up; clears 4.5:1 on cream, paper and graph |

The three status tokens are semantic aliases of hues the colour law already uses for *text*, so a lamp and a verdict chip stop improvising `green-text`/`red-text` (four screens do today) and a reader learns one meaning. They are defined in `:root` — a verdict means the same in both modes — and the Workshop block leaves them alone. `--cab-metal`, `--cab-engrave` and `--cab-graph` are defined in `:root` too (the Kit's Test Bench may one day want an instrument) and the Workshop block does not re-point them. `--cab-counterpart` and `--cab-truth` join the colour law as its third and fourth additions, by the amendments' own reasoning.

Contrast rows added: `engrave` on `metal` (text); `ink` on `metal`, `ink` on `graph`, `ink-muted` on `graph` (text); `counterpart`, `truth`, `pass`, `fail`, `inconclusive` on `cream`, `paper` and `graph` (text, since each is also a label colour); `counterpart` and `truth` against `cream` (non-text, as lane borders). The Workshop block's re-pointed `cream`/`paper` are audited for the same pairs inside the block, as the existing test already does for the layer.

### 4.2 The mock-up, refreshed (stage A)

`mockups/pro-mode-mockup.html` gains its `--wk-*` tokens renamed to the `--cab-*` names above (so the mock-up and `tokens.css` say the same thing), a **Desk** in the Run Lab tab beside the Playroom (a transcript with three lanes, a case file, a queue, the "FOR SIMULATION ONLY" strip), a **fourth tab — Boundary** — drawing §4.5's map for a Fraud-Desk-shaped build (the chassis with its bricks in the colour law at the centre; the safety stack, the egress edge and the approval gate as the ring; the desk and a counterpart inside; the provider, a guard service, three service lines, an evaluator and a sink outside, each edge labelled with its hosts and what it sends; the human on the ring), and the instrument components as they will look: a `Meter` (needle), a `Readout`, a `Strip`, three `Lamp`s, a `Tape`, a `Matrix`. Still "wireframe of record, not production code" — its footer says so.

### 4.3 `dataviz.ts` — one grammar (stage B)

`apps/workbench/src/lib/control-room/dataviz.ts`, pure TypeScript, tested:

- **Sequential ramp** — the Eval Matrix's six teal steps (`rampStep`, WP23), moved here byte-identical, each naming its fill and whether its label is ink or cream; `sequential(value: 0..1)` returns the step. **Teal only:** every other hue is a brick's under the colour law, and a magnitude ramp in a brick's colour would put that brick's meaning on a number — the Eval Matrix's own note, and `20-…` §2's "accent only" designation. No second hue for "up is good"; `direction` belongs to the gate on a `Meter`, not to the ramp.
- **Diverging ramp** — orange through cream to teal for "relative to a baseline" (`diverging(delta: -1..1)`): orange is the other accent-only tint, so neither end is a brick.
- **Lanes** — the categorical order fixed by the colour law: `sense` sky, `think` blue, `tool` purple, `action` red, `memory` green, `guardrail` yellow (with ink), `planner` rose, `reflexes` indigo, `counterpart` counterpart, `system` ink-muted — each with its token, its darkened text token, and its **glyph** (the roundel family's characters until WP73's icons), so a lane is never colour alone.
- **Status** — `pass`/`fail`/`inconclusive`/`live` with token and glyph (`✓`, `✕`, `?`, `●`).
- **Axis and legend rules** — `ticks(min, max, count)` (nice numbers), `formatPercent`, `formatCount`, `formatTick`; a legend is always rendered with the glyph beside the swatch.
- **The rule** — `dataviz.ts` is the only module under `src/lib/control-room/` or `src/lib/components/control-room/` that may name a hex or compute a ramp; components read tokens and call these.

### 4.4 The instrument components (stage B)

`apps/workbench/src/lib/components/control-room/`, each a Svelte 5 component on tokens, each with a component test, each drawn in the mock-up:

| Component | What it draws | Reads |
|---|---|---|
| `Readout` | An engraved numeric readout — the stat tile become an instrument: a label on metal, the value large, a unit, an optional delta with a glyph | `{ label, value, unit?, delta?, testId? }` |
| `Strip` | A header strip on graph paper with an engraved label and a row of `Readout`s or chips (the Run Lab's header, the campaign's summary) | `{ label }` + children |
| `Lamp` | A pass/fail/inconclusive/live indicator: a disc in the status token with its glyph and a text label — never the disc alone | `{ status, label }` |
| `Meter` | A needle gauge for a rate against a gate: an SVG arc on graph paper, the needle at `value`, a mark at `gate`, the number engraved beneath; `direction` says which side is good | `{ value, gate?, direction?, label }` |
| `Tape` | A time-series ribbon (SVG) for `/telemetry` and drift: one or more series over an x axis of day buckets, flagged points drawn as the status glyph, the legend with glyphs; sparklines are a `Tape` with no axis | `{ series: { id, label, points: {x, y}[] }[], flags?, compact? }` |
| `Matrix` | The campaign grid and the confusion matrix on one component: row and column heads, a sequential fill from the grammar with the value in every cell (`17-…` §4.4's rule), row and column summaries, an optional cell click | `{ rows, cols, cells: (r, c) → { value, label } \| undefined, onCell? }` |
| `CaseTable` | The drill-through: one row per case with decision, truth, cost, ticks, approvals, verdict lamps; sortable by column; a row click | `{ columns, rows, onRow? }` |
| `Transcript` | The Desk's transcript pane, lanes from the grammar (`agent` in the action lane, `counterpart`, `system`), a live region, `desk-line-{seq}` ids kept | `{ lines, live? }` |
| `CaseFile` | The Desk's records grouped by kind with classification badges; `desk-record-{id}` ids kept; WP54's truth flap lands here behind `--cab-truth` | `{ records }` |
| `Queue` | The Desk's queue with status chips (`Lamp`-styled); `desk-queue-{id}` ids kept | `{ items }` |
| `Boundary` | §4.5's map | `{ map: BoundaryMap, tick? }` |

`DeskView` (WP53) is rebuilt on `Transcript`, `CaseFile` and `Queue` in the same stage: the same test ids, the same `world-view` root, the same e2e (`desk.spec.ts`) and the desk golden trace rendering unchanged — the DoD's own sentence.

**The lint rule.** `eslint.config.js` gains a block over `apps/workbench/src/lib/components/control-room/**/*.svelte` and `apps/workbench/src/routes/workshop/**/*.svelte`: `no-restricted-syntax` on the Svelte AST's `svg` and `canvas` elements — "draw a chart through `Meter`, `Tape`, `Matrix` or `Boundary` (`44-…` §4.3)" — with `Meter.svelte`, `Tape.svelte` and `Boundary.svelte` excluded by file. `Matrix` needs no SVG. From WP57 on, no Workshop screen introduces a chart outside the components (`42-…` §5 rule 4); the two screens that draw their own today (`evals`' grid, `telemetry`'s bar) are `div`s and `table`s, so they pass the rule as written and are re-cut in WP71.

### 4.5 The Boundary map (stage C)

**The fold**, `boundaryMapFor(spec, registry, options?)` in `@craftabot/governance/reports`, pure, returning a `BoundaryMap` v1:

```ts
export interface BoundaryMap {
  schemaVersion: 1;
  agent: { id: string; name: string; bricks: Array<{ slot: SlotId; kindId: string; name: string }> };
  boundary: {
    safetyStack: Array<{ kindId: string; name: string; guardrailIds: string[] }>;   // the fitted safety bricks, in stack order
    egress: { mode?: EgressMode; hosts: string[] };                                  // from run.started when events are given, else the union of every fitted component's declarations
    approval: { mode: 'off' | 'everything' | 'risky'; autonomy?: string };           // the safety brick's dial and WP52's
  };
  inside: {
    world: { id: string; name: string; view: 'grid' | 'desk' } | undefined;
    counterparts: Array<{ agentId: string; name: string }>;                          // from group.started's members other than the agent, when events are given
  };
  outside: Array<{
    kind: 'provider' | 'guard-service' | 'evaluator' | 'sink' | 'service-line' | 'pdp' | 'evidence-store';
    id: string; name: string; hosts: string[]; sends: string[]; credential?: string;
  }>;
  human: { approvals: number; principal?: undefined };                               // `principal` arrives with WP65
  activity?: Array<{ tick: number; edge: string; eventId: string; verdict?: string; outcome?: string }>;
}
```

- **`agent.bricks`** from `toSpecV2(spec).bricks` joined to `registry.getBrickKind` (name, slot).
- **`boundary.safetyStack`** — the `safety` slot's bricks in order, each with the guardrail ids `capabilitiesOf` attributes to it (the ids a kind's `contributeGuardrails` installs; where capabilities cannot attribute, the kind's own id).
- **`boundary.egress`** — `run.started.egress` when events are given; otherwise `{ hosts }` as the union of the fitted provider factory's, the fitted brick kinds' and the fitted guardrail services' declarations, `mode` absent (a build has no mode until it runs).
- **`boundary.approval`** — the fitted safety brick's `approval` (or `'off'` with none fitted) and the spec's `autonomy`.
- **`inside.world`** — the goal card's world from the registry, with `view ?? 'grid'`. **`inside.counterparts`** — from `group.started.memberAgentIds` less the agent, named from the group's member events (WP55 will label roles).

> **Amended 2026-09-05 (WP55 stage C, `46-COUNTERPARTS.md` §4.6):** the seats are named by the host — `boundaryMapFor` takes `options.names` (agent id → display name), because the trace carries no display names and the host's run records do — and given their `role` from `group.started.memberRoles`. The Run Lab draws a group episode's Boundary from the `agent` seat's spec snapshot (the first member when no seat had a role), so the region that was empty for a group since stage C now shows the clerk with the visitor inside its ring.
- **`outside`** — every registered thing the build *reaches*: the provider factory the cartridge names (`provider`, its `egress` hosts and `sends`, its `credential` id when `keyRequirement === 'required'`); every guardrail service a fitted brick names (`guard-service`; the brick's config `serviceId` where the kind has one — the generic Guard brick — else the kind's own `egress`); every evaluator the caller lists as fitted (`options.evaluators?`, since a build does not name evaluators — a campaign does); every sink in `options.sinks` (`sink`); `service-line`, `pdp` and `evidence-store` are reserved for WP58, the PDP pack (a `guard-service` today) and WP70. An `outside` entry with no hosts (an offline Armour brick, a local Ollama) is drawn with a dashed edge labelled *local*.
- **`human.approvals`** — the count of `approval.requested` in the events.
- **`activity`** — when events are given, one entry per event that crosses an edge: `tool.executed` (edge `tool:<name>`), `guardrail.external` (edge `guard-service:<service>`, `outcome`, and the host parsed from `endpoint`), `approval.requested`/`approval.resolved` (edge `human`), `sense` (edge `world`), `action.performed` (edge `world`), `think.completed` (edge `provider`), `group.started` members' events with a different `agentId` (edge `counterpart:<agentId>`).

**The property** (a test): with `events` given and `run.started.egress.mode` named, every host of every `outside` entry and every host parsed from a `guardrail.external.endpoint` matches some pattern in `run.started.egress.hosts` (`hostMatches`, core's own) — or the fold reports it in `activity` as `verdict: 'outside-egress'`, which the map draws in the fail token. The golden traces (starter's `say-hello`, geap's armour offline, the desk minimal) are snapshot-tested through the fold.

**The component**, `Boundary.svelte`: concentric regions on graph paper, SVG through `dataviz.ts`. The chassis at the centre with its bricks as small blocks in their slot colours; the ring made of the safety stack (segments, each labelled), the egress edge (a gate with the hosts engraved beside it, red when `mode` is `none` and something tried), the approval gate (a figure on the ring with the count); inside the ring the world (a room or a desk glyph) and each counterpart; outside, one node per `outside` entry at a fixed angle per kind (providers at the top, guard services to the right, sinks and evaluators below, lines to the left), each edge labelled with its hosts and its `sends`, a credential drawn as a small key glyph on the edge. Every node and edge carries `data-testid` (`boundary-node-<kind>-<id>`, `boundary-edge-<edge>`) and a text label; the whole is `role="img"` with an `aria-label` that reads the map in a sentence, plus a visually hidden list of every edge for a reader. With `tick` given, edges whose `activity` entries are at that tick get `data-lit="true"` and the lit style (the scope green, plus a pulse honouring reduced motion).

**Static, in the Spec Lab** — a "Boundary" section under the contract, the map folded from the record's spec and the registry, sinks from the Workshop's store. **Over a trace, in the Run Lab** — a fourth region beside the world, the timeline and the inspector, the map folded once from the run's `specSnapshot`, the registry and the run's events, and `tick` bound to the scrubber, so scrubbing lights the edge that fired. **In the Kit — nothing** (`41-…` §6.15).

### 4.6 The first visual-regression screenshots (stage C)

A `visual` Playwright project (`playwright.config.ts` gains `projects`), a `visual.spec.ts` that seeds the fixture data the screens need and calls `toHaveScreenshot` on the Spec Lab with a Boundary, the Run Lab with a Boundary over the geap golden trace, the Kit's shelf and bench, and the Play route on the Front Desk; snapshots under `e2e/__screenshots__/<platform>/`, committed for the platform the WP was built on. `npm run e2e` keeps excluding the project; `npm run e2e:visual` runs it. The diff in CI is WP71's (its runner is Linux and the baselines must be generated there); recorded in §8.

### 4.7 What the trace says

Nothing new. The map is a fold over `run.started`, `guardrail.external`, `tool.executed`, `approval.*`, `sense`, `action.performed`, `think.completed` and `group.started` — every fact it needs is already on the trace, which is the reason the map could be drawn before the desks exist. `41-…` §6.15's two findings — that `run.started.egress` is the boundary's outside edge and that `attestation` is the human's link — stand; the second is WP65's field and `human.principal` waits for it.

## 5. UX trajectory

Stage A: the mock-up shows the whole system. Stage B: the components exist and the Desk is drawn with three of them. Stage C: the Boundary map in the Spec Lab and the Run Lab. WP71: every Workshop screen re-cut — the Bench Dashboard on `Strip`/`Readout`/`Lamp`, Campaigns on `Matrix`/`CaseTable`, Telemetry on `Tape`, Guards/Evaluators/Sinks on lamps and meters — and the visual-regression pass completed in CI. WP73: the engraved-metal and graph-paper textures and the instrument icons, swapped in behind the same components.

## 6. Determinism

The fold is pure over `(spec, registry, events, options)`; the property test and the golden snapshots hold it. Nothing in a component keeps state the trace does not carry; `tick` is the scrubber's.

## 7. Non-goals (recorded so they are decisions)

- Re-cutting any existing Workshop screen — WP71. The Bench Dashboard's tiles, the Eval Matrix's grid and the telemetry bar stay as they are this WP.
- Art: textures and icons — WP73; CSS finishes stand in.
- `Chain` and `Explain` — WP65 and WP66 draw them.
- The Boundary in the Kit.
- Diffing screenshots in CI — WP71.

## 8. Divergences from `41-…` §6.12 / §6.15, with reasons

| `41-…` says | This note does | Why |
|---|---|---|
| §6.15: `outside` includes `service-line`, `pdp`, `evidence-store` | Reserved kinds in the type; no entries produced until WP58, and WP70 (the OPA pack is a `guard-service` today) | Nothing registers them yet; the shape is fixed now so the map does not change when they arrive |
| §6.15: `human.principal` | `undefined` until WP65 | The field is WP65's |
| §6.15: sinks "outside" from the registry | From `options.sinks` — the Workshop's sink store, the harness's configured sinks | Sinks are not registry content (`35-…`); the fold takes what the host has |
| §6.12: "Sparklines on the Bench Dashboard move onto `Tape`" | Not in WP57; WP71 | The dashboard's re-cut is WP71's; `Tape` supports `compact` so it can |
| §6.12: the visual-regression pass "committed, diffed in CI" | Committed for the build platform; diffed locally; CI diffing in WP71 | The CI runner is Linux and cannot use screenshots taken here |
| §6.12: `--cab-graph` "with a 4-px rule" | The rule is a CSS gradient on the `Strip`/`Meter` grounds, not a token | A token is a colour; a rule is a pattern |

## 9. Risk register

| Risk | Handling |
|---|---|
| A new token fails contrast on a ground it lands on later | Every token is audited on every ground it is used on now; adding a ground means adding a row |
| The lint rule misses a chart drawn with `div` widths | The rule is the floor; review holds the rest, and WP71 moves the two existing `div` charts onto the components |
| The Boundary map reads the engine or a hand-kept diagram | The fold's arguments are the spec, the registry, events and options — nothing else; the golden snapshots and the egress property |
| The map is unreadable with many outside nodes | Kinds have fixed angles and nodes stack along them; the hidden edge list is the complete truth for a reader |
| `DeskView`'s rebuild moves a pixel the desk e2e reads | The e2e reads ids and text, not pixels; the desk golden trace renders unchanged (its test) |
| Screenshots differ between machines | Only the build platform's are committed; the project runs on demand; CI diffing waits for WP71 |

## 10. Implementation plan

Stage-gated as ever; every stage on the full gate; one dated note here per stage.

**Stage A — the mock-up and the tokens.** `mockups/pro-mode-mockup.html` refreshed (§4.2); the eight tokens in `tokens.css` with their `contrast.test.ts` rows; `04-…` §2's dated amendment; `41-…` §12's rows for §8.

**Stage B — the grammar, the components, the Desk on them.** `dataviz.ts` with tests; the eleven components (all but `Boundary`) with component tests; `DeskView` rebuilt on `Transcript`/`CaseFile`/`Queue` with `desk.spec.ts` and the desk golden trace unchanged; the lint rule and a test that it fires; a Storybook-free gallery route is *not* built — the mock-up is the gallery.

**Stage C — the map.** `boundaryMapFor` in `governance/reports` with the snapshots and the property; `Boundary.svelte`; the Spec Lab's section; the Run Lab's fourth region bound to the scrubber; the e2e that scrubs a stored Armour-brick run and sees the Model Armor edge light; the `visual` project and the first screenshots; `02-…` §7 unchanged and said so; `17-…` §3 and §4.2 dated notes; `42-…` §8's close-out.

## 11. Acceptance criteria (WP57 as a whole)

1. No brick colour redefined, `--cab-board` and `--cab-rug` untouched, every new token passing on every ground it is used on — all held by `contrast.test.ts`.
2. The lint rule over `components/control-room` and `routes/workshop`: no `svg`/`canvas` outside `Meter`, `Tape` and `Boundary`; a test proves it fires on a planted violation.
3. The desk golden trace renders through the rebuilt `DeskView` unchanged (its e2e reads the same ids and text).
4. The Boundary fold snapshot-tested over both golden traces and the desk golden; the property that every outside host matches `run.started.egress.hosts` when a mode was named.
5. An e2e scrubs a stored offline Armour-brick run and sees the Model Armor edge lit on the tick of its `guardrail.external`.
6. The first screenshots of the visual-regression set committed (the Spec Lab and the Run Lab with a Boundary, the Kit's shelf and bench, the Front Desk at play).
7. The mock-up carries the Boundary map and a Desk and uses the `--cab-*` names.

*(Stages append dated notes here as they land, per `10-…` §7.)*

> **Stage A landed 2026-09-05.** The eight tokens in `:root` (§4.1) with `contrast.test.ts` rows on every ground — the Kit's cream and paper, graph and metal, and the Workshop layer's darker cream and paper read from inside its block; `--cab-pass` and `--cab-inconclusive` came out darker than the `-text` hues they descend from because the Workshop's paper is `#d8d4cc` and a verdict has to read there (`#3a6e2c` measured 4.1:1 on it). `04-…` §2's amendment records Counterpart and Truth as the colour law's third and fourth additions. The mock-up is refreshed on the `--cab-*` names with four tabs — the Run Lab over a Desk run, the Boundary map for a Fraud-Desk-shaped build (with a lit edge and the reader's edge list), Campaigns on a `Matrix` and two `Meter`s, and the instrument set — and says "wireframe of record" in its footer as before. `41-…` §12 gained the two rows of §8.

> **Stage B landed 2026-09-05.** `lib/control-room/dataviz.ts` — one sequential ramp, and it is **teal**: writing the grammar surfaced the Eval Matrix's own note (WP23) that every other hue is a brick's under the colour law and `20-…` §2 designates teal "accent only", so §4.3's blue ramp and its green sibling were wrong and are gone; the diverging ramp runs orange to teal for the same reason, and a test holds both ramps clear of every brick hex. The six teal steps moved from `eval-cells.ts` byte-identical (its own tests still hold the luminance order and the label contrast) and the Eval Matrix keeps calling `rampStep` until WP71. Lanes in the colour law's order with a glyph each, status marks, nice-number ticks, formats, and the geometry `Meter` and `Tape` draw with. Ten components under `components/control-room/` (all of §4.4 but `Boundary`), each with a component test; `DeskView` rebuilt on `Transcript`/`CaseFile`/`Queue` with WP53's ids kept — `desk.spec.ts` and the Desk's a11y audit unchanged and green — and `CaseFile` carrying the truth flap WP54 will fill, behind `--cab-truth`. The lint rule in `eslint.config.js` (`no-restricted-syntax` over the Svelte AST's `svg` and `canvas` elements under `components/control-room` and `routes/workshop`, `Meter`/`Tape`/`Boundary` exempt) with `lint-rule.test.ts` planting a violation on disk and linting it through the repo's own config — on disk, because the TypeScript project service will not type a phantom file. Gate as `42-…` §8 item 8 records.

> **Stage C landed 2026-09-05 — WP57 closed.** `boundaryMapFor` in `governance/reports` (§4.5) with `litEdgesAt`; every export carries the doc comment `governance-exports.mjs` audits. Three things the fold does that §4.5 did not say: **`guardrailIds` sits on the boundary as a whole**, not per safety brick — the trace attributes no rule to a brick, and a guessed attribution would be a wrong picture; **a brick kind's egress is declared on its runtime per config** (WP41), so a build's hosts come from the provider factory, the services its safety bricks name (the generic Guard brick's `serviceId`; a pack's own safety brick reaches the one service that pack ships — the Armour brick over Model Armor) and the sinks the host hands in; and **a provider no factory registers is still drawn** — the Kit's Demo Brain as `provider · demo`, local, sending nothing — because a bot with no visible brain would be the wrong picture too. The safety dial is read after `migrateBrickConfig`, with a v1 `approvalMode` honoured where a kind has no migration. `Boundary.svelte` (kinds at fixed angles, siblings fanned; lit edges in the scope green, an undeclared host in the fail token; the sentence and the edge list). The Spec Lab's Boundary section and the Run Lab's fourth region, full-width beneath the world, bound to the scrubber. Proven three ways: the fold's own tests over a hand-built registry and a real session (the property included); the fold over all three golden traces, snapshot-committed in the workbench where the packs are reachable (`governance` may not import one), with the armour golden lighting `guard-service:geap/model-armor` on ticks 1–4 as `offline`; and `boundary.spec.ts`, where a Kit bot with the Guard brick over Model Armor unplugged — its project, region and template filled, since the service's schema wants them even offline — plays a turn and the Run Lab lights the Model Armor edge at tick 1 and not at tick 0. The `visual` Playwright project with five screenshots committed for win32 (`e2e/__screenshots__/win32/`): the shelf, the bench, the Front Desk at play, the Spec Lab with its Boundary, the Run Lab with its Boundary; `npm run e2e` runs the `default` project only. Seen in the screenshots: the world node inside the ring sits close to the dashed inner circle on a wide chassis — WP71's layout pass, noted. Gate as `42-…` §8 item 9 records.
