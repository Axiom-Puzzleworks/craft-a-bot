# 23 — Multi-Agent Core: Design & Implementation Plan (WP29)

> The detailed design for WP29, superseding the sketch in `14-BRICK-REFERENCE-DESIGNS.md` §6 where the two disagree (each divergence is recorded in §8 with its reason). Written 2026-08-19, anchored against the codebase as it stands at the close of WP26/WP27/WP28 — every contract named here is quoted from a real file, not from memory of one.
> Prerequisite reading: `02-AGENT-MODEL.md` (the loop and event catalogue), `14-…` §6 (the original sketch), `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` §7 (multi-agent risks), `18-DAY2-ROADMAP.md` §3 (WP29's row and WP31's, which bounds it).

---

## 1. Purpose, and who this is for

Craft A Bot has two users, and multi-agent capability serves each differently. The design must satisfy both **without transforming the single-agent product either of them already relies on** — that is the explicit constraint this document is written under, and §3's first principle exists because of it.

**The student learning about agents.** Today they build one robot and watch it act. The multi-agent lesson is the next rung of the ladder the leaflet has been climbing since chapter 1: *two* robots, each with its own bricks, its own brain and its own trace, sharing one room and one goal. The teaching moments that only exist with two agents: co-operation is harder than it looks (two bots duplicate work, block each other's squares, both go for the same block); a shared goal does not mean shared understanding (each bot only knows what its own senses and memory hold); and — the governance seed — *who did what* is a question the trace must answer per-robot. **The student never meets WP29 directly.** Their experience is WP31's Robot Friends duo bench, built on these rails. WP29's obligation to the student is to lay rails that WP31 can build the toy on without re-architecture, and §7.1 sketches that target experience so the core can be validated against it now.

**The AI governance & safety practitioner.** Multi-agent systems are where their hardest open problems live, and `19-…` §7 already catalogues them: emergent coordination failures, responsibility attribution across agents, the orchestrator as policy chokepoint, inter-agent trust (the ASI07 spoofed-message class, staged for WP31's Radio brick). WP29's obligation to the practitioner is concrete and immediate:

1. **Attribution by construction** — every event in a merged multi-agent trace names its agent, so "which robot leaked the code" is a filter, not an investigation.
2. **Deterministic replay of multi-agent episodes** — a co-op run replays byte-stably, which is what makes a multi-agent incident *reproducible*, the property single-agent traces have had since WP13 and most real-world multi-agent stacks still lack.
3. **The orchestrator chokepoint, real** — a policy seam at the scheduler, above any single agent's Safety Brick, where group-level rules (shared budgets, group stop) actually execute. This is `19-…` §7.2's pattern in running code.
4. **Per-agent governance composing with group governance** — each agent keeps its own Safety Brick, guardrail chain and approval flow, unchanged; the group layer sits above, never instead.

## 2. Where the code actually is (the load-bearing facts)

Everything below was verified against `main` at the time of writing. These are the facts the design leans on and the migrations it must respect.

**Already built for this moment (E10, WP13):**

- Every event envelope carries `agentId` (`packages/core/src/schemas/events.ts:49`), stamped by the session on every emission (`agent-session.ts:212` — "One agent repeating one id today is what makes two agents cost nothing later"). Merging two agents' traces into one ordered group trace is a sort, not a migration — the envelope was designed so.
- The envelope reserves `parentRunId` (`events.ts:55`) — "Nothing produces it yet; it exists so that when `SessionGroup` arrives the shape does not have to change again." WP29 is that arrival.
- The engine is single-threaded and fully deterministic: injectable `now`/`newId`/`random` (`SessionOptions`), no unseeded randomness (hard rule 5), and `step()` is an awaited promise — so a scheduler that awaits each agent's step sequentially produces a deterministic global event order *for free*.

**The one real coupling to open:**

- `createSession` builds its own `WorldInstance` internally (`agent-session.ts:102`, `createWorld(goalCard)` at `:226`). There is no way to hand two sessions one shared world. `CreateSessionDeps` (`types/agent-session.ts:96`) needs one new optional field. This is the same shape of seam WP15 added for `strategies` — additive, defaulted to current behaviour.

**The surfaces where "one bot" is structural, and what reads them:**

- `WorldInstance` methods take no agent identity: `observe(channels)`, `perform(action)`, `test(predicate)`, `describeProgress(predicate, channels)` (`types/world.ts:62-96`). Both world packs implement exactly this.
- `GridWorldState.bot` is singular (`types/grid-world.ts:59`). Read by: `WorldView.svelte` (draws `world.bot`, announces its position in the aria-label), `run-projection.ts` (folds `world.changed` payloads verbatim), and both packs' state modules (`PlayroomState.bot`, `WorkshopState.bot`).
- `GridWorldItemLocation` has `{kind: 'carried'}` with no carrier identity (`grid-world.ts:43-47`) — "carried" implicitly means "by the bot".
- Playroom narration is second person ("You moved east") and its predicates read shared state with no agent parameter (`world/predicates.ts`) — note that second-person narration is *correct* per-agent (each agent's trace speaks to that agent), and shared-state predicates are *already* multi-agent-compatible ("teddy-has-snack" does not care which robot delivered it).

**Storage and traces:**

- `Storage` (`apps/workbench/src/lib/state/storage.ts`): `putRun(RunRecord)`, `appendEvents(runId, events)`, `getEvents(runId)` returning `StoredEvent {runId, seq, event}` ordered by `seq`. The store is keyed by runId and knows nothing else — a merged group stream stored under its own id reuses this layer untouched.
- `projectThrough` (`run-projection.ts`) is the single shared fold for the Kit's live view, the Run Lab, and Compare. It reads `world.changed` payloads as `GridWorldState` and keeps the latest. It is agent-agnostic already: fold any event list, get the last-seen world.
- The golden trace is byte-stability-gated; `buildTraceFile`/`verifyTraceDigest` hash a single run's events.

**The boundary with WP31 (what WP29 is *not*):**

- WP29's DoD (`18-…` §3): "Two scripted bots complete a co-op card deterministically; group trace replays." Engine, proof, replay.
- WP31's DoD: "Duo runs in Kit with two-bot bench; ASI07 scenario teachable." The Radio brick, the child-facing duo experience, the second chassis on screen, inter-agent messaging.

This split is the single biggest de-risking fact in this document. WP29 can ship with **zero changes to the Kit's screens** and a deliberately minimal Workshop surface, because the audience-facing work has its own WP with its own row.

## 3. Design principles

1. **Additive, never transformative.** Every contract change is an optional field or an optional method. A codebase artefact that does not opt in behaves byte-identically — enforced by keeping the golden trace and all 112 e2e tests green after every stage, not just at the end.
2. **Sessions stay ignorant.** `AgentSession` does not know groups exist. It gains the ability to *receive* a world instead of creating one, and to stamp a `parentRunId` it was given. Nothing else. The tick loop — sense→compose→guard→think→decide→act→remember→judge — is untouched.
3. **The world owns multi-agent semantics; the group owns time.** Which square each robot stands on, who is carrying what, what each can see — world-pack business, behind a facade. Who acts next, when the episode ends, what the shared budget is — `SessionGroup` business. Neither reaches into the other.
4. **One trace per agent, plus the merge — never instead of.** Each agent's run remains a complete, self-consistent, independently replayable trace (openable in today's Run Lab with no changes). The group trace is an *additional* artefact: the ordered merge, stored under its own id.
5. **Determinism survives by construction.** Turn-based round-robin, sequential awaits, injectable clocks. No concurrency is introduced anywhere.

## 4. The design

### 4.1 Agent identity: `AgentHandle`

```ts
/** How a world tells agents apart. Stable for the life of a group episode. */
export interface AgentHandle {
  /** The spec's own id — the same value stamped on the agent's events (E10). */
  agentId: string;
  /** The bot's display name, for narration that names actors ("Robo moved east"). */
  name: string;
}
```

Deliberately tiny. It is an identity, not a capability object — the world learns *who*, never *what bricks they have* (capability flows through the existing session machinery).

### 4.2 The world contract: an agent-bound facade, not a signature change

`14-…` §6 sketched "`observe/perform/describeProgress` take an `AgentHandle`" — a breaking change to every method of every `WorldInstance` in every pack, plus the testkit and both solvability harnesses. This design achieves the same end by taking the handle **once, at binding time**:

```ts
export interface WorldInstance {
  // …everything exactly as today, unchanged…

  /**
   * Multi-agent opt-in (WP29). A world that can host several agents returns
   * a facade bound to one of them: the facade is itself a WorldInstance whose
   * observe/perform/test/describeProgress act *as that agent* over the shared
   * state. Calling it a second time with the same handle returns a facade for
   * the same seat. A world that omits this hosts exactly one robot, which is
   * every world written before WP29 — SessionGroup refuses such worlds with a
   * plain error rather than pretending.
   */
  forAgent?(handle: AgentHandle): WorldInstance;
}
```

Why this is the safe shape:

- **Zero changes to existing packs until they opt in.** The Workshop pack remains a valid, untouched single-agent world. The testkit's `checkWorld` passes unchanged.
- **Zero changes to the session.** The session keeps calling `world.observe(channels)` exactly as today — it simply holds an agent-bound facade instead of the root instance, and cannot tell the difference. This is what keeps principle 2 true.
- **The facade is honest about state.** All facades share one underlying state object. `snapshot()` on agent A's facade returns the objective world with `bot` set to A's own position and (new, §4.3) `agents` listing everyone — so A's trace renders today, in today's components, from A's seat.

The root instance (created by `WorldDefinition.create`) remains the single owner of state, `reset()`, and `receiveInput()`. In a group, only `SessionGroup` holds the root; sessions hold facades.

### 4.3 State shapes: two optional fields

```ts
export type GridWorldAgent = {
  id: string;        // AgentHandle.agentId
  name: string;
  position: GridPosition;
};

export type GridWorldState = {
  // …everything exactly as today, including bot…
  /**
   * Every agent in the room, self included, when the world hosts more than
   * one (WP29). Absent for single-agent worlds — which keeps every snapshot
   * ever written, and the golden trace, byte-identical.
   */
  agents?: GridWorldAgent[];
};

export type GridWorldItemLocation =
  | { kind: 'floor'; position: GridPosition }
  | { kind: 'carried'; agentId?: string }   // absent = "the (only) bot", as ever
  | { kind: 'held-by'; characterId: string }
  | { kind: 'in-container'; containerId: string };
```

Rendering rule (one small additive change to `WorldView.svelte`, needed by stage F): **when `agents` is present, draw the robots from `agents`; `bot` remains the "you" whose expression and carried item are foregrounded.** Because every co-op snapshot carries the full `agents` list, folding an interleaved merged trace through `projectThrough` renders a *stable* room — the alternating per-agent `bot` field only changes which robot wears the expressive face, never where anyone stands.

### 4.4 `SessionGroup`

New module in `@craftabot/core` (`session/session-group.ts`). The host-level composition — exactly the altitude `14-…` §6 placed it at.

```ts
export interface GroupMember {
  spec: AnyAgentSpec;
  provider: LLMProvider;
  /** Host guardrails for this agent, as CreateSessionDeps.guardrails today. */
  guardrails?: Guardrail[];
}

export interface CreateSessionGroupDeps {
  members: GroupMember[];          // V-duo: exactly 2; the contract allows N
  registry: PackRegistry;
  goalCardId: string;              // one shared card; its world must offer forAgent
  options?: SessionOptions & {
    /** Combined token ceiling across all members; per-agent budgets still apply. */
    groupMaxTokens?: number;
    /** Ceiling on scheduler rounds (a round = one tick offered to each live agent). */
    maxRounds?: number;
  };
}

export interface SessionGroup {
  readonly groupRunId: string;
  readonly sessions: readonly AgentSession[];   // per-agent status/events, as today
  readonly events: EventBus;                    // the merged stream + group.* events
  readonly status: 'idle' | 'running' | 'paused' | 'awaiting-approval' | 'finished';
  start(mode: RunMode): void;
  /** One round: each unfinished agent takes one tick, in fixed member order. */
  stepRound(): Promise<{ round: number; outcome?: RunOutcome }>;
  pause(): void;
  resolveApproval(agentId: string, approved: boolean): void;
  stop(reason?: string): void;
  deliverInput(text: string): void;             // reaches the shared world once
}
```

What the group does, precisely:

- **Construction.** Creates the shared world from the card (root instance), then one `AgentSession` per member via the existing `createSession`, passing: `world: root.forAgent(handle)` (the new seam, §4.5), `options.parentRunId = groupRunId`, and shared injected `now`/`newId` so a test group is deterministic end to end. Refuses (plain error) a world without `forAgent`, mixed-world cards, or duplicate agent ids.
- **Scheduling.** Strict round-robin in member order. `stepRound()` awaits each live session's `step()` sequentially. An agent whose run has finished sits out; the round order of the rest is unchanged. Turn-based, single-threaded, deterministic — hard rule 5 holds with no new machinery.
- **The merged stream.** The group subscribes to every member session's bus and re-emits each event on its own bus **in arrival order**, which under sequential awaits *is* the deterministic global order. Events pass through byte-untouched (they already carry `runId`, `agentId`, `parentRunId`). The group's own lifecycle events (§4.6) are interleaved at the moments they occur.
- **Group policy chokepoint.** Before offering an agent its tick, the group evaluates its own guardrail list (plain `Guardrail[]`, the existing interface) against a group context: combined usage, round number, the proposed acting agent. First non-allow verdict stops the group (`group.finished` with the reason) — the `19-…` §7.2 orchestrator chokepoint as running code. V-duo ships one built-in rule: the `groupMaxTokens` budget. The seam accepts arbitrary rules from day one because it is just the guardrail interface at a second altitude.
- **Ending.** The group finishes when: the shared success predicate holds (all live agents' runs conclude `SUCCESS` — the world is shared, so one `test()` answers for everyone); or every member has individually finished; or `maxRounds`/`groupMaxTokens` trips; or `stop()` is called. Per-agent outcomes remain exactly what each session recorded; the group outcome is derived and recorded on `group.finished`.
- **Approvals.** An agent's `awaiting-approval` pauses its `step()` promise, which pauses the round, which pauses the group. This is deliberate, correct for determinism, and itself a teaching moment the practitioner will recognise: **one agent's human checkpoint halts the whole system** — approval latency is a group-level cost, visible in the trace.

### 4.5 The session's two additive changes

```ts
export interface CreateSessionDeps {
  // …unchanged…
  /**
   * A world handed in by the host (WP29). When present the session uses it
   * and never calls WorldDefinition.create itself; when absent, behaviour is
   * byte-identical to today. SessionGroup passes an agent-bound facade here.
   */
  world?: WorldInstance;
}

export interface SessionOptions {
  // …unchanged…
  /** Stamped into every event's envelope when set (E10). SessionGroup sets it to the groupRunId. */
  parentRunId?: string;
}
```

That is the entire footprint on `agent-session.ts`: `const world = deps.world ?? createWorld(goalCard)` and one spread in `emit`. Proven byte-identical by re-running the golden-trace test with the session's own world passed back in through the new seam (stage A's whole point).

### 4.6 New events (catalogue additions, hard rule 3)

Two new event types, added to `02-AGENT-MODEL.md` §7 in the same PR that emits them:

| Event | Payload | When |
|---|---|---|
| `group.started` | `{ groupRunId, memberRunIds: string[], memberAgentIds: string[], goalCardId, scheduler: 'round-robin', budgets: { groupMaxTokens?, maxRounds? } }` | Once, first on the merged stream |
| `group.finished` | `{ outcome: RunOutcome, reason?: string, rounds: number, usage: { inputTokens, outputTokens } }` | Once, last on the merged stream |

Both are emitted with `runId = groupRunId` and no `agentId` (they happened to the group, not to an agent — the envelope's `agentId` is already optional). Per-agent events are never modified.

### 4.7 Traces and persistence

- **Per-agent:** each session's events are stored exactly as today (`putRun` + `appendEvents(runId, …)`), each a complete standalone trace, each opening in today's Run Lab untouched. `RunRecord` gains one optional field: `groupRunId?: string` — additive, every existing record still parses, no `schemaVersion` bump (the same widening policy `specSnapshot` already followed).
- **The group trace:** the merged stream is stored under `groupRunId` via the same `appendEvents(groupRunId, mergedEvents)` — the storage layer needs *no changes*, because `StoredEvent.seq` (assigned in append order) is the merge order, and each stored event still carries its true `runId`/`agentId` inside. A lightweight `GroupRunRecord` (id, member run ids, card, outcome, rounds, usage, timestamps) is stored alongside so the Run Browser can list the episode; exact shape decided at stage F against the store's real constraints.
- **Replay:** replaying the group = `getEvents(groupRunId)` folded through the existing `projectThrough` — no new reducer (principle: one fold, everywhere). Byte-stability of the merged trace is stage E's gated proof.
- **Export/digest:** `buildTraceFile` stays single-run in WP29. A group export format (bundling N member traces + the merge + a digest over the whole) is real work with its own questions and is **deferred to the Workshop-maturity era (WP34's audit centre)** — recorded here rather than half-built.
>
> **Amended 2026-08-21 (WP34 closed):** did not ship. WP34's Audit Centre (`17-…` §4.10) reads `storage.listRuns()` alone — the solo `RunRecord` list — so it never lists a `GroupRunRecord` and a group's own member run, picked individually, exports only its own trace. The bundle format this section deferred to WP34 remains real, undecided work, now with no WP named for it — a fair target for whoever next touches the Audit Centre, not a promise this phase quietly dropped.

> **Amended 2026-09-02 (WP48).** The group export this section deferred exists: `craftabot-bundle` v1 (`36-BUNDLE-AND-GROUPS.md` §4.1) — every member's trace file, the merged stream with its own digest, the evaluations, and a digest over the whole; the Audit Centre lists episodes and downloads it, the Run Lab's badge verifies it, `craftabot bundle --group` writes it. The Hearing row in §9 is closed the same day: `heard` is append-only with a cursor per seat.

### 4.8 The Playroom's co-op opt-in (the only pack that changes)

The Playroom implements `forAgent` and gains **one co-op layout and one co-op goal card**; every existing layout, card, predicate, narration string and test is untouched.

- **Internal state:** the co-op layout's `PlayroomState` carries `agents: PlayroomAgent[]` (id, name, position); `state.bot` remains, maintained as "the acting agent" while a facade performs — meaning every existing action handler (`move` reads `state.bot.position`) works *unmodified* for the acting agent. The facade's `perform` sets `state.bot` to its agent's seat, delegates to today's handler, then writes the seat back to `agents`. This is the pivotal implementation trick: **the action handlers never learn multi-agent exists.** Collision rule: two agents may not occupy one square (a refusal in character, like furniture).
- **Carried items:** the facade stamps `agentId` onto `{kind:'carried'}` on pick-up; `carriedItem` and narration resolve against the acting agent. Absent `agentId` keeps meaning "the only bot" everywhere else.
- **Observation:** `observePlayroom` for a co-op state describes fellow agents like characters ("Robo is two squares east") under the same sight rules — each agent knows only what its senses show, which is the "shared goal ≠ shared understanding" lesson made mechanical.
- **The co-op card:** `starter/tidy-together` — the existing tidy-the-blocks goal on a layout where the blocks are far enough apart that par-for-two is meaningfully below par-for-one (division of labour is *visible in the numbers*). Success predicate: the existing `blocks-in-chest` shape, unchanged — shared-state predicates were multi-agent-ready all along (§2).
- **Solvability:** two scripted-optimal plans (one per seat) proven through the real `SessionGroup` at par, the same L3 discipline every card has met since WP11.

### 4.9 Governance model (the practitioner's view, precisely)

| Layer | Mechanism | Status in WP29 |
|---|---|---|
| Per-agent policy | Safety Brick, guardrail chain, approvals — per session, unchanged | Ships working in groups by construction |
| Attribution | `agentId` on every event; merged trace filterable per agent | Ships |
| Orchestrator chokepoint | Group guardrail list evaluated per round at the scheduler | Ships (seam + one built-in budget rule) |
| Shared budgets | `groupMaxTokens` across members; per-agent budgets still apply | Ships |
| Reproducibility | Deterministic merged trace, byte-stable replay | Ships (gated) |
| Cross-agent monitoring (Watchbot watching the *other* robot) | Needs event forwarding between sessions | Seam noted; **WP31+** |
| Inter-agent comms + spoofed-message scenario (ASI07) | Radio brick, world-mediated messages | **WP31**, by roadmap |
| Group trace export with digest | Group bundle format | **WP34** audit centre |

> **Amended 2026-08-21:** the last row did not resolve when WP34 closed — see this section's own dated amendment above and `07-…` §5's matching one. The other WP29→later-WP predictions in this table (WP31's rows) did land as named.

## 5. UX trajectory (validating the core against the destinations)

**5.1 The student (WP31, sketched here only to prove the rails reach it).** The Robot Friends bench: pick a co-op card, the bench asks for a second bot from the shelf, both robots appear in one Playroom, STEP advances one *round*, the story strip narrates both by name ("Robo picked up the red block. Bolt is heading for the chest."), and the scrapbook files one shared adventure that either robot's page can open. Everything in that sentence maps onto a WP29 artefact: the round is `stepRound()`, the two-name narration is the facade's actor-naming, the shared adventure is the group trace, the per-robot page is the per-agent trace. Nothing requires reopening the core.

**5.2 The practitioner (stage F, minimal but real).** The Run Browser groups an episode's rows (the two member runs indented under the group row); opening the group row opens the Run Lab over the merged trace — same three regions, same fold, with the timeline's existing lane/filter machinery now doing attribution work (filter to one `agentId` = one robot's conduct in context). The Compare view already proves two panels can share a scrubber; a later "group view" with per-agent panels is a Workshop nicety, not WP29 scope.

## 6. Determinism and replay (the argument, compactly)

A group episode is deterministic because every source of order is fixed: member order is the `members` array; the scheduler is strict round-robin over it; each `step()` is awaited to completion before the next begins (single-threaded, no interleaving); the world is turn-based and mutation happens only inside `perform`; ids/clocks/randomness are injectable and the group threads one set through all members; and the merged stream's order is arrival order under those sequential awaits. Therefore: same specs + same scripts/providers + same injected sources ⇒ the same merged byte stream. Stage E gates this with a repeat-run byte-equality test, the same proof shape the golden trace has used since WP13.

Two known hazards, handled: **wall-clock timestamps** differ between live runs — irrelevant to replay (the fold never reads timestamps) and absent under injected clocks in tests; **provider non-determinism** is real for live LLMs exactly as it is single-agent — determinism claims are about scripted brains and about *replay of a recorded stream*, the same scope those claims have always had here.

## 7. Non-goals (inherited from `14-…` §6, reaffirmed)

No concurrent world mutation; no shared memory stores between agents; no dynamic agent spawning; no direct agent-to-agent channels (world-mediated only, and that is WP31); no group trace export format (deferred past WP34 as of 2026-08-21 — §4.7's own amendment above); no Kit UI in WP29 (WP31); no N>2 UX (the contract allows N, nothing is built or tested beyond duo).

## 8. Divergences from the `14-…` §6 sketch, with reasons

| Sketch said | This design does | Why |
|---|---|---|
| `observe/perform/describeProgress` take an `AgentHandle` | Handle bound once via `forAgent` facade; method signatures untouched | Same capability, zero breakage across two packs, the testkit, and both harnesses; the session stays world-shape-ignorant |
| `WorldState.bot` → `agents: AgentState[]` (v2 world schema, migrated) in every pack | `agents?` added alongside `bot`; only the Playroom opts in; no migration of the Workshop pack or any stored state | The sketch's migration was the "transform beyond recognition" risk; additive fields keep every snapshot and the golden trace byte-identical |
| "shared `groupRunId` via E10 envelope fields" | `parentRunId = groupRunId` | Uses the exact field E10 reserved, with its documented meaning; no envelope change at all |

> **Amended 2026-08-19 (WP29 stage C):** two refinements found while building `SessionGroup`, neither anticipated by the sketch above.
>
> - **`AgentSession` gained a public `readonly runId: string`.** `group.started`'s `memberRunIds` (§4.6) needs every member's run id *before* any member has taken a tick — the id was already generated synchronously at `createSession()`, just not exposed. Reading it off the constructed session is simpler and more honest than the alternative (listening for each member's first event and inferring `runId` from it), and it costs nothing solo sessions weren't already carrying.
> - **`CreateSessionGroupDeps.options` is `Omit<SessionOptions, 'parentRunId'>`, not the full `SessionOptions`.** A group generates its own `groupRunId` and stamps it onto every member via `parentRunId` itself (§4.5); a caller-supplied `parentRunId` on the group's own options would either be silently overwritten or silently ignored, and both are exactly the class of quiet-divergence bug this project's own retrospectives (`12-…`) warn about. Omitting the field makes the impossible input a type error instead of a footgun.

> **Amended 2026-08-19 (WP29 stage D):** two refinements found while building the Playroom's `forAgent` facade, neither anticipated by §4.8's prose.
>
> - **`GoalCardDefinition` gained an optional `coop: boolean`.** Acceptance criterion 6 promises "nothing in the Kit's screens changed", but `starter/tidy-together` is real, registered pack content — and the Kit's bench page (`apps/workbench/.../bench/[agentId]/+page.svelte`) lists every goal card the registry knows about, with no existing filter to lean on. The flag is the smallest way to keep that promise literally true: the bench page gains a one-line `.filter((card) => !card.coop)`, and every card shipped before WP29 leaves the flag unset. A card built for a `SessionGroup` is not a new choice on a one-robot bench; hiding it there is not a UI feature, it is the absence of one.
> - **A facade's seat is reserved at `forAgent(handle)` itself, not on first use.** The first draft staged `state.bot` and registered a new seat lazily, inside `seat()`, called from every facade method — which meant seating order depended on which facade's *method* ran first, not on which handle `SessionGroup` bound first. Since `SessionGroup` calls `forAgent` for every member synchronously and in member order *before any of them ticks* (§4.4), the seat reservation belongs at that call, not at first use — `facadeFor` now calls `seat(handle)` once, eagerly, and the co-op layout's `coopStarts` list is handed out in bind order regardless of which member happens to act first. Caught by `playroom-multi-agent.test.ts`'s own seat-isolation tests, which failed against the lazy version until this was fixed.
>
> Also worth recording, though it is an implementation choice rather than a divergence from anything §4.8 committed to: **`coopStarts?: Cell[]` lives on `PlayroomState` itself, not on any core type.** It is pack content — where a co-op layout seats new robots, in binding order — read only by the Playroom's own `forAgent`; core's `GridWorldState` gained nothing beyond what stage B already added (§4.3).

> **Amended 2026-08-19 (WP29 stage E):** §10's own words split across two packages, not one.
>
> - **"Each member trace independently replays through `projectThrough` to the same final world" lives in `apps/workbench`, not "`pack-starter`'s session harness" as §10 says.** `projectThrough` is a workbench module by construction (hard rule 1 — `core` and every pack stay Svelte- and DOM-free, and this fold underpins live `$state`), so it was never going to be reachable from `pack-starter`. The `SessionGroup` completion, no-wasted-turn, and byte-identical-repeat-run proofs stayed in `pack-starter/src/session/group-solvability.test.ts`, exactly where §10 puts them; only the `projectThrough` leg moved to `apps/workbench/src/lib/state/run-projection-group.test.ts`, importing the same `TIDY_TOGETHER_SEAT_A`/`TIDY_TOGETHER_SEAT_B` plans and `runGroupToCompletion` harness through the pack's existing `@craftabot/pack-starter/testing` surface (`WP19`'s precedent, not a new seam).
> - **The replay proof turned out to be more interesting than "the same final world".** `world.changed` fires only on a *successful action* (`agent-session.ts`), so a member whose own plan finishes early — Robo, at round 7 of 12 — stops producing fresh snapshots five rounds before the group actually ends. Robo's own replay never learns block-b reached the chest; it still shows Bolt *carrying* it. This is not staleness to paper over: it is §1's "a shared goal does not mean shared understanding" made mechanical, and the test asserts it directly rather than asserting a false equality between the two replays.

> **Amended 2026-08-19 (WP29 stage F):** §10 left `GroupRunRecord`'s exact shape and the seeding mechanism for a Kit-less episode undecided — "exact shape decided at stage F against the store's real constraints" and "driven through a test entry point" — so both are recorded here now that they are.
>
> - **`GroupRunRecord` is `{ id, goalCardId, memberRunIds, memberAgentIds, outcome, rounds, usage, pinned, startedAt, finishedAt?, schemaVersion }`**, stored in its own IndexedDB store (`groupRuns`, `DATABASE_VERSION` 2) rather than folded into `runs` — a group has no `specSnapshot`, no single `providerId`, and mixing the two shapes would have made every reader guess which kind of row it had. `RunRecord.groupRunId?` still carries a member back to it, exactly as §4.7 describes.
> - **Eviction stays run-scoped.** `evictOldRuns` was left untouched rather than extended to cap group episodes too — a real simplification, not an oversight: this is a practitioner-only, low-volume surface with no live producer yet, and capping episodes is exactly the kind of thing worth getting right against real usage rather than guessing at in the same stage that first gives episodes anywhere to live. Recorded here rather than quietly left unbounded.
> - **The test entry point is `window.craftabot.recordGroupEpisode`**, installed by the Workshop shell (`group-episode-entry-point.ts`) and backed by `recordGroupEpisode` (`group-recorder.ts`) — a real, storage-writing function a future WP31 live recorder can call incrementally, not scaffolding written to be torn out. A static SvelteKit build has no server route to seed through; this is the seam that stands in for one, reachable from Playwright's `page.evaluate` and nowhere else exercises it yet.
> - **`WorldView` draws a fellow robot plainly**: `BOT_POSES.walk`, a neutral `idle` face, a name caption — never the expression, speech bubble or carried-item detail the foregrounded `bot` gets, because none of that is known for anyone but the seat a given trace foregrounds. §4.3 asked only that positions come from `agents` and stay stable across interleaving; a fuller per-agent rendering is exactly the "Workshop nicety" §5.2 assigns beyond WP29.
> - **Digest verification and "Open in Kit" are simply absent from a group's Run Lab header**, not disabled or stubbed — §4.7 already commits `buildTraceFile` to staying single-run in WP29, so there was nothing to half-build here.

> **Amended 2026-08-20 (WP31 stage D):** the "no live producer yet" condition this file's own eviction note was waiting on is now false — the duo Play route writes group episodes as they are played, not only through the stage-F test entry point. Rather than design the "worth getting right against real usage" retention scheme that note deferred, `selectRunsToEvict` (`apps/workbench/src/lib/state/storage.ts`) now excludes any run carrying a `groupRunId` from the cap entirely: a grouped run was never a safe eviction candidate on its own (deleting it out from under a still-live `GroupRunRecord` corrupts the episode, unlike an ordinary solo eviction, which just loses a run cleanly), and no group-level cap exists yet either. This is the same conservative choice this file made originally, drawn one layer deeper now that the condition changed — not the real design, which still wants actual duo-play volume to inform it. Full reasoning: `24-ROBOT-FRIENDS-DESIGN.md` §8's own stage D amendment.

A dated note pointing here is added to `14-…` §6 in the same PR as this file.

## 9. Risk register

| Risk | Exposure | Mitigation |
|---|---|---|
| Golden trace breaks | Any accidental non-additive change | Stage A proves the seam byte-identical *first*; golden trace gate runs at every stage |
| `state.bot` seat-swapping trick leaks (an action caches `bot` across calls) | Playroom handlers only | Handlers are pure per-call today (verified: they read `state.bot` fresh); stage D adds a facade test asserting seat isolation after interleaved performs |
| Two agents' `world.changed` confuse a viewer | Run Lab over merged trace | §4.3's rendering rule: positions come from `agents`, stable across interleaving |
| Approval deadlock (group waits forever on an unanswered approval) | Live duo runs | Same exposure as single-agent today (a session waits too); group `stop()` remains callable; WP31's UX owns surfacing whose approval is pending |
| Scope creep toward WP31 | The whole WP | §7's non-goals list, and the DoD is the roadmap's own sentence — scripted proof + replay, nothing child-facing |
| Estimate drift (the 7–9 slices were never re-checked) | Planning | §10 re-derives the stages from this design: seven, sized against named files; the honest-sizing discipline of `18-…` §7 items 15–21 applies per stage, not once |
| The Hearing channel's queue is one per room, not one per seat | A co-op card that fits Hearing to more than one robot | Found during the post-stage-E verification pass, not designed for: `state.heard` is drained by whichever agent's turn observes it first, so a message delivered mid-episode reaches only one seat. No shipped card exercises this (`starter/tidy-together` fits neither robot with Hearing); a duo card that does needs a per-agent queue, real undone work flagged in `world/senses.ts` rather than quietly worked around |
| A group `stepRound()` called again after a non-natural finish (chokepoint trip, `stop()`) reported the wrong outcome | Any host that polls or double-calls `stepRound()` past completion | Found and fixed during the same verification pass: the already-finished branch re-derived the outcome from `memberOutcomes`, which a `session.stop()`-ended member never populates, silently falling through to `OUT_OF_STEPS`. Fixed by recording the outcome `finishGroup` actually decided and returning that on every later call; regression-tested for both the chokepoint and `stop()` paths in `session-group.test.ts` |

## 10. Implementation plan

Seven stages. **Every stage lands green on the full gate** (unit suites, `check`, `lint`, build+budget, all e2e, golden trace) **and is independently committable** — the plan is safe because at no point does the tree hold a half-open contract. Order matters: each stage's proof is the next stage's floor.

**Stage A — the world-injection seam, proven harmless.**
`CreateSessionDeps.world?` + `SessionOptions.parentRunId?` in `types/agent-session.ts`; the two-line consumption in `agent-session.ts`. Tests: golden trace byte-identical when the session's own world is passed back in through the seam; `parentRunId` present on every event when set, absent otherwise; fixtures untouched.
*Gate: golden trace unchanged. Rollback: revert one small commit.*

**Stage B — identity and state vocabulary, dormant.**
`AgentHandle` and `WorldInstance.forAgent?` in `types/world.ts`; `GridWorldAgent`, `GridWorldState.agents?`, `carried.agentId?` in `types/grid-world.ts`; exports. No implementation anywhere, no behaviour change; type-level tests only.
*Gate: every suite green with zero runtime diffs. Rollback: revert types.*

**Stage C — `SessionGroup`, against fakes.**
`session/session-group.ts`: construction/refusals, round-robin `stepRound`, merged stream + `group.started`/`group.finished`, group guardrail chokepoint with the `groupMaxTokens` rule, ending rules, approvals pausing the round. Unit-tested entirely against a hand-built fake `forAgent` world and mock providers — no pack changes yet. Event catalogue in `02-…` §7 updated in this same commit (hard rule 3).
*Gate: new suite ≥90% on the module (core's bar). Rollback: module is self-contained; nothing imports it yet.*

**Stage D — the Playroom opts in.**
`forAgent` facade with the seat-swap delegation trick (§4.8); co-op layout; `starter/tidy-together` card; fellow-agent observation; collision rule; carried-item attribution; narration naming actors in observations. Unit tests: seat isolation under interleaved performs, observation truthfulness per seat, every existing Playroom test untouched and green.
*Gate: pack suite + conformance kit + golden trace all green. Rollback: the card/layout are content; the facade is one new module.*

**Stage E — the DoD, gated.**
The L3 proof in `pack-starter`'s session harness: two scripted-optimal plans through a real `SessionGroup` complete `starter/tidy-together` deterministically at par; the merged stream is byte-equal across repeat runs; each member trace independently replays through `projectThrough` to the same final world. This stage is the roadmap sentence — "Two scripted bots complete a co-op card deterministically; group trace replays" — as executable tests.
*Gate: the DoD tests themselves. This is the point of no return worth pausing at for review before any UI work.*

**Stage F — persistence + minimal Workshop surface.**
`RunRecord.groupRunId?`; group episode stored (merged stream under `groupRunId`, member runs as today, group record for listing); Run Browser grouping; Run Lab opens the merged trace; `WorldView` draws `agents` when present (§4.3's rule). One e2e: a scripted duo episode (driven through a test entry point, since no Kit UI exists) is browsable and replayable in the Workshop.
*Gate: full e2e suite + fixture round-trips for the widened record.*

**Stage G — docs and close-out.**
Dated amendments: `14-…` §6 (pointer here), `02-…` §7 (already done in C — verify), `07-DATA-MODEL-PERSISTENCE.md` (group storage), `18-…` §3 WP29 row + §7 entry, `CLAUDE.md` next-up. Honest accounting of anything that diverged from this document — in this document.

**Sizing honesty (`18-…` §7 discipline):** A–B are small; C is the genuinely new machinery and the largest single stage; D is medium and carries the subtlest correctness risk (the facade trick — its tests matter more than its code); E is small if C and D are right, which is the point of its position; F is medium; G is small. That is seven stages against the original 7–9 slice estimate — the estimate survives re-derivation, which items 16/17 of `18-…` §7 could not say. If any stage grows beyond its description, the rule from those items applies: stop, re-size, present the finding — do not absorb it silently.

## 11. Acceptance criteria (WP29 as a whole)

1. Roadmap DoD: two scripted bots complete a co-op card deterministically; the group trace replays byte-stably. *(Stage E, gated.)*
2. Golden trace and every pre-existing test byte-identical/green throughout — not just at the end. *(Every stage.)*
3. A single-agent bot, card, pack, kit file, stored run and trace behave identically to before WP29, with no migration performed or required. *(Stages A–B property, held by additivity.)*
4. Every event in a merged trace attributes its agent; the group chokepoint demonstrably stops a group (budget test). *(Stages C, E.)*
5. The Workshop can list and replay a group episode; each member trace also opens standalone. *(Stage F.)*
6. Nothing in the Kit's screens changed; WP31's duo bench is buildable on these rails per §5.1 without reopening core contracts. *(Design property, checked at G.)*

**Checked at G, 2026-08-19 — all six hold.** (1) `pack-starter/src/session/group-solvability.test.ts` + `apps/workbench/.../run-projection-group.test.ts`. (2) The golden trace fixture test passed at every stage's own gate, not only the last. (3) Proven directly, not just argued: `playroom-multi-agent.test.ts`'s "a solo session's trace carries no multi-agent field anywhere" folds a real solo run and asserts `agents`/`coopStarts`/`parentRunId` are absent everywhere. (4) `session-group.test.ts`'s merged-trace and chokepoint suites. (5) `group-episode.spec.ts`'s e2e. (6) One line of Kit code changed in the whole WP — `bench/[agentId]/+page.svelte`'s `.filter((card) => !card.coop)` (stage D) — and it is a no-op for every card that predates WP29, none of which set the flag; every other Kit route, and every Kit e2e test, is untouched. Criterion 6 is true as stated, not true by having touched nothing at all — the distinction is worth keeping honest rather than rounding up.
