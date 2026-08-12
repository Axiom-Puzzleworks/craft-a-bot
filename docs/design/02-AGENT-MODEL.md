# 02 — The Agent Model

> What "My Very First Agent" actually is: the five bricks, Goal Cards, the agent loop, and the Playroom world — with the core TypeScript interfaces Claude Code should implement in `@craftabot/core` and `@craftabot/pack-starter`.
> Prerequisite reading: `00-PROJECT-OVERVIEW.md`, `01-ARCHITECTURE.md`.

---

## 1. The one-sentence model

An agent is a **loop** — *sense → think → act* — where **Sense** gathers observations from a world, the **LLM** decides what to do next in pursuit of a **Goal Card**, **Actions** and **Tools** carry decisions out, and **Memory** carries context from one tick to the next.

V1 teaches exactly this and nothing more. Planners, reflection, multi-agent — later kits.

## 2. The five bricks

Every brick has a toy face and a real face. The UI always offers both: the moulded plastic brick, and a flip-side "What this really is" panel using correct terminology.

### 2.1 LLM Brick (blue) — the brain

- **Really is:** the chat-completions call at the heart of every tick.
- **Slots:** one **model cartridge** socket (which provider+model — V1: OpenAI cartridges); one **battery** socket (API key, configured once in settings, shown as a battery meter).
- **Dials (config):** Temperature ("Imagination" dial, 0–2), Max tokens per thought ("Chattiness"), Personality (a short free-text system-prompt fragment, e.g. "You are a cheerful little robot").
- **Without it:** the bot cannot run at all. GO button disabled with the message *"Your bot needs a brain! Snap on an LLM brick."*

### 2.2 Memory Brick (green) — the scrapbook

- **Really is:** conversation/loop history management — what past ticks get replayed into the next prompt.
- **V1 behaviour:** a rolling window of the last N ticks (observations, thoughts, actions, results), plus a tiny **notebook** the agent can write to via a built-in `remember` tool when the Memory brick is present.
- **Dials:** Window size ("Memory span": Goldfish 3 / Puppy 10 / Elephant 30 ticks); Notebook on/off.
- **Without it:** each tick's prompt contains only the goal and the current observation — the bot forgets everything between ticks. This is a *designed teaching moment*: the tutorial has the user run a fetch-task without Memory and watch the bot wander, then snap Memory on and watch it succeed.

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

> **Amended 2026-08-12 (WP2):** Clock reports **simulated** elapsed time derived from the turn count, not wall-clock time. Real elapsed time would make an otherwise deterministic world non-reproducible, breaking the replay guarantee in `08-GOVERNANCE-GUARDRAILS.md` §7.5. Relatedly, the Playroom is turn-based: its clock advances when the bot *acts* (a wasted turn still counts), so a bot with no Actions brick sees a clock that never moves — which is honest, since nothing in the world has happened.

### 2.5 Actions Brick (red, with wheels) — hands and feet

- **Really is:** the effector set — the world-mutating counterpart of tools. Exposed to the LLM as tool calls, but distinguished in the UI and trace because they *change the world*, teaching the tools-vs-actions distinction.
- **V1 actions** (from the Playroom world definition): `move(direction)`, `pick_up(item)`, `put_down(item)`, `give(item, character)`, `open(container)`, `say(text)` (speech bubble in the Playroom), `celebrate()` (the bot's little victory dance; also how it declares the goal complete).
- **Config:** individual actions toggle on/off. Turning `pick_up` off before a fetch goal is — again — a teaching moment ("my bot can see the snack but has no hands!").
- **Without the brick:** observe-and-chat only; it can `say` nothing, do nothing. The run ends only by tick budget.

> **Amended 2026-08-12 (WP2):** `put_down` takes an optional second parameter — `put_down(item, container?)`. "Tidy the blocks" needs a way to place an item *into* the toy chest, and inferring it from proximity is ambiguous as soon as a second container exists. Omitting `container` still means "put it on the floor where I stand". The optional parameter also gives users their first look at an optional field in a real tool JSON schema.

### 2.6 Safety Brick (yellow/black stripes) — optional in V1, foundational for purpose 2

- **Really is:** guardrails. V1 ships one Safety Brick in the box (see `08-GOVERNANCE-GUARDRAILS.md`): step budget, action blocklist, and approval mode ("ask before acting": each proposed action pauses for user approve/deny).
- Not required for a working bot — but the tutorial's final chapter introduces it, planting purpose 2 in every user's mental model from day one.

## 3. Goal Cards

A Goal Card is a laminated card slotted into the bot's card holder. It is: a **title**, a **goal statement** (injected into the system prompt), a **world binding** (which world + starting layout), and a **success condition** (a predicate evaluated by the world after each tick — *the world judges success, not the LLM*; `celebrate()` with an unmet condition = "premature celebration", shown as such and a lovely lesson in agents overclaiming success).

V1 starter cards (all set in the Playroom):

| Card | Goal text | Success condition | Teaches |
|---|---|---|---|
| **Say Hello!** | Introduce yourself to Teddy. | `say` performed within 2 squares of Teddy | The minimal loop; first GO. |
| **Help the teddy get a snack** *(the box-art classic)* | Find a snack and bring it to Teddy. | Teddy has the snack | Multi-step behaviour; find → pick up → bring → give. |
| **Tidy the blocks** | Put all blocks in the toy chest. | All blocks in chest | Repetition, sub-goals. |
| **The locked chest** | The chest is locked. Get it open and tidy the blocks away. | Chest open + blocks inside | Tool use (`look_up_manual` reveals the red key). |
| **Sums for Teddy** | Teddy wants the answer to 17 × 23 (then harder). | Correct answer said | Why tools beat guessing. |
| **Free play** | (User writes their own goal text.) | Manual — user clicks "Goal achieved" | Prompting a goal well. |

Card definition interface: `GoalCardDefinition { id, title, goalText, worldId, layoutId, successCondition: WorldPredicateId, hints: string[], teachesConcepts: ConceptTag[] }`.

## 4. The Playroom (V1 world)

A deliberately small, warm, readable grid world — the nursery-room floor from the box art.

- **Space:** 8×6 grid of floor tiles (rug). Some cells hold furniture (toy chest, shelf, table), items (snack, blocks ×3, red key, ball), and characters (Teddy; the Bot itself).
- **Physics:** turn-based; one action per tick; bot moves orthogonally; can carry **one item at a time** (a constraint that creates real planning pressure); containers can be open/closed/locked; `give` requires adjacency.
- **Observation model:** what Sense reports is computed *by the world* from the bot's position (sight radius 1, i.e. current + 8 neighbours; Compass gives the wall outline and landmark directions, not item locations — so the bot must explore).
- **Determinism:** the world is fully deterministic given the action sequence (all randomness lives in the `dice` tool). Vital for purpose 2 — reproducible runs make guardrail and evaluation testing meaningful.
- **Rendering:** the UI draws it as a cosy isometric-ish flat illustration consistent with the box art; world state → pure render, no game engine.

`WorldDefinition` keeps the Playroom just one instance of a general interface, so future worlds (Workshop, Space Station…) are packs:

```ts
export interface WorldDefinition {
  id: string;                                  // "starter/playroom"
  name: string;
  layouts: WorldLayout[];                      // named starting arrangements
  actions: WorldActionDefinition[];            // schema per action (JSON-schema params)
  senses: WorldSenseDefinition[];              // what each sense channel yields
  predicates: Record<WorldPredicateId, string>;// success conditions (evaluated internally)
  create(layoutId: string): WorldInstance;
}

export interface WorldInstance {
  snapshot(): WorldState;                       // serialisable, for trace + rendering
  observe(channels: SenseChannelId[]): Observation;
  perform(action: ActionCall): ActionResult;    // validates, mutates, narrates
  test(predicate: WorldPredicateId): boolean;
  reset(): void;
  receiveInput?(text: string): void;            // see amendment below
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

Loop rules:

- **One decision per tick.** The LLM may call at most one tool/action per tick in V1 (chattier but far more legible for learners; parallel calls are an Agent Builder concept).
- **Run modes:** `step` (one tick per GO press — the default in the tutorial) and `play` (continuous with an adjustable tick delay so humans can watch).
- **Budgets:** every run has a tick budget (default 30) and a token budget; both surfaced as friendly meters ("battery level").
- **Failure is a first-class outcome:** `SUCCESS`, `OUT_OF_STEPS`, `STOPPED_BY_USER`, `STOPPED_BY_GUARDRAIL`, `ERROR` — each with its own friendly end-card and a "What happened?" link straight into the trace.

## 6. Core interfaces (implementation contract)

```ts
// ── The assembled agent (what the workbench edits, what a kit file stores) ──
export interface AgentSpec {
  id: string;                       // uuid
  name: string;                     // "Snackbot 3000"
  bricks: {
    llm?:    { cartridgeId: string; temperature: number; maxTokens: number; personality: string };
    memory?: { windowSize: 3 | 10 | 30; notebook: boolean };
    tools?:  { enabled: ToolId[] };
    sense?:  { channels: SenseChannelId[] };
    actions?:{ enabled: ActionId[] };
    safety?: { maxTicks: number; blockedActions: ActionId[]; approvalMode: boolean };
  };
  goalCardId: string;
  createdAt: string; updatedAt: string;
  schemaVersion: 1;
}

// ── The runtime ──
export interface AgentSession {
  readonly spec: AgentSpec;
  readonly status: 'idle' | 'running' | 'paused' | 'awaiting-approval' | 'finished';
  readonly events: EventBus;                    // subscribe from UI / trace / guardrails
  start(mode: 'step' | 'play'): void;
  step(): Promise<TickResult>;
  pause(): void;
  resolveApproval(approved: boolean): void;
  stop(reason?: string): void;
}

export function createSession(deps: {
  spec: AgentSpec;
  registry: PackRegistry;                       // resolves cartridge/world/tool/card IDs
  provider: LLMProvider;                        // from 06-LLM-PROVIDERS.md
  guardrails: Guardrail[];                      // from 08-GOVERNANCE-GUARDRAILS.md
}): AgentSession;
```

Validation: `validateSpec(spec, registry)` returns structured problems (`missing-brain`, `tool-needs-notebook`, `unknown-cartridge`…) that the UI renders as friendly build-checks *before* GO is enabled.

## 7. Event catalogue (the observability spine)

All events share `{ id, runId, tick, timestamp, type, payload }`, strictly typed per `type`. V1 catalogue:

`run.started` · `run.finished` · `tick.started` · `tick.completed` · `sense` · `prompt.composed` (full messages + token estimate) · `think.started` · `think.token` (streaming deltas) · `think.completed` (raw response, usage) · `decision` (thought + parsed call) · `tool.executed` (args, result, duration) · `action.performed` (args, world narration, world-state diff) · `memory.updated` · `guardrail.checked` · `guardrail.tripped` · `approval.requested` · `approval.resolved` · `world.changed` · `error`

Rules: events are **append-only facts**; payloads are JSON-serialisable; the trace is simply the ordered event list of a run (persisted per `07-DATA-MODEL-PERSISTENCE.md`); *anything* the UI shows about a run must be derivable from events — if it isn't in an event, it didn't happen.

## 8. Prompting (V1 canonical prompt)

The composed prompt is assembled from labelled sections, in this order, and shown verbatim in the trace (`prompt.composed`):

1. **System:** fixed engine preamble ("You are a small robot in a simulated playroom…"), the LLM brick's personality line, the Goal Card text, an explicit statement of which bricks/abilities are present, and response rules (think briefly, then at most one call; use `celebrate` only when the goal is truly done).
2. **Memory window** (if present): summarised prior ticks, oldest first.
3. **Current observation:** the Sense output, formatted as plain readable text (not raw JSON), because users will read it in the trace.

Tools and actions are passed via the provider's native tool-calling API — never prompt-stuffed — so users learn the real mechanism. The full JSON of every request is one click away in the trace.

## 9. Teaching arc (how the bricks tell the story)

The instruction-leaflet tutorial builds concepts in this order — each step is a designed failure→fix pair, and the V1 UI/onboarding (`03-UI-UX-DESIGN.md`) follows it:

1. Brain only + "Say Hello!" → *what a loop is* (bot thinks but can't act; add Actions).
2. Add Sense → *observations* (blind vs sighted bot).
3. Snack goal without Memory → *why memory matters* (wandering bot); add Memory.
4. "Sums for Teddy" without Tools → *hallucination*; add calculator.
5. "The locked chest" → *retrieval* (`look_up_manual`).
6. Add Safety Brick, approval mode on → *governance exists* (purpose 2 seed).
