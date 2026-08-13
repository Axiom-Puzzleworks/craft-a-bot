# 14 — Brick Reference Designs & Target Data Structures (Workstream 2)

> The rock-solid baseline for the build-out: the target design contract for bricks, the reference design of each shipped brick, the specification of bricks on the roadmap, the multi-agent-ready architecture, and the v2 data structures. Where this document and `02-AGENT-MODEL.md` differ, this document wins.
> Prerequisite reading: `12-CURRENT-STATE-ASSESSMENT.md` (the debts this design retires), `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` (the control catalogue the Safety brick grows into).

---

## 1. Design tenets

1. **True to production agents.** Every brick corresponds to a module a real agent stack has (context engineering, tool runtime, memory strategy, policy decision point, telemetry). Where we simplify, the simplification is a documented _teaching choice with an off-ramp_, never a dead end. The industry consensus we mirror: policy decision point between model and tools; typed trace with spans for step/tool/guardrail; deterministic replay; agents as identifiable principals (`19-…` §3–5).
2. **Bricks are an open taxonomy.** A brick kind is _content registered against a contract_, not a case in a core enum. Core owns the contract and the loop; packs own the bricks. (Retires D11 — the one structural change everything else depends on.)
3. **Schema-versioned everything, migrations from day one.** Any artefact a user can keep (spec, kit, trace, eval report) has a version and a table-driven migration. (Retires D7.)
4. **The trace is the interface.** Anything a UI, an eval, a monitor or an auditor needs must be derivable from events. New capability ⇒ new events in the catalogue, additively.
5. **One agent is the special case of many.** Every identifier, event and world interaction is written as if multiple agents exist; V1 simply instantiates one. (Retires D9 progressively.)

## 2. The brick contract (target)

### 2.1 `BrickKindDefinition` — what a pack registers

```ts
export interface BrickKindDefinition<C = unknown> {
	id: string; // "starter/llm" — qualified, stable forever
	slot: SlotId; // which chassis socket family it occupies (see 2.3)
	// Presentation (both registers, per project principle 3)
	name: string;
	description: string;
	realName: string;
	realExplanation: string;
	// Specification
	configSchema: ZodType<C>; // versioned via configVersion; source of truth for types
	configVersion: number;
	migrateConfig: MigrationTable<C>;
	defaults: C; // what a freshly-snapped brick gets (single source; retires the BRICK_DEFAULTS duplicate in the workbench)
	// Runtime contribution — all optional; a brick contributes only what it is
	createRuntime?(config: C, ctx: BrickRuntimeContext): BrickRuntime;
}

export interface BrickRuntime {
	// Called at the loop's fixed points; every hook is additive and observable
	contributeContext?(tick: TickContext): ContextContribution; // prompt sections (Sense, Memory)
	contributeCalls?(): CallContribution; // tools & actions offered (Equipment, Mobility) — see below
	contributeGuardrails?(): Guardrail[]; // policy (Safety)
	onTickEnd?(record: TickRecord): void; // learn/record (Memory)
	dispose?(): void;
}
```

> **Amended 2026-08-13 (WP14 slice 3b):** `contributeCalls` returns **ids, not schemas** — `{ toolIds?: string[]; actionIds?: string[] }`. As drawn it returned call schemas, which cannot work: a schema with no executor is a name the model can call and nothing can answer. The brick names *which registered content* it offers and core dispatches it, through `ToolDefinition` and `WorldActionDefinition` — both core's own types. Nothing is lost from the open contract: a Radio brick ships a pack registering both a `radio/send_message` tool and the brick kind whose config enables it, with no core change, and the tool arrives with its executor attached the way every tool does. The alternative — bricks carrying their own handlers — would be a second dispatch mechanism alongside the one packs already use.
>
> Also added: `describeFitted(config)`, for the "parts you have been built with" line. Presentation like `name`, but config-dependent (a Memory brick says how many turns it remembers), so it belongs on the kind rather than in a hook. It replaces `describeFittedBricks`'s six hard-coded `if`s — D11 in the one place a user reads the consequence.

> **Amended 2026-08-13 (WP14 slice 3c):** two additions, and one limit worth knowing about.
>
> `contributeSenses(): string[]` joins the hooks — sense channel ids, for the same reason `contributeCalls` returns ids. The *world* owns what can be perceived; a brick returning observations would be a second way of seeing alongside `WorldInstance.observe`. A Radar brick opens `radar/sweep` and the world decides what a sweep shows.
>
> **Slot contracts.** Two things a brick holds are not contributions at all: the brain socket says which model to call, how hot and how long; the memory socket says how much to remember and whether to keep a notebook. Both configure machinery core owns, and there is no honest hook shape for them — a `contributeMemory()` returning `{ windowSize, notebook }` is a hook laundering config through a runtime. So core states a contract per socket (`schemas/slot-contracts.ts`) and reads it. That is not the taxonomy this workstream dismantles: core knows what the *brain socket* means, which §2.3 says it owns, and not what `starter/llm` is. Any pack's brain works so long as it has a cartridge.
>
> The limit, stated so it is a decision and not a wall: a brick whose config is shaped differently cannot fill those two sockets — a Vector Memory brick with `embeddings` and no `windowSize` would be fitted, validated, and then ignored by the memory the loop keeps. The answer when one is wanted is to let the Memory brick contribute its own prompt messages (a placement widening of `ContextContribution`), not to widen the contract.

> **Amended 2026-08-13 (WP14 slice 3d):** `contributeGuardrails` is implemented, and a fourth delegation joins the contract.
>
> **Policy is a contribution.** It was the one hook this section declared that nothing used: a fitted Safety Brick became running guardrails in `guardrailsForSpec`, a compiler in `@craftabot/governance` that read `spec.bricks.safety` by name. That compiled exactly one brick, so a Monitor brick could contribute no policy at all without a core change — D11 in the place it costs most. `starter/safety` now composes the four governance rules itself, and `collectGuardrails` gathers them in slot order; the session concatenates the bricks' rules with whatever the *host* adds (`CreateSessionDeps.guardrails`, still the seam policy cards will arrive on). Guardrails were always an honest hook shape, unlike the brain and memory sockets below — `Guardrail` is a first-class interface and the engine already ran a list of them.
>
> **The safety socket gets a slot contract too, of exactly one field.** `resolveBudgets` needs `maxTicks` before the run starts and the play screen's gauge counts down from it, so the dial is read the way the cartridge and window size are. Only the dial: the blocklist, repeat limit and approval mode are policy and go through the hook. A brick in that socket with no dial leaves the backstop at the floor of 30, which is the right answer for a bot nobody set a limit on.
>
> **`validateConfig(config, ctx)` — the fourth question.** §2.1 said `validateSpec` gains *one* generic check. It gains one and a half. Three questions are core's (is the kind installed, does it fit this socket, does its config parse) and the ids a brick *offers* are checked generically, because `contributeCalls` and `contributeSenses` mean core can resolve every tool, action and channel any brick asks for without knowing what the brick is. But some configs are well-formed and still wrong in ways only their own kind can see — a blocklist naming an action nobody installed — so the kind is asked. It answers with build problems minus the socket, which core fills in. `ctx` is four lookups (`hasTool`, `hasAction`, `hasSenseChannel`, `hasCartridge`) rather than the registry itself: a brick should be able to check what it *names*, not enumerate what is installed.
>
> Consequently `asLegacySpec` has left `core` and `governance` entirely. The workbench still reads bots through it, at its own door, until the panels become schema-driven (§5 of `15-…`).
>
> One shape change that reaches storage: `BuildProblem.brick` (V1's six names) is superseded by `BuildProblem.slot` (a `SlotId`). The old field is kept parseable so a stored `AgentRecord.lastValidation` still loads, and nothing writes it.

> **Amended 2026-08-13 (WP14 slice 4a):** the `BrickPanel` if/else chain is gone, and how it went is worth recording because this section pointed at `15-…` §5 for the design and `15-…` §5 is the design-language section. The mechanism was never specified; this is it.
>
> **Two paths, one of which is a preference.** `BrickPanel` is a dispatcher: it takes a fitted brick and its kind, looks the kind id up in a table of hand-written panels *in the workbench*, and otherwise renders the kind's own `configSchema`. The six starter panels are entries in that table. What makes this an extension point rather than D11 wearing a hat is that things **not** in the table still work — a kind with no entry opens a real panel with real controls, and a unit test mounts an invented `expansion/monitor` to keep that true.
>
> Overrides live in the workbench rather than in packs because packs never import Svelte (hard rule 1). A pack's route to good controls is `controlHints`.
>
> **`ControlHints` — what a schema cannot say.** `configSchema` gives the shape and nothing else: `enabled: z.array(z.string())` means "some strings", and that they are *installed tool ids*, or *the actions of the world this bot's card names*, is not in the type and cannot be — the answer changes when the user swaps the card. So a kind may declare, per field, a control type, a label, and a `source` naming one of four content catalogues core already owns (`tools`, `actions`, `senseChannels`, `cartridges`). A pack naming one is contributing content, not a mechanism (hard rule 4): it says which of core's catalogues its field draws on, not how to have a new one.
>
> **The known limit, by decision.** Two things the shipped panels do cannot be expressed as hints, and both are why overrides still exist: a field whose *visibility* depends on another (the Safety Brick's repeat limit, which appears only when its rocker is on), and a control whose text depends on a *different socket* (the tool belt warning that a notebook tool has no notebook to write in — which reads the memory **slot contract**, so any memory brick answers it). When an expansion brick genuinely needs the first, a `when` predicate is the obvious widening. Recorded so it is a decision somebody makes.
>
> Also: the six brick colours gain socket-keyed aliases (`--cab-brick-slot-*`). Not a second palette — each aliases the mapping `04-…` §2.2 fixes, so the law is still stated once. What changes is that a Monitor brick in the safety socket is now yellow, because colour means the *concept* and the socket is what carries it.

Rules: core defines the loop, the hook points, and the six _slot families_; packs define brick kinds. A brick kind cannot patch another brick or reorder the loop. `validateSpec` gains one generic check — config parses against the kind's schema at its version — replacing per-brick special cases. The workbench's `BrickPanel` if/else chain is replaced by schema-driven controls with per-kind panel overrides (see `15-…` §5).

### 2.2 `AgentSpec` v2

```jsonc
{
	"id": "uuid",
	"name": "Snackbot 3000",
	"schemaVersion": 2,
	"bricks": [
		{ "slot": "brain", "kind": "starter/llm", "configVersion": 1, "config": {/* per kind */} },
		{ "slot": "safety", "kind": "starter/safety", "configVersion": 1, "config": {} }
	],
	"goalCardId": "starter/snack",
	"customGoalText": "…", // now actually consumed for free-play cards (retires D10)
	"identity": { "displayName": "Snackbot", "boxArtSeed": "…" }, // agent identity seed, §6
	"createdAt": "…",
	"updatedAt": "…"
}
```

Migration v1→v2 is mechanical (fixed slots → array entries with `kind` = the starter ids) and covered by fixtures. Kit file v2 embeds spec v2 and adds `requires.brickKinds` so import can name exactly which pack a missing brick comes from.

### 2.3 Slot families

Six socket families keep the body metaphor and the piece-fits-hole affordance while allowing many kinds per family: `brain` (head), `perception` (visor), `memory` (backpack), `equipment` (belt — tools _and_ future connector bricks), `mobility` (wheels — actions/effectors), `safety` (chest — always centre, as the box art has it). V1 rule "one brick per slot" is kept for the teaching aid; the spec format (array) already permits multiples for the professional mode later (e.g. two equipment bricks).

### 2.4 What travels with a bot — kit file v2 and `AgentRecord` v2

> **Added 2026-08-13 (WP14 slice 2c):** written up when the workbench started writing v2, because §2.2's one sentence about `requires.brickKinds` left three decisions unrecorded.

**`requires.brickKinds` maps kind id → pack id** (`{"starter/llm": "starter"}`), and is taken **from the registry, not inferred from the id**. The `pack/kind` naming is a convention; the registry is what actually knows who registered what, and a kit file that guessed would be wrong exactly when it mattered. A kind the exporter itself does not have is *omitted* rather than guessed at — that is already a blocking build problem on the exporting machine, and writing a plausible pack id would relocate the failure to the reader and blame them for it.

Import checks packs first and bricks second. "You need the space pack" is a more useful sentence than a list of six bricks that all come from it; only once every named pack **is** installed does a missing kind mean what it says — *you have the pack, at a version without this brick*, the case v1 could not describe at all.

**`AgentRecord` v2 drops `boxArtSeed`.** It moves to `spec.identity.boxArtSeed`, per §2.2 and §6. This was a live bug, not tidying: the seed lived on the storage row, so it never travelled inside a kit file, and a bot you sent someone arrived wearing a different box. The record migration is the only place that can join the two up — the spec migration deliberately leaves the seed empty rather than inventing one — so v1 → v2 on the *row* is what preserves the box art a person has been looking at.

Storage **migrates on read** rather than validating. A shelf full of v1 rows is the normal state of anyone who used V1.0; a straight parse would quarantine every one of them (`07-…` §1.5) and they would open the app to an empty shelf.

## 3. Engine evolutions required (the contract the bricks sit on)

| #   | Change                                                                                                                                                                                                                                                                            | Retires | Notes                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| E1  | **Honour post-act verdicts**: `stop-run` ends the run (`STOPPED_BY_GUARDRAIL`), `block-action` is meaningless post-act and is rejected at registration; post-act becomes the home of _outcome monitors_ (world-invariant checks, monitor bricks)                                  | D1      | Test first (13 §4.6)                                                                      |
| E2  | **Session I/O API**: `session.deliverInput(text)` → world `receiveInput`; `session.declareOutcome('SUCCESS', reason)` for manual goals; both emit events (`input.delivered`, extension of `run.finished` payload)                                                                 | D2      | Free Play's "Goal achieved" button; Hearing channel becomes real                          |
| E3  | **Feedback promotion**: `ActionResult.ok === false` narrations join `run.feedback` (the "Right now:" section) for the _next_ tick, memory brick or not                                                                                                                            | C2      | The single highest-value behaviour fix                                                    |
| E4  | **Observation upgrade**: `Observation.summary` includes position + bearings of seen entities ("at col 3 row 5 you saw the red key to the north-west"); compass line included in the memory record                                                                                 | C1      | World-side; sight radius unchanged — the lesson ("explore") survives, the amnesia doesn't |
| E5  | **Single-sourced shapes**: `RunOutcome`, `GuardrailVerdict`, `ChatResponse`, `Observation` defined once in Zod, `z.infer` everywhere                                                                                                                                              | D3      |                                                                                           |
| E6  | **Qualified world content ids** (`starter/playroom/move` internally; wire names remain short but collision-checked globally)                                                                                                                                                      | D4      | Migration note in kit files                                                               |
| E7  | **Strategy seams**: `MemoryStrategy` and `PromptStrategy` interfaces with the V1 implementations as defaults (`window-v1`, `sections-v1`); a `transcript-v1` prompt strategy adds the real tool-result message protocol as a selectable "realism mode" for the professional bench | D5, D12 |                                                                                           |
| E8  | **Trace completeness**: `RunRecord` gains `budgets` (effective), `providerId`, `wireModel`, `sessionMode` honest; `think.started` carries wire model; `tool.executed` carries `data`; `memory.updated.notebookUpdated` truthful                                                   | D6, D15 | Trace `formatVersion: 2` + migration table (D7)                                           |
| E9  | **Guardrail context efficiency**: context carries a read-only view + cursor into history rather than copies                                                                                                                                                                       | D8      |                                                                                           |
| E10 | **Agent identity in events**: envelope gains `agentId` (spec id) and optional `parentRunId`; single-agent runs simply repeat one id                                                                                                                                               | D9      | Enables §6 without touching consumers                                                     |
| E11 | **Retry/backoff policy**: honour `retryAfterMs` for `rate-limited` with one bounded retry, traced                                                                                                                                                                                 | D10     |                                                                                           |
| E12 | **`celebrate` becomes meaningful**: on free-play cards it ends the run SUCCESS (the bot decides); on predicate cards it stays a decoy but the end-of-run card explains premature celebration explicitly                                                                           | C7      |                                                                                           |

> **Amended 2026-08-13 (WP13):** all eight evolutions have landed — E1, E2, E5, E6, E8, E9, E10 and E11. Notes on where the implementation differs from the rows above:
>
> - **E6 resolves legacy ids rather than migrating them.** The row calls for "a one-off codemod + kit migration". What shipped instead: world content is qualified (`starter/playroom/move`), the session translates to short wire names in both directions, a global collision check refuses any build with two things the model would call by the same name — and the **registry resolves a bare local name as long as exactly one piece of content answers to it**. A data migration can fail, needs a version bump on `AgentSpec`, and would have to reach specs in three places (kit files, IndexedDB records, in-flight benches); tolerant resolution cannot fail and needs none of that. The tolerance is deliberately narrow: the moment two worlds ship a `move`, the bare name resolves to *neither* and the build check says so, which is the honest answer to the ambiguity D4 previously resolved silently. New specs are written qualified, so the compatibility path stays a compatibility path.
> - **The blocklist guardrail compares local names.** A spec blocks `starter/playroom/celebrate`; the model proposes `celebrate`. Qualifying ids without this made the blocklist match nothing — a governance control failing *open*, caught by the E2E suite rather than by a unit test, which is itself worth noting.
>
> - **E1's "rejected at registration" became "rejected when the verdict appears".** A guardrail declares its *hooks* up front but not its *dispositions*, so there is no registration-time moment at which a post-act `block-action` is detectable. The engine now throws when one is returned, which surfaces as an `error` event and ends the run — loud, per `10-…` §1's "never swallow". Quietly ignoring it was precisely what D1 was.
> - **E2 added `input.delivered` with a `heard` flag.** A world need not implement `receiveInput`, and a trace that implied a message landed when it went nowhere would be worse than one that says so.
> - **E5 exposes the schemas as well as the types.** `schemas/shared.ts` exports both, so a pack can validate what it produces against the same definition the engine infers from.
> - **E8 bumped `TraceFile` to `formatVersion: 2` with a migration table**, and `RunRecord` to `schemaVersion: 2`. The migration fills what v1 genuinely did not record with the literal string `unrecorded` rather than inventing plausible values — an artefact that admits a gap is worth more than one that quietly fills it. `agentId` *is* recovered, because a v1 trace names the agent on the run itself.
> - **E9 dropped the copy but not a cursor.** The context now hands guardrails the live `history` array typed `ReadonlyArray`, which removes the O(events²) copying D8 describes. No cursor API was added: nothing needed one, and inventing an interface for a hypothetical consumer is how contracts rot.
> - **E11 added `provider.retried`** rather than reusing `error`, so a recovered wait does not render as a failure. One retry, clamped to five seconds however long the provider asks for.
>
> WP13's DoD is met for what landed: the v1 golden trace migrates to v2 with fixtures on both sides, and `audit-completeness.test.ts` (`13-…` §9) proves the trace answers each audit question from the event stream alone.

> **Amended 2026-08-13 (WP11):** E3, E4 and E12 have landed; the notes below record where the implementation went further or less far than the row above.
>
> - **E12 goes one step further: the _second_ `celebrate` fails.** E12 as written leaves a bot on a predicate card celebrating on every remaining turn, which is the terminal loop C7 describes, and the end-card explanation only arrives once the budget is spent. Making the repeat a failure ("you have already done your victory dance… whether the goal is finished is judged by the room, not by you") puts the correction in front of the bot on the next turn through E3. The first celebration is untouched, so premature celebration is still fully available as a lesson.
> - **No-repetition v2 exempts successful `move` calls, not all successful calls.** §4.6 reads "trips on ≥N occurrences of a failing signature … and never on `move` calls that succeed", and the two clauses pull in different directions. A failures-only rule was implemented first and it broke the flagship case: the loop first reported from play was a bot beside the toy chest calling to a Teddy three squares away, where every `say` **succeeded**. The starter suite caught it. The rule as built therefore counts repeats of any signature inside the last ten decisions and exempts only a `move` that worked — the documented false positive, and the one case where an identical repeat genuinely means progress. Success is not progress; movement is. §4.6's wording should be tightened to match.
> - **No-repetition v2 is on by default for newly built bots** (`repeatLimit: 3`). The field stays optional in the schema, as §4.6 has it; what changed is the bench's default spec. v1 shipped switched off because it stopped a bot walking in a straight line, and the cost of that was that the reported hello-loop was the _default_ experience (`12-…` C3). With the movement exemption the false positive is impossible, so the default is safe. The loop lesson survives by being switched _off_ in the leaflet chapter, which is the better demonstration.
> - **A world action name (`move`) now appears inside a guardrail**, which is a layering wart flagged in the code: policy cards (§4.6) should let a world declare which of its actions mean "you got somewhere", at which point the constant goes.
> - **C5 is only half addressed.** Penny Thinker's default `maxTokens` rose from 400 to 600, which stops the shipped configuration starving mid-reasoning. The per-cartridge _minimum_ the bench dial cannot go below waits for §4.1's "cartridge defaults become real" in WP14, so that fit-time-copy-versus-engine-fallback is decided once rather than twice.
> - **E4 covers the compass too.** The summary carries the compass's landmark bearings, and stands in on its own for a bot with a compass and no eyes. The compass's anti-cheat rule is unchanged: landmarks only, never items or Teddy.

## 4. Reference designs — the six shipped bricks

Format per brick: concept → target configuration → runtime behaviour → events → extension path → multi-agent note. Config tables show the v2 schema; unchanged v1 fields are kept.

### 4.1 Brain brick (`starter/llm`, slot `brain`)

**Concept:** the model call at the heart of each tick; teaches "the model is a component you choose and configure, not the agent itself."
**Config:** `cartridgeId` (may be empty = slot open); `temperature 0..2` (UI shows "not adjustable on this cartridge" when the catalogue says so — the dial must stop lying); `maxTokens` (min raised to cover measured reasoning floors per cartridge); `personality` (≤280 chars); **new** `reasoningEffort?: 'minimal'|'low'|'medium'` override (pro mode only, defaults from cartridge).
**Runtime:** `contributeContext` adds the personality line; the session owns the call. Cartridge `defaults` become real: applied at fit time by the bench _and_ used as engine fallback (one rule, tested).
**Events:** `think.started {providerId, wireModel, cartridgeId}`; usage as today.
**Extension path:** persona cartridges (same model, different defaults+personality — the Multi-Pack lesson "behaviour = model × configuration"); local/Ollama cartridges (`keyRequirement:'none'`); a future `planner` brick _cooperates_ with (never replaces) the brain (§5.1).
**Multi-agent:** nothing special — each agent has its own brain; shared-budget accounting happens at the session-group level (§6).

### 4.2 Memory brick (`starter/memory`, slot `memory`)

**Concept:** what the agent carries between ticks; teaches "memory is a strategy, not a database."
**Config:** `strategy: 'window'` (v2 default; the only kids-mode option) with `windowSize 3|10|30`; `notebook: boolean`. Pro mode may select `strategy:'transcript'` (paired with E7's transcript prompt strategy).
**Runtime:** implements `MemoryStrategy`; records per-tick `TickRecord` incl. refusals and (per E4) positions; `onTickEnd` writes; `contributeContext` renders.
**Events:** `memory.updated` truthful; **new** `memory.written {source: 'tick'|'notebook'}` distinguishing automatic from deliberate writes — the provenance seed for the memory-poisoning curriculum (`19-…` §2.6: provenance tags and write-gating are the emerging defence).
**Extension path (expansion packs):** `summary` strategy (LLM-written running summary — teaches lossy compression); `long-term` split (Agent Builder box art promise); `librarian` retrieval memory (§5.5). Each is a new brick kind in the `memory` slot — zero core change.
**Multi-agent:** memory is strictly per-agent; shared knowledge is modelled as a world artefact (noticeboard) or comms (§5.4), never a shared store — that distinction _is_ the lesson.

### 4.3 Tools brick (`starter/tools`, slot `equipment`)

**Concept:** function calling; teaches the tool contract (name, schema, deterministic result).
**Config:** `enabled: ToolId[]` (qualified); per-tool `config?` object admitted by the tool's own schema (future-proofs configurable tools).
**Runtime:** `contributeCalls` offers schemas; execution stays in the session with injected `{tick, notebook, random}`.
**Tool metadata additions:** `riskTier: 'observe'|'reversible'|'irreversible'` (drives risk-tiered approvals, `19-…` #3) and `costHint`. Starter tools are all `observe`/`reversible` — the tiers become visible when the first `irreversible` world action teaches the difference.
**Events:** `tool.executed` carries `data` (E8).
**Extension path:** Tool Shop pack (measuring tape = distance queries, camera = snapshot-to-notebook, walkie-talkie → §5.4); **Connector brick** (§5.6) is a _separate equipment kind_, keeping "local tool" vs "remote capability" as a taught distinction.
**Multi-agent:** tool executions are per-agent and traced with `agentId`; a shared-resource tool (one calculator on the table!) is a deliberately teachable contention scenario for the duo pack.

### 4.4 Sense brick (`starter/sense`, slot `perception`)

**Concept:** context engineering — "what you choose to put in the prompt is what the agent can know."
**Config:** `channels: SenseChannelId[]` (qualified per E6); **new** `detail: 'plain'|'annotated'` — annotated adds coordinates to sight lines (default for pro, opt-in "explorer's notebook" upgrade in kids mode after the C1 fix lands in summaries regardless).
**Runtime:** `contributeContext` renders channels in canonical order; summaries per E4.
**Events:** `sense` unchanged; observation `data` retained for structured consumers (pro trace views).
**Extension path:** new worlds ship new channels (thermometer, radar); a `hearing` that works (E2); future _filtered_ senses teach attention/cost trade-offs ("sight is tokens").
**Multi-agent:** `observe(agentHandle, channels)` — each agent senses from its own position; overhearing another bot's `say` is the natural first inter-agent channel and needs no new machinery (already in `spoken`/`heard`).

### 4.5 Actions brick (`starter/actions`, slot `mobility`)

**Concept:** effectors — the world-mutating counterpart of tools.
**Config:** `enabled: ActionId[]` (qualified). Action definitions gain `riskTier` (as 4.3) — `open` on someone else's chest is the first "reversible-but-rude" teaching case; future worlds get genuinely irreversible actions (paint!) to make approval tiers meaningful.
**Runtime:** `contributeCalls`; refusal paths unchanged (three-way: not-built-with / world-refuses-in-character / performed); failure narrations promoted to feedback (E3); bump narrations include the reach rule (C8).
**Events:** `action.performed`; `world.changed` on success.
**Extension path:** worlds are the extension point; the brick stays thin. `celebrate` per E12.
**Multi-agent:** `perform(agentHandle, call)` with world-level arbitration (turn scheduler, §6); action results name the actor in narration ("Beep picks up the red key") so shared traces read naturally.

### 4.6 Safety brick (`starter/safety`, slot `safety`) — the centrepiece

**Concept:** the policy decision point. Physically central on the robot; conceptually central to purpose 2. The V1 rules stay, joined by a policy-card slot that makes the brick _programmable_ — the industry pattern (PDP between model and tools; policy-as-code; `19-…` §3.2–3.3) in toy form.
**Config v2:**

| Field            | Spec                                                                                                                                                                               | Teaches                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `maxTicks`       | int 5..200 (bounded at last)                                                                                                                                                       | budgets                                                   |
| `maxTokens?`     | int — user-visible token cap below the platform floor                                                                                                                              | cost governance                                           |
| `blockedActions` | `ActionId[]`                                                                                                                                                                       | capability scoping                                        |
| `approval`       | `'off' \| 'everything' \| 'risky'` — risky = actions whose `riskTier ≥ reversible` (replaces boolean; default for kids becomes `risky` once tiers exist)                           | risk-tiered HITL (`19-…` #3, the approval-fatigue answer) |
| `repeatLimit?`   | int 2..10, **windowed** detection v2: trips on ≥N occurrences of a failing signature within the last M=10 decisions (not only consecutive), and never on `move` calls that succeed | loop detection without the straight-line false positive   |
| `autonomy?`      | `'operator' \| 'collaborator' \| 'approver' \| 'observer'` — pro-mode dial mapping onto approval+budget presets (Levels-of-Autonomy, `19-…` §8.1)                                  | graduated autonomy                                        |
| `policyCards?`   | `PolicyCardId[]` — slotted declarative rules (below)                                                                                                                               | policy-as-code                                            |

**Policy cards** (V1.x, the `08-…` §5 plan now specified): a `PolicyCard` is data — `{id, title, rules: [{hook, when: PredicateExpr, then: 'block-action'|'stop-run'|'require-approval', reason}]}` — validated, versioned, shareable like goal cards, compiled by `guardrailsForSpec` into ordinary guardrails. `PredicateExpr` v1 is deliberately tiny: match on call kind/name/argument literals and simple usage comparisons. This is AgentSpec/OPA in miniature (`19-…` §3.3) and exports cleanly with `@craftabot/governance`.
**Events:** verdicts already first-class (`guardrail.checked/tripped`); add `policyCardId` to the payload when a card fired.
**Extension path:** guardrail packs (content-filter on `say`, world-invariant monitors on post-act per E1, injection-detector on Hearing input — the CAISI #1 threat as a Playroom scenario, `19-…` #12); the Monitor brick (§5.3) consumes the same events.
**Multi-agent:** guardrails evaluate per-agent; a _group_ policy (orchestrator-level) is host-assembled from the same interface — the chokepoint pattern (`19-…` §7.2).

## 5. Roadmap bricks (specified now, built by phase — see `18-DAY2-ROADMAP.md`)

All are new brick kinds against §2 — none requires core surgery once E1–E10 land. Each entry: slot · concept · minimal config · teaching story · pro-mode story.

| Brick                    | Slot                                                                  | Concept & minimal config                                                                                                            | Teaches (kids 5–11)                                                          | Pro mode                                                                                           |
| ------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **5.1 Planner**          | brain-adjacent (`brain` slot, second socket in Agent Builder chassis) | Turns the goal into a visible step list the brain follows; config: `maxSteps`, `replanOn: 'failure'\|'never'`                       | "Think before you do" — the plan is drawn as a paper checklist the bot ticks | Plan-then-execute pattern; plan diffs in trace                                                     |
| **5.2 If/Then brick**    | mobility-adjacent                                                     | Tiny visual rules ("IF you see the key THEN pick it up") evaluated before the brain; config: rule list                              | Deterministic vs learned behaviour — when rules beat thinking                | Reflex/short-circuit policies; latency & cost lesson                                               |
| **5.3 Monitor brick**    | safety-adjacent (2nd chest socket)                                    | A second, read-only observer that reads the live trace and raises flags (post-act, E1); config: `watchFor: MonitorRuleId[]`         | "Who watches the robot?" — a teddy-cam                                       | SHADE-Arena-style monitor agent (`19-…` #27); flags become trace events; genuine research frontier |
| **5.4 Radio brick**      | equipment                                                             | Send/receive short messages between bots (via world message board first, direct A2A-style later); config: `channel`, `allowFrom`    | Talking robots; the spoofed-message scenario (ASI07) in toy form             | Inter-agent comms with authentication lesson; message provenance                                   |
| **5.5 Librarian brick**  | memory                                                                | Retrieval over a bigger manual/bookshelf (embedding-free keyword RAG first); config: `books: BookId[]`                              | "Looking things up beats remembering everything"                             | RAG grounding + citation display; retrieval poisoning scenario                                     |
| **5.6 Connector brick**  | equipment                                                             | MCP-lite: a capability that lives _outside_ the toy (simulated remote service with latency/failures); config: `serviceId`, `scopes` | "Some tools live far away and need permission slips"                         | Scope minimisation, confused-deputy mini-curriculum (`19-…` §4.5, #38)                             |
| **5.7 Test Bench brick** | bench accessory (not on robot)                                        | Assertion cards run against traces ("bot never touched Teddy's snack"); config: assertion list                                      | "Check your robot's homework"                                                | Trace-based eval assertions; feeds the eval harness                                                |
| **5.8 Identity badge**   | chassis accessory                                                     | Every bot carries a machine-readable card: name, bricks, permissions, provenance (A2A Agent-Card/AI-BOM shape, `19-…` #29–30)       | "Your robot's passport"                                                      | Kit-file transparency artefact; export to real formats                                             |

Selection rationale: 5.1–5.4 are the Agent Builder box-art promises (planner, if/then, guardrails, feedback loops) and cover the ages 5–11 arc; 5.3/5.7/5.8 are the governance proving-ground's next experiments; everything in the AI Architect box (training, datasets, deployment pipelines) is **out of the kids line permanently** per Andrew's direction — its worthwhile concepts (eval matrices, red-team cards, monitoring dashboards) live on in the professional mode only (`17-…`, `18-…` §2).

## 6. Multi-agent target architecture (design now, build in Phase E/F)

- **Sessions:** one `AgentSession` per agent, unchanged. A new host-level `SessionGroup` owns: a shared `WorldInstance` created once; a **turn scheduler** (round-robin ticks in V-duo; the world stays turn-based so determinism and replay survive); shared budget accounting; group stop.
- **World contract:** `observe/perform/describeProgress` take an `AgentHandle`; `WorldState.bot` → `agents: AgentState[]` (v2 world schema, migrated); narration names actors. Predicates may reference "any agent" or a named agent.
- **Traces:** each agent keeps its own run trace (own `runId`, shared `groupRunId` via E10 envelope fields); the group trace is the ordered merge — exactly how production tracing correlates spans (delegation metadata, `19-…` §5.3).
- **Comms:** Radio brick (§5.4) via world-mediated messages first — observable, arbitratable, and traced like everything else. Direct agent-to-agent channels only in pro mode, with the authentication lesson attached.
- **Governance:** per-agent Safety bricks plus an optional group policy chain at the scheduler (the orchestrator chokepoint). Monitor bricks may watch _other_ agents' event streams read-only.
- **Explicit non-goals:** no concurrent (non-turn-based) world mutation; no shared memory stores; no dynamic agent spawning in the kids line (pro mode may prototype it later).

## 7. Data-structure baseline v2 (summary of record)

| Artefact                  | v2 changes                                                                                                    | Migration                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `AgentSpec`               | §2.2: brick array with kind/configVersion; identity block; bounded safety fields                              | v1→v2 mechanical, fixtures both ways   |
| `KitFile`                 | embeds spec v2; `requires.brickKinds`; semver actually evaluated (D13)                                        | table extended                         |
| `TraceFile` / `RunRecord` | E8 fields; envelope `agentId`/`groupRunId`; **migration table introduced**                                    | v1 golden trace becomes the v1 fixture |
| Events                    | additive: `input.delivered`, `memory.written`, `policyCardId` on guardrail payloads; envelope identity fields | additive only                          |
| Ids                       | E6 qualification; branded types for the id families (compile-time misuse protection)                          | one-off codemod + kit migration        |
| `EvalReport`              | new, schema-versioned (13 §8)                                                                                 | starts at v1 with fixtures             |
| PolicyCard                | new, versioned, shareable (§4.6)                                                                              | starts at v1                           |

**Compatibility policy:** additive changes never bump `formatVersion`; breaking shape changes bump it with a migration and a fixture; content ids are stable forever once shipped (`10-CODING-STANDARDS.md` §4 upheld — E6 ships with kit migration precisely because it breaks this once, deliberately, before any public release).

## 8. Acceptance

This document is "done" as a baseline when: (1) every D-register item in `12-…` maps to an E-item, a §4 design decision, or a recorded accepted risk; (2) the §2 contract is proven by porting all six starter bricks onto it with zero behaviour change (golden traces stay byte-identical apart from additive fields); (3) one roadmap brick (recommend 5.3 Monitor, smallest) is prototyped against the contract without core changes; (4) `13-…` L0–L3 suites are green on the ported engine.
