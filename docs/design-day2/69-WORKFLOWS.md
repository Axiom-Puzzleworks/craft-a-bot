# 69 — Workflows: stages, executors and stage records (WP79)

> **Status:** design of record for WP79 (`65-DAY5-ROADMAP.md` Phase S), opened 2026-09-10 on the `day5` branch after the Phase R exit review. Stage A is this note; stage B the package and the two events; stage C the harness's `workflow run`.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.2.1–§6.2.2 and §8 (decision D7 in part; tenet 21 — *the workflow is the unit of comparison; the stage is the unit of evidence*). Retires G45. The lending workflow itself, its reference configurations and the Pipeline view are WP80's and WP86's.

---

## 1. Where the code is

1. **A session is one bot over one world to one goal card.** `createSession({ spec, registry, provider, world?, guardrails?, options })` — the world is handed in or built from the card (`agent-session.ts:132`) and **never reset by the session**, so several sessions can work one `WorldInstance` in turn; the session ends when `world.test(card.successCondition)` holds (`:974`) or a budget runs out; `start('step')` then `step()` until an outcome.
2. **A goal card is content with a `successCondition`** (`GoalCardDefinition { id, title, goalText, worldId, layoutId, successCondition, hints, teachesConcepts, par, audience? }`), looked up on the registry by id. A stage that says *until `identity-verified`* is a goal card whose success condition is that predicate; the workflow can register one per stage on a registry of its own, built from the host's packs.
3. **The world performs an action without a session** — `WorldInstance.perform(call) → ActionResult`, `test(predicate)`, `snapshot()`, `truth?()`, `restore?(snapshot)` (WP66). A `rule` stage is `perform` with a call a pure function chose; the `action.performed` a session would have written is written by the workflow instead.
4. **A service line is a tool** — `registry.getTool(serviceLineToolId(packId, lineId, op))` with `execute(args, { tick, notebook, random, worldState })`; a `line` stage calls it and records a `tool.executed`.
5. **An approval is an event pair** — `approval.requested { proposed, reason }` resolved by `session.resolveApproval(approved, by?)`; a campaign resolves every pause with its scripted resolver (`51-…` §8). A `human` stage is the same shape lifted out of a session: a prompt, options, a resolver the host hands in, `by` recorded.
6. **The event envelope** — `{ id: uuid, runId: uuid, agentId, tick, timestamp, type, payload }`; `EventBus.emit` is public, so a workflow can put `stage.*` on a session's own stream before `start` and after the outcome. A trace's digest is over its event array, so it covers them.
7. **`forkSession` rebuilds a world from its recorded calls** (WP66) — and everything here is deterministic, so *re-running stages 1…n−1 with the same seeds* is the same as restoring them, and simpler: `fromStage` replays and then diverges.
8. **`sha256Hex` was `fs-bank`'s** (WP74); a stage record's digest wants it in `core`, so it moves there and `fs-bank` imports it.

## 2. Principles

- **A workflow is a schedule over what a desk already does.** No desk changes to be run as a workflow; an `agent` stage is the existing bot on a goal card whose success condition is the stage's `until`.
- **Every stage has typed input and output, validated both ways.** A stage whose executor ends without producing its output is `status: 'error'` with a finding — never a silent pass.
- **The executor is configuration.** The same stages run `rules-only`, `bot-everywhere` or with a person at the decision by swapping `WorkflowConfig.executors`; the spec's executor is the default.
- **One `WorldInstance` per workflow run**, carried across stages; every agent run the workflow made is on the record by id, and its events carry the stage boundary.
- **Determinism.** A workflow run is a function of the item, the config, the seed and the providers; `fromStage` at *n* reproduces stages 1…n−1 byte-identically.

## 3. The contract (in `core`, `types/workflow.ts`)

```ts
export type Executor =
	| { kind: 'rule'; rule: string }                                   // WorkflowSpec.rules[rule]
	| { kind: 'agent'; until: string; maxTicks?: number }              // the bot on a card whose successCondition is `until`
	| { kind: 'human'; prompt: string; options: string[]; default?: string }
	| { kind: 'line'; lineId: string; operation: string; arguments?: (input, state) => unknown };

export interface StageSpec<In = unknown, Out = unknown> {
	id: string; name: string;
	input: JsonSchema; output: JsonSchema;
	executor: Executor;
	guards?: { policyCards?: string[]; components?: StageGuardComponent[] };   // WP95, §10
	irreversible?: boolean;
	/** The stage's output read off the world once the executor is done (agent and line stages); a rule returns its own. */
	read?: (state: WorldState, truth: unknown) => Out | undefined;
	/** Which stage follows, from this one's output, the state and (since stage B) the input it was given. */
	next: (out: Out, state: WorldState, input: In) => string | 'end';
}

export type RuleFn<In = unknown, Out = unknown> = (input: In, state: WorldState, truth: unknown) => { output: Out; call?: ActionCall };

export interface WorkflowSpec {
	id: string; name: string; worldId: string; purpose: string;
	intake: (item: WorkItem) => { layoutId: string; input: unknown; config?: Record<string, unknown> };
	stages: StageSpec[]; first: string;
	rules?: Record<string, RuleFn>;
	obligations: string[];
	/** Named configurations, each an autonomy level applied to the journey (WP80). */
	configurations?: Record<string, WorkflowConfig>;
}

export interface WorkflowConfig {
	executors?: Record<string, Executor>;
	knobs?: Record<string, number | string | boolean>;
	autonomy?: { level: 1 | 2 | 3 | 4 | 5; ceilings?: Record<string, 1 | 2 | 3 | 4 | 5> };
	context?: unknown;                                                 // WP81's ContextSpec
}
```

`PackManifest.workflows?: WorkflowSpec[]` — content, registered like worlds; ids qualified.

## 4. The records (in `core`, `schemas/workflow-run.ts`; `docs/schemas/workflow-run.schema.json`)

```ts
export interface StageRecord {
	stageId: string; executor: Executor (as data); startedTick: number; endedTick: number; durationMs: number;
	input: { digest: string; value?: unknown }; output: { digest: string; value?: unknown };
	guards: { checked: number; tripped: Array<{ guardrailId: string; disposition: string; cause?: string }>; verdicts?: BoundaryVerdict[] };   // `verdicts` WP95, §10
	runId?: string; approval?: { requested: true; by?: Principal; decision: string };
	status: 'ok' | 'blocked' | 'escalated' | 'error'; finding?: string;
}
export interface WorkflowRun {
	schemaVersion: 1; id: string; workflowId: string; itemId: string; populationDigest?: string;
	config: WorkflowConfig (as data); startedAt: string; finishedAt: string;
	outcome: 'completed' | 'stopped' | 'abandoned';
	stages: StageRecord[]; runIds: string[];
	/** The workflow's own events — `stage.*` for the non-agent stages, the `action.performed` and `tool.executed` they made. */
	events: EngineEvent[];
	digest: string;   // sha256 over canonical JSON of the stage records
}
```

A value is kept on the record when its canonical JSON is under 16 kB, else the digest alone.

## 5. The runtime (`@craftabot/workflow`, `runWorkflow`)

```ts
runWorkflow(spec, item, {
	config?, packs, spec: AgentSpecV2, providerFor: (stage, goalCardId) => LLMProvider,
	guardrailsFor?: (cardIds) => Guardrail[], human?: (stage, state) => Promise<{ decision; by? }>,
	approve?: (stage, proposed) => boolean, principal?, egress?, now?, newId?, random?,
	fromStage?: { stageId; from: WorkflowRun; config }, onStage?
}): Promise<WorkflowRun>
```

1. **The registry** is built from `packs` plus a synthetic pack `workflow/<workflowId>` carrying one goal card per agent stage — `${workflowId}/stage/${stageId}`, the workflow's world and the intake's layout, `successCondition: until`.
2. **The world** is `definition.create(layoutId, { random, config: { ...intake.config, knobs } })`, once.
3. **Each stage** validates its input, runs its executor, reads its output, validates it, records, and asks `next` where to go (`'end'` ends). An unknown stage id is an error; a cycle is bounded by a step limit.
   - `agent`: a session over the shared world with the bot on the stage's card (its `goalText` when the executor names one, else `${purpose} — ${name}.`) and the stage's guards compiled by the host; `stage.started` emitted on the session's bus with `tick: 0` before `start('step')`, `stage.completed` after the outcome with the last tick; the record's `guards` folded from the run's `guardrail.*` events, `runId` the session's. An `OUT_OF_STEPS` or a missing output is `error` with a finding; a blocked action that ends the run is `blocked`.
   - `rule`: `rules[id](input, snapshot, truth)` → `{ output, call? }`; a call is performed and written as `action.performed` on the workflow's events.
   - `human`: the host's resolver (default: the executor's `default`, else its first option, `by` absent); written as `approval.requested` / `approval.resolved` on the workflow's events; the output is `{ decision }`; `escalated` when the decision is not the first option.
   - `line`: the registry's tool for the line's operation, `execute(arguments(input, state), context)`; `tool.executed` on the workflow's events; the output the tool's `data ?? { output }`.
4. **`fromStage`**: stages before `stageId` are re-run under the origin's config with the same seeds, then the new config applies — a fork lifted to stages; the test compares the records.
5. **The digest** is over the stage records' canonical JSON.

## 6. The two events (`02-AGENT-MODEL.md` §7, additive)

| Event | Payload | Emitted |
|---|---|---|
| `stage.started` | `{ workflowRunId, stageId, executor, input: { digest, value? } }` | on the agent run's trace at tick 0 when a bot does the stage; on the workflow's own events otherwise |
| `stage.completed` | `{ workflowRunId, stageId, output: { digest, value? }, status, guards }` | the same, at the run's last tick |

> **Amended 2026-09-12 (WP95, §10).** `stage.completed.guards` gains `verdicts?: BoundaryVerdict[]` — the boundary chain's verdicts in order, absent when the stage had no boundary guards. A boundary check is a `guardrail.checked` (and, on a denial, a `guardrail.tripped`) with `point: { kind: 'stage-in' | 'stage-out', at: stageId }` on it: at `stage-in`, on the workflow's own events before the stage starts; at `stage-out`, where the stage's `stage.completed` is written — the agent run's trace for a bot, the workflow's events otherwise.

Both optional in every reader; the OTel mapping (`35-…`) gives each a child span `stage <id>` with `craft_a_bot.stage.*` attributes; a trace's digest covers them.

## 7. Tests (stage B's DoD, `65-…` WP79)

- A workflow of one agent stage over the desk golden trace (`packages/desk`'s test desk and `trace.desk-minimal.v1.json`) reproduces the session's events byte for byte plus only the two `stage.*` events; the lending desk's own identity lands with `LENDING_WORKFLOW` (WP80).
- A `rule` stage performs the desk's action and writes the same `action.performed` a session writes for it.
- A `human` stage resolves by the scripted resolver and records `by`.
- A stage whose bot ends without the output is `error` with a finding.
- `fromStage` at stage *n* reproduces stages 1…*n*−1 byte-identically and diverges after.
- Input and output are validated both ways; a wrong output shape fails the stage, not the run.
- The schema validates a run; the trace digest covers the new events; both desk goldens are unchanged.

## 8. Stage plan

- **Stage A** — this note.
- **Stage B** — `core`: `types/workflow.ts`, `schemas/workflow-run.ts`, the two events, `sha256Hex`, `PackManifest.workflows`; `packages/workflow`: `run.ts`, `validate.ts`; the telemetry spans; the tests.
- **Stage C** — the harness's `craftabot workflow run --workflow <id> --item <file>` over one work item, writing the `WorkflowRun` and every agent trace to the run directory.

## 9. Divergences from `64-…` §6.2

> **Amended 2026-09-10 (stage B built).** What the build settled beyond the note: (1) the agent executor carries `goalText?` — a stage's brief is the card's, and the golden trace's prompt tokens depend on it; (2) the workflow's clock, id source and stream (`now`, `newId`, `random`/`seed`) are distinct from the agent seat's (`session: SessionOptions`), and the world is created with the seat's `random` when given — so an agent stage's trace is byte for byte the trace a session alone writes, with the two `stage.*` events stamped by the workflow's clock around it; (3) `onAgentRun` hands every agent run's events to the host as it ends, since the package writes nothing — the harness writes them as `run` does; (4) the identity test runs over `desk`'s test desk (now shipped as `@craftabot/desk/testing`) and `trace.desk-minimal.v1.json` (§7 item 1's lending identity lands with WP80); (5) `PackManifest.workflows` is indexed by the registry (`getWorkflow`/`listWorkflows`) so a host finds a pack's workflow by id; (6) a `line` executor's pack is the segment before the line id's last slash; (7) the world is created with a `config` only when there is one (an intake config or knobs), so a plain case is built exactly as a session builds it; (8) an agent stage's `stage.completed` lands after `run.finished` — the last event on the trace — and its tick is the run's last.
>
> **Amended 2026-09-11, later (WP81, `70-…` §3).** `WorkflowConfig.context` is typed `ContextSpec` and reaches the world at `create` beside the knobs — a re-run from a stage keeps the origin's rung, as it keeps its knobs.
>
> **Amended 2026-09-11, later (WP88, `79-…` §3).** `StageSpec.obligations?: string[]` — the obligation tags a stage answers for, content on the three workflows' stages (the lending desk's `explanation` for `fca:cd:understanding`, the fraud desk's `contact` for `poca:tipping-off`, the advice desk's `recommendation` for `fca:cd:support`); the Conduct page opens the Pipeline at the first stage naming a tag, else the first stage. The runtime reads nothing from it.

> **Amended 2026-09-11 (WP80, `73-…` §7).** Three additions to the contract, all optional: `StageSpec.suggest?(input, state, truth)` — what a scripted person answers at a `human` stage, which the runtime's default resolver and the harness's `--decide` fall back to; `WorkflowSpec.decisionKindOf?(stageId, output)` — the decision kind a stage's output is, for the ceilings; `WorkflowSpec.book?(request)` — the book the workflow draws from a population at a seed and size. `RunWorkflowOptions.onFinished(world, run)` hands the world back for a campaign's scoring. And one correction to §3 as built: `read` applies to `agent` and `line` stages only — a rule and a person return their own output, and it is that output the schema checks. `@craftabot/workflow` also folds a run to the human-load metrics' shape (`touchedCaseOf`).
>
> **Amended 2026-09-10, later (stage C built).** `craftabot workflow run --workflow <id> --item <item.json> [--config <name>] [--kit <bot>] [--brain …] [--seed <n>] [--decide <stageId>=<option>,…] [--deny] [--egress …] [--out ./runs]` (`packages/harness/README.md`): the workflow found on the registry, the item parsed as a `WorkItem`, `--config` one of the workflow's named configurations, `--kit` the bot every agent stage seats (needed only when a stage's executor is the bot — the scripted brains look a stage's plan up by the stage card's id, `<workflowId>/stage/<stageId>`, so a pack's `testing` plans answer for its workflow), `--decide` the answers for the human stages, else each executor's default. Every agent run is written exactly as `run` writes one; the workflow run as `<out>/workflows/<id>/workflow-run.json`. Exit 0 on `completed`, 1 otherwise.

- `agent` executors name `until`, not a `goalCardId`: the card is synthesised per stage on the workflow's registry, because a stage's card is the stage (§1 item 2), and a pack would otherwise ship nine cards it never plays.
- `fromStage` re-runs rather than restores (§1 item 7) — the same bytes by construction, no snapshot to carry.
- A `line` executor carries an `arguments(input, state)` function beside `lineId` and `operation`, since an operation's arguments come from the case.
- The JSON-schema validation at the boundary is a small structural checker in the package (`type`, `required`, `properties`, `enum`, `items`), not a full validator — enough for the stage records, and dependency-free.

> **Amended 2026-09-11 (WP84, `75-THE-MONITOR.md` §5).** `WorkflowSpec.kinds?: WorkItemKind[]` — the work-item kinds the workflow takes, so a host assigning desks by workflow (the Monitor's set-up) knows what the clock may offer them; `LENDING_WORKFLOW` declares `['application']`, and a workflow without one is assumed to take applications. `71-…` §7's divergence (the desks route by an explicit `kinds` list) stands: the assignment still names its kinds, the workflow now says which it can take.

> **Amended 2026-09-11 (WP85, `76-…` §3).** One runtime change: `stagePack(spec, layoutId, executors?)` synthesises a card for every stage whose *effective* executor — the configuration's over the spec's — is a bot, so a stage a person takes by default and a bot takes in one configuration (the fraud SAR at Level 5) has its card when that configuration runs. `runWorkflow` passes its config's executors.

## 10. Stage-boundary guards (WP95, `83-…` §6.2.3, D11)

> **Amended 2026-09-12 (WP95, built).**

**The contract.** `StageSpec.guards` widens to `{ policyCards?: string[]; components?: Array<{ id, config?, point: 'stage-in' | 'stage-out' }> }`. A component at a boundary is any `GuardrailComponent` (`85-…`) that declares the point — the `policy-card` and `guard-service` adapters now declare both boundaries beside their loop hooks, the `evaluator-breaker` declares `stage-out`. `policyCards` is sugar for `policy-card` components at `stage-in`, kept so the three shipped workflows read as they did. **A card no longer runs inside the bot's loop at a stage** — before WP95 the runtime handed `guardrailsFor(policyCards)` to the agent stage's session; now every stage guard runs at a boundary, whatever the executor, which is the point of D11 (a `rule` stage and a `human` stage are guarded too). No shipped workflow had a card fitted, so nothing shipped changed.

**The runtime.** `RunWorkflowOptions.boundaryGuardrailsFor(stage, point)` replaces `guardrailsFor`; the host compiles it — `stageBoundaryGuardrails(registry, deps?)` in `@craftabot/governance` is the one implementation every host uses (`evals`' book cells, `craftabot workflow run` and `bank run`, the Worker), the cards first then the components, each stamped `point: { kind, at: stageId }`; `governance` stays out of `@craftabot/workflow`'s dependencies. `RunWorkflowOptions.guardrails` (WP94) is the loop's shared chain and is untouched. At `stage-in` the chain runs over the validated input before the executor; at `stage-out` over the validated output before the record is finished and before `next` reads it. Each guardrail is checked once with a `GuardrailContext` whose `stage` is `{ id, point, input, output? }` (the one `core` addition, additive), whose `proposed` frames the stage as an action named for it with the value as its arguments — so a policy card's rules read the stage as they would a call — whose `hook` is `pre-act` at `stage-in` and `post-act` at `stage-out`, and whose `history` is the bot's own run at a `stage-out` on an agent stage (so an evaluator breaker judges the run that just ended) and the workflow's events otherwise. A guardrail's `hooks` are not consulted at a boundary: the point is the hook there, and the component was compiled for it.

**The verdicts**, first non-allow wins: `block-action` → the stage is `blocked` with the reason as its finding and the journey stops; `stop-run` → the same, the verdict saying which; `pause` → `approval.requested` / `approval.resolved` on the events, answered by `options.approve` (approved when the host has none), a decline halting with `declined at <point>: <reason>`; `redact` → the value the next reader sees is rewritten (a string whole, an object's string `text`, anything else left as it was — WP96 widens this to the transcript) and the stage goes on; `annotate` and a plain allow → recorded. Every verdict is on `StageRecord.guards.verdicts` and `stage.completed.guards.verdicts` as `{ guardrailId, point, verdict, componentId?, policyCardId?, reason?, approved? }` (`boundaryVerdictSchema` in `core`, beside `stageRecordSchema`), and `guards.checked` counts the boundary's checks with the loop's. A stage with no boundary guards has no `verdicts` key, so every record written before parses and reads as it did.

**The tests.** `packages/workflow/src/run.test.ts` — a guarded rule stage trips at `stage-in` (nothing performed), a guarded human stage trips at `stage-out` after the person answered, a pause declined and approved, a `stop-run` ending the journey once the stage is recorded, redact and annotate over a rule's output read by the next stage, the agent stage's `stage-out` context carrying its own trace and the stage, and a record with no guards carrying no verdicts. `packages/governance/src/components/stage-guards.test.ts` — the sugar equals the component form, cards before components at their own point, a component that cannot decide at a boundary refused. `packages/packs/fs-lending/src/workflow.test.ts` — the evaluator breaker at the `decision` stage's `stage-out` over `fs-lending/decision-matches-rules` fails a planted over-approve (`blocked`, the journey stopped, the verdict naming the component) and lets the rule's own decision through. The three workflows' existing golden and configuration tests are unchanged and green.

**The Pipeline** (`77-…`) lists a stage's boundary verdicts under its trips — point, guardrail, verdict, reason.
