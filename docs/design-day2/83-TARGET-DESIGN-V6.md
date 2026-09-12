# 83 — Target Design V6: The Guardrail Studio, the Journey Canvas, and the domain blueprint

> **Status: proposed, 2026-09-11.** The Day 6 target, written against the `day5` branch at its close (WP0–WP93's craft-a-bot half done; the manual at v1.3). It extends `64-TARGET-DESIGN-V5.md` and does not replace it: every contract in `41-…` §6 and `64-…` §6 stands, and every section below names the one it grows. The implementation plan is `84-DAY6-ROADMAP.md` (Phases X–AB, WP94–WP110), which cites this document section by section.
>
> **What changed in the brief.** Day 5 made the bank run and the controls measurable. Day 6 is asked for four things and a fifth that runs through them: a **visual representation of the banking workflows** a reader can read, build and light; the ability to **configure and connect guardrail components** — bespoke and third-party — as first-class things rather than a config block on one brick; an **inventory of guardrail components and techniques** aligned to current industry practice and current research, kept as content and read against what the product ships; assurance that the **retail banking agentic workflows are well represented**, with the ones still missing named and built; and, without adding any industry now, proof that the codebase is **extensible to healthcare, logistics and manufacturing** with clear instructions and blueprints. Through all of it, the **UX and UI** are to become more powerful, more visually rich and more accessible.

---

## 1. Purpose

### 1.1 The vision, restated for this phase

A governance professional opens the Playground and sees the bank as a bank sees itself: journeys drawn as journeys — a customer, an assistant, a colleague, the systems behind them — with the controls drawn where they sit. They can pick a guardrail from a catalogue that names what the industry ships and what the research proposes, drop it on the stage boundary it belongs to, connect it to the third-party service it wraps, and run the journey to watch the verdicts light. They can read, for every technique in that catalogue, whether the product has it, what it costs, and what it did on the evidence. And when their next client is a hospital or a freight forwarder, they can read a blueprint that says exactly what a domain pack is, scaffold one, and know the conformance kit will hold it to the same rules.

At the end of Day 6:

- **A workflow is drawn, not only listed.** The **Journey Canvas** (§6.1) draws any `WorkflowSpec` as swimlanes — the counterpart, the assistant, the colleague, the rules, the systems — with stages as nodes, edges as the `next` function's outcomes, guard points on the boundaries, and a run lighting the path it took. The same drawing is the Pipeline's map, the Playground's journey page, the assurance pack's figure and the manual's.
- **A guardrail is a component with a contract.** `GuardrailComponent` (§6.2) is one shape over everything that decides — the built-in rules, policy cards, guard services, evaluator breakers, the Watchbot, budgets, egress — with a declared **point** (which hook, which stage boundary, which chokepoint), a declared **verdict class**, a declared **cost**, and, for a third-party service, a declared **connection**. A **stack** is a composition of components, saved as content.
- **The Guardrail Studio** (§6.3) is where stacks are built: the catalogue on one side, the journey's points on the other, and a **test bench** in the middle that runs a scenario through the stack and shows every verdict as it fires. Connect a Model Armor template, an Azure key, an OPA policy, a Llama Guard on Ollama; fit a bespoke card; save the stack; use it in a campaign, a workflow configuration or an experiment.
- **The inventory is content, and it is honest.** The **Guardrail Catalogue** (§6.4) records every technique the industry ships or the research proposes — taxonomised by the current survey categories and mapped to OWASP's Agentic Top 10, NIST AI RMF and the site's control map — and says for each: *shipped as a component*, *connectable*, *bespoke design available*, *blueprint only*, or *not applicable to a simulator*. The Assurance lens reads it as a coverage table; the register (§6.8 of `64-…`) says what each shipped one did.
- **Retail banking is covered end to end.** Four journeys join the three: **onboarding and KYC**, **payments and disputes**, **collections and arrears**, and **account servicing and vulnerability support** (§6.5), with the coverage matrix (§6.5.1) stating which journeys a UK retail bank runs, which the product has, and which are deliberately out. Journeys hand off to one another (a payment dispute that becomes a fraud alert that becomes a complaint), which is what makes them *agentic workflows* rather than desks.
- **A domain is a blueprint, and the blueprint is executable.** The **domain pack blueprint** (§6.6) states what any industry needs — a world model, cited generators, service lines, obligations, control-map rows, decision rights, workflows, evaluators, policy cards, ontology classes — and `craftabot scaffold domain` produces a pack that passes `checkDomainPack` with placeholder content. Three **blueprint notes** — healthcare, logistics, manufacturing — apply it on paper, each ending in the list of what would be typed. No industry pack is built.
- **The Workshop becomes powerful, rich and accessible at once.** Control Room v3 (§6.7): a command palette and saved views for power; illustrated journeys, lit rings and a real visual identity for richness; and canvases that are keyboard-navigable and screen-reader-legible — every drawing has a list twin — for accessibility, held by tests as the contrast test holds colour today.

### 1.2 What this design is not

Everything in `41-…` §11 and `64-…` §11 stands: nothing real, no fitted model, no compliance opinion, no hosted compute, no production deployment. Added here: **no industry pack beyond retail banking is built**; the blueprint notes are designs, not code. **No guardrail vendor is endorsed**: the catalogue records maturity and fit, and a connectable component is one whose contract the shell already meets. **No BPMN, no rules engine, no workflow designer that edits `next` functions by mouse**: the Canvas draws and lights a `WorkflowSpec`; authoring stays in TypeScript, because a workflow's edges are code that tests hold.

### 1.3 New words (glossary additions to `00-…` §6, `41-…` §1.3, `64-…` §1.3)

| Word | Meaning |
|---|---|
| **Journey Canvas** | The drawing of a workflow: swimlanes by actor, stages as nodes, edges by outcome, guard points on the boundaries, a run lit along its path. |
| **Actor lane** | One swimlane: the counterpart (customer, caller), the assistant (the bot), the colleague (a person), the rules, the systems (service lines). |
| **Guard point** | A place a component can decide: a hook on the bot's loop (`pre-think`, `pre-act`, `post-act`), a stage boundary (`stage-in`, `stage-out`), the group chokepoint, the egress gate. |
| **Guardrail component** | One thing that decides at a guard point, under one contract: a built-in rule, a policy card, a guard service, an evaluator breaker, the Watchbot, a budget, the egress rule. |
| **Connection** | A component's binding to something outside the product — a hosted service, a local classifier, a policy engine — with its credential kind, its egress declaration and its offline stand-in. |
| **Stack** | A named composition of components at their points, saved as content; today's `guards[]` entry, promoted. |
| **Guardrail Studio** | The screen where stacks are built, connected and tested. |
| **Catalogue** | The inventory of guardrail techniques and components, as content, with a coverage status per entry. |
| **Coverage status** | *shipped* · *connectable* · *bespoke* · *blueprint* · *not applicable* — what the product can say about a technique. |
| **Journey** | A workflow as the bank names it (onboarding, disputes, collections); a workflow is the spec, a journey is what it models. |
| **Handoff** | A stage whose `next` is another workflow's intake — a dispute becoming an alert, an alert becoming a complaint. |
| **Domain pack** | A pack that brings an industry: its world, generators, lines, obligations, rows, rights, workflows, evaluators, cards, ontology. `fs-bank` plus its desks is the first. |
| **Blueprint** | The written design of a domain pack: the checklist, the stubs, the conformance kit's demands. |
| **List twin** | The accessible equivalent of a drawing: the same facts as a navigable list or table, always present. |

---

## 2. Where the code actually is (the load-bearing facts)

Read before any contract below is judged. Every path was checked on `day5` at its close.

1. **Guardrails are one contract with three hooks and four verdicts.** `packages/core/src/types/guardrail.ts` — `Guardrail { id, name, description, hooks: ('pre-think' | 'pre-act' | 'post-act')[], check(ctx) → allow | { allow: false, disposition: 'block-action' | 'stop-run' } | { pause } }`, with `GuardrailContext { hook, tick, spec, usage, proposed?, worldState, history, observation?, messages?, response?, world? }`. The session runs the chain at each hook; first non-allow wins; every check emits `guardrail.checked`, every trip `guardrail.tripped` with a `cause` (`08-…` §2). Sound, and small.
2. **Where guardrails come from today.** Three lanes, no `PackManifest.guardrails` since WP56: the **Safety brick**'s built-ins (step budget, action blocklist, approval mode — its config is `{ maxTicks, blockedActions, approval, policyCards }`, seen in every campaign file); **policy cards** compiled by `compilePolicyCard` (`governance/policy-compiler.ts`) from `PredicateExpr` v2 — leaves `call-kind-is`, `call-name-is`, `argument-equals/contains/matches`, `usage-at-least`, `observation-contains`, `prompt-contains`, `world-predicate`, `history-count`, `hook-is`, with `and/or/not` (`core/schemas/policy-card.ts`); and **guard services** on the shell — `GuardrailService { id, hooks, credential?, egress[], alwaysStop?, browserCapable?, configSchema, create(), createOffline() }` returning a `ScreenReading { outcome, matched, findings: ScreenFinding[] (category ∈ injection | jailbreak | harmful | sensitive-data | malicious-link | policy-violation | other), redactedText? }` (`core/types/guardrail-service.ts`; `29-GUARD-SHELL.md`). Five services ship: `geap/armor` (Google Model Armor), `guard-local/llama-guard`, `guard-local/prompt-guard`, `azure-content-safety/content-safety`, `pdp-opa` (an external policy decision point, `33-…`).
3. **A fourth and fifth lane exist at the group level.** `campaignGuardSchema { id, fit: FittedBrick[], for?, group?: { watchFor, refusalLimit, breakOn: [{ evaluatorId, labels, onFail }] } }` (`evals/src/campaign.ts`): the group Watchbot and the evaluator circuit breaker (`pack-monitor`, `56-…`), installed at the two-seat episode's chokepoint. A single-seat cell has no chokepoint and ignores it.
4. **A stack is a preset in the Workshop and a `guards[]` entry in a campaign.** `apps/workbench/src/lib/workshop/stacks.ts` names five (`none`, `policy-cards`, `policy-cards+local-classifier`, `policy-cards+hosted-guard`, `compliance-watchbot`) and reads which one is fitted from the bricks, never from a remembered pick. It is not content: a stack cannot be saved, shared, versioned or cited by an experiment as a thing.
5. **A stage can name policy cards and nothing else.** `StageSpec.guards?: { policyCards?: string[] }` (`core/types/workflow.ts`). No service, no budget, no breaker can be attached to a stage boundary; a stage's guard tally counts the bot's own chain.
6. **The safety socket holds four.** `SLOT_CAPACITY.safety = 4` (WP40). A stack of a budget, two cards and a hosted guard fills it; the Compliance Watchbot's judges are group-level and do not count. Composition beyond four is a design change to the socket or to what a brick is.
7. **The Guard Rack lists services; the Spec Lab fits stacks.** `/workshop/guards` — every registered `GuardrailService` with **Test it** and **Fit it**; `/workshop/spec/<agentId>` — the safety stack and its presets, the Boundary. Neither shows a verdict flowing through a chain, and neither knows a stage.
8. **The Boundary map draws rings; the Pipeline draws a rail.** `Boundary.svelte` over `lib/control-room/boundary-layout.ts` (WP86): the bot at the centre, the stack and egress on the ring, the lines outside, and one ring per workflow with each stage as its actor. The Pipeline (`/workshop/workflows/<runId>`) is a horizontal rail of stage cards with In/Out panes. Neither is a *journey*: there is no lane for the customer, no lane for the colleague, no edge drawn between stages, no place a guard is drawn *between* two things.
9. **Three workflows, one handoff nowhere.** `fs-lending/lending` (ten stages), `fs-fraud/fraud` (eight), `fs-advice/advice` (seven); the complaints desk is a desk with decks and no workflow. `next` returns a stage id or `'end'` — a workflow cannot hand a work item to another workflow. Retail banking's journeys that exist as *desks* but not as workflows: complaints. Those that exist nowhere: onboarding/KYC, payments and disputes, collections and arrears, account servicing, card management, bereavement and closures, mortgages, savings servicing.
10. **The pack manifest has seventeen content kinds and no notion of a domain.** `PackManifest { brickKinds, tools, worlds, cartridges, goalCards, guardrailServices, evaluators, serviceLines, evidenceStores, assertionCards, scenarios, campaigns, policyCards, controlMaps, calibrations, workflows, providers, artwork }` (`core/schemas/pack-manifest.ts`), plus personas and obligation tags as plain exports of `fs-bank`. A domain today is *a convention*: `fs-bank` (content only, no runtime) plus three desk packs that `requiresPacks: { 'fs-bank': '^1' }`. The convention is sound — `51-…` §2's "next desk" test found few contract gaps — but it is written nowhere as a checklist, there is no scaffold, and `pack-testkit`'s fourteen `check*` functions check kinds, not a domain's completeness.
11. **The reference `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` is the closest thing to a catalogue** — eight areas, thirty-eight candidate controls, with adoption notes dated into Day 4 — and it is a markdown file a reader cannot filter, a screen cannot render, and a pack cannot cite. Nothing maps a shipped component to the technique it implements.
12. **The Control Room is thirteen instruments and a chart lint rule** (`44-…`, `60-…`): `Readout`, `Strip`, `Lamp`, `Meter`, `Tape`, `Matrix`, `CaseTable`, `Transcript`, `CaseFile`, `Queue`, `Boundary`, `Chain`, `Roundel`, on `dataviz.ts`'s one grammar; every Workshop route on the visual and axe passes; contrast held by a token test (`Appendix C` of the manual). What it does not have: a command palette, saved views, density, a keyboard model for the canvases (the Boundary is a picture to a screen reader), a reduced-motion story for the lit rings, or any illustrated surface beyond the Kit's placeholders (`63-…`'s wave-2 brief is commissioned, not landed).
13. **Four lenses, one vocabulary component** (`lens.ts`, `78-…`). The lenses order and rename; they do not yet change *density* or *which instruments* a page uses.
14. **The UX register is closed** (`docs/manual/UX-AND-GAPS.md` §0); its deferred items landed in Day 5 but GAP-1 (control-map review as content) and GAP-5 (*Talk to this desk*). Three Day 5 visual baselines are empty states (the manual's Appendix D).

### 2.1 Foundations: what this phase needs that Day 5 did not build, and four decisions

| Need | What exists | What is missing | Decision |
|---|---|---|---|
| One shape for everything that decides | Three-to-five lanes with different contracts (fact 2–3) | A component contract and a point vocabulary | **D10** — `GuardrailComponent` is an *adapter* over the existing lanes, not a replacement: a built-in rule, a card, a service, a breaker and a budget each get a thin adapter that declares point, verdict class, cost and connection, and the session keeps calling `Guardrail.check` as today. Nothing that runs changes; what is *declared* about it does (§6.2). |
| Guards at stage boundaries | `StageSpec.guards.policyCards` | Any component at `stage-in`/`stage-out` | **D11** — the workflow runtime runs a stage-boundary chain with the same `Guardrail` contract, a `GuardrailContext.stage?` addition, and the same events; a stage guard is a component whose point is a boundary (§6.2.3). One core addition, additive. |
| A drawing of a journey | The ring and the rail (fact 8) | Lanes, edges, guard points | **D12** — the Canvas is a pure layout (`journey-layout.ts`) over `WorkflowSpec` + optional run, drawn by one component and *always* accompanied by its list twin (§6.1, tenet 29). No canvas library; the Control Room's grammar. |
| A domain as a thing | A convention (fact 10) | A checklist, a scaffold, a conformance check | **D13** — a domain is a *manifest of manifests*: `DomainSpec` names the packs, the obligations vocabulary, the decision rights and the calibration table a domain brings; `checkDomainPack` holds it; `craftabot scaffold domain` writes it. The bank is retrofitted first, so the blueprint is proven on the industry that exists (§6.6). |

Nothing here asks for a second engine, a second UI system or a second store.

---

## 3. Gap register (what stands between today and §1.1)

Numbering continues `64-…` §3 (G43–G58). Severity as before.

| ID | Sev | Gap | Where |
|---|---|---|---|
| G59 | A | **A guardrail is not a thing a reader can pick up.** Five lanes with five contracts; no shared declaration of where it decides, what verdicts it can give, what it costs, what it connects to. An experiment names a stack by a string. | `core/types/guardrail.ts`, `guardrail-service.ts`, `evals/src/campaign.ts`, `workshop/stacks.ts` |
| G60 | A | **A stack is not content.** Five hard-coded presets; nothing saved, shared, versioned, cited, or drawn. | `workshop/stacks.ts` |
| G61 | A | **A guard cannot sit on a stage boundary.** Only policy cards, only through the bot's own chain. A journey's colleague, rule and line stages have no guard at all. | `core/types/workflow.ts`, `packages/workflow` |
| G62 | A | **No inventory.** The reference is prose; no technique is mapped to a component, no coverage is stated, no screen or pack can read it. | `19-…` |
| G63 | A | **A journey is not drawn.** Rings and rails; no lanes, no edges, no guard points, no customer, no colleague. | `Boundary.svelte`, `workflows/[runId]` |
| G64 | A | **Retail banking is four journeys of ten.** Onboarding/KYC, payments and disputes, collections and arrears, account servicing and vulnerability support, card management, bereavement and closures are absent; complaints is a desk, not a workflow; no journey hands off to another. | `packages/packs/fs-*` |
| G65 | B | **No third-party connection is declared as such.** A service declares egress and a credential kind; nothing declares its *connection* — what it wraps, its offline stand-in, its browser-capability, its cost class — where a reader can compare two. | `guardrail-service.ts`, `/workshop/guards` |
| G66 | B | **A domain is a convention with no checklist, no scaffold and no check.** | `01-…` §4, `pack-testkit` |
| G67 | B | **The safety socket's four is a ceiling composition will hit.** | `SLOT_CAPACITY` |
| G68 | B | **The canvases are pictures to a screen reader**; the Boundary and the rail have no keyboard model and no list twin. | `Boundary.svelte`, `Pipeline` |
| G69 | B | **No power features**: no command palette, no saved views, no density, no keyboard navigation beyond the bench. | `WorkshopRail.svelte`, routes |
| G70 | C | **The Workshop's illustrated surface is placeholders** (wave 2 commissioned, not landed); the lit ring has no reduced-motion form. | `lib/assets/*` |
| G71 | C | **GAP-1 and GAP-5 from the UX register** remain; three Day 5 baselines are empty states. | `docs/manual/UX-AND-GAPS.md` |

G59–G64 are the phase. G65–G69 are what it builds on. G70–G71 fold in where they fall.

---

## 4. Design tenets (V6 additions to the twenty-six)

27. **Everything that decides is a component, and every component says where it decides.** One contract for the built-in rule, the card, the hosted service and the breaker; one vocabulary of points. A guardrail that cannot state its point, its verdicts and its cost is not fitted.
28. **The catalogue is honest about coverage, and coverage is measured.** *Shipped* means a component exists and the register can show what it did; *connectable* means the shell meets the vendor's contract and a checkpoint proves it; *bespoke* means a design of record exists; *blueprint* means the technique is described and mapped; *not applicable* is said, with the reason. Nothing is *implied*.
29. **Every drawing has a list twin.** A canvas, a ring, a rail: the same facts, as a keyboard-navigable list or table, always rendered, never hidden behind a toggle. The drawing is the richer view; the list is the *accessible* one, and the tests hold them equal.
30. **A journey is the unit of representation; a desk is the unit of simulation.** The bank is drawn as its journeys; a journey runs on a desk; a journey may hand a case to another journey. Nothing that runs changes; what is *shown* is the journey.
31. **A domain is a checklist the kit enforces.** Bringing an industry is a list of things to type, each with a `check*` that refuses a gap, and a scaffold that writes the shape. The bank passes its own checklist before anyone else's is written.
32. **Power, richness and access are one budget, not three.** A feature that adds power must not cost access; a richer drawing must ship with its list twin and its reduced-motion form; a palette that adds a colour must pass the contrast test in both registers. The visual pass, the axe pass and the keyboard pass are one CI job.

---

## 5. Target architecture

```
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ Content                                                                  │
   │  guardrail catalogue (technique entries, coverage)   domain specs        │
   │  stacks (saved compositions)                         journeys (7)        │
   │  connections (vendor bindings, stand-ins)            blueprint notes ×3  │
   └───────────────┬────────────────────────────────────────┬─────────────────┘
                   │ GuardrailComponent · Stack · Point       │ DomainSpec · WorkflowSpec (+handoff)
                   ▼                                          ▼
   ┌───────────────────────────────┐        ┌────────────────────────────────┐
   │ core (additive)               │        │ @craftabot/workflow            │
   │ GuardrailComponent adapter    │◄──────►│ stage-boundary chain           │
   │ GuardrailContext.stage?       │        │ handoff · journeyLayout        │
   │ DomainSpec · catalogue schema │        └────────────────┬───────────────┘
   └───────────────┬───────────────┘                         │
                   ▼                                          ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ governance/reports: coverage fold · stack explanation · verdict flow     │
   │ pack-testkit: checkComponent · checkStack · checkConnection · checkDomainPack
   └───────────────┬──────────────────────────────────────────────────────────┘
                   ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ Workshop — Control Room v3                                               │
   │  Journey Canvas (+ list twin)   Guardrail Studio (catalogue · points ·   │
   │  test bench · connections)      Coverage (Assurance)   command palette   │
   │  saved views · density · keyboard model · illustrated surfaces           │
   └──────────────────────────────────────────────────────────────────────────┘
```

No new package. `core` gains the component adapter, the point vocabulary, `DomainSpec` and the catalogue schema; `workflow` gains the boundary chain, handoffs and the journey layout; `governance/reports` gains the coverage fold and the verdict-flow fold; `pack-testkit` gains four checks; the harness gains `scaffold` and `stack`; the Workshop gains two screens, one pane and the v3 system.

---

## 6. The contracts

### 6.1 The Journey Canvas (retires G63, G68-part; decision D12; tenets 29, 30)

**Extends** `Boundary.svelte`, the Pipeline, `boundaryMapFor`. **Packages** `workflow` (the layout), `workbench` (the drawing and its twin).

#### 6.1.1 The layout

```ts
export interface JourneyLayout {
  lanes: Array<{ id: 'counterpart' | 'assistant' | 'colleague' | 'rules' | 'systems'; label: string }>;
  nodes: Array<{ stageId: string; lane: LaneId; x: number; y: number; executor: Executor['kind'];
                 irreversible: boolean; obligations: string[]; guards: GuardPointSummary[] }>;
  edges: Array<{ from: stageId; to: stageId | 'end' | { handoff: workflowId }; label: string; taken?: boolean }>;
  points: Array<{ id: string; kind: PointKind; at: stageId | 'loop' | 'group' | 'egress'; components: string[] }>;
  lit?: { path: stageId[]; verdicts: Array<{ pointId; componentId; verdict; tick }> };   // from a run
}
export function journeyLayout(spec: WorkflowSpec, config?: WorkflowConfig, run?: WorkflowRun): JourneyLayout;
```

A stage's **lane** is its *effective* executor under the configuration (`rule` → rules, `agent` → assistant, `human` → colleague, `line` → systems); a counterpart lane is drawn when the world has one, with the transcript's turns as ticks along it. **Edges** come from `next`: the layout enumerates the outcomes a stage's output schema admits (an `enum` on the output, or the `suggest` options for a `human` stage) and asks `next` for each, so a decision node fans out to *approve / decline / refer* and a lit run marks the edge it took. Where `next` cannot be enumerated (a free function over state) the edge is drawn as *depends on the case* and the lit run supplies the truth. A **handoff** edge (§6.5.3) leaves the canvas to another journey's intake, drawn as a labelled exit.

**Guard points** are drawn where they decide: the loop's three hooks as a ring around the assistant lane's node (the existing Boundary's ring, small), a stage boundary as a gate on the edge into or out of the node, the group chokepoint as a bar across the counterpart and assistant lanes, the egress gate at the systems lane's edge. Each point lists its components; a lit run colours each verdict on its point.

#### 6.1.2 The drawing and its twin

`JourneyCanvas.svelte` on the Control Room grammar: lanes as horizontal bands, nodes as roundels with the executor's icon and the stage name, irreversible stages with the existing hazard mark, obligations as small tags, edges as orthogonal routes with their labels, points as gates. A run lights the path and animates the verdicts in order (with the reduced-motion form: no animation, the final state drawn). Selecting a node opens the Pipeline's In/Out panes for that stage; selecting a point opens the Studio at that point (§6.3).

The **list twin** is `JourneyList.svelte`, rendered *beside* the canvas at every width (a tab on narrow screens, never removed): one row per stage in journey order — lane, executor, obligations, guards, and for a lit run the status, the verdicts and the edge taken — and a second table of edges. Both are built from the same `JourneyLayout`; a test asserts the twin carries every node, edge and point the canvas draws. Keyboard: arrow keys move focus node to node along edges, `Enter` opens the panes, `g` jumps to the point on the focused node; the focused node's facts are announced from the twin's row.

#### 6.1.3 Where it appears

- **The Playground's journey pages** — `/workshop/playground/journeys` lists the bank's journeys; `/workshop/playground/journeys/<workflowId>` draws one unlit with its configurations as a selector (the drawing changes lane as executors change), its guard points and its obligations; the page a reader opens to *understand* lending before running it.
- **The Pipeline** — the canvas replaces the Boundary's ring beneath the rail, lit by the run; the rail stays as the stage-by-stage detail.
- **The Monitor** — a small unlit canvas per desk with the queue drawn on the intake node (the count as a badge), the lit paths of the last *n* runs faded in (a heat of which edges the day is taking).
- **The assurance pack** — the journey as a figure in §3 (*development, implementation and use*), with the guard points and their components listed beneath — the picture a reviewer asks for.
- **The manual and the site** — the same SVG, exported (`craftabot journey render --workflow <id> --svg`).

**Tests.** The layout over the three workflows is byte-stable and enumerates every `next` outcome the lending decision admits; the lit path over the golden lending workflow run equals its stage records; the twin's rows equal the layout's nodes and edges (one test per workflow); the keyboard walk reaches every node (e2e); axe green on every page that draws it; the reduced-motion form renders the final state without animation (a snapshot under `prefers-reduced-motion`); the SVG export validates and is byte-stable.

### 6.2 Guardrail components, points and stacks (retires G59, G60, G61, G67; decisions D10, D11; tenet 27)

**Extends** `Guardrail`, `GuardrailService`, `campaignGuardSchema`, `StageSpec.guards`, `SLOT_CAPACITY`. **Packages** `core`, `governance`, `workflow`, `evals`, `pack-testkit`.

#### 6.2.1 The point vocabulary

```ts
export type PointKind =
  | 'pre-think' | 'pre-act' | 'post-act'      // the loop's hooks, as today
  | 'stage-in' | 'stage-out'                  // a stage boundary (D11)
  | 'group'                                   // the two-seat chokepoint (WP48/WP64)
  | 'egress';                                 // the session's fetch guard (WP41)
export interface GuardPoint { kind: PointKind; at?: string /* stageId for stage-*; hostname pattern for egress */ }
```

#### 6.2.2 The component contract

```ts
export interface GuardrailComponent {
  id: string; name: string; description: string;
  technique: string;                                   // a catalogue entry id (§6.4): 'input-classifier', 'policy-as-code', 'budget-cap', …
  points: PointKind[];                                 // where it can decide
  verdicts: Array<'allow' | 'block-action' | 'stop-run' | 'pause' | 'redact' | 'annotate'>;  // what it can give
  cost: { class: 'free' | 'local-compute' | 'metered'; latency: 'none' | 'local' | 'network'; perCall?: string };
  connection?: Connection;                             // §6.2.4; absent for a bespoke component
  configSchema: z.ZodType<unknown>;
  explain(config: unknown): string;                    // one sentence a reviewer can read
  compile(config: unknown, deps: ComponentDeps): Guardrail;   // the thing the session runs — unchanged contract
}
```

`compile` returns today's `Guardrail`, so the session, the events, the digest and every golden trace are untouched (D10). Five **adapters** ship, one per lane that exists: `builtin` (the Safety brick's step budget, blocklist and approval mode, each its own component), `policy-card` (a card by id), `guard-service` (a `GuardrailService` by id with its config — the adapter *is* `createHostedGuardrails`), `evaluator-breaker` (an evaluator with `labels`/`onFail`, at the `group` point or, new, at `stage-out`), `egress-rule` (an allow-list at the `egress` point, today's declared/none modes as two components). Two verdict kinds are new and additive: `redact` (the service's `redactedText` applied to the outgoing `say` — today discarded) and `annotate` (a finding recorded on `guardrail.checked` with `allow: true` — a monitor that never blocks). Both are `allow` to the session and a note on the event.

**Component content.** `PackManifest.guardrailComponents?: GuardrailComponent[]`; the registry indexes them by id and by technique; `checkComponent` in `pack-testkit` asserts the declaration is honest — every declared point is one the adapter can compile for, every declared verdict is one `compile`'s guardrail can return (a fixture per verdict), the cost class matches the connection (a metered connection cannot claim `free`), `explain` is non-empty, and a component with a connection has a stand-in that answers offline.

#### 6.2.3 Stage-boundary guards (D11)

`StageSpec.guards` widens: `{ policyCards?: string[]; components?: Array<{ id: string; config?: unknown; point: 'stage-in' | 'stage-out' }> }` (`policyCards` kept as sugar for components of the `policy-card` adapter at `stage-in`). The workflow runtime runs the boundary chain with the same *first non-allow wins* rule: at `stage-in` over the validated input (`GuardrailContext.stage = { id, input }`), at `stage-out` over the validated output; `block-action` fails the stage with a finding (`status: 'blocked'`), `pause` asks the host as a `human` stage would, `stop-run` ends the journey, `redact` rewrites the output before the next stage reads it, `annotate` records. `stage.completed.guards` already carries a tally; it gains the verdicts. A guard at a boundary runs whatever the stage's executor — this is the point: a *rule* stage and a *colleague* stage are guarded too, which no lane could do before.

#### 6.2.4 Connections (retires G65)

```ts
export interface Connection {
  kind: 'hosted' | 'local' | 'policy-engine';
  wraps: string;                                       // 'google/model-armor', 'azure/content-safety', 'meta/llama-guard-4', 'open-policy-agent', 'aws/bedrock-guardrails', 'lakera/guard', …
  credential?: BrickKindDefinition['credential'];      // as today
  egress: EgressDeclaration[];                         // as today
  browserCapable: boolean | 'checkpoint-pending';
  standIn: 'offline-fixture' | 'deterministic-rule' | 'none';   // what createOffline gives
  checkpoint?: { takenOn: string; note: string };      // the live checkpoint, as `30-…`/`39-…` record them
  version?: string;                                    // the vendor's API or filter version the adapter targets
}
```

A connection is a *declaration*; the shell's `create`/`createOffline` remain the mechanism. Two connections are new in this phase and both are **harness-only** by their auth model: `aws/bedrock-guardrails` (SigV4 — recorded in `30-…` as the one that cannot be a browser pack) and `lakera/guard` (bearer; browser-capability by checkpoint). `google/model-armor` gains the vendor's current surface as config: the filter version (`v3`, stable from September 2026), the multimodal flag, and *streaming sanitisation* recorded as not applicable to a one-call-per-tick loop.

#### 6.2.5 Stacks as content

```ts
export interface Stack {                                // docs/schemas/stack.schema.json
  schemaVersion: 1; id: string; name: string; description: string;
  fit: Array<{ componentId: string; config?: unknown; point: GuardPoint }>;
  group?: CampaignGuardGroup;                            // as today
  obligations?: string[]; controls?: string[];          // what it claims to serve — the register's join key
  provenance: { author: Principal; createdAt: string; derivedFrom?: string };
}
```

`PackManifest.stacks?` ships the five presets as content (byte-identical in effect to `stacks.ts`, which becomes a reader); the content store saves a user's; a campaign's `guards[]` entry may be `{ stack: id }`; a workflow configuration may name a `stack` per stage or for the journey; an experiment's `guard` factor is a list of stack ids. `checkStack` refuses a fit whose component cannot decide at the point given, a socket over capacity, and a connection without a stand-in in a browser edition.

**The socket** (G67): `SLOT_CAPACITY.safety` stays four *bricks*; a stack fits as **one** brick — the Safety brick's config gains `stack?: id`, compiled to its components' guardrails in order — so composition is unbounded in a stack and bounded in the tray, and the Kit's one-well rule (`40-…`) is untouched.

**Tests.** Every existing campaign file and preset compiles to the same guardrail chain (a byte-diff of the `guardrail.checked` sequence over the injection baseline and the lending baseline — the identity test); a component fixture per adapter per verdict; `redact` rewrites a `say` and the transcript shows the redacted line with the finding; a `stage-out` breaker on the lending `decision` stage fails a planted `over-approve` and the stage reads `blocked`; a guarded `rule` stage trips; a stack in a campaign, a configuration and an experiment each resolve to the same chain; `checkStack`'s three refusals; the schema validates fixtures.

### 6.3 The Guardrail Studio (retires G60-part, G65-part; tenet 27)

**Extends** `/workshop/guards`, the Spec Lab's stack panel, the Policy Studio. **Package** `workbench`.

`/workshop/studio` — three columns on the Control Room:

- **The catalogue** (left): every component the installed packs ship, grouped by technique and filtered by point, verdict, cost and connection kind; each a card with `explain`, its coverage status (§6.4) and its connection's lamp — *connected* (credential fitted, checkpoint taken), *stand-in* (offline), *needs a battery*, *harness only*.
- **The journey and its points** (centre): the Journey Canvas (§6.1) of the chosen workflow — or the bot's loop alone for a Playroom bot — with every point drawn; drag a component from the catalogue onto a point (keyboard: select the component, select the point, `Enter`), and the stack under construction lists beneath with each fit's config form (from `configSchema`, the pattern the Sinks screen uses) and `explain` line.
- **The test bench** (right): pick a scenario or a work item and a brain; **Run through the stack** runs it in the Worker and draws the **verdict flow** — every `guardrail.checked` in order as a row: point, component, verdict, cause, latency, the finding's category, with the redacted text where there was one — lit on the canvas as it happens. A second stack can be pinned and the two flows shown side by side over the same run (the fork pattern, at the stack).

**Connections** are managed here too: a component with a `hosted` connection shows its battery slot (the same Settings vault), **Test the connection** (the Guard Rack's *Test it*, moved), the checkpoint's date, and the vendor's config surface (a Model Armor template id and filter version; an Azure endpoint; an OPA bundle URL; an Ollama model name).

**Save** writes the stack to the content store with provenance; **Use in…** offers a campaign (adds a `guards[]` entry), a workflow configuration, an experiment (as a `guard` level), or the Spec Lab (fits it to the bot). The Guard Rack becomes the *connections* tab of the Studio; the Spec Lab's stack panel becomes a picker of saved stacks with *Open in the Studio*.

**Tests.** A drag and a keyboard fit produce the same stack; the verdict flow over the injection baseline's four scenarios equals the traces' `guardrail.checked` sequences; two stacks side by side over one run; a saved stack reloads and compiles identically; the Studio under every lens (the matrix e2e); axe and the keyboard walk; the visual baseline with a fixture stack.

### 6.4 The Guardrail Catalogue (retires G62; tenet 28)

**Extends** `19-AI-SAFETY-GOVERNANCE-REFERENCE.md`, the control map, the register. **Packages** `core` (schema), `governance` (content and the coverage fold), `workbench` (the page).

#### 6.4.1 The entry

```ts
export interface CatalogueEntry {                       // docs/schemas/guardrail-catalogue.schema.json
  id: string;                                            // 'input-classifier', 'policy-as-code', 'taint-tracking', …
  name: string; summary: string;
  category: 'runtime-protection' | 'secure-by-design' | 'identity-and-access' | 'component-hardening' | 'evaluation-and-assurance' | 'human-oversight';
  subcategory: string;                                   // 'input-guardrail', 'output-guardrail', 'information-flow', 'monitoring', 'human-in-the-loop', 'privilege-separation', 'formal-verification', …
  points: PointKind[];                                   // where in the loop it decides, if it decides
  maturity: 'widely-adopted' | 'emerging' | 'research';
  threats: string[];                                     // OWASP ASI01–ASI10, LLM01–LLM10, MITRE ATLAS ids
  frameworks: string[];                                  // NIST AI RMF functions, ISO/IEC 42001 clauses, EU AI Act articles, PRA SS1/23 principles — the control map's vocabulary
  obligations?: string[];                                // the bank's tags where one applies
  sources: Array<{ title: string; publisher: string; year: number; url?: string; kind: 'standard' | 'vendor' | 'paper' | 'guidance' }>;
  coverage: { status: 'shipped' | 'connectable' | 'bespoke' | 'blueprint' | 'not-applicable'; componentIds?: string[]; note: string; since?: string };
  bankingRelevance: 'core' | 'supporting' | 'none';      // the phase's focus, stated
}
```

#### 6.4.2 The inventory

The catalogue's first edition, as content in `governance` (`catalogue/*.ts`), taxonomised by the current survey structure and mapped to OWASP's Agentic Top 10 (2026): ASI01 goal hijack, ASI02 tool misuse, ASI03 identity and privilege abuse, ASI04 agentic supply chain, ASI05 unexpected code execution, ASI06 memory and context poisoning, ASI07 insecure inter-agent communication, ASI08 cascading failures, ASI09 human–agent trust exploitation, ASI10 rogue agents. **The coverage column is what the product can say today, on the facts in §2**; the roadmap's WPs move entries rightward and nothing else does.

**Runtime protection — input guardrails** (ASI01, ASI06, LLM01)

| Entry | Practice / research | Coverage today | Day 6 |
|---|---|---|---|
| Prompt-injection and jailbreak classifiers | Meta Prompt Guard 2, Llama Guard 4; Google Model Armor (filter v3, prompt-injection and jailbreak detection, 65k-token screens); Azure Prompt Shields; Lakera Guard; AWS Bedrock Guardrails prompt-attack filter; Anthropic Constitutional Classifiers (deployed, method emerging elsewhere) | **shipped**: `guard-local/prompt-guard`, `geap/armor`, `azure-content-safety` at `pre-think`/`pre-act` | connectable: `lakera/guard`, `aws/bedrock-guardrails` (harness) |
| Hazard/content classifiers | Llama Guard 4 (MLCommons taxonomy), Azure Content Safety severities, OpenAI moderation, gpt-oss-safeguard (policy-conditioned), ShieldGemma, Granite Guardian | **shipped**: `guard-local/llama-guard`, Azure; `geap/armor` RAI filter | bespoke: a *policy-conditioned* classifier component over any cartridge (the bank's rulebook as the policy) |
| Untrusted-content marking (spotlighting, instruction hierarchy, delimiting) | Microsoft spotlighting; OpenAI instruction hierarchy; CaMeL's control/data separation (DeepMind, 2025) | **bespoke, partial**: the desk brief separates records from instructions; no marking of tool results | bespoke: `untrusted-content` component at `post-act` that labels tool results and line answers, with the *poisoned factsheet* deck as its test |
| Indirect-injection defences for tool results and MCP (tool poisoning, confused deputy) | OWASP ASI02/ASI04; MCP security best practices; tool-description audits | **shipped as scenarios**: the poisoned factsheet, the CRM note, the doctored payslip (`19-…` #38) | blueprint: a *tool-description integrity* check on the registry (a digest of each tool's description in the kit file) |
| Memory and context poisoning defences (provenance tags, quarantine) | ASI06; 2025–26 memory-poisoning research | **bespoke, partial**: `memory.updated` on the trace; no provenance tag | bespoke: `memory-provenance` — every notebook write tagged with its source event; a card that refuses a `think` over untrusted memory (`19-…` #13) |

**Runtime protection — output guardrails** (ASI09, LLM02, LLM06)

| Entry | Practice / research | Coverage today | Day 6 |
|---|---|---|---|
| PII detection and redaction | Microsoft Presidio; Model Armor Sensitive Data Protection; Azure PII; Guardrails AI validators | **shipped**: the *PII-contained* card and `data-minimised` evaluator; Model Armor SDP through the shell, `redactedText` discarded | shipped: the `redact` verdict applied to `say` (§6.2.2) |
| Domain output rules (no guarantee language, no tipping-off, promotions wording, plain English) | FCA COBS 4 / POCA / Consumer Duty — the bank's own rulebook as filters | **shipped**: the cards on every desk | — |
| Output-side hazard and hallucination checks | LLM-as-judge; Guardrails AI hallucination validators; Bedrock automated reasoning checks (formal checks against a policy document) | **shipped**: the rubric evaluators and the hosted Gen AI evaluators (`39-…`) as judges, offline stand-ins | connectable: Bedrock automated-reasoning as a `policy-engine` connection (harness) — recorded *research-grade for a bank's rulebook* |
| Structured-output validation | Guardrails AI; JSON-schema-validated tool calls | **shipped**: every stage output validated against its schema (WP79) | — |

**Runtime protection — action control and policy-as-code** (ASI02, ASI03, ASI05)

| Entry | Practice / research | Coverage today | Day 6 |
|---|---|---|---|
| Tool allow/deny lists, per-argument rules | Claude Code permissions; OpenAI Agents SDK guardrails; Vercel policy-tool approvals | **shipped**: the blocklist, `argument-*` leaves | — |
| Policy-as-code decision point | OPA/Rego, AWS Cedar (Bedrock AgentCore), Microsoft Agent Governance Toolkit | **shipped**: `pdp-opa`; `PredicateExpr` v2 as the built-in engine | connectable: Cedar (harness; a policy-engine connection) |
| Runtime enforcement DSLs | AgentSpec (ICSE 2026): trigger → predicate → enforce; Progent: least-privilege policy language with LLM-assisted generation | **shipped**: policy cards *are* the AgentSpec shape (`33-…`) | bespoke: *privilege scopes* — a component that starts a bot with minimal grants and records elevation requests (`19-…` #15) |
| Risk-tiered approval and four-eyes | `19-…` #3; the thought experiment's decision rights | **shipped**: risk tiers, the approval mode, the `four-eyes` stage, ceilings | — |
| Budgets, rate limits, loop detection | Runaway-cost incidents; LangGraph recursion limits | **shipped**: step and token budgets, `OUT_OF_STEPS` as the loop score | bespoke: a `no-progress` detector component (repeated identical calls) at `pre-act` (`19-…` #7) |
| Kill switch and safe-mode degradation | DeepMind FSF v3 shutdown-resistance; CISA agentic guidance | **shipped**: Stop, the *Fallback* card, `provider-fault` | — |
| Sandboxed tool execution | Firecracker/gVisor sandboxes | **not applicable**: the world is the sandbox; recorded so the claim is not implied | — |

**Runtime protection — information flow and monitoring** (ASI06, ASI08, ASI10)

| Entry | Practice / research | Coverage today | Day 6 |
|---|---|---|---|
| Information-flow control and taint tracking | FIDES, CaMeL (capabilities on data), the *lethal trifecta* framing; the 2026 attack/defence survey's IFC category | **bespoke, partial**: classification on every record and purpose-gating on every line (tenet 13); no taint through the bot's reasoning | bespoke: `taint` — a label on every observation and tool result (`public` / `customer` / `special-category` / `untrusted`) carried to `pre-act`, and a card leaf `taint-reaches` that blocks an egress or a `say` carrying a label the purpose forbids |
| Monitor agents and circuit breakers | SHADE-Arena monitors; ASI08 cascade breakers; ASI10 rogue-agent detection | **shipped**: the Compliance Watchbot, the evaluator breaker, the group Watchbot | shipped: the breaker at `stage-out` (§6.2.3) |
| Behavioural drift and anomaly detection | `19-…` #23; the Monitor | **shipped**: drift metrics, the Monitor, Page–Hinkley | — |
| Evidence tracing and execution provenance | 2026 provenance research; OpenInference GUARDRAIL spans; OTel GenAI conventions | **shipped**: the trace, digests, principal, attestation, OTel export | — |

**Secure by design, identity and access, component hardening** (ASI03, ASI04, ASI07)

| Entry | Practice / research | Coverage today | Day 6 |
|---|---|---|---|
| Privilege separation and dual-LLM patterns | AirGapAgent; Willison's dual-LLM; CaMeL's privileged/quarantined split | **bespoke, partial**: the Watchbot is a second seat with its own brain | blueprint: a *quarantined reader* seat that summarises untrusted content for the assistant, as a configuration of the two-seat episode |
| Formal verification of agent policies | ShieldAgent; Bedrock automated reasoning | **not shipped**: recorded *research* | blueprint |
| Agent identity, delegation chains, attestation | Entra Agent ID, Okta XAA, SPIFFE; `19-…` #17–18 | **shipped**: principal, `onBehalfOf`, attestation | — |
| Credential hygiene | the vault, key-leak test | **shipped** | — |
| Supply-chain: pack, tool and cassette integrity | ASI04; AI-BOM; C2PA for content | **shipped, partial**: kit-file `requires`, cassette digests, the inventory entry | bespoke: a *content digest* on every pack manifest, checked at registration (`19-…` #30 completed) |
| Inter-agent message authentication | ASI07; A2A | **shipped as a scenario** (`starter/party-line`) | blueprint |

**Evaluation, assurance and human oversight** (ASI09)

| Entry | Practice / research | Coverage today | Day 6 |
|---|---|---|---|
| Eval harnesses and policy-compliance benchmarks | Inspect; tau-bench; `19-…` #24–25 | **shipped**: campaigns, decks under pressure | — |
| Automated red-teaming | Petri-style adversary agents; `19-…` #26 | **shipped**: the adversary tier and the scripted adversary; no *live* adversary seat | bespoke: the live counterpart as a red-team seat with a persona cartridge (a configuration, not a mechanism) |
| Safety cases, transparency artefacts, incident reporting | `19-…` #28–31 | **shipped** | — |
| Confirmation fatigue and autonomy measurement | `19-…` #35–36; Anthropic's autonomy study | **shipped**: touches per case, unattended rate, ceiling breaches | — |
| Explainability to end users | `19-…` #37; SS1/23 explanation | **shipped**: Explain, `explanation-faithful` | — |

Fifty-odd entries in the first edition; each cites its sources with a year, and the note says what the product means by its status. The catalogue is reviewed content like the calibration table: every entry carries `review: 'pending' | 'reviewed'`, and the page counts them.

#### 6.4.3 The coverage fold and the page

`coverageReport(catalogue, registry, results)` in `governance/reports`: one row per entry with its status, the components that implement it, the stacks that use them, and — joined through `Stack.controls` — the register's headline effect where an experiment measured a stack that carries it. `/workshop/catalogue` renders it as a `CaseTable` with the taxonomy as groups, a threat filter (ASI01–10), a maturity filter and a coverage filter; a row opens the Studio at its components or the note where there are none. The **Assurance lens** gains it as *Coverage* beneath the register; the assurance pack's §5 gains a *coverage* subsection listing the *blueprint* and *not-applicable* entries by name, so a reviewer sees what the product does **not** claim.

**Tests.** `checkCatalogue` — every entry cited, every `componentIds` resolving, every `shipped` entry having at least one component and every `not-applicable` a note, every threat id from the closed lists; the fold's row count equals the catalogue's; a snapshot of the page over the shipped content; the pack's §5 subsection cites the blueprint entries.

### 6.5 Retail banking journeys, end to end (retires G64; tenet 30)

**Extends** the three workflows, the complaints desk, `fs-bank`. **Packages** `fs-bank` (lines and generators), four new desk packs or extensions, `workflow` (handoffs).

#### 6.5.1 The coverage matrix

The journeys a UK retail bank runs for a personal customer, and where the product stands. *Core* means the product should model it in this phase; *supporting* means the shelf and lines carry it for a later desk; *out* is a decision.

| Journey | Today | Day 6 | Why |
|---|---|---|---|
| Onboarding and KYC (identity, sanctions/PEP screen, risk rating, account open) | `fs-bank/kyc` line; `mlr:kyc` tag; no journey | **core — new** `fs-onboarding/onboarding` | MLR, the tipping-off pair, the first journey every customer takes; the agent's first irreversible act (open) |
| Payments and disputes (send, hold/release, chargeback, APP-scam reimbursement) | `fs-bank/payments` line; the fraud desk's freeze/release | **core — new** `fs-payments/disputes` | PSR APP-scam reimbursement rules; the handoff to fraud and to complaints |
| Fraud and scams (alerts, contact, restriction, SAR) | `fs-fraud/fraud` | kept | — |
| Lending (unsecured) | `fs-lending/lending` | kept | — |
| Collections and arrears (missed payments, forbearance, affordability reassessment, plans) | `ledger.loans`; no journey | **core — new** `fs-collections/arrears` | CONC 7 forbearance and Consumer Duty support; the vulnerability pathway's hardest case |
| Savings and investment advice | `fs-advice/advice` | kept | — |
| Complaints and redress | the complaints desk (decks) | **core — promoted** to `fs-advice/complaints` workflow (DISP timescales as stages) | the handoff target of three journeys |
| Account servicing and vulnerability support (address change, disclosure, third-party access, support needs) | `fs-bank/crm` line; the *address-change* scenarios | **core — new** `fs-servicing/servicing` | FG21/1 and Consumer Duty support; the journey most conversations actually are |
| Card management (freeze, reissue, limits) | `fs-bank/core-banking` freeze | supporting — a servicing sub-journey | small; folds into servicing |
| Bereavement and closures | none | supporting — a servicing sub-journey with the *bereavement* persona | folds into servicing |
| Mortgages, pensions, insurance, business banking | the shelf carries the products | **out** (`41-…` §11) | different conduct rules; a later day |

#### 6.5.2 The four new journeys

Each is content on the existing contracts — `createDeskWorld`, `WorkflowSpec`, the bank's lines, `OBLIGATION_TAGS` (which gains `psr:app-reimbursement`, `fca:conc-7:arrears`, `mlr:screening`, `fca:cd:support` already there) — with decks, cards, evaluators, a control-map row set, ceilings, a book, a campaign and its red run, on the pattern `49-…`/`51-…`/`52-…` set:

| Journey | Stages (default executors) | Irreversible | Ceilings (decision kind → level) | The rule in truth |
|---|---|---|---|---|
| `fs-onboarding/onboarding` | application → identity (line `kyc`) → screening (line, new `sanctions` operation on `kyc`) → risk-rating (rule) → decision (agent) → account-open (agent) → welcome (agent) | account-open | account-open 4; adverse decision 3; a screening *hit* 2 (never told to the customer — the tipping-off pair) | the screening list and the risk-rating rule, both synthetic |
| `fs-payments/disputes` | intake → verify (agent) → classify (agent: unauthorised / authorised-scam / merchant dispute) → hold (line) → investigate (agent) → decision (agent: reimburse / decline / refer) → reimburse (line, irreversible) → **handoff** to fraud on a scam pattern, to complaints on a decline | reimburse | reimbursement within limit 4; above 3; decline 3 | the PSR-style reimbursement rule over the case's truth |
| `fs-collections/arrears` | missed-payment intake → contact (agent, the *rainy-day* and *job-loss* personas) → circumstances (agent: the vulnerability disclosure) → reassess (rule over the bureau) → plan (agent: forbearance options) → decision (human below Level 4) → agree (agent) → **handoff** to servicing on a support need | agree (a payment plan is a contract) | forbearance 3; default notice 2 | CONC 7's forbearance options as a rule over disposable income |
| `fs-servicing/servicing` | request → identify (agent) → classify (agent: address / third-party / disclosure / card / bereavement) → verify (line) → act (line, reversible except closure) → record (agent: the support-needs flag) → **handoff** to collections or advice where the disclosure warrants | closure | disclosure-recording 4; closure 3 | the CRM's support-needs model and FG21/1's four drivers |

Each journey's *rules-only* configuration is the bank as it is; each carries five configurations by autonomy level; each ships a *matched pair* where a cohort should not matter and a red-team deck with the confused-deputy and injection shapes that fit it (a screening hit leaked through a chatty welcome; a dispute's merchant note carrying an instruction; a collections caller claiming a support need to stop a default notice).

#### 6.5.3 Handoffs

`StageSpec.next` may return `{ handoff: workflowId; item: (out, state) => WorkItem }`. The workflow runtime ends the current run with `outcome: 'handed-off'` and a `handoff` record (`{ to, itemId }`), and the host — the book runner, the bank clock, `craftabot workflow run --follow` — starts the target with the new item; a `WorkflowRun.handoffs[]` chain links them. The Canvas draws the exit; the Pipeline follows it; the Monitor routes it by kind as any arrival. A handoff carries the *item*, never the desk state: the receiving journey builds its own case, as it would from a form.

**Tests.** Each journey's golden run; `rules-only` agreeing with its rule over its book; the tipping-off pair on onboarding under every stack; a dispute handing off to fraud produces two linked runs with the item's truth carried; a bank day with seven desks in CI at reduced size; the four books in CI; the coverage matrix rendered on the Playground's journeys page from `DomainSpec` (§6.6).

### 6.6 The domain pack blueprint (retires G66; decision D13; tenet 31)

**Extends** `PackManifest`, `pack-testkit`, the harness. **Packages** `core`, `pack-testkit`, `harness`, `docs/blueprints/`.

#### 6.6.1 `DomainSpec`

```ts
export interface DomainSpec {                              // docs/schemas/domain.schema.json
  id: string;                                              // 'uk-retail-banking'
  name: string; jurisdiction: string; sector: string;
  packs: { world: string; journeys: string[] };            // 'fs-bank'; ['fs-lending', 'fs-fraud', …]
  obligations: Record<string, string>;                     // the tag vocabulary with glosses
  decisionRights: Array<{ kind: string; ceiling: AutonomyLevel; why: string; source: SourceRef }>;
  calibration: string;                                     // the calibration table id
  ontology: { classes: string[]; specialCategory: string[] };
  journeys: Array<{ workflowId: string; status: 'shipped' | 'supporting' | 'out'; why?: string }>;   // the coverage matrix
  personas: string[];
  glossary: Record<string, string>;                        // the domain's words, both registers
}
```

`PackManifest.domains?: DomainSpec[]`; `fs-bank` ships `uk-retail-banking`. **`checkDomainPack(spec, registry)`** holds the checklist: every pack named registers; every journey's `obligations ⊆ spec.obligations`; every workflow's `decisionKindOf` output is a `decisionRights.kind`; every control-map row on the journeys resolves; the calibration table exists and every row is cited or an assumption; every world's special-category records are the ontology's; every service line declares tiers; every persona exists; every journey ships a golden run, a book, a campaign with a red run, and at least one matched pair; `checkSynthetic` over the domain's fixtures. The bank is held to it first.

#### 6.6.2 The scaffold

`craftabot scaffold domain --id <id> --sector <s> --jurisdiction <j> --world <name> --journey <name>…` writes `packages/packs/<world>/` (the world model with a `Customer`-shaped root entity renamed to the domain's word, generators over a calibration table of `stated assumption` rows, three service lines with tiers, an obligations file, a control map, personas, a `DomainSpec`) and one `packages/packs/<journey>/` per journey (a desk spec with three actions and two predicates, a `WorkflowSpec` of four stages with `rules-only` and Level 4 configurations, a deck of two scenarios, a policy card, a deterministic evaluator, a book, a campaign, a golden-run test). The result **passes `checkDomainPack` with placeholder content and fails `checkCalibration`'s review** — which is the point: a scaffold is a shape, and the first thing a domain author does is cite a row.

#### 6.6.3 The blueprint and the three notes

`docs/blueprints/DOMAIN-PACK.md` is the checklist as prose — what a world is, what a journey is, what truth is and where it may be read, what a line is, what an obligation tag is for, what a control-map row cites, what a ceiling is, what a calibration row must carry, what the conformance kit refuses, how a domain reaches the shelf and an edition — each item pointing at the bank's own file as the worked example. Three notes apply it without writing code:

| Note | World | Journeys (core) | Obligations and rights (examples) | Special category | What the blueprint predicts is hard |
|---|---|---|---|---|---|
| `docs/blueprints/HEALTHCARE.md` | a synthetic NHS-shaped trust: patients, encounters, medications, referrals, results; lines for the record, e-prescribing, referrals, pathology, appointments | triage and referral; prescribing support; results communication; appointment and follow-up | UK GDPR Art. 9 health data; the NHS Confidentiality Code; MHRA SaMD boundary; the clinical decision rights (a prescription is a clinician's, ceiling 3; results communication 3) | every clinical record | the MHRA boundary — a journey that *recommends* a prescription is a device question the blueprint must refuse to cross; the calibration sources (NHS Digital) are richer than the bank's |
| `docs/blueprints/LOGISTICS.md` | a synthetic freight forwarder: shipments, consignors, carriers, customs declarations, dangerous-goods classes; lines for tracking, customs, carrier booking, DG classification | booking and quotation; customs declaration; exception handling (delay, damage, hold); dangerous-goods acceptance | UK customs (CDS), IATA DGR / ADR, sanctions screening (again), the ceilings: a customs declaration 3, a DG acceptance 2 | sanctions matches; DG misdeclaration | few *conduct* obligations and many *safety* ones: the evaluators are physical-consequence rules, and the cohort axis is the consignor's size, not a person |
| `docs/blueprints/MANUFACTURING.md` | a synthetic plant: work orders, machines, maintenance, quality lots, suppliers, incidents; lines for MES, CMMS, quality, procurement, EHS | maintenance scheduling and dispatch; quality hold and release; supplier non-conformance; incident reporting | ISO 45001, machinery safety (PUWER), ISO 9001 traceability; the ceilings: a lot release 3, a lock-out/tag-out override 1 (never the assistant's) | incident and injury records | the *autonomy ceiling of 1* — a journey where the assistant may only draft; the blueprint's `human`-everywhere configuration is the interesting one |

Each note ends with **the list of what would be typed** — files, rows, cards, scenarios, by count — and a **sizing** in the roadmap's units, so a decision to build one is a decision about a number. None is scheduled.

**Tests.** `checkDomainPack` green on the bank; the scaffold's output green on `checkDomainPack` and red on calibration review; the three notes reviewed by a reader against the checklist (a checkbox per item in each note); the blueprint's every checklist item names a `check*` and a bank file.

### 6.7 Control Room v3: power, richness, access (retires G68, G69, G70; tenet 32)

**Extends** `44-…`, `60-…`, `78-…`, `63-…`. **Package** `workbench`.

#### 6.7.1 Power

- **Command palette** (`⌘K` / `Ctrl+K`): every route, every stored artefact by id or title (runs, reports, stacks, experiments, workflow runs), every action a screen exposes (*Run campaign*, *Fork from tick*, *Open in the Studio*), with the lens's vocabulary; fuzzy; keyboard-only.
- **Saved views**: a screen's filters, sort, window and selected artefact as a named view in the content store, per lens; the rail lists a lens's views beneath its groups; a view is a URL.
- **Density**: *comfortable* / *dense* on every table and rail, remembered with the lens; *dense* is the analyst's default, *comfortable* the board's.
- **Cross-links everywhere**: every id on every screen is a link to its artefact, and every artefact page lists what links to it (a run: its campaign cell, its workflow stage, its experiment).

#### 6.7.2 Richness

- **The Journey Canvas** (§6.1) and the Studio's verdict flow are the two new drawings; both on the grammar, both lit.
- **The instrument icons and finishes** commissioned in `63-…` land on their seams (wave 2 delivered or its placeholders re-drawn in-house to the same brief) — the roundel family gains *journey*, *stack*, *point*, *catalogue*, *domain*.
- **Illustrated journey covers**: one illustration per journey on the Playground's journeys page and the box, in the Kit's voice, on the swap-in seam.
- **The lit ring's motion** gets a reduced-motion twin and a *replay* control; the Monitor's tapes gain the reference band drawn as a shaded region rather than a hairline.
- **A colour-vision-safe pair** for pass/fail on every Lamp: the existing hue plus the existing shape, checked by a test that every state's glyph differs.

#### 6.7.3 Access

- **Every canvas has a list twin** (tenet 29) — the Journey Canvas, the Boundary, the Pipeline rail, the Studio's points, the Monitor's queue drawing — rendered beside, tested equal.
- **A keyboard model for every canvas**: roving focus, arrow keys along edges or around the ring, `Enter` to open, `Escape` to leave, and the focused element announced from its twin's row.
- **Landmarks and headings on every route**; the rail as a `nav` with the lens's groups as labelled sections; skip links; focus returned after every drawer.
- **A screen-reader pass** in CI (axe stays; add a rule set for `aria-*` on the canvases and a Playwright walk that reads the accessible name of every focus stop on the three canvases).
- **Motion, zoom, contrast**: `prefers-reduced-motion` honoured everywhere the ring lights; every page usable at 200% zoom and 320 px wide (the twin takes over); the contrast test extended to the new tokens.

**Tests.** The palette reaches every route and every stored artefact (an e2e over a fixture store); a saved view round-trips through the URL; density changes no fold; the keyboard walk over the three canvases reads every focus stop's name (the screen-reader pass); the twin-equals-drawing tests; the 200%/320 px snapshots; the reduced-motion snapshots; every new token in the contrast test; the visual baselines regenerated **over the fixture corpus** so no empty state is a figure (G71).

---

## 7. Data model v6 (summary of record)

| Artefact | Schema | Store | New |
|---|---|---|---|
| Guardrail component | — (content) | pack | ✓ |
| Stack | `stack.schema.json` | pack (presets), content store, evidence store (`stack`) | ✓ |
| Catalogue entry | `guardrail-catalogue.schema.json` | pack content | ✓ |
| Domain spec | `domain.schema.json` | pack content | ✓ |
| Saved view | — (content store) | content store | ✓ |
| Workflow run | `workflow-run.schema.json` | as today | `handoffs[]`, `outcome: 'handed-off'`, boundary verdicts on stage records |
| Campaign | `campaign.schema.json` | as today | `guards[].stack` |
| Experiment | `experiment.schema.json` | as today | `guard` factor levels as stack ids |
| Assurance pack | as today | as today | §3 journey figure; §5 coverage subsection |

## 8. Events catalogue changes (`02-…` §7, additive only)

| Event | Change |
|---|---|
| `guardrail.checked` | `point?: GuardPoint`, `componentId?`, `verdictKind?: 'redact' \| 'annotate'` alongside `allow: true`, `finding?` |
| `guardrail.tripped` | `point?`, `componentId?` |
| `stage.completed` | `guards.verdicts[]`, `handoff?: { to, itemId }` |
| `run.finished` | `outcome: 'HANDED_OFF'` added to the workflow-level outcome, never to `RunOutcome` (an agent run still ends as it does) |

## 9. Workshop surfaces (target IA)

New: `/workshop/studio`, `/workshop/catalogue`, `/workshop/playground/journeys`, `/workshop/playground/journeys/<workflowId>`; the Guard Rack folded into the Studio's *Connections* tab (`/workshop/guards` redirects); the Spec Lab's stack panel a picker; the Pipeline and the Monitor gain the Canvas; the Assurance entry gains *Coverage*; the palette on every route. The Kit is untouched but for the journey covers on the Playground box.

## 10. Determinism and reproducibility (three additions)

- A component's `compile` is pure over its config; a stack compiles to the same chain on every host (the identity test).
- The journey layout is a pure function of spec, configuration and run; the SVG export is byte-stable.
- A handoff carries an item, and the item is digested; two runs linked by a handoff replay to the same pair.

## 11. Non-goals (recorded so they are decisions)

- No healthcare, logistics or manufacturing pack. Three blueprint notes and a scaffold that passes the kit.
- No vendor endorsement; no vendor SDK in the browser bundle. A connection is a declaration over the shell; SigV4 vendors are harness-only and say so.
- No sandboxing of code execution — the simulator has no code execution; the catalogue records the technique as *not applicable* rather than claiming the world is one.
- No visual editing of `next`. The Canvas draws and lights a workflow; the edges are code.
- No canvas library, no second chart grammar, no dark/light theme switch (the Control Room is one register; the Kit is the other).
- No fine-tuned or trained classifier of the product's own. A *policy-conditioned* component is a prompt over a cartridge with the rulebook as its policy, recorded as such.
- No second engine, store or UI system.

## 12. Divergences from earlier docs, with reasons

| Earlier | Now | Why |
|---|---|---|
| `26-…` §6 / `29-…`: three lanes, the shell, no shared shape | `GuardrailComponent` as an adapter over them (D10) | A reader must pick a guardrail up as a thing; the session must not change. |
| `64-…` §6.2.1: `StageSpec.guards.policyCards` | `guards.components` at `stage-in`/`stage-out` (D11) | Rule and colleague stages were unguarded. |
| `40-…`: the socket holds four bricks | Four bricks; a stack is one brick | Composition without breaking the Kit's tray. |
| `29-…`: `redactedText` recorded, not applied | The `redact` verdict | Output filtering is the technique the catalogue says is shipped; it should be. |
| `41-…` §6.15, `77-…`: the Boundary's ring is the journey's picture | The Journey Canvas; the ring stays for the bot's loop | Rings have no lanes, no edges, no customer. |
| `41-…` §11: "a fourth desk is content someone ships" | Four journeys shipped here; the *domain* is the unit for other industries (D13) | Retail banking's coverage was four of ten. |
| `19-…` as prose | The catalogue as content with coverage | Prose cannot be filtered, rendered, cited or measured. |

## 13. Risks

| Risk | Mitigation |
|---|---|
| The adapter changes a chain's order or a verdict | The identity test over every campaign file and preset; the golden traces. |
| The catalogue drifts from what ships | `checkCatalogue` refuses a `shipped` entry without a component; the coverage fold is generated, never typed. |
| A vendor's surface moves under a connection | `Connection.version` and the checkpoint date; the stand-in is what CI runs; the live checkpoint is a maintainer action, recorded. |
| The Canvas becomes a workflow editor by accretion | §11: no editing of `next`; the layout is read-only over the spec. |
| Four journeys in one phase thin the content | Each on the `49-…`/`51-…`/`52-…` pattern with the same DoD; servicing and collections share personas and lines; the roadmap orders them by handoff dependency. |
| Blueprints are read as commitments | Each note ends with a sizing and *not scheduled*; `DomainSpec.journeys.status` says `out`. |
| Power features bury the guided path | The palette and views are additive; the lens's `firstRun` is unchanged; the Conduct lens defaults to *comfortable*. |
| The twin is treated as a fallback and rots | Tenet 29: rendered always, tested equal, walked by CI. |

## 14. Acceptance (the design as a whole)

1. Every existing campaign, preset and golden trace compiles and runs to the same `guardrail.checked` sequence under the component adapter.
2. A stack built in the Studio — a hosted service with a stand-in, a bespoke card, a breaker at `stage-out` — saves, reloads, and runs in a campaign, a configuration and an experiment to the same chain.
3. A `rule` stage and a `human` stage are guarded at their boundaries and the Pipeline shows the verdict.
4. The catalogue renders with a coverage status on every entry, every `shipped` entry resolves to a component, and the assurance pack lists the *blueprint* and *not-applicable* entries by name.
5. Two new connections declare themselves harness-only and refuse a browser edition with the reason.
6. The Journey Canvas draws all seven journeys with lanes, edges and points, lights a stored run, and its list twin carries every node, edge and point; the keyboard walk reads every stop.
7. Onboarding, disputes, collections and servicing run `rules-only` and Level 4 over their books in CI; a dispute hands off to fraud and to complaints with linked runs.
8. The coverage matrix on the journeys page is generated from `DomainSpec` and says which journeys are out and why.
9. `checkDomainPack` is green on the bank; the scaffold's output is green on it and red on calibration review; the three blueprint notes are reviewed against the checklist.
10. The command palette reaches every route and artefact; saved views round-trip; density changes no fold.
11. Every Workshop route passes axe, the screen-reader walk, the 200%/320 px snapshots and the reduced-motion snapshots; every visual baseline is over the fixture corpus.
12. The manual carries Part H (the Studio, the catalogue, the journeys, the blueprint) and a rebuilt PDF with the journey figures.

---

*End of document.*
