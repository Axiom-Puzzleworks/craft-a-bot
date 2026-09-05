> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward as the V1.0 baseline. The target reference design for every brick and data structure now lives in `14-BRICK-REFERENCE-DESIGNS.md`, which supersedes this document where the two differ.
> This file is a verbatim copy of `docs/design/02-AGENT-MODEL.md` carried into the standalone Day 2 set; only this banner has been added.

# 02 — The Agent Model

> What "My Very First Agent" actually is: the five bricks, Goal Cards, the agent loop, and the Playroom world — with the core TypeScript interfaces Claude Code should implement in `@craftabot/core` and `@craftabot/pack-starter`.
> Prerequisite reading: `00-PROJECT-OVERVIEW.md`, `01-ARCHITECTURE.md`.

---

## 1. The one-sentence model

An agent is a **loop** — _sense → think → act_ — where **Sense** gathers observations from a world, the **LLM** decides what to do next in pursuit of a **Goal Card**, **Actions** and **Tools** carry decisions out, and **Memory** carries context from one tick to the next.

V1 teaches exactly this and nothing more. Planners, reflection, multi-agent — later kits.

## 2. The five bricks

Every brick has a toy face and a real face. The UI always offers both: the moulded plastic brick, and a flip-side "What this really is" panel using correct terminology.

> **Amended 2026-08-12 (WP5):** `BrickDefinition` gained `realName` and `realExplanation` to carry that second face as data. It previously had only the toy `name` and a one-line `description`, so the flip side promised here and in `00-PROJECT-OVERVIEW.md` §6 had nowhere to live.
>
> Also settled while building the bench: `AgentSpec.bricks.llm.cartridgeId` may be the empty string, meaning "brick fitted, cartridge slot still empty". That is a normal halfway state the bench has to be able to save, and the existing `unknown-cartridge` build check is what holds GO back until a cartridge is in — it now words itself differently for an empty slot than for a cartridge you do not own, because the two need different fixes.

### 2.1 LLM Brick (blue) — the brain

- **Really is:** the chat-completions call at the heart of every tick.
- **Slots:** one **model cartridge** socket (which provider+model — V1: OpenAI cartridges); one **battery** socket (API key, configured once in settings, shown as a battery meter).
- **Dials (config):** Temperature ("Imagination" dial, 0–2), Max tokens per thought ("Chattiness"), Personality (a short free-text system-prompt fragment, e.g. "You are a cheerful little robot").
- **Without it:** the bot cannot run at all. GO button disabled with the message _"Your bot needs a brain! Snap on an LLM brick."_

### 2.2 Memory Brick (green) — the scrapbook

- **Really is:** conversation/loop history management — what past ticks get replayed into the next prompt.
- **V1 behaviour:** a rolling window of the last N ticks (observations, thoughts, actions, results), plus a tiny **notebook** the agent can write to via a built-in `remember` tool when the Memory brick is present.
- **Dials:** Window size ("Memory span": Goldfish 3 / Puppy 10 / Elephant 30 ticks); Notebook on/off.
- **Without it:** each tick's prompt contains only the goal and the current observation — the bot forgets everything between ticks. This is a _designed teaching moment_: the tutorial has the user run a fetch-task without Memory and watch the bot wander, then snap Memory on and watch it succeed.

### 2.3 Tools Brick (purple) — the tool belt

- **Really is:** function calling / tool use.
- **V1 tool set** (all simulator-safe, defined in `pack-starter`):
  - `calculator` — evaluate arithmetic expressions.
  - `dice` — random number/choice (teaches non-determinism vs. tool determinism).
  - `notebook_read` / `notebook_write` — the agent's persistent scratchpad (requires Memory brick's notebook enabled; the UI explains the dependency).
  - `look_up_manual` — query a tiny built-in "encyclopedia of the Playroom" (teaches retrieval: facts the model doesn't know, e.g. "the toy chest is locked by the red key").
- **Config:** individual tools toggle on/off; each tool shows its JSON schema on the flip side — this is where users first see what a tool definition really looks like.
- **Without it:** the LLM gets no tool definitions (except world actions — see 2.5); it can only think and act. Asked to compute 17×23, it will guess — another designed teaching moment.

### 2.4 Sense Brick (light blue) — eyes and ears

- **Really is:** the observation builder — what context from the environment enters the prompt each tick.
- **V1 senses** (toggles): **Sight** (what's in the bot's current and adjacent Playroom squares), **Hearing** (messages the user types into the Playroom chat bubble), **Compass** (bot's position and the room map outline), **Clock** (tick number and elapsed time).
- **Without it:** the bot is flying blind — it receives the goal but no observations. It will act, hilariously badly. (Designed teaching moment: sight off → bot bumps into walls.)
- **Teaching note:** the flip side explains that in real systems "senses" are context engineering — what you choose to put in the prompt.

> **Amended 2026-08-12 (WP2):** Clock reports **simulated** elapsed time derived from the turn count, not wall-clock time. Real elapsed time would make an otherwise deterministic world non-reproducible, breaking the replay guarantee in `08-GOVERNANCE-GUARDRAILS.md` §7.5. Relatedly, the Playroom is turn-based: its clock advances when the bot _acts_ (a wasted turn still counts), so a bot with no Actions brick sees a clock that never moves — which is honest, since nothing in the world has happened.

### 2.5 Actions Brick (red, with wheels) — hands and feet

- **Really is:** the effector set — the world-mutating counterpart of tools. Exposed to the LLM as tool calls, but distinguished in the UI and trace because they _change the world_, teaching the tools-vs-actions distinction.
- **V1 actions** (from the Playroom world definition): `move(direction)`, `pick_up(item)`, `put_down(item)`, `give(item, character)`, `open(container)`, `say(text)` (speech bubble in the Playroom), `celebrate()` (the bot's little victory dance; also how it declares the goal complete).
- **Config:** individual actions toggle on/off. Turning `pick_up` off before a fetch goal is — again — a teaching moment ("my bot can see the snack but has no hands!").
- **Without the brick:** observe-and-chat only; it can `say` nothing, do nothing. The run ends only by tick budget.

> **Amended 2026-08-12 (WP2):** `put_down` takes an optional second parameter — `put_down(item, container?)`. "Tidy the blocks" needs a way to place an item _into_ the toy chest, and inferring it from proximity is ambiguous as soon as a second container exists. Omitting `container` still means "put it on the floor where I stand". The optional parameter also gives users their first look at an optional field in a real tool JSON schema.

> **Amended 2026-08-20 (WP31 stage F):** an eighth Playroom action, `radio_send(text)`, and a fifth sense channel, **Radio** (messages other robots have sent on your own radio channel) — the Radio brick (`24-ROBOT-FRIENDS-DESIGN.md` §4.7), equipment-slot, config `channel`/`allowFrom`. Only meaningful with a second robot present (WP31's duo bench); a solo bot can fit it and simply never hears anything back. Carrying the sender's own `channel`/`allowFrom` config to the world — needed so the world can tag an outgoing message and filter an incoming one — needed one small, deliberate core addition: `BrickRuntime.contributeWorldConfig?()`, collected once per session and handed to `WorldInstance.configure?()` right after the fitted bricks are built. `AgentHandle` (`types/world.ts`) itself is untouched — its own "identity, not capability" boundary held; the new config reaches the world through a separate, brick-owned channel instead. Full reasoning and the mechanism that was ruled out first (parameterising the sense-channel id itself, which `validateSpec` rejects) are in `24-…` §8's own stage F amendment.

### 2.6 Safety Brick (yellow/black stripes) — optional in V1, foundational for purpose 2

- **Really is:** guardrails. V1 ships one Safety Brick in the box (see `08-GOVERNANCE-GUARDRAILS.md`): step budget, action blocklist, and approval mode ("ask before acting": each proposed action pauses for user approve/deny).
- Not required for a working bot — but the tutorial's final chapter introduces it, planting purpose 2 in every user's mental model from day one.

## 3. Goal Cards

A Goal Card is a laminated card slotted into the bot's card holder. It is: a **title**, a **goal statement** (injected into the system prompt), a **world binding** (which world + starting layout), and a **success condition** (a predicate evaluated by the world after each tick — _the world judges success, not the LLM_; `celebrate()` with an unmet condition = "premature celebration", shown as such and a lovely lesson in agents overclaiming success).

V1 starter cards (all set in the Playroom):

| Card                                                   | Goal text                                                  | Success condition                         | Teaches                                              |
| ------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| **Say Hello!**                                         | Introduce yourself to Teddy.                               | `say` performed within 2 squares of Teddy | The minimal loop; first GO.                          |
| **Help the teddy get a snack** _(the box-art classic)_ | Find a snack and bring it to Teddy.                        | Teddy has the snack                       | Multi-step behaviour; find → pick up → bring → give. |
| **Tidy the blocks**                                    | Put all blocks in the toy chest.                           | All blocks in chest                       | Repetition, sub-goals.                               |
| **The locked chest**                                   | The chest is locked. Get it open and tidy the blocks away. | Chest open + blocks inside                | Tool use (`look_up_manual` reveals the red key).     |
| **Sums for Teddy**                                     | Teddy wants the answer to 17 × 23 (then harder).           | Correct answer said                       | Why tools beat guessing.                             |
| **Free play**                                          | (User writes their own goal text.)                         | Manual — user clicks "Goal achieved"      | Prompting a goal well.                               |

Card definition interface: `GoalCardDefinition { id, title, goalText, worldId, layoutId, successCondition: WorldPredicateId, hints: string[], teachesConcepts: ConceptTag[], par?: number, expert?: boolean }`.

> **Amended 2026-08-13 (WP11):** the starter set is now **seven** cards, and every card with a machine-checkable goal declares a `par`.
>
> - **Tidy the blocks** is two blocks, both on the chest's side of the room (par 10); **The locked chest** is one block out, two already inside, and the key inboard by the table (par 13). Both were unwinnable inside the 30-turn platform floor — about 34 and 45 turns respectively — so no bot could ever finish them and nothing on the card said so (`12-…` C6). `16-…` §1.1 re-scoped them rather than raising the floor, because the floor is the governance teaching point.
> - **The locked chest — expert** (`starter/locked-chest-expert`) preserves V1.0's layout exactly, carries `expert: true`, and says on its face that it needs a bigger step budget. Measured par is **36**, not the ~45 `12-…` estimated by hand: the scripted solution in `solvability.test.ts` is tighter than the estimate, and par is defined as the length of the solution we can actually prove.
> - `par` is optional and additive, so every pack written before it still validates; Free Play has none, because nobody but the player knows when it is finished.
> - **Free play's success condition is no longer manual-only.** `celebrate` now ends a free-play run as SUCCESS (E12, `14-…` §3) — on that one card the bot's own judgement is all there is. The player's "Goal achieved" button arrives with `session.declareOutcome` (E2, WP13); the two are meant to coexist, bot-declared and human-declared endings, both traced.

> **Amended 2026-08-12 (WP5):** `AgentSpec` gained an optional `customGoalText`. The Free Play card is "a laminated card with a marker pen" the user writes their own goal on (`03-UI-UX-DESIGN.md` §4.5), and the spec previously had nowhere to keep that text. Optional, so every kit file written before it existed still validates; cards with a fixed goal ignore it.

## 4. The Playroom (V1 world)

> **Amended 2026-09-05 (WP53 stage A, `43-DESK-WORLDS.md` §4.1):** a world is no longer a grid by definition. `WorldDefinition` gained `view?: 'grid' | 'desk'` (absent means `'grid'`, every world written before), and `types/desk-world.ts` gives a business world its own drawable vocabulary — `DeskWorldState`: a transcript, the records the world has revealed, a queue, alerts — beside `GridWorldState`'s room. A host draws whichever shape the `world.changed` payload has (`isDeskWorldState`/`isGridWorldState`). **No event changed:** a Desk's first frame and every frame after it are the same `world.changed` a room's are, and §7's catalogue is untouched. The first desk is `workshop/the-desk`, the Front Desk, in the Workshop pack.

A deliberately small, warm, readable grid world — the nursery-room floor from the box art.

- **Space:** 8×6 grid of floor tiles (rug). Some cells hold furniture (toy chest, shelf, table), items (snack, blocks ×3, red key, ball), and characters (Teddy; the Bot itself).
- **Physics:** turn-based; one action per tick; bot moves orthogonally; can carry **one item at a time** (a constraint that creates real planning pressure); containers can be open/closed/locked; `give` requires adjacency.
- **Observation model:** what Sense reports is computed _by the world_ from the bot's position (sight radius 1, i.e. current + 8 neighbours; Compass gives the wall outline and landmark directions, not item locations — so the bot must explore).
- **Determinism:** the world is fully deterministic given the action sequence (all randomness lives in the `dice` tool). Vital for purpose 2 — reproducible runs make guardrail and evaluation testing meaningful.
- **Rendering:** the UI draws it as a cosy isometric-ish flat illustration consistent with the box art; world state → pure render, no game engine.

`WorldDefinition` keeps the Playroom just one instance of a general interface, so future worlds (Workshop, Space Station…) are packs:

```ts
export interface WorldDefinition {
	id: string; // "starter/playroom"
	name: string;
	layouts: WorldLayout[]; // named starting arrangements
	actions: WorldActionDefinition[]; // schema per action (JSON-schema params)
	senses: WorldSenseDefinition[]; // what each sense channel yields
	predicates: Record<WorldPredicateId, string>; // success conditions (evaluated internally)
	create(layoutId: string): WorldInstance;
}

export interface WorldInstance {
	snapshot(): WorldState; // serialisable, for trace + rendering
	observe(channels: SenseChannelId[]): Observation;
	perform(action: ActionCall): ActionResult; // validates, mutates, narrates
	test(predicate: WorldPredicateId): boolean;
	reset(): void;
	receiveInput?(text: string): void; // see amendment below
}
```

> **Amended 2026-08-12 (WP2):** `WorldInstance` gained the optional `receiveInput(text)` method. The Hearing sense channel (§2.4) is defined as "messages the user types into the Playroom chat bubble", but the interface previously had no way for those messages to enter the world — leaving the UI to mutate world state directly, which `05-TECH-STACK.md` §4 forbids. It is optional, so worlds the user cannot talk to simply omit it.
>
> Two Playroom rules that §4 left open, settled in WP2 and recorded here because the Goal Cards depend on them: **reach equals sight** — the bot can pick up, put down, open, and give within Chebyshev distance 1 (its own square plus the eight around it), so there is one distance rule to learn rather than three; and the **"within 2 squares of Teddy"** greeting condition (§3) uses that same Chebyshev metric.

## 5. The agent loop (the engine's heart)

One **tick** = one journey around the loop. Pseudocode of `AgentSession.tick()`:

```
1. SENSE    observation = world.observe(enabled sense channels)        → event: sense
2. COMPOSE  prompt = system(personality + goal + brick manifest)
                   + memory window (if Memory brick)
                   + observation                                        → event: prompt.composed
3. GUARD    pre-think guardrails (budgets)                              → event: guardrail.checked / .tripped
4. THINK    response = provider.chat(prompt, toolDefs)                  → events: think.started / .token / .completed
5. DECIDE   parse response → thought text + zero or one tool/action call → event: decision
6. GUARD    pre-act guardrails (blocklist, approval mode — may pause)   → event: guardrail.checked / .tripped / approval.*
7. ACT      tool → execute locally; action → world.perform(...)         → event: tool.executed | action.performed
8. REMEMBER append tick record to memory (if Memory brick)              → event: memory.updated
9. JUDGE    if world.test(successCondition) → SUCCESS
            else if tick budget exhausted → OUT_OF_STEPS                → event: tick.completed | run.finished
```

> **Amended 2026-08-20 (WP30's If/Then sizing, stage A, `§7`'s own amendment carries the full close-out):** a fitted brick may pre-empt steps 2–5 entirely. Right after step 1, the loop asks every fitted brick's own `contributeReflex` for a call to try instead of thinking; if one fires, COMPOSE/THINK/DECIDE are skipped outright — no prompt composed, no model called — and the loop rejoins at step 6 with the reflex's own proposal, still through the exact same `pre-act` guardrail chain a brain-driven call gets. Step 3's guardrails still run for a reflex tick too, just without a preceding COMPOSE. The rest of the loop (6–9) is unchanged either way; `decision.source` says which path a given tick took.

Loop rules:

- **One decision per tick.** The LLM may call at most one tool/action per tick in V1 (chattier but far more legible for learners; parallel calls are an Agent Builder concept).
- **Run modes:** `step` (one tick per GO press — the default in the tutorial) and `play` (continuous with an adjustable tick delay so humans can watch).
- **Budgets:** every run has a tick budget (default 30) and a token budget; both surfaced as friendly meters ("battery level").
- **Failure is a first-class outcome:** `SUCCESS`, `OUT_OF_STEPS`, `STOPPED_BY_USER`, `STOPPED_BY_GUARDRAIL`, `ERROR` — each with its own friendly end-card and a "What happened?" link straight into the trace.

## 6. Core interfaces (implementation contract)

```ts
// ── The assembled agent (what the workbench edits, what a kit file stores) ──
export interface AgentSpec {
	id: string; // uuid
	name: string; // "Snackbot 3000"
	bricks: {
		llm?: { cartridgeId: string; temperature: number; maxTokens: number; personality: string };
		memory?: { windowSize: 3 | 10 | 30; notebook: boolean };
		tools?: { enabled: ToolId[] };
		sense?: { channels: SenseChannelId[] };
		actions?: { enabled: ActionId[] };
		safety?: { maxTicks: number; blockedActions: ActionId[]; approvalMode: boolean };
	};
	goalCardId: string;
	createdAt: string;
	updatedAt: string;
	schemaVersion: 1;
}

// ── The runtime ──
export interface AgentSession {
	readonly spec: AgentSpec;
	readonly status: 'idle' | 'running' | 'paused' | 'awaiting-approval' | 'finished';
	readonly events: EventBus; // subscribe from UI / trace / guardrails
	start(mode: 'step' | 'play'): void;
	step(): Promise<TickResult>;
	setTickDelayMs(ms: number): void; // the play-mode gap, changeable mid-run
	pause(): void;
	resolveApproval(approved: boolean): void;
	stop(reason?: string): void;
}

> **Amended 2026-08-14 (WP16 slice d):** `setTickDelayMs` added. The play-mode delay was captured when the session was built, so the Playroom's speed dial was a silent no-op mid-run (`12-…` D15) and the only honest way to apply a change was to rebuild the session and throw the trace away. The loop now reads the value each time round.
>
> **Deliberately not an event, and deliberately not in the trace.** Hard rule 3 covers what the UI shows about *engine behaviour*; the tick gap changes no decision, no world state and no outcome. It is how fast a human watches. `run.started` records budgets, provider and model precisely because those constrain what the agent did — the viewing speed does not, and recording it would put a UI preference in an audit record.

export function createSession(deps: {
	spec: AgentSpec;
	registry: PackRegistry; // resolves cartridge/world/tool/card IDs
	provider: LLMProvider; // from 06-LLM-PROVIDERS.md
	guardrails: Guardrail[]; // from 08-GOVERNANCE-GUARDRAILS.md
}): AgentSession;
```

Validation: `validateSpec(spec, registry)` returns structured problems (`missing-brain`, `tool-needs-notebook`, `unknown-cartridge`…) that the UI renders as friendly build-checks _before_ GO is enabled.

> **Amended 2026-08-13 (WP14 slice 3d):** every one of those checks is now generic — none of them names a brick. Core resolves the ids the fitted bricks *offer* (`contributeCalls`, `contributeSenses`), reads the cartridge and notebook through slot contracts, and asks each kind about anything else via `validateConfig`. A brick from a pack core has never seen is validated exactly as thoroughly as `starter/tools` is, which it previously was not at all (`14-…` §2.1).
>
> A problem now points at a `slot` (`brain`, `equipment`, …) rather than at `brick` (V1's `llm`, `tools`, …). The old field is kept parseable so stored validation results still load; nothing writes it.

## 7. Event catalogue (the observability spine)

> **Amended 2026-09-02 (WP41, `26-TARGET-DESIGN-V3.md` §6.6):** `run.started` gains an optional `egress: { mode: 'declared' | 'none', hosts: string[] }` — the mode the host named and every host pattern a fitted component declared — written only once the host names a mode, so every trace written before it, the golden traces among them, keeps its bytes. `error.kind` has two spoken-for values: `'engine'` and `'egress-refused'`, the latter emitted by the session's `fetch` guard *before* the rejection reaches the caller, so a refusal is on the trace even when a client swallows it; the run's own terminal error is not written a second time for the same refusal.

All events share `{ id, runId, tick, timestamp, type, payload }`, strictly typed per `type`. V1 catalogue:

`run.started` · `run.finished` · `tick.started` · `tick.completed` · `sense` · `prompt.composed` (full messages + token estimate) · `think.started` · `think.token` (streaming deltas) · `think.completed` (raw response, usage) · `decision` (thought + parsed call + source) · `tool.executed` (args, result, duration) · `action.performed` (args, world narration, world-state diff) · `memory.updated` · `brick.state` (slot, kind, opaque state) · `guardrail.external` (a hosted guardrail's own network call) · `guardrail.checked` · `guardrail.tripped` · `approval.requested` · `approval.resolved` · `world.changed` · `error`

> **Amended 2026-08-13 (WP13):** the catalogue gains one event and one payload field, both additive (E2, `14-…` §3).
>
> - **`input.delivered`** `{ text, heard }` — something said to the bot from outside the world, via `session.deliverInput()`. The Hearing sense could always report messages and there was no way to send one (`12-…` D2). `heard` is false when the world implements no `receiveInput`, so the trace says plainly that the message went nowhere rather than implying it landed. It is traced because untrusted input from outside the simulation is the first link in the injection chain (`19-…` §2), and "who told it that?" is an audit question.
> - **`run.finished.reason?`** — why the run ended, when the outcome alone does not say. A goal met by the world's predicate and a goal declared finished by a person are both `SUCCESS`; `session.declareOutcome(outcome, reason)` records which.

> **Amended 2026-08-14 (WP15, E7):** one payload field, additive.
>
> - **`run.started.strategies?`** `{ memory, prompt }` — the ids of the strategies that assembled this run's context (`window-v1` + `sections-v1` by default). The trace could already show *what* went to the model, message by message, and had no way to say what **rule** produced it. "Was this run in realism mode?" is a governance question, because two runs of the same bot under the same budgets can decide differently when their context was shaped differently, and reverse-engineering the answer from the message shapes is a guess rather than an audit.
> - Optional, so every trace written before WP15 still parses; absent means the only pairing that was then available. No `formatVersion` bump and no migration entry — an unrecorded field on old traces is honestly unrecorded.
> - `ChatMessage` also gains **`toolCalls?`**, the assistant half of the tool protocol, which `transcript-v1` writes and `sections-v1` never does. It is carried verbatim into `prompt.composed` like the rest of the message, so the realism mode needs no event of its own.

> **Amended 2026-08-16 (WP22):** one payload field, additive, on two events.
>
> - **`guardrail.checked.policyCardId?`** and **`guardrail.tripped.policyCardId?`** — which policy card (`14-…` §4.6) a guardrail was compiled from, when it was compiled from one. A hand-written guardrail (the Safety Brick's own four, a Monitor's rules) has none and the field is simply absent, so every trace written before WP22 still parses. Set on the `Guardrail` itself by `@craftabot/governance`'s `compilePolicyCard` and copied through by the engine — not derived by parsing `guardrailId` for a naming convention, which is how E6's own bare-id ambiguity got introduced the first time.

> **Amended 2026-08-19 (WP29 stage C, `23-MULTI-AGENT-DESIGN.md` §4.6):** two new events, both group-altitude — `runId` on each is the **group's** run id, and neither carries `agentId` (already-optional on the envelope). No existing event or field changes; every solo trace parses exactly as before.
>
> - **`group.started`** `{ groupRunId, memberRunIds, memberAgentIds, goalCardId, scheduler: 'round-robin', budgets: { groupMaxTokens?, maxRounds? } }` — a `SessionGroup`'s one-time opening fact: who is in it, what each member's own `runId` is (so the group's line in the merged stream can be joined to every member's own trace), and under what scheduling and budget rules. Always the first event on a group's merged stream.
> - **`group.finished`** `{ outcome, reason?, rounds, usage }` — how the group ended: `outcome` is derived from every member's own outcome (`SUCCESS` only if all members reached it; a stop or error on any member propagates), `usage` is the group's running token total (summed from each member's own `think.completed` events, the same mechanism the group-token-budget guardrail reads), `rounds` counts scheduler rounds, not per-member ticks. Always the last event on a group's merged stream — every member's own `run.finished` still lands on that member's own trace first.
>
> A group's merged stream is the union of these two events with every member session's own unmodified event stream (each still opening `run.started` and closing `run.finished`, per §4.7 of `23-…`); nothing about a member's own trace changes when it runs inside a group instead of solo.

> **Amended 2026-08-20 (WP30 stage C):** one new event, additive, plus one new `BrickRuntime` hook it comes from (`14-…` §2.1's own contract, `types/brick.ts`).
>
> - **`brick.state`** `{ slot, kind, state }` — a fitted brick's own live state, reported once per tick for the bricks that have anything new to say. `state` is opaque to core, the same "core owns the pipe, the pack owns the shape" stance `contributeWorldConfig`'s bag already takes. Unlike `memory.updated`, which core has always emitted directly because Memory is a concept core itself owns, a pack-contributed brick's internal state (the Planner's plan and checklist, `14-…` §5.1) lives entirely in a closure core cannot see into — `contributeState?(): unknown` on `BrickRuntime` is the door such a brick uses to put it on the trace anyway, called once per tick right after `onTickEnd`, additive and opt-in like every hook beside it.
> - Why not read `tool.executed` instead, for a brick like the Planner whose state changes through its own tool calls? Because a tool's `execute()` is stateless and pack-wide — it validates shape, not a specific bot's config (`maxSteps`, an in-range check-off index) — so `tool.executed.data` can legitimately disagree with what the brick actually did with a call (a plan trimmed to `maxSteps`, an out-of-range check-off silently ignored). `contributeState` reports the brick's own authoritative belief instead, the same one `contributeContext`'s prompt text already carries, just structured.
> - No `formatVersion` bump: every trace written before WP30 simply never contains a `brick.state` event, which is honestly true of them.

> **Amended 2026-08-20 (WP30's If/Then sizing, stage A):** one payload field, additive, plus one new `BrickRuntime` hook and a genuine branch in the loop itself (§5's own step list, above) — the first hook that changes *whether* steps 2–5 run this tick, not merely what they see.
>
> - **`decision.source?`** `'brain' | 'reflex'` — where this tick's call came from. Optional, so every trace written before this WP still parses; absent there means exactly what it always meant, a brain-driven tick, since nothing could propose the other kind until now.
> - **`contributeReflex?(context): ReflexProposal | undefined`** on `BrickRuntime` (`14-…` §2.1) — a fitted brick may propose a call right after SENSE, before the brain is ever asked. A firing reflex skips COMPOSE/THINK/DECIDE entirely: no `prompt.composed`, no `think.*` events, genuinely zero tokens and zero latency, which is the actual point (`14-…` §5.2's own "reflex/short-circuit… latency & cost lesson" — a soft nudge folded into `contributeContext`'s prose would still call the brain every tick and could not teach this).
> - **Still governed, not a way around governance.** A firing reflex is checked against `pre-think` guardrails exactly as a brain-driven tick is (a `stop-run` policy card's deadline applies to every tick, or a rule becomes a way past it), and its proposed call still goes through `pre-act` guardrails before it runs, same as any other. Token budget is the one check skipped for a reflex, deliberately: it spends no tokens, so gating a free action on a spend limit would refuse it for a resource it never touches. `contributeReflex` decides *what to try*; the guardrail chain still decides *whether it is allowed* — that division never moves.

> **Amended 2026-09-01 (WP35 stage B, `25-ARMOUR-BRICK.md` §4.7):** one new event, plus one new optional `Guardrail` method it comes from (`14-…` §3's own contract).
>
> - **`guardrail.external`** `{ guardrailId, hook, service: 'model-armor', endpoint, template, latencyMs, charsScreened, outcome, filters? }` — a hosted guardrail's own record of the network call it made, emitted by core immediately before the matching `guardrail.checked`. Never the token, never the screened text — host, method, template, timing, and which filters ran and matched, the same "say what left the browser, never what was in it" discipline the rest of the trace already holds to. `service` is a single literal today because the Armour Brick is the first hosted guardrail; a second one widens it rather than adding a parallel event.
> - **`checkWithRecord?(ctx): Promise<{ verdict, external? }>`** on `Guardrail` (`14-…` §3) — the hosted alternative to `check`. Optional and additive: every guardrail written before WP35 only implements `check` and keeps working exactly as before; `runGuardrailChain` prefers `checkWithRecord` when present and hands its `external` to the session, which is what emits the event above — the guardrail itself never emits anything, staying pure per `08-…` §2.

Rules: events are **append-only facts**; payloads are JSON-serialisable; the trace is simply the ordered event list of a run (persisted per `07-DATA-MODEL-PERSISTENCE.md`); _anything_ the UI shows about a run must be derivable from events — if it isn't in an event, it didn't happen.

## 8. Prompting (V1 canonical prompt)

The composed prompt is assembled from labelled sections, in this order, and shown verbatim in the trace (`prompt.composed`):

1. **System:** fixed engine preamble ("You are a small robot in a simulated playroom…"), the LLM brick's personality line, the Goal Card text, an explicit statement of which bricks/abilities are present, and response rules (think briefly, then at most one call; use `celebrate` only when the goal is truly done).
2. **Memory window** (if present): summarised prior ticks, oldest first.
3. **Current observation:** the Sense output, formatted as plain readable text (not raw JSON), because users will read it in the trace.

Tools and actions are passed via the provider's native tool-calling API — never prompt-stuffed — so users learn the real mechanism. The full JSON of every request is one click away in the trace.

> **Amended 2026-08-14 (WP15, E7):** the three sections above are now **one strategy of two**, named `sections-v1`, and still the default for every kit build — byte-for-byte what shipped before the seam existed, which the golden trace proves.
>
> The Memory brick's `strategy` dial selects the pairing. `transcript` swaps the prose history for the **real function-calling conversation**: a `user` turn per remembered tick, an `assistant` turn carrying the `toolCalls` it made, and a `tool` message answering that call by id. `ChatMessage` has supported `role:'tool'` and `toolCallId` since WP2 and nothing ever wrote one (`12-…` D12).
>
> Three points that are decisions rather than details:
>
> - **The system message and the current observation are shared.** Both strategies compose them identically, because they are not history — swapping the strategy must change the *form* the bot is told in and never *what it knows*, or a comparison between the two is measuring the wrong thing.
> - **A refused call is answered as a tool result.** Where a guardrail or a person stopped a call, the transcript still carries the assistant's call and answers it with the refusal — which is both the only well-formed rendering and the pattern every real agent platform uses for a denied tool.
> - **Well-formedness is the contract, not a nicety.** A provider returns 400 for a `tool` message answering nothing and for a call nothing answers. It is held as an invariant over prompts real runs composed, in both directions, including the two easy-to-miss turns (a refusal, and a tick the bot mumbled through).
>
> `window` stays the only option the kit bench offers: a child reading the Flight Recorder should meet a paragraph saying what the bot remembers. `transcript` is the Workshop's realism mode.

## 9. Teaching arc (how the bricks tell the story)

> **Amended 2026-08-12 (WP9):** building the leaflet turned up three things worth recording.
>
> **The Actions brick did not gate anything.** `performCall` sent every proposed action straight to `world.perform`, so a bot with no Actions brick could still move, speak and pick things up. The brick was decorative and chapter 1 ("bot thinks but can't act") was impossible to demonstrate. The engine now refuses an action the world defines but the bot was not built with — in character, as a wasted turn — while a name the world has never heard of still goes to the world, as `08` §3 describes. Relatedly, the workbench's default Actions brick granted only `move`, `say`, `celebrate`, which left most Goal Cards unreachable once the gate was real; fitting the brick now grants all seven actions and the checkboxes take them away.
>
> **Two Goal Cards cannot be completed inside the tick budget.** "Tidy the blocks" needs roughly 34 turns and "The locked chest" roughly 45 (open the chest _and_ carry three blocks to it, from opposite corners of an 8×6 grid with orthogonal movement only), against an engine floor of 30. Neither is winnable by any route, by any model. Chapter 5 therefore completes on the _retrieval_ moment it teaches — the bot using `look_up_manual` — rather than on the card being won. The cards themselves need a decision: shorten the goals, move the blocks, or raise the budget. Recorded here rather than quietly worked around.
>
> **The failure in each pair must be scripted.** The keyless demo brain now reads the spec and picks a "before" or "after" run per chapter, so the bot genuinely guesses the wrong answer without a calculator and genuinely loops without memory. Chapter progress keys off _turns watched_ rather than a finished run, because a failing bot has no early exit and would otherwise make the reader sit through the whole budget.

The instruction-leaflet tutorial builds concepts in this order — each step is a designed failure→fix pair, and the V1 UI/onboarding (`03-UI-UX-DESIGN.md`) follows it:

1. Brain only + "Say Hello!" → _what a loop is_ (bot thinks but can't act; add Actions).
2. Add Sense → _observations_ (blind vs sighted bot).
3. Snack goal without Memory → _why memory matters_ (wandering bot); add Memory.
4. "Sums for Teddy" without Tools → _hallucination_; add calculator.
5. "The locked chest" → _retrieval_ (`look_up_manual`).
6. Add Safety Brick, approval mode on → _governance exists_ (purpose 2 seed).
7. Turn the dials → _sampling and context_ (temperature, reply length, personality, memory span, notebook).

> **Amended 2026-08-14 (WP17 §2.2):** a seventh chapter. The six above teach the bricks and never the *settings* — a child can set a temperature, a reply length, a personality, a memory span and a notebook, and the arc went from "fit the brick" straight to "run it". The settings that most change how an agent behaves were the ones with no lesson attached, which `16-…` §2.2 records as the leaflet review's clearest gap. `coverage.test.ts` now holds every configurable field to being claimed by some chapter, so a brick that grows a field fails until somebody decides where it is taught.
>
> **Amended 2026-08-16 (WP25):** three governance scenarios (`19-…` #11/#12/#35) sit *beside* the arc above, not inside it — reached as side quests from the leaflet's badge sheet rather than a numbered eighth step. Each is a real goal card (`starter/warning-sign`, `starter/keep-the-secret`, and the existing `starter/tidy-the-blocks` reused for the approval-fatigue case) with its own scripted proof in `governance-scenarios.test.ts`. Deliberately optional and unordered: unlike the seven chapters, none of the three depends on the others, and the numbered arc's job is to be finished, not to grow every time a new scenario ships.
>
> **Amended 2026-08-20 (WP31 stage G):** a fourth side quest joins the three above — `starter/party-line` (ASI07, OWASP's "Insecure Inter-Agent Communication"), a `coop` card reached through Robot Friends rather than the solo bench. It reuses `keep-the-secret`'s exact trifecta (same layout, same `hello-said-secret-kept` predicate, the same `no-secrets-out-loud` policy card) and changes only the request's delivery: a message claiming a false identity on the Hearing channel, rather than a sign in the manual, asks for the cupboard code — contrasted, in the trace, against the real teammate's own honestly-attributed Radio message. Proven in `session/party-line.test.ts` over a real two-seat `SessionGroup`, since the contrast this one needs (claimed identity versus the engine's own attribution) has no solo form. Full reasoning in `24-…` §8's own stage G amendment.
