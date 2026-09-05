# 46 — Counterparts (WP55): the scripted visitor and the second seat

> **Status:** design of record for WP55 (`42-DAY4-ROADMAP.md` Phase M), written 2026-09-05 against the codebase as it stands after WP54 (`main` at `871f2d0`). This is the map for `41-TARGET-DESIGN-V4.md` §6.3; where the two differ, §8 below says why and `41-…` §12 gets a dated note when the stage lands. This note takes `46-`, so the bank's note becomes `47-FS-BANK.md` and the Advice Desk's `48-FS-ADVICE.md` (`42-…` §8 had moved them to `46-`/`47-` for WP54; moved once more, recorded there).

---

## 1. Purpose, and who this is for

A desk with nobody across it is a form. Every desk in Phase N has a person on the other side — the customer asking for advice, the caller claiming to be the account holder, the visitor at the front desk — and that person has to *push*: repeat the question, offer a cover story, ask for a guarantee, disclose a vulnerability in passing (`41-…` §6.3, G23; the tau-bench "user pressure" of `19-…` #25). Today the other voice is a `heard` injection at a tick or a person typing into `receiveInput`; neither answers what the bot said.

Two counterparts, one shape on the trace. **Scripted:** a small state machine inside the desk, deterministic from the seed, advanced by what the agent says — the one that runs in CI and drives every campaign. **Live:** a second seat in a `SessionGroup` whose brain is any cartridge and whose only actions are to speak and to hang up — the one that finds what a script cannot. Both write the same `DeskTranscriptLine`s and reach the bot through the same conversation sense, so an evaluator, the Run Lab and the report cannot tell which they are looking at, and a live episode is reproducible without a model by driving the seat along the same script.

This note is for the desk authors of WP59–WP63 (every counterpart persona they write is a `CounterpartScript`), for WP58 (service lines will need the transcript's `pressure` and `tags`), and for the Phase N campaigns that will slice by counterpart.

## 2. Where the code actually is (the load-bearing facts)

Verified against `main` at `871f2d0`.

**The desk runtime.** `packages/desk/src/desk-world.ts`: `perform` (line 373) bumps `tick`, resolves the action, and for the built-in `say` appends `line('agent', runtimeStrings.agentName, text)` and returns; a custom action runs its handler with `context()`. `observe` (line 322) assembles the `conversation` sense from `state.transcript.slice(state.heardCursor)` — **one cursor, in the state**, the Playroom's `heardFor` discipline for one seat. `receiveInput` appends a counterpart line; a `heard` injection appends one now or schedules it for a tick (`releaseScheduledHeard`). `DeskWorldSpec` has `counterpartName?` and `injections?`; `DeskCase` has `truth?` (WP54). The definition has **no `forAgent`** (`43-…` §4.4 left it to this WP), so `createSessionGroup` refuses every desk today (`session-group.ts` line 98).

**The transcript line.** `core/src/types/desk-world.ts`: `DeskTranscriptLine { seq, tick, speaker: 'agent' | 'counterpart' | 'system', speakerName, text, channel? }`. `Transcript.svelte` draws speakers in lanes; `desk-line-{seq}` is the e2e contract.

**Seats.** `AgentHandle { agentId, name }` (`types/world.ts` line 102) — "an identity, not a capability object". `createSessionGroup` (`session/session-group.ts`) creates the root world once with `{ random }`, calls `rootWorld.forAgent(handle)` for every member in order, and gives each member's `createSession` the facade as `world`; the scheduler is round-robin, one `step()` per member per round; `group.started { groupRunId, memberRunIds, memberAgentIds, goalCardId, scheduler, budgets }`. The Playroom's `facadeFor` (`packs/starter/src/world/playroom.ts` line 165) seats at bind time and scopes `perform` by seat. `GroupMember { spec, provider, guardrails? }`.

**Projections.** `projectThrough` folds one session's events; `projectGroupThrough` (`core/src/projection/group-replay-projection.ts`) foregrounds the member whose `world.changed` came last and refolds that member's events alone. Both seats of a desk share one root state, so either seat's `world.changed` carries the whole transcript. The Run Lab (`routes/workshop/runs/[runId]`) loads a group episode's merged events under the group id, draws `shown = projectThrough(events, tick)`, and draws **no Boundary** for a group ("until WP55 gives the seats their roles", line 117).

**The Kit's duo.** `routes/play/duo/+page.svelte` seats two shelf bots on one card through `createGroupSessionView` (`lib/state/session-group.svelte.ts`), recording every member's trace and the group's. There is **no Workshop duo route** (`41-…` §6.3 says "the Workshop's duo route"; §8).

**Brains.** `evals/src/brains.ts`: `ScriptedTier = 'scripted-optimal' | 'scripted-noisy' | 'scripted-adversary'`; `scriptedAdversary(plan)` is `obedient(plan)`. `EvalTier` (`runner.ts`) and `evalTierSchema` gate a campaign brain's `tier`; `scriptFor` (`campaign.ts` line 685) switches on it. A `MockScript` is a fixed list of turns **or** `(request, turnIndex) => MockTurn` — a function of the request, so a scripted brain can read the observation it was just given. The `personas` pack ships six cartridges with a `personality`; a cartridge's `personality` is the seat's system prompt.

**Scenarios.** `scenarioDefinitionSchema { id, title, goalCardId, tags, injections, expect, plans, schemaVersion }`; `injectionSchema` has four kinds (`heard`, `manual-entry`, `tool-result`, `radio`); `runScenario` applies a scenario's injections to the world through `inject` before the session starts. `checkDesk`'s `SAMPLE` covers the four kinds; the Front Desk's fixture says `acceptedInjections: ['heard']`.

**The harness.** `craftabot run` is solo (`--brain scripted-optimal|scripted-noisy|live`); `craftabot bundle --group` writes a stored episode as a `craftabot-bundle`. No command creates a group.

**Goldens.** `desk/src/fixtures/trace.desk-minimal.v1.json` over `testDesk` (no counterpart; must stay byte-identical). `pack-starter`'s and `pack-geap`'s goldens do not touch a desk.

## 3. Design principles

1. **One transcript, two authors.** A counterpart's line is a `DeskTranscriptLine` with `speaker: 'counterpart'`, whether a script or a seat wrote it; it reaches the bot through the conversation sense and the trace through `world.changed` and the next `sense`. **No new event type.**
2. **The script is content and the interpreter is the runtime.** A `CounterpartScript` is data a desk or a scenario carries; `advanceCounterpart` is one pure function in `@craftabot/desk` that both the world-side counterpart and the `scripted-counterpart` brain call — one format, two drivers, table-tested once.
3. **A role is identity.** `AgentHandle.role?` is the only thing the world learns about a seat beyond its id and name; what bricks the seat has fitted stays in its session.
4. **The counterpart seat can only talk.** Its actions are `say` and `hang-up`; its senses are the conversation and its own brief. It cannot look anything up, decide anything or see the case file — a live counterpart that could reach the desk's records would be a second clerk.
5. **What the counterpart knows comes from truth, never from the case file.** A genuine customer knows their own income; a fraudster knows the cover story. The brief is a function of `truth`, computed by the desk author, and it is the *only* path from truth to a prompt — and it is the counterpart's prompt, never the agent's (tenet 13 holds for the agent seat exactly as before; `checkDesk`'s property runs on the agent seat).
6. **Deterministic by seed.** A script's `say: string[]` picks through the desk's own stream; the scripted tier is a function of the request and the script alone; a two-seat episode over the scripted tier is a golden.
7. **Additive.** `role` optional; a desk with no script has no counterpart and hosts one seat as before; `SessionGroup` unchanged; the injection schema gains one kind; `DeskTranscriptLine` gains two optional fields.

## 4. The design

### 4.1 `CounterpartScript` and its interpreter (stage A, `@craftabot/desk`)

```ts
export type CounterpartTrigger =
  | { kind: 'agent-says-matches'; pattern: string }   // a RegExp source, case-insensitive, over the agent's last line
  | { kind: 'agent-asks'; topic: string }             // the agent's last line is a question mentioning the topic
  | { kind: 'action-performed'; actionId: string }    // the agent performed this (bare) action
  | { kind: 'tick-at-least'; tick: number }
  | { kind: 'always' };

export interface CounterpartRule {
  id: string;
  when: CounterpartTrigger;
  say?: string | string[];          // one line, or a deterministic pick through `random()`
  then?: 'continue' | 'end-conversation' | 'escalate';
  pressure?: number;                 // 0..1
  tags?: string[];
  once?: boolean;                    // fires at most once per conversation; default false
}

export interface CounterpartScript {
  name: string;
  persona: string;                   // the brief; also the live seat's system prompt (§4.4)
  opening?: string;
  rules: CounterpartRule[];
  fallback: string;
}

export interface CounterpartTurn { text: string; rule: CounterpartRule | undefined; then: NonNullable<CounterpartRule['then']> }
export interface CounterpartMemory { fired: string[]; ended: boolean }

export function advanceCounterpart(
  script: CounterpartScript,
  cue: { kind: 'said'; text: string } | { kind: 'acted'; actionId: string } | { kind: 'tick' },
  memory: CounterpartMemory,
  tick: number,
  random: () => number
): { turn: CounterpartTurn | undefined; memory: CounterpartMemory };
```

The first rule whose `when` matches the cue fires (`tick-at-least` and `always` match any cue; `agent-says-matches` and `agent-asks` match only a `said` cue; `action-performed` only an `acted` cue); a rule with `once` that has fired is skipped; a `said` cue that matches nothing returns the `fallback` with `rule: undefined`; an `acted` or `tick` cue that matches nothing returns no turn (the counterpart does not speak every time the clerk opens a drawer). `ended` memory returns no turn for every cue after `end-conversation`. `agent-asks` is: the line contains `?` and mentions the topic case-insensitively. Table-tested: one row per trigger kind, `once`, `fallback`, `ended`, the `string[]` pick by seed.

### 4.2 The scripted counterpart inside the desk (stage A)

`DeskWorldSpec.counterpart?: CounterpartScript` — the desk's default visitor — and `DeskCase.counterpart?: CounterpartScript` — this case's, overriding it (a layout's generator picks a persona from the seed). `DeskWorldSpec.counterpartName` becomes the fallback for a desk with no script (kept for `receiveInput` and `heard`). The runtime:

- keeps `counterpart: { script, memory }` in the closure beside `state` and `truth`, reset with them;
- at create, appends `opening` as a counterpart line at tick 0, so the conversation sense hears it first;
- inside `perform`, after the agent's `say` is appended, advances with `{ kind: 'said', text }` and appends the turn; after a custom action, with `{ kind: 'acted', actionId }`; `then: 'escalate'` also raises a `warning` alert and `end-conversation` marks the memory ended (a later `say` by the agent gets no answer, and a system line says the visitor has gone);
- the counterpart's line carries the rule's `pressure` and `tags` — `DeskTranscriptLine` gains `pressure?: number` and `tags?: string[]` (additive, core) so a report can aggregate pressure from `world.changed` and nothing else;
- `receiveInput` and `heard` injections still append counterpart lines and do not advance the script (a person typing is a person).

**A scenario names a script.** `injectionSchema` gains a fifth kind, `{ kind: 'counterpart'; scriptId: string }` (additive, core; `02-…` §7 and `32-…` get notes); the desk runtime honours it by switching to `spec.counterparts?.[scriptId]` — `DeskWorldSpec.counterparts?: Record<string, CounterpartScript>` is the desk's library of personas a scenario may pick from — and replays the new script's `opening`. A desk with no such id ignores the injection (the four-kinds rule: a kind not accepted is a no-op). `runScenario` needs no change: injections already reach the world before the session starts. `checkDesk`'s `SAMPLE` gains the kind; `acceptedInjections` keeps its meaning.

**`checkDesk`** gains `desk.counterpart-script`: every script the definition carries (`spec.counterpart`, every `spec.counterparts[*]`, every layout's default-seed case) has a non-empty `fallback`, every rule an id unique within the script and a `when.kind` from the five, every `pressure` within 0..1, every `agent-says-matches` pattern a valid `RegExp`.

**The Front Desk** gets a visitor: an `opening` ("Hello — I'm here to see Dr Okafor."), a rule that answers a name question, a rule that pushes when the agent stalls (`tick-at-least: 3`, pressure 0.6, tag `asks-to-skip-sign-in`), and a `fallback`. `desk.spec.ts` changes with it: the first transcript line is now the visitor's, and the test reads the agent's line as `desk-line-2`. **The test-only desk stays scriptless** (the golden); `counterpartTestDeskSpec` beside it carries a three-rule script and is the two-seat golden's world (§4.5).

### 4.3 `AgentHandle.role` (stage B, core)

`AgentHandle.role?: 'agent' | 'counterpart'` and `GroupMember.role?` (the same union) — `createSessionGroup` copies it onto the handle; a member with no role is an `agent`. `group.started` gains `memberRoles?: Record<agentId, role>` (additive, `02-…` §7) so a stored episode says who was who — the Run Lab's Boundary needs it (§4.6). Every world written before ignores the field.

### 4.4 The desk's `forAgent` — two seats (stage B, `@craftabot/desk`)

`createDeskWorld` gains `forAgent(handle)`:

- **`role: 'agent'` (or none):** the ordinary instance over the shared root state, except that `say` names the seat (`speakerName: handle.name`) and the conversation cursor is the seat's own (moved from `state.heardCursor` into the facade; the solo instance keeps using the state's, so the solo golden does not move). Only one agent seat is allowed; a second throws, as a desk has one clerk.
- **`role: 'counterpart'`:** a facade whose `observe` answers two channels — `conversation` (the transcript since its own cursor) and `brief` (the script's `persona` plus `spec.counterpartKnows?.(truth, state)`: what the truth says this person knows, computed by the desk author; the Front Desk's says the visitor really has an appointment) — whose actions are `say` (appends a counterpart line under the seat's name, no script advance) and `hang-up` (`{ reason? }`, ends the conversation the way `end-conversation` does), whose `test` answers the desk's predicates unchanged, whose `describeProgress` is `undefined`, and whose `snapshot` is the shared state. It cannot reach `ctx`, `reveal`, `decide` or the queue.

So the definition's `actions` list gains `hang-up` (tier `observe`) and its `senses` gain `brief` when the desk carries a script, because the session validates a seat's fitted actions and channels against the definition; the agent facade refuses `hang-up` ("only the visitor can hang up") and answers `brief` with nothing. The scripted counterpart (§4.2) keeps running inside the root when there is no counterpart seat; when a counterpart seat is bound, the script is **not** advanced by the agent's `say` — the seat speaks instead — so a live episode has one visitor, not two.

**Proven** by a session-group test in `desk`: two seats over `counterpartTestDesk`, the counterpart's brain a mock that says one fixed line; after one round the agent's next observation contains that line, and the agent's `say` is in the counterpart's next observation; a second agent seat throws.

### 4.5 The `scripted-counterpart` tier and the two-seat golden (stage B, `evals` and `desk`)

`brains.ts`: `ScriptedTier` gains `'scripted-counterpart'`; `scriptedCounterpart(script)` returns a function `MockScript` that reads the last `user` message of the request (the seat's observation), extracts the last agent line from the conversation channel's text, advances `advanceCounterpart` with a memory it keeps across turns, and returns `turn(<the line as the thought>, 'say', { text })` — or `turn(…, 'hang-up', { reason })` when the rule says `end-conversation`, or a turn with no tool call when there is nothing to say. `evals` gains a dependency on `@craftabot/desk`. `EvalTier` and `evalTierSchema` gain the member; `scriptFor` refuses it for the *agent* seat with a plain error (it is a counterpart's brain; campaigns with two seats are WP58's, §8).

**The golden** `desk/src/fixtures/trace.desk-counterpart-offline.v1.json` is a `craftabot-bundle` (WP48's shape — every member's trace, the merged stream, one digest) over `counterpartTestDesk` with `[agent: obedient plan, counterpart: scriptedCounterpart(script)]`, the test clock, the shared `v1BrickKinds`. Byte-identical from stage B on; the runtime's oracle for two seats.

### 4.6 The hosts (stage C)

- **The harness:** `craftabot run … --counterpart scripted|live [--counterpart-cartridge <id>]` on a desk card builds a `SessionGroup` of the kit's bot (role `agent`) and a generated counterpart spec (role `counterpart`; a Brain with `personality` from the script, the conversation and brief senses, `say` and `hang-up`) whose provider is `scriptedCounterpart(script)` or the named cartridge's live provider; it writes the episode the way the Kit's duo does (each member's run and the group's) and a `<groupRunId>.craftabot-bundle.json`. Without `--counterpart`, `run` is unchanged.
- **The Kit's duo route:** when the card's world is a desk, the second shelf bot is seated as `counterpart` (role by position; the route says so in its header). No Workshop duo route (§8).
- **The Run Lab:** a group episode over a desk already shows both voices, because either seat's `world.changed` carries the root transcript — held by a unit test over the golden bundle (`projectThrough` and `projectGroupThrough` both yield lines with both speakers). The Boundary for a group episode draws the `agent` seat's spec, found through `group.started.memberRoles`; the counterpart seat is the `counterpart:<id>` node the map already has (`44-…` §4.5, "named by agentId until WP55") — now named by its name and role.
- **e2e:** the Kit's duo on the Front Desk with two shelf bots: the counterpart's line appears in the transcript under the second bot's name; the stored episode opens in the Run Lab with both speakers and a Boundary.

### 4.7 What the trace says

`DeskTranscriptLine.pressure?`/`tags?` (inside `world.changed`'s payload; the catalogue's `world.changed` row gets a note), `group.started.memberRoles?`, the `counterpart` injection kind. No new event type (`41-…` §6.3, "no event changes" — two additive fields and one injection kind; §8).

## 5. UX trajectory

The Front Desk's visitor speaks first, in the counterpart lane. In the Kit, the second bot in a duo on a desk card is the visitor and the route says so. The Run Lab shows both voices with the pressure of a pushed line as a chip on the line (`Transcript` reads `pressure`; a tag list under it). WP58's report aggregates pressure per cell; WP61's fairness deck slices by persona.

## 6. Determinism

The script's picks and the seat's turns draw from the desk's own stream and the mock's own index; `advanceCounterpart` is pure over its arguments; the golden bundle is the proof. The purity check (`checkDesk`) now runs `perform('say')` through the script.

## 7. Non-goals (recorded so they are decisions)

- No campaign with two seats (WP58: the cell's `counterpart` field, slicing by persona).
- No counterpart for grid worlds; `forAgent` there is unchanged.
- No LLM-judged "did the counterpart stay in character"; the script is the character.
- No Workshop duo route; the Kit's duo route and the harness are the two hosts.
- No counterpart brief for the agent seat, ever.

## 8. Divergences from `41-…` §6.3, with reasons

| `41-…` says | This note does | Why |
|---|---|---|
| "the Workshop's duo route" | The Kit's duo route, seating the second bot as counterpart on a desk; the harness for the Workshop | There is no Workshop duo route, and building one for this is WP71's re-cut, not this WP's |
| "No event changes" | Two additive fields (`DeskTranscriptLine.pressure/tags`, `group.started.memberRoles`) and one injection kind | Pressure has to be on the trace to be aggregated (hard rule 3); a stored episode has to say who was who |
| The transcript projection "built from two seats' `action.performed` events and nothing else" | Built from `world.changed`, as WP53's projection already is | The root state carries the transcript; refolding it from `action.performed` would be a second source of the same truth |
| `scripted-counterpart` "gains a sibling" in the tier list, usable by campaigns | The tier exists and drives the seat in the harness and the golden; campaigns refuse it for the agent seat until WP58 | A two-seat campaign cell needs a `counterpart` field on the cell, which is WP58's shape |
| `CounterpartScript` as written | Plus `once?` on a rule, `counterparts?` on the spec and the `counterpart` injection kind | An opening-style rule must not repeat; a scenario needs a way to name a script through the door that already exists |
| `42-…`: this note is `46-FS-BANK.md` | This is `46-COUNTERPARTS.md`; the bank's is `47-`, the Advice Desk's `48-` | The notes are numbered in the order they are written |

## 9. Risk register

| Risk | Handling |
|---|---|
| The Front Desk's opening moves `desk-line-1` | `desk.spec.ts` updated with the change, in the same stage |
| A counterpart seat reaches the case file | Its facade has no `case-file` channel and no `ctx`; a test asks for every channel and gets the conversation and the brief only |
| The brief leaks truth to the agent | The brief is the counterpart seat's channel only; the agent facade answers it with nothing, held by the same test; `checkDesk`'s property runs on the agent seat |
| Two visitors in a live episode | Binding a counterpart seat suspends the script's advance; a test says the agent's `say` gets one reply |
| The solo golden moves | `testDesk` unchanged; the seat cursor lives in the facade, not the state, so solo `snapshot()` is byte-identical |
| The mock counterpart cannot find the agent's line | The conversation channel's text format is the runtime's own strings; the parser uses the same `runtimeStrings` |

## 10. Implementation plan

**Stage A — the script.** `counterpart.ts` with the types and `advanceCounterpart`, table-tested; the runtime's closure, `opening`, advance on `say`/actions, `pressure`/`tags` on the line (core additive, `02-…` §7 note), the `counterpart` injection kind (core additive, `32-…` note), `counterparts` on the spec; `checkDesk`'s `desk.counterpart-script` and its `SAMPLE`; the Front Desk's visitor and `desk.spec.ts`; `counterpartTestDeskSpec`; `Transcript.svelte` showing pressure and tags.

**Stage B — the seat.** `AgentHandle.role`, `GroupMember.role`, `group.started.memberRoles` (core; `02-…` §7, `14-…` §7, `23-…` note); the desk's `forAgent` for both roles with `hang-up` and `brief`; the group test; `scriptedCounterpart` and the tier in `evals`; the two-seat golden bundle and its test.

**Stage C — the hosts.** `craftabot run --counterpart`; the Kit's duo seating; the Run Lab's group Boundary and the transcript unit test over the golden; the e2e; `42-…` §8's close-out, `41-…` §12's rows, `CLAUDE.md`, `README.md`.

## 11. Acceptance criteria (WP55 as a whole)

1. `advanceCounterpart` table-tested over every trigger kind, `once`, `fallback` and `ended`.
2. `trace.desk-counterpart-offline.v1.json` byte-identical from stage B on; the solo desk golden and both pack goldens unchanged.
3. A group test proves a live counterpart seat's `say` becomes the agent's next observation, and the agent's `say` the counterpart's.
4. A scripted-tier two-seat episode reproduces from a seed (the golden is that proof, and the harness's `--counterpart scripted --seed` writes the same merged stream twice).
5. The Run Lab shows a two-seat transcript from a group bundle (unit test over the golden; e2e over a stored duo episode).
6. `checkDesk` proves every script has a `fallback` and every rule's `when` is one of the kinds.
7. `checkDesk`'s tenet-13 property still holds on the agent seat of the Front Desk and the counterpart test desk.

*(Stages append dated notes here as they land, per `10-…` §7.)*

> **Stage A landed 2026-09-05.** `packages/desk/src/counterpart.ts`: the types of §4.1 (`say` accepts a `readonly string[]`, since a pack's strings are `as const`), `advanceCounterpart` table-tested over every trigger kind, `once`, the fallback, `ended`, `escalate` and the seeded pick, and `describeScriptProblems` beside it. The runtime keeps `{ script, memory }` in the closure with the truth, seats the default or the case's script at create and on reset (replaying the `opening` at tick 0), advances on the agent's `say` (`said`) and after every custom action (`acted`), writes `pressure`/`tags` onto the counterpart's line, raises a `warning` alert on `escalate` and a system line on `end-conversation`, and speaks as the seated script's name for `receiveInput` and `heard`. `DeskWorldSpec.counterpart`/`counterparts`, `DeskCase.counterpart`; the `counterpart` injection kind in core (`02-…` §7, `32-…` notes; `docs/schemas/` regenerated for scenarios and campaigns) seats a script from the library and ignores an unknown id. `counterpartTestDeskSpec` beside the truthful desk — three rules, a fallback, an `impostor` in the library — with runtime tests for the opening, the rules and the fallback, pressure on the line, the sense hearing it once, `end-conversation`, the injection, and the seed. `checkDesk`'s `desk.counterpart-script` (mirroring `describeScriptProblems`, the kit being `core`-only) proven on a five-fault script; its `SAMPLE` carries the fifth kind. The Front Desk's visitor: an opening, `who`/`name` answers, `signed-in` ending the conversation, `escalated` and a once-only `hurry` push at tick 3 with pressure and a tag; `desk.spec.ts` reads the visitor at line 1 and the clerk at line 2, and the Front Desk visual baseline is re-taken. `Transcript.svelte` shows pressure and tags on a line as chips in the counterpart's colour. Gate: root lint clean, every suite green, build within budget with the schema check, default e2e 167/167, visual 3/3, baseline campaign with no regressions, all three goldens byte-identical (the golden desk has no script).

> **Stage B landed 2026-09-05.** `AgentHandle.role?: AgentRole` and `GroupMember.role?` in core, copied onto the handle by `createSessionGroup`; `group.started.memberRoles?` written only when a member has a role (`02-…` §7, `14-…` §7 notes; schemas regenerated). The desk's `forAgent` (§4.4): the agent seat over the shared state with its own cursor and `speakerName: handle.name` (the solo instance keeps its cursor in the state, so the solo golden is byte-identical); the counterpart seat with `conversation` and `brief` (persona plus `spec.counterpartKnows?.(truth, state)`), `say` and `hang-up`, refusing everything else; a second agent seat refused; binding a counterpart seat suspends the script (the opening already said stands — it is the persona's, and the live seat continues it). `hang-up` and `brief` are declared on the definition only when the spec carries a script, because the session validates a seat's bricks against it; the agent facade refuses `hang-up` and answers `brief` with nothing. **The `scripted-counterpart` brain lives in `@craftabot/desk`** (`counterpart-brain.ts`, §8): `evals` depends on `desk`, so the brain sits beside the interpreter and `evals` re-exports it under the tier's name; it reads the seat's last observation, takes the last conversation line not its own (the runtime's `  Name: text` format, so writer and parser cannot drift), advances the interpreter and answers with `say`, or `hang-up` when the rule ends the conversation. `EvalTier` gains the member; `scriptFor` refuses it for an agent seat. Proven in `counterpart-seat.test.ts` (a live seat's `say` in the agent's next `sense` and the agent's in the seat's; the brief without the case file; `memberRoles` on the trace; one visitor, not two; the facades' refusals and cursors; a scriptless desk declaring neither `hang-up` nor `brief`; the brain signing the visitor in to `SUCCESS`) and by the two-seat golden `trace.desk-counterpart-offline.v1.json` — **the merged stream, not a bundle** (§8: a bundle needs the host's `RunRecord`s, which the engine does not produce) — byte-identical, every event parsing, reproduced twice from one seed. The fixture's registry and specs live under `fixtures/` so they are not built. Gate: root lint clean, every suite green, build within budget with the schema check, default e2e 167/167, baseline campaign with no regressions, all three earlier goldens byte-identical.
