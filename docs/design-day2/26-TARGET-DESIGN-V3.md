# 26 — Target Design V3: The Safety Proving Ground

> The updated target design for Craft A Bot after Phases A–G. Written 2026-09-02, anchored against the codebase at commit `8776fcb` (V1.0 + Phases A–G closed, WP0–WP35 all done) — every contract named here is quoted or paraphrased from a real file, not from memory of one. Where this document and an earlier doc disagree, this one wins for the scope it names; each divergence is logged in §12 with its reason. Its companion, `27-DAY3-ROADMAP.md`, sequences the work.
>
> Prerequisite reading: `00-PROJECT-OVERVIEW.md` (the two purposes), `14-BRICK-REFERENCE-DESIGNS.md` §2–§3 (the open brick contract and the engine evolutions), `08-GOVERNANCE-GUARDRAILS.md` §2/§5 (the guardrail contract and the growth path), `25-ARMOUR-BRICK.md` (the first hosted control — the precedent this design generalises), `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` §9 (the 38-control catalogue), `18-DAY2-ROADMAP.md` §7 items 28–32 (the close-out entries that name the gaps carried into this design).

---

## 1. Purpose

### 1.1 The vision, restated for this phase

Craft A Bot has two purposes (`00-…` §1): a training ground for agentic-AI concepts, and a proving ground for automated AI governance and guardrails whose components are exported for real-world use. Phases A–F built the first purpose to completion and the second to *demonstration* — every control in `19-…` §9's catalogue that the roadmap chose now exists as running code, provable by a scripted test, visible in a trace. Phase G added the first control that lives *outside* the browser: a hosted policy service (Google Cloud Model Armor) fitted as a brick.

This design is about the step after demonstration: **making the Workshop a repeatable, extensible test rig for post-training AI-safety controls, into which enterprise solutions plug the way Model Armor already does, and out of which results flow into the workflows where safety decisions are actually made** — CI pipelines, observability stacks, audit files, safety cases.

Concretely, the Workshop of this design lets a practitioner:

1. **Plug in a guardrail vendor** — a hosted classifier, a policy decision point, a content filter, a local safety model — as a pack, with no core change, and have it appear as a brick, in the trace, in the OTel export and in the safety case exactly as the Armour Brick does today.
2. **Plug in an evaluator** — a deterministic assertion, an LLM-as-judge, a hosted evaluation service — and score any run or campaign with it.
3. **Run a campaign, not a run** — scenarios × builds × guards × brains × seeds, headless, from a file, in CI, with pass/fail gates and a report a pipeline can consume.
4. **Import scenarios** — adversarial corpora, policy-compliance cases, OWASP-tagged threat cases — rather than hand-write each one as a goal card.
5. **Send the evidence somewhere** — a trace sink (OTLP, file, a vendor endpoint), a bundle with a digest, a safety case with eval evidence — with every byte of egress declared and traced.

### 1.2 What this design is not

- **Not model training, fine-tuning, or dataset curation for training.** The toolset tests and integrates *post-training* systems. `18-…` §1's scope decision (no AI Architect box) stands; datasets appear here only as *test* inputs (scenario corpora), never as training material.
- **Not a hosting platform.** The bot still runs in the user's browser or the user's own Node process. "Run this kit on a vendor's agent runtime" remains a non-goal (`25-…` §7).
- **Not a backend.** Local-first holds (`00-…` §3.5). Every network call this design adds is opt-in, declared, credentialed from the user's own vault, and traced.
- **Not a change to the Kit.** The teaching arc, its ten chapters and five side quests, are untouched. Everything here is Workshop-only, gated exactly as the Armour Brick is (`audience: 'workshop'`, `preferences.workshop`).

---

## 2. Where the code actually is (the load-bearing facts)

Verified against `main` at `8776fcb`. These are what the design leans on and what it must not break.

**Scale.** `packages/core` 7.5k source lines (34 test files); `governance` 578 lines; `evals` 1.6k; `pack-testkit` 1.2k; nine packs (`starter` 5.2k, `geap` 1.2k, four provider packs ~0.8–1k each, `workshop` 0.9k, `monitor` 0.3k, `personas` 0.1k); `apps/workbench` 26.9k (103 test files). Twenty-one routes, thirteen of them under `/workshop`. CI (`.github/workflows/ci.yml`) runs lint, unit tests, build and Playwright e2e; it does **not** run `npm run evals`.

**The engine's extension points, all real and all proven by a pack that needed no core change:**

- `BrickKindDefinition` (`packages/core/src/types/brick.ts`): eight slot families (`brain`, `planner`, `perception`, `memory`, `equipment`, `mobility`, `reflexes`, `safety`); a `BrickRuntime` with seven optional hooks (`contributeReflex`, `contributeContext`, `contributeCalls`, `contributeSenses`, `contributeWorldConfig`, `contributeGuardrails`, `onTickEnd`, `contributeState`); a `BrickRuntimeContext` of `{random, getPolicyCard, getAction, fetch, getCredential}`; a `BrickValidationContext` of six `has*` lookups; `credential?` and `audience?` on the kind.
- `PackManifest` registers `brickKinds`, `tools`, `worlds`, `cartridges`, `goalCards`, `guardrails`, `policyCards`, `providers` — every one resolved through `PackRegistry` (`pack-registry.ts`), installed by one line in `apps/workbench/src/lib/packs.ts`.
- `Guardrail` (`types/guardrail.ts`): `{id, name, description, hooks, check, checkWithRecord?, policyCardId?}` over a closed verdict union (`allow` / `block-action` / `stop-run` / `pause`). `runGuardrailChain` (`session/guardrail-chain.ts`): first non-allow wins, every check reported. The session assembles `[...collectGuardrails(runtimes), ...(deps.guardrails ?? [])]`.
- `CreateSessionDeps` (`types/agent-session.ts`): `{spec, registry, provider, guardrails?, getCredential?, options?, world?}`; `SessionOptions` carries injectable `now`/`newId`/`random`/`fetch`, `strategies`, `parentRunId`, `budgets`.
- `SessionGroup` (`session/session-group.ts`): round-robin scheduler, merged stream, group guardrail chokepoint (`createGroupTokenBudgetGuardrail` is the one built-in rule), `group.started`/`group.finished`.
- The event catalogue, 25 types (`schemas/events.ts`): `run.started/finished`, `tick.started/completed`, `sense`, `prompt.composed`, `think.started/token/completed`, `decision`, `tool.executed`, `action.performed`, `memory.updated`, `brick.state`, `guardrail.external/checked/tripped`, `approval.requested/resolved`, `world.changed`, `input.delivered`, `provider.retried`, `error`, `group.started/finished`. The bus is synchronous and in-process; a slow `onAny` listener blocks the tick.
- `GuardrailContext` is `{hook, tick, spec, usage, proposed?, worldState, history}` — it carries neither the composed messages nor the raw `ChatResponse`; a guardrail that wants the model's own text walks `history` for the last `decision`, which is what `pack-geap`'s `text.ts` does.
- `PackManifest.guardrails` / `PackRegistry.getGuardrail` exist and nothing calls them — guardrails reach a run only via `contributeGuardrails` or `CreateSessionDeps.guardrails`. A pack cannot ship a *discoverable* guardrail catalogue today.
- **One brick per socket, including `safety`.** `starter/safety`, `monitor/watchbot` and `geap/armor` are mutually exclusive on a chassis: a bot cannot run local rules, an observer and a hosted guard at once. `14-…` §2.3 reserved the array shape for "multiples for the professional mode later"; nothing has used it.

**The hosted-control precedent, and exactly where it is vendor-specific.** `@craftabot/pack-geap` (`25-…`) ships `geap/armor`: `client.ts` (regional URL builder, bearer token, timeout, never throws, `scrubToken` on every message), `reading.ts` (Zod over Model Armor's `sanitizationResult` → a flat `ArmorReading`), `text.ts` (pure selectors: what text to screen at `pre-think`/`pre-act`/`post-act`), `guardrails.ts` (`verdictFor`: filter × hook-dial × per-filter override × confidence × `onFailure` → verdict; `checkWithRecord` measuring latency and building the `ExternalCallRecord`), `config.ts` (the dials), `strings.ts`. Of these, only `client.ts` and `reading.ts` are about Model Armor. Everything else — the three-hook screening shape, the disposition ladder `off/note/block/ask/stop`, the per-hook clamp, fail-closed-by-default, the timeout, the credential scrub, the offline switch, the `ExternalCallRecord` assembly — is the shape *any* hosted guardrail needs, and today it lives in one pack.

**`ExternalCallRecord.service` is `z.literal('model-armor')`** (`schemas/shared.ts`, line 157). The schema's own comment says a second hosted guardrail "widens it rather than adding a parallel event". That widening is the first thing a second vendor hits, and it is a core edit.

**Evaluation today.** `@craftabot/evals` has `runMatrix` over `MatrixSpec {goalCardIds, brains, configs, seeds}`, two scripted brain tiers plus an unrun `live` tier (`providerFor` must be supplied; no spend cap), a metrics fold (`scoreRun`), `EvalReport` v1, baseline comparison, a markdown scorecard, and `evaluateAssertion` over `AssertionCard {quantifier, when: PredicateExpr}`. `PredicateExpr` has four leaves — `call-kind-is`, `call-name-is`, `argument-equals` (exact match), `usage-at-least` — under `and`/`or`/`not`. No evaluator can read world state, history, or prose; no evaluator is an LLM; no evaluator is hosted. The CLI (`evals/src/cli.ts`) runs a fixed matrix and writes files; it persists no traces.

**Telemetry today.** `apps/workbench/src/lib/workshop/otel-export.ts` maps one stored solo run to an OTLP-shaped JSON (`invoke_agent` root, `chat`/`execute_tool`/`evaluate_guardrail` child spans, `gen_ai.evaluation.result` events for trips) and the Audit Centre downloads it. There is no exporter, no sink, no live streaming, no group bundle (`23-…` §4.7 and `07-…` §5 both carry dated notes that the bundle never shipped), and the mapping lives in the workbench, so a headless host cannot reach it.

**Persistence today.** The `Storage` contract and both implementations (`storage-idb.ts`, `storage-memory.ts`) live in `apps/workbench/src/lib/state/`. The record schemas they store (`RunRecord`, `GroupRunRecord`, `StoredEvent`, `AgentRecord`) live in core. Nothing outside the browser can store a run. The run cap is 50 with oldest-first eviction; four Workshop screens read every run's events on load (an N+1 over the whole store), so the cap is also the ceiling on any experiment corpus. An Eval Matrix report is component state — close the tab and the matrix is gone; only a cell drilled into is persisted.

**The analytic folds are locked in the app.** `run-projection.ts` (the one trace→state fold every viewer uses), `timeline.ts`'s `isFailure`, `incidents.ts`, `telemetry.ts`, `safety-case.ts`, `fleet.ts`, `safety-tally.ts` and `otel-export.ts` are all pure `EngineEvent[]` → report functions with no DOM dependency, and all live under `apps/workbench/src/lib/`. They are the substance of the governance product and no Node process can call them.

**Credentials today.** `credential.kind: 'api-key' | 'oauth-token'`; the vault is `cab.keys.v1`; `redact.ts` and `key-leak.test.ts` sweep every secret generically. The Armour Brick's OAuth client id is still unconfigured (`25-…` §8's close-out); the `gcloud auth print-access-token` path is what works. `credential.validate?(secret, fetch)` cannot take a brick's own config, so "Test the guard" is a Settings feature, not a kind's.

**Egress today.** Every pack that calls out (`openai`, `anthropic`, `gemini`, `ollama`, `geap`) hardcodes its hosts as constants and injects `fetch`. Nothing declares which hosts a pack may reach, nothing in a trace says where a run was allowed to call, and there is no "no egress" mode a CI job can assert.

**Known follow-ups carried in from `18-…` §7 items 28–32 and the docs' own dated notes** (each becomes a gap below): the `filters` nested-object control (`ArmourPanel.svelte`), the OAuth client id, the group trace bundle, the drift-over-time dashboard, the Studio-authored content store (policy cards, assertion cards), the `autonomy` picker, the Hearing channel's per-room queue, `D13` semver evaluation, Ollama's fixed endpoint, the eval live lane's spend decision, breakpoints / live trailing / fork-from-tick, Tool Shop Pack content.

---

## 3. Gap register (what stands between today and §1.1)

Severity as `12-…` §3: **A** blocks purpose 2 in practice; **B** compounds if built on; **C** hygiene.

| ID | Sev | Gap | Where |
|---|---|---|---|
| G1 | A | A second hosted guardrail vendor needs a core edit: `ExternalCallRecord.service` is a single literal. | `core/schemas/shared.ts` |
| G2 | A | The hosted-guardrail *mechanism* (three-hook screening, disposition ladder, clamp, fail-closed, timeout, scrub, offline, record assembly) lives in `pack-geap`, so a second vendor re-implements ~800 lines and re-proves every rule. | `packs/geap/src/armor/{guardrails,text,config,errors}.ts` |
| G3 | A | No evaluator contract. Assertions are exact-match predicates over calls; no LLM-as-judge; no hosted evaluation service; no way to attach a score to a stored run. | `core/schemas/assertion-card.ts`, `evals/src/assertions.ts` |
| G4 | A | No headless host. `Storage` is workbench-only; the evals CLI runs sessions but keeps no traces; nothing outside the browser can run a campaign, keep the evidence, or export it. | `apps/workbench/src/lib/state/storage*.ts`, `evals/src/cli.ts` |
| G5 | A | No CI gate on guardrail efficacy beyond unit tests. `npm run evals` is not in `ci.yml`; there is no machine-readable pass/fail artefact a pipeline can consume. | `.github/workflows/ci.yml` |
| G6 | B | No scenario contract. Adversarial content is hand-written goal cards + layouts + manual entries; threat taxonomy ids (`ASI01`…) exist only in prose; no import of a corpus; no expected-outcome declaration on a card. | `packs/starter/src/{goal-cards,world/manual,world/layouts}.ts` |
| G7 | B | Telemetry is a file download from one screen. No sink, no live streaming, no group bundle, mapping unreachable from a headless host. | `apps/workbench/src/lib/workshop/otel-export.ts` |
| G8 | B | Policy expressiveness: `PredicateExpr` cannot see world state, history, or prose; no `contains`/`matches`; the Studio builds only a flat AND. No external policy decision point (OPA/Cedar) adapter. | `core/schemas/policy-card.ts`, `governance/src/policy-compiler.ts` |
| G9 | B | Egress is undeclared and untraced; no "no network" mode for CI; hosts are constants a reader has to grep for. | every network pack; `run.started` |
| G10 | B | Credential seam is two kinds with no TTL/refresh notion, `validate` cannot see brick config, OAuth client id unset, no proxy kind. | `core/types/brick.ts`, `workbench/lib/state/geap-credential.svelte.ts` |
| G11 | B | Workshop-authored content (policy cards, assertion cards, scenarios) cannot persist or reach the Kit picker; no custom-pack store. | `17-…` §4.5/§4.7 dated notes |
| G12 | B | Group episodes: no export bundle with digest; no cross-agent monitor; Hearing queue is per room. | `23-…` §4.7/§9 |
| G13 | B | `@craftabot/governance` is unpublished in practice: version `0.0.1`, no README/API docs, no example of use outside the toy. `08-…` §5's last row is unmet. | `packages/governance` |
| G14 | C | Drift over time: `/telemetry` is a current-state breakdown, not a time series. | `workbench/lib/workshop/telemetry.ts` |
| G15 | C | `SchemaPanel` cannot render a nested `z.object` field (`filters`); `ArmourPanel.svelte` unbuilt; `autonomy` picker unbuilt. | `workbench/lib/components/bench/schema-fields.ts` |
| G16 | C | Run Lab: breakpoints, live trailing, fork-from-tick unbuilt. | `17-…` §3 |
| G17 | C | `D13` semver evaluation of `requires` still presence-only; Ollama endpoint fixed; `no-repetition.ts` hardcodes a world action name (`MOVEMENT`), its own comment calls it a wart. | `core/persistence/kit-export.ts`, `packs/ollama`, `governance/src/guardrails/no-repetition.ts` |
| G18 | A | **Layered defence is impossible**: the `safety` socket holds one brick, so a local floor, an observer and a hosted guard cannot be fitted together — the exact configuration a defence-in-depth experiment needs. | `core/validate-spec-v2.ts` (`slot-already-filled`), `14-…` §2.3 |
| G19 | B | The analytic folds (projection, incidents, telemetry, safety case, OTel mapping) are workbench modules; a headless host cannot produce a safety case, an incident list or an export. The 50-run cap and N+1 reads bound every corpus. | `apps/workbench/src/lib/{state,workshop}/*.ts` |
| G20 | C | `GuardrailContext` carries no `ChatResponse` and no composed messages; an output filter reconstructs the model's text from `history`. | `core/types/guardrail.ts` |

G1–G5 and G18 are the ones that decide whether the Workshop is a rig or a demo. G6–G9 and G19 are what make the rig *useful*. The rest are debts the rig will trip over.

---

## 4. Design tenets (V3 additions to `14-…` §1's five)

6. **Vendors are packs; mechanisms are core or governance.** A guardrail service, an evaluator, a telemetry sink, a scenario corpus arrives as a pack registered against a contract. The contract — screening shape, verdict mapping, record assembly, scoring shape — is written once. A second vendor of any kind must be *client + reading + strings*, never a re-implementation of policy. (Hard rule 4, applied to the outside world.)
7. **The trace is still the interface, and now the trace has a destination.** Nothing a sink sends, an evaluator scores, or a report summarises may come from anywhere but the event stream and the artefacts derived from it. A sink is a *consumer* of the bus, exactly as the Flight Recorder is.
8. **Egress is declared, allow-listed, and traced.** A pack that calls out declares its hosts; a run records which hosts it was permitted; a host can run a session with no network at all and prove it. A secret never leaves the vault except to a declared host. (Hard rule 2, widened to every credential and every destination.)
9. **Headless is first-class.** Every Workshop capability that does not need a person — run, campaign, evaluate, export — has a Node entry point that produces the same records the browser does, against the same `Storage` contract. The browser is *a* host, not *the* host.
10. **Fail closed, say why, cost nothing to disprove.** Every hosted dependency has an `offline` stand-in that returns a canned, labelled result, so every scenario runs in CI without an account, and the golden trace stays byte-stable but for labelled rows (the Armour Brick's own discipline, `25-…` §6, made general).
11. **Post-training only.** Nothing here reads, writes, or produces training data. A scenario corpus is a test set; an evaluator is a scorer; a judge is a classifier. The line is in the non-goals (§11) and in the package boundaries.

---

## 5. Target architecture

```
┌────────────────────── hosts ──────────────────────────────────────────────────┐
│  apps/workbench (browser)           @craftabot/harness (Node, CLI, CI)          │
│  Kit · Workshop                     craftabot run | campaign | evaluate | export │
│  IndexedDB Storage                  file/JSONL Storage                           │
└──────────────┬───────────────────────────────────┬────────────────────────────┘
               │ same Storage contract, same records │
┌──────────────▼───────────────────────────────────▼────────────────────────────┐
│ @craftabot/core        the loop · brick contract · registry · events · records  │
│                        + Storage contract (moved) · Egress declaration           │
│ @craftabot/governance  local rules · policy compiler · hosted-guardrail shell    │
│                        · PredicateExpr v2 · external-PDP mapping                 │
│ @craftabot/evals       matrix runner · metrics · Evaluator contract impls        │
│                        · Campaign runner · reports & gates                       │
│ @craftabot/telemetry   TraceSink contract · OTLP mapping (moved) · file sink     │
│ @craftabot/pack-testkit conformance: + hosted guardrail · evaluator · sink       │
└──────────────┬────────────────────────────────────────────────────────────────┘
               │ packs register content against the contracts above
┌──────────────▼────────────────────────────────────────────────────────────────┐
│ content packs   starter · workshop · personas · scenario packs (red-team corpora)│
│ provider packs  openai · anthropic · gemini · ollama                             │
│ guard packs     geap (Model Armor) · guard-local (Ollama-hosted safety models)   │
│                 · <enterprise vendor> · pdp (OPA/Cedar)                          │
│ evaluator packs judge-llm (via any provider) · geap-eval (Vertex Gen AI eval)    │
│ sink packs      otlp-http · <vendor observability>                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

Four moves make this picture true, and each is additive:

1. **Extract the hosted-guardrail shell** from `pack-geap` into `@craftabot/governance` (§6.1). `pack-geap` becomes the first *adapter* of the shell, byte-identical in behaviour.
2. **Add three registered content types** — `guardrailServices`, `evaluators`, `sinks` — beside the eight `PackManifest` already has, plus `scenarios` as a richer sibling of `goalCards` (§6.2–§6.5).
3. **Move the `Storage` contract and the OTel mapping** out of the workbench into `core` and a new `@craftabot/telemetry`, so a Node host can persist and export (§6.5, §6.7, §6.14).
4. **Add `@craftabot/harness`** — the Node host and CLI — and a `Campaign` artefact that CI can run and gate on (§6.8–§6.9).

---

## 6. The contracts

Each subsection: what exists → what changes → why it is additive → what proves it.

### 6.1 Hosted guardrail services (retires G1, G2)

**What exists.** `Guardrail.checkWithRecord` returns `{verdict, external?: ExternalCallRecord}`; `pack-geap` implements it for one vendor.

**What changes — in `@craftabot/core`:**

```ts
// schemas/shared.ts — widened, not replaced
export const externalCallRecordSchema = z.object({
  service: z.string().min(1),            // was z.literal('model-armor'); a registered GuardrailService id
  method: z.string().optional(),         // 'sanitizeUserPrompt', 'applyGuardrail', 'evaluate' … vendor's own name
  endpoint: z.string(),
  template: z.string().optional(),       // was required; 'template' is Model Armor's word for a policy ref
  policyRef: z.string().optional(),      // the vendor-neutral name for the same thing
  latencyMs: …, charsScreened: …,
  outcome: z.enum([...existing ten...]),
  filters: z.record(...).optional()
});
```

Every trace written before this parses unchanged (`'model-armor'` is a string; `template` present is fine). `guardrail.external` keeps its shape.

```ts
// types/guardrail-service.ts — new, the vendor contract
export interface ScreenRequest {
  hook: GuardrailHook;
  /** What to screen. `text` is what every vendor takes; `context` is optional extra (the observation for a response screen). */
  text: string;
  context?: string;
  /** The proposed call, for services that gate actions rather than content (a PDP). */
  proposed?: ProposedStep;
  /** Pointers a service may forward, never the whole trace: tick, run id, agent id. */
  envelope: { runId: string; agentId?: string; tick: number };
}

export interface ScreenReading {
  outcome: 'ok' | 'partial' | 'failure';
  matched: boolean;
  /** Vendor-neutral categories with the vendor's own name kept alongside. */
  findings: Array<{
    category: FindingCategory;           // 'injection' | 'jailbreak' | 'harmful' | 'sensitive-data' | 'malicious-link' | 'policy-violation' | 'other'
    vendorLabel: string;                 // 'pi_and_jailbreak', 'HATE_SPEECH', 'PII', a Cedar policy id …
    confidence?: 'low' | 'medium' | 'high';
    ran: boolean;
    matched: boolean;
  }>;
  redactedText?: string;                 // noted only, never substituted (`25-…` §4.4)
}

export type ScreenResult =
  | { reading: ScreenReading; record: Omit<ExternalCallRecord, 'latencyMs' | 'charsScreened'> }
  | { error: { kind: ExternalOutcomeKind; message: string }; record: Omit<ExternalCallRecord, 'latencyMs' | 'charsScreened'> };

export interface GuardrailService {
  id: string;                            // 'geap/model-armor', 'aws/bedrock-guardrails', 'local/prompt-guard'
  name: string;
  description: string;
  /** Which hooks this service can screen. A PDP is pre-act only; a content filter is all three. */
  hooks: GuardrailHook[];
  /** The credential it reads, if any — same shape as BrickKindDefinition.credential. */
  credential?: BrickKindDefinition['credential'];
  /** Hosts it may call (§6.6). */
  egress: EgressDeclaration[];
  /** Build a client. `fetch` and `getCredential` come from BrickRuntimeContext; `config` is the fitted brick's own service block. */
  create(options: { config: unknown; fetch: typeof globalThis.fetch; getCredential(id: string): string | undefined }): {
    screen(request: ScreenRequest, signal: AbortSignal): Promise<ScreenResult>;
  };
  /** The canned client every service must provide (tenet 10). */
  createOffline(): { screen(request: ScreenRequest): Promise<ScreenResult> };
  /** Zod for the service block of a fitted brick's config (project/region/template; guardrail id/version; policy path …). */
  configSchema: ZodType<unknown>;
}
```

`PackManifest` gains `guardrailServices?: GuardrailService[]`; `PackRegistry` gains `getGuardrailService(id)`/`listGuardrailServices()`; `BrickRuntimeContext` gains `getGuardrailService(id)` (the same "needs the resolved thing" reasoning as `getPolicyCard`). The dead `PackManifest.guardrails` / `getGuardrail` lane is deprecated in the same change — `guardrailServices` is what it was reaching for.

**`GuardrailContext` widens** (retires G20), additively: `response?: ChatResponse` (present at `pre-act` and `post-act` for a brain-driven tick, absent for a reflex), `observation?: Observation` (present at every hook after SENSE), `messages?: readonly ChatMessage[]` (the composed prompt, present from `pre-think`). An output filter screens `ctx.response.text` directly; `pack-geap`'s `text.ts` selectors become one-liners over these fields, with their `history`-walking form kept as the fallback for a host that has not been updated. **A `post-think` hook was considered and not chosen**: the closed hook enum stays at three because every screening a fourth hook would allow is already possible at `pre-act` once the response is in the context, and a hook whose only legal verdicts are `allow` and `stop-run` (a raw completion cannot be "blocked" without a re-prompt, which is a mutation) would be `post-act`'s shape wearing a new name. Recorded so it is a decision.

**What changes — in `@craftabot/governance`:** the shell, extracted from `pack-geap`'s `guardrails.ts`/`text.ts`/`config.ts`:

```ts
export const hostedScreenConfigSchema = z.object({
  screenObservation: dispositionSchema.default('off'),
  screenDecision:    dispositionSchema.default('ask'),
  screenResult:      dispositionSchema.default('off'),
  perCategory: z.record(findingCategorySchema, z.enum(['inherit','off','note','block','ask','stop'])).default({}),
  minConfidence: z.enum(['low','medium','high']).default('medium'),
  onFailure: z.enum(['stop-run','allow-with-note']).default('stop-run'),
  timeoutMs: z.number().int().min(500).max(10000).default(3000),
  offline: z.boolean().default(false)
});

export function createHostedGuardrails(options: {
  guardrailIdPrefix: string;                 // 'geap/armor'
  service: GuardrailService;
  serviceConfig: unknown;
  screening: HostedScreenConfig;
  ctx: Pick<BrickRuntimeContext, 'fetch' | 'getCredential'>;
  selectors?: Partial<Record<GuardrailHook, TextSelector>>;   // defaults: observation / decision / result, as pack-geap's text.ts today
  envelope: () => ScreenRequest['envelope'];
}): Guardrail[];

export function verdictForReading(reading: ScreenReading, hook: GuardrailHook, screening: HostedScreenConfig): GuardrailVerdict;
```

The disposition ladder, the per-hook clamp (`block`/`ask` → `stop` off `pre-act`), the strictest-wins fold, fail-closed on `partial`/`failure`/transport error, the `nothing to check` short-circuit, latency measurement and record assembly all move here, table-tested once. A non-dialable category (`csam`) becomes a `GuardrailService`-declared `alwaysStop: FindingCategory[]`.

`pack-geap` keeps `client.ts`, `reading.ts` (now producing `ScreenReading`), `strings.ts`, the fixtures, and its `BrickKindDefinition`; its `createRuntime` becomes `[...localFloor, ...createHostedGuardrails({...})]`. The offline golden trace `fixtures/trace.geap-armour-offline.v1.json` must stay byte-identical — that is the gate for the extraction.

**A generic Guard brick.** With the shell in governance, the Workshop offers one Workshop-only brick kind, `workshop/guard` (slot `safety`), whose config is `{ serviceId, service: <service.configSchema>, screening: HostedScreenConfig, maxTicks, repeatLimit? }` and whose `controlHints` draw `serviceId` from a new `ControlSource: 'guardrailServices'`. A vendor pack that ships a `GuardrailService` and nothing else is therefore fittable on the bench with no brick of its own. `geap/armor` stays as the vendor's own named brick (its copy and defaults are worth keeping), and becomes the reference for "a vendor that also wants its own brick".

**Conformance.** `@craftabot/pack-testkit` gains `checkGuardrailService(service, fixture)`: `create` never throws; every fixture response parses to a `ScreenReading` or a typed error; the offline client answers; no message or record can carry the credential (a planted secret sweep, `25-…` §11 stage A's test made generic); every declared host is regional/fixed and appears in `egress`; `hooks` is non-empty.

**What proves it.** `pack-geap`'s 162 tests green against the shell; the golden offline trace byte-identical; a test-only `GuardrailService` in `governance`'s own suite driven through `createHostedGuardrails` at all three hooks with every disposition; `checkGuardrailService` rejecting a deliberately broken fixture service.

### 6.2 Evaluators (retires G3)

**What exists.** `AssertionCard` + `evaluateAssertion` (deterministic, exact-match); `scoreRun` metrics; `EvalReport`.

**What changes — in `@craftabot/core`:**

```ts
// types/evaluator.ts
export interface EvaluationInput {
  run: RunRecord;
  events: readonly EngineEvent[];
  /** Present for a group episode. */
  group?: { record: GroupRunRecord; members: Array<{ run: RunRecord; events: readonly EngineEvent[] }> };
  /** The scenario's own expectations, when the run came from one (§6.3). */
  scenario?: ScenarioDefinition;
}

export interface EvaluationResult {
  evaluatorId: string;
  /** Pass/fail is what a gate reads; score is what a dashboard reads; both optional so a pure-metric evaluator need not fake a verdict. */
  verdict?: 'pass' | 'fail' | 'inconclusive';
  score?: number;                        // 0..1
  label?: string;                        // 'blocked', 'leaked', 'hijacked' …
  explanation: string;
  /** Which events the verdict rests on — never the whole trace. */
  evidence: Array<{ eventId: string; tick: number; note?: string }>;
  /** Present when the evaluator called out (an LLM judge, a hosted eval service). */
  external?: ExternalCallRecord;
}

export interface Evaluator {
  id: string;                            // 'starter/testbench/no-secrets-out-loud', 'evals/judge/goal-faithfulness', 'geap/eval/safety'
  name: string;
  description: string;
  /** 'deterministic' runs in CI; 'model' needs a provider; 'hosted' needs a credential + egress. */
  kind: 'deterministic' | 'model' | 'hosted';
  configSchema?: ZodType<unknown>;
  credential?: BrickKindDefinition['credential'];
  egress?: EgressDeclaration[];
  evaluate(input: EvaluationInput, deps: { config?: unknown; provider?: LLMProvider; fetch: typeof globalThis.fetch; getCredential(id: string): string | undefined; signal: AbortSignal }): Promise<EvaluationResult>;
  createOffline?(): Pick<Evaluator, 'evaluate'>;   // required when kind !== 'deterministic'
}

// schemas/records.ts — a new stored artefact beside RunRecord
export const evaluationRecordSchema = z.object({
  id: z.string(), runId: z.string(), evaluatorId: z.string(), campaignId: z.string().optional(),
  result: evaluationResultSchema, evaluatedAt: z.string(), schemaVersion: z.literal(1)
});
```

`PackManifest.evaluators?: Evaluator[]`; registry lookups to match. **Assertion cards become evaluators**: `evals` exports `assertionEvaluator(card)` so every existing built-in card is an `Evaluator` of kind `deterministic` with no change to the card schema — and, because `EvaluationInput` carries the `RunRecord`, the `usage-at-least` leaf finally has real usage to read (today `evaluateAssertion` zeroes it, so such a card can never fire; documented in `evals/src/assertions.ts`). `PackManifest.assertionCards?` joins alongside so a pack can ship cards the way it ships policy cards (today only the workbench's `assertion-cards.ts` holds any).

**Where evaluation runs, and why there is no new engine event.** An evaluation runs *over* a finished trace — in the harness after a run, in the Workshop on demand, in a campaign as a gate. That is not engine behaviour, so hard rule 3 does not ask for an event; the result is an `EvaluationRecord` stored beside the run, exported in the bundle (§6.7), and shown in the Run Lab's new "Evaluations" inspector. An evaluator that calls out records its call in `result.external`, the same shape as a hosted guardrail's, so the Audit Centre lists every network call a run *and its evaluation* made. **In-run** evaluation — a judge that watches every tick — is already what a Monitor-style brick at `post-act` is (`19-…` #27); a `workshop/monitor-judge` brick composes an `Evaluator` of kind `model` into `contributeGuardrails` with `note`-only verdicts. That path *does* produce events (`guardrail.checked` with the note) and needs nothing new.

**Three evaluators ship with the contract:** every existing assertion card (deterministic); `evals/judge/rubric` — an LLM-as-judge over a rubric string, driven through any registered `ProviderFactory` (kind `model`, so Ollama makes it free and offline-capable); and, in `pack-geap`, `geap/eval/*` over the Gen AI evaluation service (`25-…` §7's "natural second GEAP brick", kind `hosted`) — the second GEAP integration, sharing the `geap` credential id.

**Conformance.** `checkEvaluator`: deterministic evaluators are pure over the same input (repeat → identical result); every evaluator returns `evidence` that names real event ids; `createOffline` exists for non-deterministic kinds; a planted secret never appears in `explanation` or `external`.

### 6.3 Scenarios (retires G6)

**What exists.** `GoalCardDefinition {id, title, goalText, worldId, layoutId, successCondition, hints, teachesConcepts, par?, expert?, coop?}`; adversarial content as manual entries, layouts and seeded `heard` lines; scripted plans in `pack-starter/testing`.

**What changes.** A `ScenarioDefinition` is a goal card *plus what a test needs*:

```ts
export const scenarioDefinitionSchema = z.object({
  id: z.string(), title: z.string(), description: z.string().optional(),
  goalCardId: z.string(),                          // the card that binds world + layout + predicate
  /** Threat/control vocabulary from `19-…`: OWASP ASI ids, LLM Top-10 ids, the catalogue's #n. Data, so a report can group by it. */
  tags: z.array(z.string()).default([]),
  /** Content injected at start: extra heard lines, manual entries, tool-result overrides — the same mechanisms WP25/WP31/WP32 used by hand. */
  injections: z.array(injectionSchema).default([]),
  /** What a safe run looks like, and what an unsafe one looks like, as evaluator ids + expected verdicts. */
  expect: z.object({
    outcome: runOutcomeSchema.optional(),
    evaluators: z.array(z.object({ evaluatorId: z.string(), verdict: z.enum(['pass','fail']) })).default([])
  }),
  /** Scripted plans for CI, by name — the `plans.ts` precedent. */
  plans: z.object({ safe: z.string().optional(), unsafe: z.string().optional() }).default({}),
  schemaVersion: z.literal(1)
});

export const injectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: 'heard', text: z.string(), atTick: z.number().int().optional() }),
  z.object({ kind: 'manual-entry', key: z.string(), text: z.string() }),
  z.object({ kind: 'tool-result', toolId: z.string(), match: z.string().optional(), result: z.unknown() }),
  z.object({ kind: 'radio', fromName: z.string(), channel: z.string(), text: z.string() })
]);
```

`PackManifest.scenarios?: ScenarioDefinition[]`. The four shipped governance cards (`warning-sign`, `keep-the-secret`, `party-line`, `false-alarm`) are re-expressed as scenarios *wrapping* their unchanged goal cards — the cards stay, the tests stay, the scenario is the metadata that was in prose. `injections` need one deliberate core seam: `WorldInstance.inject?(injection)` beside `configure?`, implemented by the Playroom for the four kinds above (each already exists as a hand-placed mechanism in `manual.ts`, `layouts.ts`, `services.ts`, `radio`). A world that omits it refuses a scenario carrying injections with a plain build problem.

**Corpus import.** A JSONL importer (`@craftabot/harness`, and the Workshop's Scenario Library) turns rows of `{text, tags, expected}` into scenarios over a chosen base card — the fastest way to run a third-party prompt-injection set through the Playroom. Imported scenarios are content (§6.10) and travel in a scenario pack file, never silently into `starter`.

**Adversary brain.** `evals` gains a third scripted tier, `scripted-adversary`, whose plan *acts on* an injection (the "unsafe" plan of every scenario, generalised) — the "prove the brake works by driving at the wall" suite (`13-…` §9) as a matrix column rather than a hand-written test each time.

### 6.4 Policy-as-code v2 (retires G8)

**What exists.** `PredicateExpr` with four leaves; `compilePolicyCard`; the Studio's flat builder.

**What changes.** `PredicateExpr` v2, additive leaves under the same `kind` discriminator: `argument-contains {path, value}`, `argument-matches {path, pattern}` (RE2-safe subset, no backtracking), `observation-contains {value}` (the If/Then brick's own leaf, promoted), `world-predicate {predicateId}` (the world's own `test()`), `history-count {type, name?, atLeast}` (repetition, drift), `hook-is {hook}`. `evaluatePredicate` gains the context it needs (`worldState`, `history`, `observation`) — all already on `GuardrailContext`. `POLICY_CARD_SCHEMA_VERSION` stays 1; a v1 card is a valid v2 card.

**External policy decision point.** OPA, Cedar, or a vendor PDP is a `GuardrailService` with `hooks: ['pre-act']` whose `ScreenRequest.proposed` carries the call and whose `ScreenReading.findings` carries `{category: 'policy-violation', vendorLabel: <policy id>}`. No new mechanism: `governance` ships `pdpRequestFor(ctx)` (a stable JSON shape — spec identity, proposed call, usage, world predicates — the PDP's input document) and `pack-pdp-opa` ships the client. This is `19-…` #14 in hosted form.

### 6.5 Telemetry sinks (retires G7)

**What exists.** `otel-export.ts` in the workbench, download-only.

**What changes — new package `@craftabot/telemetry`** (depends on core only; ESLint-restricted like `governance`):

```ts
export interface TraceSink {
  id: string;                            // 'telemetry/file', 'telemetry/otlp-http', 'vendor/langfuse'
  name: string;
  credential?: BrickKindDefinition['credential'];
  egress?: EgressDeclaration[];
  configSchema: ZodType<unknown>;
  create(options: { config: unknown; fetch: typeof globalThis.fetch; getCredential(id: string): string | undefined }): {
    /** Live: subscribe to a bus; the sink batches and flushes on its own schedule. */
    attach(events: EventBus, run: { runId: string; agentId: string }): Unsubscribe;
    /** Stored: export a finished run (or group bundle) in one go. */
    export(input: TraceBundle): Promise<{ ok: true; sent: number } | { ok: false; error: string }>;
    flush(): Promise<void>;
  };
}
```

`otelTraceFor` moves here unchanged (the workbench re-exports it), gains `evaluate_guardrail` for *every* `guardrail.external` regardless of vendor, and gains group support (one `invoke_agent` per member under a root span per episode). Two sinks ship: `telemetry/file` (JSONL, the harness's default) and `telemetry/otlp-http` (OTLP/HTTP JSON to a user-supplied collector URL, credential optional). A sink is *never* attached by the Kit; the Workshop's Sinks screen and the harness's campaign file are the only two places one is configured. A sink's own failures are surfaced, not swallowed, and never affect the run (a sink is a consumer; the loop does not await it).

### 6.6 Egress declaration (retires G9, extends hard rule 2)

```ts
export interface EgressDeclaration {
  /** A host pattern — exact, or a single-label wildcard: 'modelarmor.*.rep.googleapis.com'. */
  host: string;
  purpose: string;                       // 'LLM completions', 'content screening', 'trace export'
  /** What leaves: a fixed vocabulary a safety case can quote. */
  sends: Array<'prompt' | 'observation' | 'decision' | 'result' | 'trace' | 'credential-header'>;
}
```

Every `ProviderFactory`, `GuardrailService`, `Evaluator` of kind `hosted`, and `TraceSink` declares `egress`. `createSession` takes `options.egress?: 'declared' | 'none'`: under `'declared'` (default) the injected `fetch` is wrapped to refuse any host not declared by a registered, fitted component — refusal is a typed error and a `guardrail.tripped`-style `error` event, never a silent failure; under `'none'` every call is refused, which is what CI runs. `run.started` gains `egress?: { mode, hosts: string[] }` — additive, so the trace says where a run was allowed to call. The safety case's control section gains a row per declared host. `redact.ts` and `key-leak.test.ts` are unchanged; they already sweep every vault secret.

### 6.7 Storage contract and the trace bundle (retires G4-part, G12-part)

**Move `Storage`** (`apps/workbench/src/lib/state/storage-contract.ts`) and `createMemoryStorage` into `@craftabot/core/persistence`, unchanged in shape — the IndexedDB implementation stays in the workbench and implements the moved interface. The move is mechanical and the workbench's storage contract tests (`storage-contract.ts` is already written as a shared suite) become core's.

**Trace bundle** — the export format `23-…` §4.7 and `07-…` §5 both deferred:

```jsonc
{ "format": "craftabot-bundle", "formatVersion": 1, "exportedAt": "…", "exportedBy": "…",
  "runs": [ /* TraceFile v2 each — solo, or every member of a group */ ],
  "group": { /* GroupRunRecord + the merged events */ },      // optional
  "evaluations": [ /* EvaluationRecord */ ],
  "campaign": { "id": "…", "cellId": "…" },                     // optional, when produced by a campaign
  "bundleDigest": "sha256 over every runs[].traceDigest, the group digest and every evaluation, in order" }
```

`buildTraceBundle`/`verifyBundleDigest` in core beside `buildTraceFile`; the Audit Centre and the harness both use it; the Run Lab's integrity badge verifies a bundle the same way it verifies a file.

### 6.8 The headless host: `@craftabot/harness` (retires G4)

A Node package (depends on core, governance, evals, telemetry, and whichever packs a campaign names) exposing:

```
craftabot run       --kit bot.craftabot.json --card starter/warning-sign [--provider ollama] [--seed 7] [--egress none] --out ./runs
craftabot campaign  --file campaign.json [--strict] [--egress declared] --out ./campaign-out
craftabot evaluate  --run ./runs/<id> --evaluator evals/judge/rubric --config rubric.json
craftabot export    --run ./runs/<id> --sink telemetry/otlp-http --config sink.json
craftabot bundle    --run ./runs/<id> [--group <groupId>] --out bundle.json
craftabot packs     # lists installed packs, services, evaluators, sinks, egress
```

`createFileStorage(dir)` implements `Storage` as one directory per run (`run.json`, `events.jsonl`, `evaluations.jsonl`) — readable by the Workshop's existing "import a trace" path with no conversion. The harness reads the vault from environment variables (`CRAFTABOT_CREDENTIAL_<id>`), never from a file in the repo, and its own key-leak test plants one per declared credential. The demo brain and every scripted tier work with no key at all. `installedPacks` for the harness is a `craftabot.config.ts` the user writes, the same explicit list `apps/workbench/src/lib/packs.ts` is — no dynamic loading.

### 6.9 Campaigns and gates (retires G5)

A `Campaign` is `MatrixSpec` grown to name scenarios, guards and evaluators, with gates:

```ts
export const campaignSchema = z.object({
  id: z.string(), title: z.string(), schemaVersion: z.literal(1),
  scenarios: z.array(z.string()),                          // scenario ids (or goal card ids, wrapped)
  builds: z.array(z.object({ id: z.string(), kit: kitFileSchema.or(z.string()), overrides: specOverridesSchema.optional() })),
  guards: z.array(z.object({ id: z.string(), serviceId: z.string().optional(), screening: hostedScreenConfigSchema.optional(), policyCards: z.array(z.string()).optional() })),  // 'none' is a valid guard
  brains: z.array(matrixBrainSchema),                      // scripted-optimal | scripted-noisy | scripted-adversary | live
  seeds: z.array(z.number().int()),
  evaluators: z.array(z.object({ evaluatorId: z.string(), config: z.unknown().optional() })),
  gates: z.array(z.object({
    id: z.string(),
    where: z.object({ scenarioTag: z.string().optional(), guard: z.string().optional(), brain: z.string().optional() }).optional(),
    require: z.discriminatedUnion('kind', [
      z.object({ kind: 'evaluator-pass-rate', evaluatorId: z.string(), atLeast: z.number() }),
      z.object({ kind: 'outcome-rate', outcome: runOutcomeSchema, atLeast: z.number() }),
      z.object({ kind: 'metric', name: metricNameSchema, direction: z.enum(['atMost','atLeast']), value: z.number() }),
      z.object({ kind: 'no-regression', metric: metricNameSchema, tolerance: z.number().optional() })
    ])
  })),
  budget: z.object({ maxLiveCells: z.number().int().optional(), maxTokens: z.number().int().optional() }).optional(),
  sinks: z.array(z.object({ sinkId: z.string(), config: z.unknown() })).default([])
});
```

`runCampaign` in `evals` (browser- and Node-safe; the harness is just a caller) produces a `CampaignReport` v1: every cell's `RunRecord` id, metrics, evaluation results, gate verdicts, the baseline comparison, and `budget.spent`. Three renderers: markdown scorecard (extends the existing one), **JUnit XML** (one test case per gate per slice — what every CI system reads natively), and **SARIF** (one result per failed gate with the evidence event ids — what GitHub code scanning and enterprise security tooling ingest). `--strict` exits non-zero on any failed gate. A live cell refuses to run without both a provider *and* a `budget` (the spend decision `18-…` §7 item 7 left open becomes a required field, not a default).

A campaign file is the unit of "a guardrail regression suite": `campaigns/injection-baseline.json` runs the four shipped scenarios × (no guard, Safety Brick + policy card, offline Armour) × (optimal, adversary) × 20 seeds, gates on "the adversary plan is stopped under every guard but `none`", and runs in CI in seconds because everything in it is scripted and offline. That file is the first artefact `27-…`'s Phase H ships, and it is what `ci.yml` gains.

### 6.10 Workshop content store (retires G11)

A `cab.content` IndexedDB store (and a `content/` directory for the harness) holding user-authored `PolicyCard`, `AssertionCard`, `ScenarioDefinition` and `Campaign` records under a reserved pack id `local` (`local/policy/…`), registered into the `PackRegistry` at app start as a synthetic pack. Ids are namespaced so they can never collide with a shipped pack's; a `local/*` card fitted on a bot is exported inside the kit file's new `requires.localContent` block (the card itself embedded, since no other machine has it), and import rebuilds it under a fresh `local/` id — the same "imported things are copies" rule kit files already follow. The Policy Studio, Test Bench and Scenario Library gain "save" for the first time; the Kit's card picker lists `local/*` cards while the Workshop door is open (the `audience` gate again).

### 6.11 Credential seam v2 (retires G10)

`credential.kind` gains `'bearer-token'` (an opaque token with an optional `expiresAt`, what `oauth-token` actually is once obtained) and `'header'` (an arbitrary named header value, which is how several enterprise services authenticate); `'oauth-token'` keeps its meaning (obtained via a flow) and the GIS flow becomes one of two ways to obtain one (the other is paste-with-expiry, today's Armour Studio path made first-class). The vault entry gains optional `expiresAt` so the battery meter is honest for every timed credential, not only geap's. `credential.validate` gains an optional `config` parameter (the fitted component's own service block), which is what "Test the guard" needed and could not have (`25-…` §8 stage E finding 2). The `proxy-url` kind stays unbuilt: CORS held for Model Armor, and a vendor that cannot be reached from a browser is reached from the harness instead — that is what the headless host is for.

### 6.12 Multi-agent governance completion (retires G12)

- **Group bundle** — §6.7.
- **Cross-agent monitor** — `SessionGroup` gains `options.observers?: Array<(events: EventBus) => Unsubscribe>` so a Monitor-style brick fitted on *no* chassis (a group-level Watchbot) reads the merged stream and contributes group guardrails through the existing chokepoint. The `19-…` #27/#34 "monitor agent" and "circuit breaker" in one seam.
- **Hearing per seat** — `state.heard` becomes per-agent, the Radio channel's own cursor pattern applied to the channel it was designed around (`23-…` §9's flagged undone work).

### 6.13 Layered defence: socket capacity (retires G18)

`SLOT_IDS` gains a sibling, `SLOT_CAPACITY: Record<SlotId, number>` — `1` for every socket but `safety`, which becomes `4`. `validateSpecV2`'s `slot-already-filled` check reads the capacity; `collectGuardrails` already iterates fitted bricks in slot order, so multiple safety bricks simply run in fitted order, brick rules still before host rules, first non-allow still winning. Every existing spec has at most one brick per socket, so nothing changes shape and the golden traces are untouched.

The Kit bench keeps its one well per socket — that is a *bench* rule, not an engine rule (`PartsTray.svelte`/the baseplate), and the teaching arc depends on it. The Spec Lab and the Guard Rack are where a second, third and fourth safety brick are fitted; a kit file carrying them validates and runs in the Kit (a chip on the chest socket reads "+2 more, see Workshop"). The reference configuration for a defence-in-depth experiment becomes expressible for the first time: `starter/safety` (local floor + policy cards) → `monitor/watchbot` (observe-only) → `workshop/guard` (a hosted classifier) → `workshop/guard` (a PDP), and a campaign's `guards` axis names such stacks by id.

The "2nd chest socket" `14-…` §5.3 deferred is therefore *not* built: capacity on the existing socket is the same capability without new chassis art or a `SlotId`, and it composes to four where a second socket would stop at two.

### 6.14 The analytic folds move out of the workbench (retires G19)

Three moves, each a file relocation with the workbench re-exporting the old path for one release:

- `run-projection.ts` (`applyEvent`, `projectThrough`, `emptyProjection`) and `group-replay-projection.ts` → `@craftabot/core/persistence/projection` — the canonical trace→state fold belongs beside the trace format it folds.
- `timeline.ts`'s `isFailure`, `incidents.ts` (`incidentsFrom`), `safety-case.ts`, `telemetry.ts`, `safety-tally.ts` → `@craftabot/governance/reports` — these are governance artefacts (`19-…` #28, #31, #36) and are what `08-…` §5's export row means by "trace schema + integrity tooling". Each takes `(runs, eventsFor, registry)` and returns data; none imports Svelte today.
- `otel-export.ts` → `@craftabot/telemetry` (§6.5).

`craftabot report --safety-case <agentId>` and `--incidents` in the harness (§6.8) are then thin. The N+1 read is retired by giving `Storage` a `summariseRuns(filter)` that returns the per-run facts the dashboards actually need (outcome, guardrail-trip ids, usage, failure count) from a stored `RunSummary` written at `run.finished`; the 50-run cap becomes a Workshop setting and campaign runs are exempt from eviction while their `CampaignReport` exists.

### 6.15 Small debts folded in (G13–G17)

`@craftabot/governance` gets a README, TSDoc on every export, a `1.0.0-rc` version, and an `examples/` directory with one real integration: a plain Node agent loop (no Craft A Bot world) gating tool calls through `runGuardrailChain`, a policy card, and a hosted service via the shell — the proof `08-…` §5's last row asks for. `/telemetry` gains a time axis (runs bucketed by day; drift = change in guardrail-trip mix and loop score across buckets). `SchemaPanel` gains an `'object'` case rendering a nested schema as a fieldset (fixes `filters` generically, so `ArmourPanel.svelte` is never needed). The `autonomy` picker ships in the Spec Lab. Breakpoints and live trailing ship in the Run Lab once the harness's sink can stream to it (the same bus). `D13` semver evaluation ships in `importKitFile`. Ollama's endpoint becomes a Settings field validated to `localhost`/`127.0.0.1` only.

---

## 7. Data model v3 (summary of record)

| Artefact | Change | Migration |
|---|---|---|
| `ExternalCallRecord` / `guardrail.external` | `service: string`, `method?`, `template?` (was required), `policyRef?` | additive; old traces parse |
| `run.started` | `egress?: { mode, hosts }` | additive |
| `GuardrailService`, `Evaluator`, `TraceSink`, `ScenarioDefinition`, `EgressDeclaration` | new registered content types on `PackManifest` | new |
| `EvaluationRecord` | new stored artefact, `cab.evaluations` / `evaluations.jsonl` | new, v1 |
| `Campaign`, `CampaignReport` | new, v1; `EvalReport` stays for `runMatrix` | new |
| `TraceBundle` | new export format `craftabot-bundle` v1 | new |
| `PredicateExpr` | six additive leaves | none (v1 cards valid) |
| `KitFile` | `requires.localContent?` | additive |
| Vault entry | `{ secret, expiresAt? }` | on-read migration from bare string |
| `Storage` contract | moved to core; `summariseRuns` + `RunSummary` added | none |
| `GuardrailContext` | `response?`, `observation?`, `messages?` | additive |
| `SLOT_CAPACITY` | new core constant; `safety` = 4 | none (every existing spec ≤ 1) |
| `CampaignReport` in the browser | `cab.campaigns` store | new |

Compatibility policy unchanged (`14-…` §7): additive never bumps; breaking bumps with a fixture.

---

## 8. Events catalogue changes (`02-…` §7, additive only)

- `run.started.egress?` — as §6.6.
- `guardrail.external.service` widened; `method?`/`policyRef?` added; `template` optional.
- `error.kind?: 'egress-refused'` — a refused undeclared host, so the trace says a component tried to reach somewhere it had not declared.

No other event changes. Evaluations, campaigns and exports are artefacts derived from the trace, not engine behaviour (§6.2's reasoning).

---

## 9. Workshop surfaces (target IA, extending `17-…` §2)

```
/workshop
├── (home) Bench Dashboard          — + campaign tiles, egress summary
├── /spec/[agentId]                 — + autonomy picker; + Guard brick service block
├── /runs, /runs/[runId]            — + Evaluations inspector; bundle verify; breakpoints/trailing when a live bus is attached
├── /evals                          — Eval Matrix (unchanged) 
├── /campaigns, /campaigns/[id]     — NEW: author/import a campaign, run scripted cells in-browser, view gates, export JUnit/SARIF/markdown; live cells only with a budget
├── /scenarios                      — NEW: Scenario Library — shipped + local; JSONL import; tags; safe/unsafe plan playback
├── /guards                         — NEW: Guard Rack — every registered GuardrailService: credential state, egress, offline switch, "test the guard" against a fixture; fit into a bot
├── /evaluators                     — NEW: every registered Evaluator; run one against a stored run; rubric editor for the judge
├── /sinks                          — NEW: configure a TraceSink; send a stored run/bundle; live attach toggle for the current Workshop run
├── /policies, /bench               — + save to local content; PredicateExpr v2 leaves in the builder
├── /telemetry                      — + time axis / drift
├── /incidents, /safety-case        — + evaluation evidence; + egress rows; + campaign results per bot
├── /armour                         — folds into /guards (kept as a redirect for one release)
└── /export                         — Audit Centre: + bundle, + group episodes, + "send to sink"
```

Every new screen is a consumer of the registry and the stores; none needs an engine change beyond §6. `15-…` §7's rules hold: real terms with toy tooltips; the Kit never sees any of it.

---

## 10. Determinism and reproducibility (inherited, three additions)

The world is untouched. Hosted verdicts and evaluations are recorded, so replay never re-calls a vendor. Three additions: (1) `offline` is mandatory on every hosted component, so every scenario and campaign runs in CI with `--egress none`; (2) the `scripted-adversary` tier is deterministic like the other two, so "the attack succeeds without the guard and fails with it" is a byte-stable proof, not a live observation; (3) a `CampaignReport` records the exact `packVersions`, `egress` mode and `budget.spent`, so two reports are comparable only when they say the same thing about all three — `compareToBaseline`'s existing `comparable: false` path, extended.

---

## 11. Non-goals (recorded so they are decisions)

- Model training, fine-tuning, RLHF, dataset curation for training, synthetic-data generation for training. Any request to add these is out of scope by `18-…` §1 and this section.
- Running bots on a vendor's agent runtime (Agent Engine, Bedrock AgentCore, etc.); reaching controls that only exist inside such a runtime (`25-…` §7).
- A backend, accounts, sharing, or a marketplace. The content store is local; the harness is a local process; a sink is the user's own collector.
- Dynamic pack loading. `installedPacks` and `craftabot.config.ts` stay explicit lists.
- Any Kit change beyond what the `audience` gate already does.
- A general-purpose workflow engine. The harness is a CLI with files in and files out; orchestration belongs to the user's CI.

---

## 12. Divergences from earlier docs, with reasons

| Earlier doc said | This design does | Why |
|---|---|---|
| `25-…` §4.7 / `shared.ts`: `service` is a literal "widened when a second arrives" | Widened now to a registered id, with `method`/`policyRef` | The second arrival is the whole point of this phase; doing it first keeps every vendor on one shape |
| `25-…` §4.2: "named `geap` so later GEAP bricks share one package" | Kept; `geap/eval/*` lands in the same pack | Consistent with the design of record |
| `08-…` §5: "guardrail packs (content-filter checks…)" as *local* packs | Both: a local safety model via Ollama is a `GuardrailService` too | The shell does not care where the classifier runs; a local model proves vendor-neutrality without a cloud account |
| `17-…` §4.10: OTel mapping lives in the workbench | Moves to `@craftabot/telemetry` | A headless host must export; hard rule 1 already forbids the reverse dependency |
| `07-…` §8: `Storage` "behind a thin interface in the app" | Interface moves to core; app keeps the IDB implementation | Same reason; the contract tests were already written as a shared suite |
| `14-…` §5.7: Test Bench cards are "assertion cards run against traces" | Unchanged, and every one becomes an `Evaluator` | Generalisation, not replacement; the card schema does not change |
| `23-…` §4.7: group bundle "deferred to WP34" | §6.7 specifies it; `27-…` schedules it | Both docs' dated notes said it had no WP; now it does |
| `13-…` §8: live lane "behind an env key, spend-capped" | A live cell requires an explicit `budget` block or refuses | Makes the spend decision a property of the artefact, not of whoever runs it |
| `14-…` §2.3 / §5.3: one brick per slot; a "2nd chest socket" for the Monitor | `SLOT_CAPACITY` on the existing `safety` socket, capacity 4; no new socket | Same capability, no chassis art, composes past two; the Kit bench keeps its own one-well rule |
| `08-…` §2: guardrails see `hook, tick, spec, usage, proposed, worldState, history` | `+ response?, observation?, messages?` | Output filters should not reconstruct the model's text from history; a `post-think` hook was rejected in favour of this |
| `17-…` §4.6–§4.10: incidents, safety case, telemetry are Workshop screens | The folds behind them move to `@craftabot/governance/reports`; the screens stay | A headless host must produce the same artefacts; the screens were always thin over the folds |
| `01-…` §4: `PackManifest.guardrails` | Deprecated in favour of `guardrailServices` | Nothing ever called `getGuardrail`; the new lane is what it was for |

*(Stages append dated notes here as they land, per `10-…` §7.)*

> **Amended 2026-09-02 (WP36 stage A).** §6.7 says the `Storage` contract moves to "`@craftabot/core/persistence`". It moved to **`packages/core/src/storage/`** instead (`storage.ts`, `memory.ts`), exported from the main barrel, and the contract suite plus its fixtures went to **`src/testing/`** under the existing `@craftabot/core/testing` entry point. Two reasons, both found by doing it rather than planning it: `persistence/**` carries a 100 %/95 % coverage gate written for the key-containment code (`redact.ts`, the exporters), and the store's own gates were 100/90 and 95/85 in the workbench — moving them into that directory would have either tightened a gate nobody decided to tighten or loosened one that protects hard rule 2; and `storage-contract.ts` imports `vitest`, which belongs beside `mock-provider.ts` and `test-clock.ts` on the testing subpath, never on the production barrel. The workbench keeps four one-line re-export shims at the old paths, excluded from its coverage; the two threshold entries moved to `packages/core/vitest.config.ts` unchanged. No consumer, no test assertion and neither golden trace changed. §6.7's and §6.14's later references to `core/persistence/projection` should be read as `core/src/storage/` for the store and — when stage B lands — a sibling directory for the folds, decided then.
>
> **Amended 2026-09-02 (WP36 stage B).** The folds landed as §6.14 describes with three refinements: the projections live in `packages/core/src/projection/`; the reports are a **subpath**, `@craftabot/governance/reports`, not the main barrel, so the "mechanisms" export `08-…` §5 names is not mixed with artefacts derived from traces; and **`capabilitiesOf` (the workbench's `bot-capabilities.ts`) moved to the core barrel** as a dependency §6.14 had not listed — the safety case is built from a `BotCapabilities`, and the module only ever read a bot through core's own machinery. `safetyWords` (Kit copy) stayed in the workbench; `fleet.ts` stayed (bench UI imports). The workbench keeps one-line shims at every old path. `27-…` §8 item 2 carries the gate and the test-count reconciliation.
>
> **Amended 2026-09-02 (WP36 stage C).** §6.14 says `Storage` gains "`summariseRuns(filter)` that returns the per-run facts … from a stored `RunSummary` written at `run.finished`". What landed splits that sentence in two, on purpose: the **store keeps** summaries (`putRunSummary`/`getRunSummary`/`listRunSummaries`, cascading with delete, evict and clear) and the **reports fold** them (`summariseRun` in `@craftabot/governance/reports`) — a store that computed an incident would have to know what one is, which `core` must not. The host decides when to fold and whether to keep the answer (`apps/workbench/src/lib/state/run-summaries.ts`: finished runs are written back, in-progress runs never are). The `RunSummary` shape is §6.14's list plus what the safety case and incident log actually read — the findings verbatim, decision and hosted-screen counts — so no screen reads a trace again. Every report kept its event-taking signature as a wrapper over the summary path; `filter` is not built, because nothing yet filters below "these runs". `27-…` §8 item 3 carries the gate.
>
> **Amended 2026-09-02 (WP37).** `@craftabot/harness` landed as §6.8 describes, with four refinements. The config module is `craftabot.config.mjs`/`.js` exporting `{ packs }`, not `.ts` (no loader shipped). The keyless brain is `@craftabot/evals`' scripted tiers, not the Kit's demo brain (a teaching device that lives in the app); a `--brain live` run uses the kit's own cartridge and its provider, with `--provider` a check rather than a choice. `craftabot bundle` writes a single-run `.craftabot-trace.json` today — the multi-run bundle with a digest over the whole (§6.7) is WP48's, and the command is named for where it is going. `craftabot report` is thin over `governance/reports`, which is what §6.14's move was for; the summary backfill rule joined that package so both hosts keep summaries identically. `Storage.kind` gained `'file'`. `27-…` §8 items 4–6 carry the gates and the one row-level divergence (the OpenAI smoke script kept, a harness smoke added beside it).

> **Amended 2026-09-02 (WP43 — evaluators).** §6.2 landed through `31-EVALUATORS.md` (its §8 has the lettered divergences). What changes this document's text: `EvaluatorDeps` carries `model` beside `provider`; the assertion adapter lives in `governance`, not `evals`; the rubric judge ships as `@craftabot/pack-evaluators` (id `evals`) rather than from the `evals` package; `scenario` on the input is opaque until WP44; `geap/eval/*` is not shipped; the in-run judge runs deterministic evaluators live and the rest offline, the live in-run model judge being WP48's. The three-store `Storage` gained evaluations (IndexedDB v5, `evaluations.jsonl`), the trace file an optional `evaluations` array, and campaigns `evaluators` with the `evaluator-pass-rate` gate. `27-…` §8 item 12 carries the gate.

> **Amended 2026-09-02 (WP42 — second and third services, the Guard Rack).** `30-SECOND-VENDORS.md` is the design of record. Against §6.1's next-vendor test: `@craftabot/pack-guard-local` (Llama Guard and a prompt-injection classifier over the user's own Ollama, no credential) and `@craftabot/pack-azure-content-safety` (Prompt Shields + `text:analyze`, the `header` credential kind's first user) are each a service, a client, a reading, fixtures and strings — no brick kind, no mechanism. Two additions to this document's contracts: `GuardrailService.browserCapable?: boolean` (from a live CORS checkpoint; `false` until one is taken) and `RunCampaignOptions.packs` (§6.9's runner registers extra packs beside the starter pack, which a stack through `workshop/guard` needs). §9's vendor posture gains a fact: Bedrock Guardrails cannot be a browser pack under this architecture (SigV4). Azure's live checkpoint is not yet taken — no key in the build environment — and is recorded as such. `27-…` §8 item 11 carries the gate.

> **Amended 2026-09-02 (WP41 — egress and credentials v2).** §6.6 and §6.11 landed with these notes. **Where the allowed hosts come from:** §6.6 says "declared by a registered, fitted component"; concretely the built `LLMProvider` carries `egress` (its factory declares the same) and a `BrickRuntime` carries `egress` (the Armour Brick and the Guard Brick return their service's when not unplugged), and the session's guard allows the union — nothing is inferred from the registry, only from what is actually fitted and built. **`run.started.egress` is written only when the host names a mode**, so the golden traces stay byte-identical; the guard is active regardless. **The `Evaluator` and `TraceSink` halves of §6.6 wait for WP43 and WP47**, which ship the types. **Credentials:** `bearer-token` and `header` kinds exist on the contract with `headerName`; no shipped pack uses them yet (WP42's vendor is expected to). The GIS flow stores `expiresAt`; paste-with-expiry stays the Armour Studio's path rather than a compartment field — the compartment's meter reads whatever the vault knows. "Test the guard" moved onto the kind (`armorBrickKind.credential.validate(secret, fetch, config)`), the compartment being a door to it. **Not built here:** the `proxy-url` kind (unchanged decision), and egress enforcement for the two Workshop probes (Armour Studio, Policy Studio), which run scripted, offline sessions. `27-…` §8 item 10 carries the gate.

> **Amended 2026-09-02 (WP40 — socket capacity).** §6.13 landed as written, with two notes. **The bench edits only the first brick in a socket**: `removeBrick`/`updateBrick` used to act on every brick in the slot (there was only ever one), and with a stack behind the chip that would have edited what the bench cannot show. **The campaign's `guards` axis needed no change** — a guard's `fit` already replaced everything in a socket and appended what it named, so a stack is a guard that names more than one safety brick; `campaign.test.ts` proves one runs and is grouped by its id, and the shipped baseline is unchanged. `27-…` §8 item 9 carries the gate.

> **Amended 2026-09-02 (WP39 — the guard shell).** §6.1 landed through `29-GUARD-SHELL.md`, whose §8 carries ten lettered divergences; the ones that change this document's text: `ExternalCallRecord.service` is the service's own record name, not its registry id (the golden trace says `'model-armor'`; the registry link is `guardrailId`); findings carry `vendorConfidence` beside the neutral scale; `alwaysStop` is a list of vendor labels; `ScreenRecord` excludes `filters` and `outcome`, which the shell writes; `createOffline` takes the config; `timeoutMs` reaches `create` as an option; the Guard Brick's service block is JSON text until WP42 gives the panel a second schema to resolve; `EgressDeclaration` is a core type now, declared by every service and checked by `checkGuardrailService`, with enforcement still WP41's. `GuardrailContext` gained `observation`/`messages`/`response`; the `post-think` hook stays not chosen. `27-…` §8 item 8 carries the gate.

> **Amended 2026-09-02 (WP38 — Phase H closed).** Campaigns landed as §6.9 describes, through `28-CAMPAIGNS.md` (its §8 carries the stage-level divergences). Four refinements to this document's text. **`budget` is enforced before the first cell** rather than by refusing at the first live call, so a campaign never half-spends. **Gates are four kinds** — `outcome-rate`, `assertion-pass-rate` (inline assertion cards, the stand-in until WP43's evaluators give `evaluator-pass-rate` something to count), `metric`, `no-regression` — and a gate whose `where` matches no cell **fails** rather than passing vacuously. **The store keeps an envelope** (`StoredCampaignReport` in `core`, the report opaque inside), since `core` cannot import the report schema from `evals`; `Storage` gained the four campaign-report methods across all three implementations, and the browser's database is at version 4. **The screen edits the campaign as JSON** (the file CI runs), with a file import and the shipped baseline loaded by default, not a form. `27-…` §8 item 7 carries the gate.

> **Amended 2026-09-02 (WP44 — scenarios).** §6.3 landed through `32-SCENARIOS.md`. Two things this document did not say: **a tool sees the world through `ToolContext.worldState`** — a snapshot the session hands every tool call — because two of the four injection kinds (`manual-entry`, `tool-result`) land in state only a tool reads, and no tool had ever seen the world (`32-…` §7 D-a); and **a campaign scenario may name `scenarioId`** in place of `goalCardId`, inheriting the card, the tags and the injections. The corpus importer is JSONL rows over one base card, delivered as manual entries by default; imports are scenario pack files, content only. `27-…` §8 item 13 carries the gate.

> **Amended 2026-09-02 (WP45 — policy v2 and the PDP).** §6.4 landed through `33-POLICY-V2-PDP.md`. Three things this document did not say: **`GuardrailContext.world`** — the world's own `test()` and predicate ids, one optional field the session fills, because the leaves' context was not in fact all on the context; **`ScreenRequest.policyInput`** — the shell attaches `pdpRequestFor(ctx)` to every request, since a service only ever sees a request; **progress is an action flag** (`WorldActionDefinition.progress`), not a world predicate — the no-repetition guardrail needs to know which past action counted, which is a declaration on the action. The OPA pack keeps the engine on localhost (egress is static per service). `27-…` §8 item 14 carries the gate and the live checkpoint.

> **Amended 2026-09-02 (WP46 — the content store; Phase J closed).** §6.10 landed through `34-CONTENT-STORE.md`. Two things this document did not say: **a campaign is stored but is not pack content** — the registry has no campaign field and `core` cannot import the campaign schema, so the record is opaque in the store and the Campaigns page lists it; and **only policy cards ride in kit files** (`requires.localContent`), since a spec references policy cards and nothing else authored. The harness reads the same records from a `content/` directory (`--content`). `27-…` §8 item 15 carries the gate.

> **Amended 2026-09-02 (WP47 — telemetry sinks).** §6.5 landed through `35-TELEMETRY.md`, with six divergences recorded there: the `TraceSink` contract's types live in `core` beside the other contracts (the package implements them); `export` takes a `TraceExport` (a stored run's fields) until WP48's bundle exists; a sink's `egress` is a function of its config, since the host is what the person typed; the JSONL file sink lives on `@craftabot/telemetry/node` so the main entry stays browser-safe; the e2e's collector is a Playwright route, not a container; and a sink's failures surface through `status()` and `onError`. Two sinks ship as this document says, the Kit attaches none, and the Sinks screen and the harness are the two places one is configured. `27-…` §8 item 16 carries the gate.

> **Amended 2026-09-02 (WP48 — the bundle and multi-agent completion).** §6.7 and §6.12 landed through `36-BUNDLE-AND-GROUPS.md`. The bundle's group section carries its own digest so the bundle digest is over digests only; the observer signature is `(events, { groupRunId })`; the group Watchbot is an `observe` for the note and `guardrails` for the chokepoint, since an observer has the group's ear but not its hand; Hearing is per seat by a cursor, as Radio always was. `27-…` §8 item 17 carries the gate.

> **Amended 2026-09-03 (WP49 — drift, the safety case v2, the live Run Lab; Phase K closed).** §6.15's middle sentences and §9's `/telemetry`, `/safety-case` and `/workshop` rows landed through `37-DRIFT-SAFETY-CASE-RUN-LAB.md`. Three divergences: `start()` on a paused session resumes it (a core change §6.15 did not list, needed by breakpoints and retiring a latent restart-on-Play defect); the campaign report names its builds' bots (`builds[]`), which is what lets a stored report be held against a shelf bot; and the Run Lab trails the app's own live session rather than a harness stream — the harness half stays unbuilt and recorded. `27-…` §8 item 18 carries the gate.

> **Amended 2026-09-03 (WP50 — `@craftabot/governance` 1.0).** §6.15's first sentence landed through `38-GOVERNANCE-1-0.md`: the README, TSDoc on every export with an audit test, `examples/plain-node-agent` as a workspace with its own test, `docs/governance-mapping.md`, `1.0.0-rc.1` with `private: false` and the `npm pack` dry-run checked in CI. Two decisions recorded: `@craftabot/core` stays private, so a real publish waits on it; and `zod` is now a declared dependency, since a tarball cannot rely on hoisting. `27-…` §8 item 19 carries the gate.

> **Amended 2026-09-03 (WP51 — the hosted evaluator).** §6.2's third evaluator landed through `39-HOSTED-EVALUATOR.md`: `geap/eval/safety`, `geap/eval/fulfillment` and `geap/eval/rubric` over one `evaluateInstances` client, kind `hosted` on the `geap` battery, fixtures and an offline stand-in whose record says `offline`. Three divergences: `hostMatches` grew a `*-suffix` label form for the `{location}-aiplatform` hosts; a campaign's live evaluations are budgeted by their own `maxLiveEvaluations` and counted as `liveEvaluations`, since a hosted evaluator over a scripted cell is spend with no live brain; the project id travels as config, not as a credential. The live checkpoint is pending for want of a fresh token (`39-…` stage A's note says how). `27-…` §8 item 20 carries the gate.

> **Amended 2026-09-03 (WP52 — debts; Phase L closed).** §6.15's remaining sentences landed through `40-DEBTS.md`: the autonomy picker in the Spec Lab, `D13` evaluated (`satisfiesRange` in core, the registry, `importKitFile`, `checkManifest`), the Ollama endpoint as a loopback-only Settings field, `ArmourPanel.svelte` verified unnecessary, and `personas` declaring `requiresPacks`. Two divergences: `requiresPacks` is new manifest metadata (a declaration a registry can enforce, where a comment could not), and kit exports write caret ranges rather than pins, since a pinned `requires.packs` under evaluation would have refused every kit at the next patch release. With this, `27-…`'s forward plan is exhausted.

---

## 13. Risks

| Risk | Likelihood | Handling |
|---|---|---|
| Extracting the shell changes the Armour Brick's behaviour | Medium | The offline golden trace is byte-identical or the stage does not land; `verdictFor`'s table test moves with the code |
| A vendor's API cannot be called from a browser (CORS) | Per vendor | The harness is the fallback host; `GuardrailService` declares `browserCapable?: boolean` and the Guard Rack says so; no proxy is built |
| Egress wrapping breaks a provider pack's streaming | Low | The wrapper only checks the URL host before delegating; every provider e2e runs under `'declared'` |
| A judge evaluator scores non-deterministically | Certain | Kind `model` is never a CI gate unless `offline`; the report labels it; determinism claims stay where they always were |
| JUnit/SARIF shapes drift from what tools accept | Low | Fixture files validated against the published schemas in the evals suite |
| The content store becomes a second source of truth for shipped cards | Medium | `local/` ids only; a shipped card can be *copied* into local, never edited in place |
| Scope creep toward a platform | High, historically | §11; and `27-…`'s phases each end with a "stop and re-size" gate as `23-…`/`24-…` did |
| Live campaign spend | Real money | `budget` is required for any live cell; `maxLiveCells` is enforced before the first call; reports record `spent` |

---

## 14. Acceptance (the design as a whole)

1. A second guardrail vendor ships as a pack containing a `GuardrailService`, a client, a reading parser, fixtures and strings — and **no** disposition, clamp, timeout, scrub, or record-assembly code of its own. It fits on the bench through `workshop/guard` with no brick of its own, appears in the trace as `guardrail.external`, in the OTel export as `evaluate_guardrail`, and in the safety case as a control row.
2. `pack-geap` runs on the shared shell with its offline golden trace byte-identical and its full suite green.
3. A campaign file naming the four shipped scenarios, three guards and two scripted tiers runs in CI under `--egress none` in under two minutes and fails the build when a guard is removed from a scenario that expects one.
4. The same campaign runs from the harness with a live provider and a budget, persists every run to file storage, and those runs open in the Workshop's Run Browser with no conversion.
5. An LLM-as-judge evaluator scores a stored run in the Workshop and in the harness; its call is recorded as `external`; its result appears in the Run Lab and the bundle.
6. A stored group episode exports as a bundle whose digest verifies, and a solo run streams live to an OTLP collector from the Workshop with the run itself unaffected if the collector is down.
7. A run under `--egress none` with a hosted component fitted and `offline: false` ends `STOPPED_BY_GUARDRAIL` with an `egress-refused` error event, never a network call.
8. `@craftabot/governance` builds standalone, ships a README and an example that gates a non-Craft-A-Bot agent loop through a policy card and a hosted service.
9. The Kit is unchanged: every Kit e2e green, the leaflet coverage test unchanged, the tray shows no new kind with the Workshop door shut, and a bot with four safety bricks fitted in the Workshop still opens on the Kit bench.
10. A bot fitted with `starter/safety` + `monitor/watchbot` + two `workshop/guard` bricks runs; the trace shows all four chains at every hook in fitted order; the campaign report groups results by that stack's id.
11. `craftabot report --safety-case` and `--incidents` from the harness produce the same JSON the Workshop screens render, over the same stored runs.
12. Nothing in the repo reads, writes or generates training data; a grep for the words in §11's first bullet in `packages/` finds only this section quoted in comments.
