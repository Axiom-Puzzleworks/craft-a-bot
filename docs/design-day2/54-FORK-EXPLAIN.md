# 54 — Counterfactual replay and "explain this decision" (WP66)

> **Status (2026-09-06):** the design of record for WP66 (`42-DAY4-ROADMAP.md` §3 Phase O; `41-TARGET-DESIGN-V4.md` §6.9). Written before stage A; the stage notes at the foot say what landed. Two things: **fork** — start a new run from a stored run's state at tick *n*, with or without a change, so a question like "would the freeze card have paused this?" is answered by running it rather than arguing it — and **explain** — a fold that says, for one decision, what the bot saw, what it was offered, what it chose, what checked it, what a person said, what happened, and which rows of the trace are its causes. The explanation fold grows WP63's `reasonsUsed`; the assurance pack's incidents section (WP67) starts quoting it.

## 1. Purpose, and who this is for

A reviewer on the Lending Desk asks: this loan was declined at tick 4 — what did the bot have in front of it, which rule checked the decision, and would a different guard stack have declined it too? Today the Run Lab shows the rows; the reader assembles the answer. After WP66 the inspector's *Explain* panel assembles it, the timeline lights the related rows, and "Fork from this tick" runs the counterfactual beside the original with one scrubber over both. Headless, `craftabot fork --run <id> --tick n [--kit other.json]` does the same for a campaign's cell.

## 2. Where the code actually is — and what the contract test found

Read for this note: `core/src/session/agent-session.ts` (`createSession(deps)`: the world built by `definition.create(layoutId, { random })` unless `deps.world` is handed in; `usage`, `run.tick`, `memory.remember`, the guardrails installed from the fitted bricks and reading `ctx.usage`/`ctx.history`; `start(mode)` emitting `run.started`; the resume WP49 built for a *live* session), `core/src/types/world.ts` (`WorldInstance`: `snapshot`, `perform`, `reset`, `inject?`, `receiveInput?`, `forAgent?`, no restore), `core/src/session/memory.ts` (`TickMemory`, `createMemory`), `core/src/projection/run-projection.ts` (`projectThrough`), `core/src/schemas/events.ts` (`run.started`, `decision`, `guardrail.checked`/`tripped`, `approval.*`, `action.performed` with `stateDiff`, `brick.state`, `prompt.composed`), `desk/src/desk-world.ts` (the counterpart's memory in the instance's closure, not the state), `starter/src/world/playroom.ts` (state cloned from a layout), `harness/src/commands/run.ts` and `run-record.ts`, `apps/workbench/src/lib/state/session.svelte.ts` (`createSessionView`), the Run Lab (`routes/workshop/runs/[runId]`) and Compare, `governance/reports/decision-explanation.ts` (`reasonsUsed`).

**Where the contract was found wanting:**

1. **A world cannot be put back where it was.** `WorldInstance` has `reset()` and `snapshot()` but nothing takes a snapshot back. **Fixed in `core`:** `restore?(snapshot: WorldState): void` — optional, one more door; a world without it is rebuilt by replaying its recorded `action.performed` calls and delivered inputs through `perform`/`receiveInput` onto a fresh instance, which is exact for a deterministic world whose creation drew nothing the fork cannot redraw. The desk implements `restore` (its state is one object; the counterpart's memory joins the snapshot as `counterpart: { fired, ended }` so a `once` rule does not fire twice after a fork — a snapshot-shape change, and the desk goldens are re-recorded with a dated note); the Playroom implements `restore` too (its state is a cloned layout). Stage A.
2. **A session cannot start mid-way.** `createSession` begins at tick 0 with fresh memory and usage. **Fixed in `core`:** `forkSession(deps, { from: { events, tick }, overrides? })` — the same `deps` as `createSession` plus the origin's stored events and the tick to fork after — which rebuilds the world (§4.1), refills the memory window from the origin's `TickMemory` (folded from `sense`/`decision`/`action.performed`/`tool.executed` rows, the same fold the loop keeps), restores the notebook from the last `brick.state` of the memory slot, sets `usage` (ticks = *n*, tokens summed from `think.completed`), seeds the guardrails' `history` with the origin's rows through tick *n*, and emits `run.started` with `forkedFrom: { runId, tick }` (additive on the schema) and `parentRunId` = the origin. Stage A.
3. **The random stream's position is not recorded.** A world's creation draws from the session's `random`; the dice tool draws from it later. A fork cannot put a caller's `random` back to where the origin's was, because the trace records dice *results*, not the stream. **Decided, not changed:** the fork's `random` is the caller's, as the origin's was; the proof of byte-identity is over goldens whose worlds draw nothing after creation (the desks; the Playroom's layouts are fixed), and §8 records that a run using `dice` after tick *n* is reproduced up to the first draw. Recording the stream is a trace-format change this WP does not make.
4. **"Byte-identical after *n*" has an envelope.** A fork is a new run: its `runId`, its event `id`s and `timestamp`s are its own. **Decided:** the equality the tests prove is over `{ type, tick, payload }` of every event after tick *n*, with `run.started` compared minus `forkedFrom` and `run.finished` compared whole. §8.
5. **The brain is the caller's.** A scripted provider has a cursor; a live one has none. `forkSession` takes the provider from `deps` like `createSession` does; a caller forking a scripted run positions the script by the number of brain turns the origin took through tick *n* (`brainTurnsThrough(events, tick)`, exported). The harness's `fork` does this for the scripted tiers and refuses `--brain live` without a budget flag, as `run` does.
6. **The origin's spec travels on the run record.** `RunRecord.specSnapshot` (the trace file's record) carries the bot as it was when the run started, so `craftabot fork` reads it from the stored `run.json` and needs `--kit` only for a counterfactual build; the Workshop reads the same record. Not a contract change. §7.

## 3. Design principles

1. **A fork is a run.** It is stored, listed, bundled, evaluated and compared like any other; its `run.started.forkedFrom` is the only thing that says it is one, and `parentRunId` ties it to the origin the way a group member is tied to its episode.
2. **Exact or refused.** A world that cannot be rebuilt (no `restore`, and a replay whose `action.performed` fails) makes the fork throw before `run.started`; there is no "approximately forked" run.
3. **An explanation is a fold.** `decisionExplanation` reads events and nothing else; the inspector renders it; the pack quotes it; nothing is authored into it.
4. **Related rows are the fold's, not the timeline's.** `related` is computed once, in governance, and the timeline highlights what it is given.

## 4. The design

### 4.1 `forkSession` (`core`, stage A)

```ts
forkSession(deps: CreateSessionDeps, fork: {
  from: { events: readonly EngineEvent[]; tick: number };
  overrides?: { spec?: AnyAgentSpec; guardrails?: Guardrail[]; world?: WorldInstance };
}): AgentSession
```

- **The spec** is `overrides.spec ?? deps.spec`; the registry, provider and guardrails are `deps`' (plus `overrides.guardrails`). The goal card is the spec's — a fork onto a different card is refused (the world would not be the origin's).
- **The world** (`rebuildWorld`): the last `world.changed` at or before tick *n* is the target state. `overrides.world` wins if given; else the card's world is created with `deps`' random and, if it has `restore`, restored to the target; else every `action.performed` (ok or not — a refused call may still have advanced a counterpart) and `input.delivered` through tick *n* is replayed in order and the result's snapshot compared to the target — a mismatch throws with the first differing path. Scenario injections are not replayed: the origin's world already absorbed them into the state the fork restores; a caller wanting them anew hands in `overrides.world`.
- **Memory**: `tickMemoryFrom(events, tick)` folds one `TickMemory` per tick through *n* (observation summary from `sense`, thought and call from `decision`, result from `action.performed`/`tool.executed`, refused from `guardrail.tripped`); the window strategy is the spec's. The notebook: the memory slot's last `brick.state` through *n* carries `{ notebook: string[] }` (the starter's memory brick already reports it; a kind that does not leaves the notebook empty and the fork says so in `run.started.forkedFrom.notebook: 'restored' | 'empty'`).
- **Usage**: `ticks = n`; `inputTokens`/`outputTokens` summed from `think.completed` through *n*.
- **History**: the guardrails' `ctx.history` starts as the origin's rows through *n*, so a `history-count` leaf and the loop-breaker see the same past. Those rows are **not** re-emitted on the fork's bus and are not the fork's events.
- **Then** the ordinary loop from tick *n+1*: `start(mode)` emits `run.started` with `forkedFrom`, and everything after is the engine as it is.
- `brainTurnsThrough(events, tick)`: the number of `think.completed` rows through *n* — what a scripted provider skips.

`run.started.forkedFrom?: { runId: string; tick: number; notebook: 'restored' | 'empty' }` — additive; `02-…` §7 amended. `RunRecord.forkedFrom?` mirrors it (records schema, additive) so the Run Browser and Compare can find the origin without reading the trace.

### 4.2 `restore` on the two worlds (stage A)

- **The desk**: `restore(snapshot)` replaces the state wholesale (`structuredClone`) and the counterpart memory from `snapshot.counterpart`; `snapshot()` now carries `counterpart: { fired, ended } | undefined` beside `hidden` — `DeskView` reads neither. The desk golden trace and the two-seat golden are re-recorded (the payload of every `world.changed` gains the field), with a dated note in `43-…` §7 and `46-…` §7.
- **The Playroom**: `restore(snapshot)` clones the snapshot over `state` — every field the Playroom keeps is in it already (`playroom.ts`'s comment: "all four land in state").

### 4.3 `craftabot fork` (harness, stage B)

`craftabot fork --run <runId> [--tick n] [--kit other.craftabot.json] [--brain scripted-optimal|scripted-adversary|scripted-noisy] [--card …] [--seed n] [--out ./runs] [--egress …]` — loads the origin's events from the file store, the spec from `--kit` or the origin's `kit.json` written beside every run since this WP (`run.ts` writes it), positions the scripted brain by `brainTurnsThrough`, forks, runs to completion, writes the run exactly as `run` does (`run.json` with `forkedFrom`, `events.jsonl`, `summary.json`, the trace file). `--tick` defaults to the origin's last completed tick minus one.

### 4.4 `decisionExplanation` (governance, stage B)

```ts
decisionExplanation(events, decisionEventId): DecisionExplanation | undefined
```

v1: `{ decisionEventId, runId, tick, source: 'brain' | 'reflex', observation: { channels, text }, prompt: { sections: Array<{ role, chars }>, estimatedTokens } | undefined, callsAvailable: string[], decision: { thought, call }, checks: Array<{ guardrailId, hook, verdict: 'allow' | 'block' | 'pause' | 'stop', reason?, policyCardId? }>, approval: { requested: boolean; approved?: boolean; reason? } | undefined, result: { kind: 'action' | 'tool', name, ok, narration?, stateDiff? } | undefined, reasonsUsed: ReasonsUsed, related: string[] }`. `callsAvailable` is read from the tick's `brick.state` rows whose state carries `calls` (the starter's equipment and mobility bricks report them) and, failing that, from the tool names the `prompt.composed` messages carry. `related` is the ids of: the tick's `sense`, `prompt.composed`, `think.completed`, the decision, every `guardrail.checked`/`tripped`/`external` between the decision and the result, the `approval.*` pair, the result row, and the `world.changed` that followed. Snapshot-tested over every golden trace (the starter's, the desk's, the two-seat one, the confused-deputy one).

The assurance pack's monitoring section stops saying "not recorded (WP66)": each incident gains `explanations: DecisionExplanation[]` for the decisions of the ticks its findings name, and the HTML renders them. `53-…` §7 amended.

### 4.5 The Run Lab and Compare (stage C)

- **Explain** in the inspector: with a `decision` row selected (or any row of that tick), the panel renders the fold — the observation, the prompt's sections and sizes, the calls on offer, the choice, the checks with verdicts, the approval, the result and the diff, `reasonsUsed` — each line linking to its row; the timeline marks `related` rows (`data-related="true"`) while the panel is open.
- **Fork from this tick** in the header (the slot WP20 left): runs a fork from the scrubber's tick, with the origin's spec, through the Workshop's own session path (`createSessionView` gains `forkFrom`), stores it, and opens `/workshop/compare?a=<origin>&b=<fork>&from=<tick>` — Compare, seeing `forkedFrom` on `b`, folds `a`'s events through the fork tick before `b`'s own, so the two panels share one scrubber from the fork point. A guard-stack change for the counterfactual is the Spec Lab's job (fork, then edit the fork's bot is a later WP); the Workshop's fork is the "no overrides" one, and the DoD's "a fork with a guard added" is proved headless.

## 5. UX trajectory

Workshop only. The Kit is untouched. The Run Lab's inspector gains a panel and the header a button; Compare gains a sync point. Screenshots: the Run Lab with Explain open joins the visual set.

## 6. Determinism

A fork's world is exact or refused (§3.2); its ids and clock are the caller's; the tests prove payload identity after *n*.

## 7. Non-goals

- Recording the random stream (§2 item 3); forking onto a different goal card; forking a group episode (a member run can be forked as a single-seat run — recorded as a limitation); the Spec Lab editing a fork in place; the fold's `related` for tool calls inside a group (`onBehalfOf` is WP65's).
- No new event types: `forkedFrom` is a field on `run.started`.

## 8. Divergences from `41-…` §6.9 and `42-…` §3, with reasons

| Doc says | This note does | Why |
|---|---|---|
| "seeds `random` from the recorded stream position" | The caller's `random`; identity proved over worlds that draw nothing after creation | The stream's position is not on the trace (§2 item 3) |
| "reproduces the original's events after *n* byte-identically" | `{ type, tick, payload }` identical; the envelope (ids, runId, timestamps) is the fork's own | A fork is a new run |
| "rebuilds the world by replaying `world.changed` through `perform`" | `restore(snapshot)` where a world has it; else the recorded *calls* replayed and checked against the snapshot | A `world.changed` carries a state, not a call; `perform` takes a call |
| `overrides.counterpart` | `overrides.world` | A counterpart is seated inside a world; handing in the world is the general door |
| the Run Lab's fork "with synced scrubbing" over any override | The Workshop forks without overrides; overrides are headless | Editing a fork's bot in the Spec Lab is its own WP |

## 9. Risk register

| Risk | Mitigation |
|---|---|
| The desk snapshot shape change breaks a stored trace | Additive field; `DeskView` ignores it; goldens re-recorded with notes |
| A replayed world differs silently | The rebuild compares snapshots and throws with the path |
| The memory refold drifts from the loop's own | One function, `tickMemoryFrom`, used by the loop's `remember` path in a test |

## 10. Implementation plan

- **Stage A — the fork in core.** `restore?` on `WorldInstance`, on the desk (with the counterpart field, goldens re-recorded) and the Playroom; `forkSession`, `tickMemoryFrom`, `brainTurnsThrough`; `run.started.forkedFrom`, `RunRecord.forkedFrom`; the identity tests over the goldens; the Fraud Desk freeze fork with the card added.
- **Stage B — the harness and the fold.** `craftabot fork` with `kit.json` beside every run; `decisionExplanation` with `related`, snapshot-tested over the goldens; the lending fork under two guard stacks; the assurance pack's incidents quoting explanations.
- **Stage C — the Workshop, the close-out.** Explain in the inspector with related rows lit; "Fork from this tick" and Compare's sync; screenshots; e2e.

## 11. Acceptance criteria (WP66 as a whole)

1. A fork at tick *n* with no overrides reproduces the origin after *n* in `{ type, tick, payload }` over the starter golden, the desk golden, the two-seat golden and the confused-deputy golden.
2. A fork of a Fraud Desk freeze with *Freeze needs a second look* added pauses where the origin froze.
3. A fork of a declined loan under a different guard stack diverges or does not, and the harness's report says which.
4. `decisionExplanation` is snapshot-tested over every golden trace; the assurance pack quotes it for incidents.
5. The Run Lab highlights a decision's related rows; "Fork from this tick" opens Compare with synced scrubbers from the fork (e2e).

> **Stage A landed 2026-09-06.** `WorldInstance.restore?` (§2 item 1), on the desk — the state wholesale, the counterpart's memory and the random's draw count now in the snapshot so a `once` rule does not fire twice and a counterpart's random choice lands where it did; the two desk goldens re-recorded for the two added fields, `43-…` §7 and `46-…` §7 amended — and on the Playroom, whose state is its whole world. `forkSession` in `core/src/session/fork.ts` (§4.1): the goal card checked, the origin's `run.started` and the fork tick's `tick.completed` required, the world put back through `restore` or rebuilt by replaying its recorded calls and delivered inputs in order and checked against the recorded snapshot at the moment it was recorded (a mismatch throws with the first differing path), the memory window refolded (`tickMemoryFrom`, built the way REMEMBER builds it — the observation's short form, the thought and the call, "used the … tool"/"tried to …" with what happened, the refusal a rule or a person wrote), the notebook replayed from the notebook tool's own calls (`notebookFrom`), the next prompt's feedback (`feedbackAfter`: a failed action's narration, a refusal, the mumble note), usage and the guardrails' history restored, and `run.started.forkedFrom` on the schema with `RunRecord.forkedFrom` beside it (`02-…` §7 amended, `docs/schemas` regenerated). `createSession` takes the fork's state through `deps.fork`; `createMockProvider` gains `startAt`, since a scripted brain resumes where the origin left it (§2 item 5) — the mock's own turn counter is on the trace as `raw.turnIndex`, which is why a sliced script was not enough. **The proofs** (§11 items 1–2): a fork at every completed tick of the starter's say-hello and confused-deputy goldens and of the desk golden reproduces the origin after the fork tick in `{ type, tick, payload }` (the fork's opening is its own `run.started` and the restored world, then its rows begin at tick + 1); a notebook written before the fork is on the fork's first prompt; a world with no `restore` is rebuilt and refused when its calls do not reproduce the recorded state; and the Fraud Desk's adversary, forked after tick 1 with *Freeze needs a second look* added, pauses at tick 2 where the origin froze, while the same fork with nothing changed freezes as the origin did, event for event. Two things the proofs taught the note: the engine re-asks an empty reply once within a tick, so the mumble note follows two empties, not one; and the fork's first tick is `tick + 1` while its `run.started` carries tick *n*. The two-seat golden is not forked (§7: a group episode is a later door). Gate: root lint, every workspace's tests, the build, the evals baseline, the default e2e and the visual set.

> **Stage B landed 2026-09-06.** `craftabot fork --run <id> [--tick n] [--kit other.json] [--brain …] [--seed n] [--deny] [--egress …] [--out …]` (`harness/src/commands/fork.ts`, §4.3): the origin's events and record from the file store, the spec from the record's own snapshot or a kit's counterfactual one (§2 item 6 corrected — the run record carries the spec, so no `kit.json` is written beside a run), the scripted brain resumed at `brainTurnsThrough` through `chooseBrain`'s new `startAt` (`loadSpecFrom` and `chooseBrain` exported from `run.ts` for it), the fork run to the origin's budget and written as `run` writes — `run.json` with `forkedFrom`, the events, the summary, the trace file — and two verdicts on the report: `divergence` (the first row after the fork tick that differs in type, tick or payload) and `acts` (the narrower question: did the bot decide or do anything differently — a guard that only checks leaves it `same`). The proof (§11 item 3): the Lending Desk's clear decline, forked after tick 2 under the five cards, decides the same — the rows diverge at tick 3 (the cards' checks) and the acts do not, and the run still succeeds; forked under a build that blocks `decide`, the acts diverge at tick 3 and the run does not succeed; a fork with nothing changed neither diverges nor acts differently, and its record, its `run.started` and its trace file all name the origin. `decisionExplanation(events, decisionEventId, { callsAvailable? })` in `governance/reports` (§4.4): the observation, the prompt's sections and sizes, the calls the caller names (the trace carries the prompt, not the tool list — a `DecisionExplanationOptions` field, filled by the pack from the spec's capabilities), the decision, every `guardrail.checked` between it and its effect with `allow`/`block`/`stop`/`pause` and the card, the approval, the result (an action's narration and diff, a tool's output), `reasonsUsed`, and `related` — the tick's sense, prompt and think rows, the decision, every check, trip and external call, the approval pair, the result and the world change; `explanationsForTicks` for the pack. Snapshot-tested over every decision of the four goldens (say-hello, confused-deputy, desk-minimal, the two-seat one) and checked row by row on a hand-built tick. The assurance pack's incidents now carry their findings' explanations when the host hands the traces in — `assurancePackFromStorage` reads the incident runs' events — and `53-…` §7 says so; the pack's snapshot re-recorded for the new field. Gate: root lint, every workspace's tests, the build, the evals baseline, the default e2e and the visual set.

