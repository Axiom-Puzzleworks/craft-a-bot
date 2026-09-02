# 31 — Evaluators (WP43): one contract for "what does this trace say"

> **Status:** design of record for WP43 (`27-DAY3-ROADMAP.md` Phase J), written 2026-09-02 against the codebase after WP42. This is the map for `26-TARGET-DESIGN-V3.md` §6.2; where the two differ, §8 below says why and `26-…` §12 gets a dated note when the stage lands. (`27-…`'s row names this note `30-EVALUATORS.md`; `30-…` went to WP42's vendors, so this is `31`.)

---

## 1. Purpose

Three things judge a finished trace today and none of them shares a shape: an `AssertionCard` (deterministic, exact, per completed call — `evals/assertions.ts`), `scoreRun` (metrics, no verdict), and a campaign gate (a rate over cells). Nothing can ask a model whether a run *did the right thing*, nothing records what a judge saw, and a card that reads token usage can never fire because the assertion runner scores every call against zeroed usage. WP43 gives the three one contract — `Evaluator` — and a stored artefact — `EvaluationRecord` — so a verdict is something a gate reads, a dashboard plots, a Run Lab shows and a bundle carries, whoever produced it.

---

## 2. Where the code actually is

**`packages/core/src/schemas/assertion-card.ts`** — `assertionCardSchema` `{ id, title, description?, schemaVersion: 1, quantifier: 'never' | 'at-least-once', when: PredicateExpr }`. **`packages/evals/src/assertions.ts`** — `evaluateAssertion(card, events)` walks `tool.executed`/`action.performed`, evaluates `card.when` per call through governance's `evaluatePredicate` with `usage: ZERO_USAGE` (its own comment: "a card that tried `usage-at-least` would silently never fire"), returns `{ card, pass, matches[] }`; `runTestBench(cards, events)`. **`packages/governance/src/policy-compiler.ts`** — `PredicateEvalContext { proposed?, usage }`. **`apps/workbench/src/lib/workshop/assertion-cards.ts`** — the five built-in cards (`starter/testbench/*`, `workshop/testbench/*`), the only cards anywhere, held by the app, not a pack. **`apps/workbench/src/routes/workshop/bench/+page.svelte`** — picks a stored run, `testBenchCards.map((card) => evaluateAssertion(card, events))`. **`packages/evals/src/campaign.ts`** — cells carry `assertions: Record<cardId, boolean>`; gate kind `assertion-pass-rate`. **`packages/core/src/storage/storage.ts`** — `Storage` with run summaries and campaign reports, no evaluations; IndexedDB at version 4. **`packages/harness/src/cli.ts`** — `packs | run | bundle | report | campaign`. **`apps/workbench/src/routes/workshop/runs/[runId]/+page.svelte`** — the inspector shows the selected event, raw JSON, the prompt diff. **`packages/packs/monitor`** — the Watchbot, `post-act` note-only rules from a `contributeGuardrails`. `LLMProvider.chat(req, opts)` needs a `model`; a `ProviderFactory` builds one from a key.

---

## 3. Design principles

1. **A verdict is data beside the run, not an event in it.** Evaluation runs *over* a finished trace; hard rule 3 asks for no event. The result is an `EvaluationRecord` stored beside the run, shown, bundled and gated on.
2. **Deterministic evaluators run in CI; the rest have an offline stand-in.** `kind: 'deterministic'` is pure over its input; `'model'` and `'hosted'` must ship `createOffline` (tenet 10), and a campaign in CI runs exactly those.
3. **Evidence names events.** Every result points at the event ids its verdict rests on — never the whole trace, never nothing.
4. **The existing cards do not change shape.** Every `AssertionCard` becomes an `Evaluator` through one adapter; the Test Bench renders through it with identical results.
5. **A judge that calls out records the call.** `result.external` is the same `ExternalCallRecord` a hosted guardrail writes, so the Audit Centre lists every network call a run and its evaluation made.

---

## 4. The design

### 4.1 The contract (core, stage A)

```ts
// types/evaluator.ts
export interface EvaluationInput {
  run: RunRecord;
  events: readonly EngineEvent[];
  group?: { record: GroupRunRecord; members: Array<{ run: RunRecord; events: readonly EngineEvent[] }> };
  /** The scenario's expectations, once WP44 defines them; opaque until then. */
  scenario?: unknown;
}
export interface EvaluationResult {
  evaluatorId: string;
  verdict?: 'pass' | 'fail' | 'inconclusive';
  score?: number;                        // 0..1
  label?: string;
  explanation: string;
  evidence: Array<{ eventId: string; tick: number; note?: string }>;
  external?: ExternalCallRecord;
}
export interface EvaluatorDeps {
  config?: unknown;
  provider?: LLMProvider;
  /** The wire model the provider should be asked for — a `model` evaluator needs both. */
  model?: string;
  fetch: typeof globalThis.fetch;
  getCredential(id: string): string | undefined;
  signal?: AbortSignal;
}
export interface Evaluator {
  id: string; name: string; description: string;
  kind: 'deterministic' | 'model' | 'hosted';
  configSchema?: ZodType<unknown>;
  credential?: BrickKindDefinition['credential'];
  egress?: EgressDeclaration[];
  evaluate(input: EvaluationInput, deps: EvaluatorDeps): Promise<EvaluationResult>;
  createOffline?(): Pick<Evaluator, 'evaluate'>;   // required when kind !== 'deterministic'
}
```

`evaluationResultSchema` and `evaluationRecordSchema` (`{ id, runId, evaluatorId, campaignId?, result, evaluatedAt, schemaVersion: 1 }`) in `schemas/records.ts`. `Storage` gains `putEvaluation`, `listEvaluations(runId)`, `listAllEvaluations()`, `deleteEvaluationsFor(runId)`; deleting or evicting a run takes its evaluations with it; `clear()` clears them. Memory, IndexedDB (version 5, an `evaluations` store indexed by `runId`) and the file store (`runs/<runId>/evaluations.jsonl`) all pass the extended contract suite. `PackManifest.evaluators?: Evaluator[]` and `PackManifest.assertionCards?: AssertionCard[]`; registry `getEvaluator`/`listEvaluators`/`getAssertionCard`/`listAssertionCards`; `describeEvaluatorProblems` refuses a non-deterministic evaluator with no `createOffline` at registration.

### 4.2 Cards as evaluators, and the judge (evals, stage B)

`assertionEvaluator(card): Evaluator` — kind `deterministic`, `evaluate` walks the same completed calls but hands `evaluatePredicate` the **run's own usage** (`input.run.usage` + `input.run.ticks`), so `usage-at-least` fires for the first time; `evidence` is one entry per matched call (`eventId`, `tick`, the call rendered); `verdict` `pass`/`fail` by the quantifier; `label` `'matched'`/`'clean'`. `evaluateAssertion` is kept, now a thin wrapper that builds a provisional `RunRecord`-less input — the Test Bench and the campaign runner switch to the evaluator path and their results are asserted identical. **The five built-in cards move into their packs**: `starter/testbench/*` onto `pack-starter`'s manifest, `workshop/testbench/*` onto `pack-workshop`'s; the workbench's `assertion-cards.ts` becomes `registry.listAssertionCards()`.

`evals/judge/rubric` — kind `model`. Config `{ rubric: string; passMark: number (0.5) }`. It renders the run as a transcript (each tick's observation summary, thought, call and result narration), asks the provider for JSON `{ score, verdict, explanation, evidence: tick[] }` with the rubric as the system message, parses defensively (a malformed answer is `inconclusive`, never a throw), maps the ticks it cites to event ids, and records the call as `external` (`service: providerId`, `endpoint: 'provider://<id>/<model>'`, `method: 'chat'`, latency, chars). `createOffline()` returns `inconclusive` with an explanation that says so — never a canned pass.

**Campaigns:** the campaign file gains `evaluators?: Array<{ id: string; config?: unknown }>` run per cell (offline for non-deterministic kinds, always), a cell gains `evaluations: Record<evaluatorId, 'pass' | 'fail' | 'inconclusive'>`, and the gate kind `evaluator-pass-rate` `{ evaluatorId, atLeast?, atMost? }` counts `pass` over cells where the verdict is not `inconclusive` (inconclusive cells are excluded, and a gate with none left is inconclusive itself, as `no-regression` already is).

### 4.3 The Workshop (stage C)

- **`/workshop/evaluators`**: every registered evaluator with its kind, credential and egress; pick a stored run; run any evaluator (a `model` one through the app's provider for the run's own cartridge when its battery is in, offline otherwise); every result persisted as an `EvaluationRecord` and listed.
- **Run Lab — "Evaluations" inspector**: the stored evaluations for the open run, verdict, score, explanation, evidence as clickable ticks.
- **Test Bench** renders through `assertionEvaluator` — same cards, same results, its e2e unchanged.
- **`workshop/monitor-judge`** (safety socket, Workshop audience): names an evaluator and runs it at `post-act` over the trace so far, `note`-only, through `createOffline` unless the evaluator is deterministic — an in-run judge whose notes are `guardrail.checked` rows, nothing new on the bus. A *live* in-run model judge needs a provider inside a brick, which `BrickRuntimeContext` does not carry; that is WP48's Watchbot work and is recorded as deferred (§8).

### 4.4 The harness and the kit (stage D)

`craftabot evaluate --run <id> [--evaluator <id>]... [--provider <id>] [--out ./runs]` runs every named evaluator (all deterministic ones by default) over a stored run and writes the records beside it; `craftabot bundle` carries `evaluations` in the trace file (`traceFileSchema` gains an optional `evaluations` array). `checkEvaluator(evaluator, fixture)` in the testkit: deterministic → identical result on repeat; evidence names real event ids; `createOffline` present for non-deterministic kinds; a planted secret never in `explanation` or `external`.

---

## 5. Non-goals

`geap/eval/*` over the Gen AI evaluation service (`26-…` §6.2's third shipped evaluator) — a hosted evaluator with a live checkpoint, deferred to a follow-up once one can be taken; the contract's `hosted` kind is built and `checkEvaluator` covers it. A live in-run model judge (§4.3). Scenario expectations on the input (WP44 fills `scenario`).

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| The Test Bench's results drift under the adapter | The bench's e2e is unchanged and a unit test asserts old and new paths agree on every built-in card over a stored trace |
| A model judge's JSON is unreliable | Parse defensively; anything short of a verdict is `inconclusive`, and inconclusive never passes a gate |
| Golden traces | No engine change; both stay byte-identical by construction |

---

## 7. Stages

| Stage | Builds | Definition of done |
|---|---|---|
| **A** | This note; the contract, the record, storage across three stores, registry lanes | Contract suite green on all three stores; IDB upgrade test from v4 |
| **B** | `assertionEvaluator`, cards into their packs, the rubric judge, campaign evaluators + `evaluator-pass-rate` | Old and new assertion paths agree; `usage-at-least` fires; the judge parses good, bad and empty answers; a campaign gates on a verdict |
| **C** | `/workshop/evaluators`, the Run Lab inspector, the Test Bench through the adapter, `workshop/monitor-judge` | Bench e2e unchanged; an e2e runs an evaluator on a stored run and finds it in the Run Lab |
| **D** | `craftabot evaluate`, the bundle, `checkEvaluator` | Harness test evaluates a stored run and bundles it; `checkEvaluator` rejects the two broken fixtures |
| **E** | Close-out | Notes in §8, `26-…` §12, `27-…`, `CLAUDE.md`, README |

---

## 8. Divergences from `26-…` §6.2

- **D-a — `EvaluatorDeps.model`**: a `model` evaluator needs the wire model as well as the provider; §6.2's deps had only the provider.
- **D-b — `scenario` is `unknown`** until WP44 defines `ScenarioDefinition`.
- **D-c — `geap/eval/*` not shipped** (§5).
- **D-d — the in-run judge runs deterministic evaluators live and the rest offline** (§4.3).

Stage notes are appended below.

> **Amended 2026-09-02 (Stage A).** The contract and the record landed as §4.1 describes: `types/evaluator.ts` (`Evaluator`, `EvaluationInput`, `EvaluationResult`, `EvaluatorDeps`, `describeEvaluatorProblems`), the schemas in their own `schemas/evaluation.ts` (so `trace-file.ts` can carry a record without a cycle through `records.ts`), `Storage` with `putEvaluation`/`listEvaluations`/`listAllEvaluations`/`deleteEvaluationsFor` on all three stores — IndexedDB at version 5 with an upgrade test from v4, the file store at `runs/<runId>/evaluations.jsonl`, rewritten on a repeated id — cascading with run deletion and eviction; `PackManifest.evaluators` and `assertionCards` with registry lookups, a non-deterministic evaluator without `createOffline` refused at registration. Gate: core 42 / 618 with thresholds, harness 91, the IDB suite 61.

> **Amended 2026-09-02 (Stage B).** **The adapter lives in `@craftabot/governance`** (`evaluators.ts`: `assertionEvaluator`, `evaluateCard`, `provisionalRun`, `evaluationInputFor`, `completedCalls`), not in `evals` as §4.2 said: it rests on `evaluatePredicate`, and a pack that wants it (the Monitor Judge) must not depend on `evals`, which depends on `pack-starter` — putting it beside the predicate evaluator broke a cycle that turbo counts through dev dependencies too. `evals` re-exports it and keeps the registry helpers (`evaluatorsOf`, `resolveEvaluator`). `evaluateAssertion`/`runTestBench` are faces over it and take the `RunRecord` when a caller has one. The five built-in cards moved onto `pack-starter` and `pack-workshop`'s manifests; the workbench's `assertion-cards.ts` is a door onto `registry.listAssertionCards()`. **The rubric judge is a pack** — `@craftabot/pack-evaluators`, id `evals` — because an evaluator registers like every other contribution and its id must be qualified; `evals/judge/rubric` is kind `model`, parses one JSON object defensively (anything short of a verdict is `inconclusive`, never a pass), records its call as `external`, and its offline form is `inconclusive` and says so. **Campaigns:** `evaluators: [{ id, config? }]` on the file, `evaluations` on the cell, the `evaluator-pass-rate` gate excluding `inconclusive` cells and inconclusive itself when none are left; the runner builds a registry from the starter pack plus `options.packs` to resolve ids. `usage-at-least` fires for the first time (`evaluators.test.ts`). Gate: evals 88, evaluators pack 7, starter/workshop green with the cards, workbench's card tests over the registry.

> **Amended 2026-09-02 (Stage C).** `/workshop/evaluators` (every registered evaluator and card, run over a stored run through `runEvaluator` — the run's own provider and wire model when its battery is in, offline otherwise — every record persisted), the Run Lab's **Evaluations** inspector (verdict, score, explanation, evidence ticks that scrub), the Test Bench through the adapter with its e2e unchanged, and `workshop/monitor-judge` (an evaluator at `post-act`, note-only, deterministic live and the rest offline; three `BuildProblem` codes). `BrickRuntimeContext` gained **optional** `getEvaluator`/`getAssertionCard` and `BrickValidationContext` `hasEvaluator` — optional so no hand-built context in any test had to change. The evaluators e2e runs a card and the judge over a stored run and finds both in the Run Lab. Gate: workshop pack 76, workbench green, e2e 150/150.

> **Amended 2026-09-02 (Stage D — WP43 closed).** `craftabot evaluate --run <id> [--evaluators a,b] [--rubric …]` runs every deterministic evaluator by default, a model one through the run's provider when its credential variable is set and offline otherwise, writes the records beside the run and exits 1 on an unknown id; `craftabot bundle` carries `evaluations` (`traceFileSchema` gained the optional array, redacted like everything else and outside the digest). `checkEvaluator` in the testkit — result shape, determinism on repeat, evidence naming real events, `createOffline` for non-deterministic kinds, no planted secret in a result — runs from `describeConformance` for every evaluator a manifest ships; the broken fixture pack fails it three ways and the rubric judge passes it. Against the row: every built-in card is an `Evaluator` and the bench renders through it with identical results (its e2e unchanged); `usage-at-least` fires; the judge scores a stored run in the Workshop and in the harness with its call recorded; an evaluation persists, shows in the Run Lab and rides in the bundle; `checkEvaluator` rejects the non-deterministic "deterministic" evaluator and the missing `createOffline`. Not built, as §5 says: `geap/eval/*` and the live in-run judge. Gate: harness 94, testkit 37, core 42 / 619, lint (34 tasks), build within budget, e2e 150/150.
