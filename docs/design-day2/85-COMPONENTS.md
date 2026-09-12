# 85 — Guardrail components, points and the five adapters (WP94)

> **Status:** design of record for WP94 (`84-DAY6-ROADMAP.md` Phase X), opened 2026-09-12 on the `day6` branch. Stage A is this note; stage B the contract in `core`, the adapters in `governance` and the packs, the events; stage C `checkComponent` and the identity test.
>
> **What this is.** `83-TARGET-DESIGN-V6.md` §6.2.1–§6.2.2 (retires G59; decision D10; tenet 27): one contract — `GuardrailComponent` — over everything that decides, as an *adapter* over the five lanes that exist. A component declares where it decides (its points), what it can say (its verdicts), what it costs and what it connects to, and `compile`s to today's `Guardrail`; the session, the chain runner, the digest and every golden trace are untouched. What changes is what is *declared* about a guardrail, and that the events can say which component and which point a verdict came from.

---

## 1. Where the code is

1. **The contract** (`core/types/guardrail.ts`): `Guardrail { id, name, description, hooks, check, checkWithRecord?, policyCardId? }`; `runGuardrailChain` runs first-non-allow-wins per hook and the session copies `policyCardId` onto `guardrail.checked`/`tripped`.
2. **The five lanes.** The Safety brick's built-ins (`starter/brick-kinds.ts`: `createStepBudgetGuardrail`, `createTokenBudgetGuardrail`, `createActionBlocklistGuardrail`, `createNoRepetitionGuardrail`, `createApprovalModeGuardrail`, in that order, then the cards); policy cards (`compilePolicyCard`); guard services (`createHostedGuardrails` over a `GuardrailService`, one guardrail per hook the screening dials on); the evaluator breaker and the group Watchbot (`pack-monitor`, at the two-seat chokepoint); the egress guard (`core/egress.ts`, `SessionOptions.egress`).
3. **A campaign's guard** (`evals`): `guards[].fit` as bricks merged into the spec (`fit(spec, guard.fit)`), `guards[].group` as the chokepoint stack (`groupStackFor`).
4. **The registry** (`core/pack-registry.ts`): one map per content kind, `insertUnique`, `get*`/`list*`.

## 2. Principles

- **An adapter, not a replacement (D10).** `compile` returns `Guardrail[]` built by the very factories the lanes use today, so a component's chain is the lane's chain. The identity test (§6) is the proof and the guard: every campaign file and preset, run as fits and as components, gives the same `guardrail.checked` sequence.
- **Declaration is honest or refused.** A component's `points`, `verdicts` and `cost` are checked by `checkComponent` against what its `compile` can actually produce; a `metered` connection cannot claim `free`; a component with a connection needs a stand-in.
- **Events say which component, additively.** `guardrail.checked` and `guardrail.tripped` gain `componentId?` and `point?`, written only when the guardrail was compiled from a component — a trace written before parses unchanged, and the identity test compares the fields the fit path writes.
- **Packs contribute components; governance ships the factories.** `governance/components/*` exports the adapter factories; the packs that own the lanes register the components in their manifests (`starter` the built-ins, the policy-card and the egress components; each service pack its service's; `monitor` the breaker). Nothing in `governance` is a pack.

## 3. The point vocabulary

```ts
export type PointKind = 'pre-think' | 'pre-act' | 'post-act' | 'stage-in' | 'stage-out' | 'group' | 'egress';
export interface GuardPoint { kind: PointKind; at?: string }   // stageId for stage-*; a host pattern for egress
```

The three loop hooks are the points the session runs today; `group` is the two-seat chokepoint; `stage-in`/`stage-out` are WP95's boundary chain; `egress` is the session's fetch guard. `pointHook(point)` maps a loop point to its `GuardrailHook`; a component compiled for a boundary point returns guardrails whose `hooks` the workflow runtime reads at the boundary (WP95).

## 4. The component contract

```ts
export type ComponentVerdictKind = 'allow' | 'block-action' | 'stop-run' | 'pause' | 'redact' | 'annotate';
export interface ComponentCost { class: 'free' | 'local-compute' | 'metered'; latency: 'none' | 'local' | 'network'; perCall?: string }
export interface Connection { kind: 'hosted' | 'local' | 'policy-engine'; wraps: string; credential?: string; egress: EgressDeclaration[];
  browserCapable: boolean | 'checkpoint-pending'; standIn: 'offline-fixture' | 'deterministic-rule' | 'none';
  checkpoint?: { takenOn: string; note: string }; version?: string }
export interface ComponentDeps { getPolicyCard; getGuardrailService; getEvaluator; getAction; fetch?; getCredential?; screening?: { offline: boolean; timeoutMs? } }
export interface GuardrailComponent {
  id; name; description; technique: string; points: PointKind[]; verdicts: ComponentVerdictKind[]; cost: ComponentCost;
  connection?: Connection; configSchema: ZodType; explain(config): string;
  compile(config, deps, point: GuardPoint): Guardrail[];
}
```

`compile` stamps `componentId` and `point` on every guardrail it returns (two optional fields on `Guardrail`, beside `policyCardId`), and the session copies them onto the events. The two new verdict kinds are carried on the *allow* branch of `GuardrailVerdict` — `{ allow: true, verdictKind?: 'redact' | 'annotate', finding?: { category, label?, confidence? }, redactedText? }` — so a monitor that annotates and a filter that redacts are allows to the chain runner and notes on the event; WP96 applies `redactedText` to the outgoing `say`.

## 5. The five adapters

| Adapter | Component ids | Config | `compile` | Points | Verdicts | Cost |
|---|---|---|---|---|---|---|
| `builtin` | `governance/step-budget`, `governance/token-budget`, `governance/action-blocklist`, `governance/no-repetition`, `governance/approval-mode` | `{ maxTicks }`, `{ maxTokens }`, `{ blockedActions }`, `{ repeatLimit }`, `{ mode: 'everything' \| 'risky' }` | the Safety brick's own factories, with `deps.getAction` for progress and risk tiers | the loop hooks each factory declares | `stop-run` (budgets), `block-action` (blocklist, no-repetition), `pause` (approval) | free, none |
| `policy-card` | `governance/policy-card` | `{ cardId }` | `compilePolicyCard(deps.getPolicyCard(cardId))` | `pre-think`, `pre-act`, `post-act` | `block-action`, `stop-run` | free, none |
| `guard-service` | the service's own id (`geap/armor`, `guard-local/llama-guard`, `guard-local/prompt-guard`, `azure-content-safety/content-safety`, `pdp-opa`) | the service's `configSchema` plus `screening?` | `createHostedGuardrails` — the adapter *is* the shell | the service's `hooks` | `block-action`, `stop-run`, `redact` where the service reports `redactedText`, `annotate` | metered/network for a hosted connection, local-compute/local for Ollama, per the service |
| `evaluator-breaker` | `monitor/evaluator-breaker` | `{ evaluatorId, labels?, onFail? }` | `createEvaluatorCircuitBreaker(deps.getEvaluator(id), …)` | `group`, `stage-out` | `stop-run` | local-compute, local |
| `egress-rule` | `governance/egress-declared`, `governance/egress-none` | `{}` | no guardrail — the egress gate is the session's; `egressModeOf(componentId)` is what a host applies | `egress` | `block-action` | free, none |

The Safety brick's runtime is unchanged: it keeps calling the factories directly, so a fitted brick's chain and a component's chain are the same objects built the same way. `stacks.ts`'s five presets are expressible as component lists (WP97 makes them content).

## 6. The identity test

> **Amended 2026-09-12 (stage B, built).** The test lives in `packages/harness/src/component-identity.test.ts`, not `evals`: the four desk baselines need the desk packs and the harness's plan chain (`harnessPlans`), which `evals` does not depend on. The translation is `componentFitsFor(guard, registry)` in `evals` (the note's `componentsForFit`), and it fits **one component per hook**: a card once per hook its rules use, a service once per hook it screens (§4's rule, below). A cell with `components` runs them through `componentChainFor` — `compileComponents` over `componentDepsFor(registry, { fetch, getCredential })` — on all three cell paths: `runToCompletion`'s `guardrails`, the duo's agent member, and the workflow's new `guardrails` option (every `agent` stage's session, after the stage's own cards). `egressForGuard` reads an egress component into the session's mode. `specFor` refuses a guard that names components *and* fits `starter/safety` or `workshop/guard`. The test asserts no cell errored on either path (two empty traces prove nothing), that the bricks' run carries no stamp and the components' run carries some, and that outcomes and assertions agree — over the injection baseline, the four desk baselines (complaints included, so four not three) and the lending book, at one seed each. Green on 2026-09-12.

`packages/evals/src/component-identity.test.ts`: for the injection baseline, the three desk baselines and the lending book campaign, each `guards[]` entry's fits are translated to their component form (`componentsForFit` in `evals`: the Safety brick's config → the built-in components in the brick's order, then a `policy-card` component per card; a Guard brick → the service's component with its config), the campaign is run both ways at one seed, and the `guardrail.checked` sequence per cell — `guardrailId`, `hook`, `verdict`, `policyCardId` — is byte-identical. The two golden traces (`starter`, `desk`) are byte-identical by construction: nothing on their path changed. `campaignGuardSchema` gains `components?: Array<{ id, config?, point? }>` so a campaign can name its guard in the component form directly; the runner compiles them to `SessionOptions.guardrails`, which the session appends after the fitted bricks' chain.

## 7. `checkComponent`

> **Amended 2026-09-12 (stage C, built).** `checkComponent(component, fixture, fallbackDeps?)` with `ComponentConformanceFixture { config, points?, verdicts?: { verdict, context, point? }[], deps? }`; `describeConformance` runs it for every `manifest.guardrailComponents` entry with the deps off a registry holding the pack and its companions, and refuses a manifest whose component has no fixture — as it does a service. Fixtures: `starter` (eight — the five built-ins, the card at `pre-act` with an allow and a block, the two egress rules), `geap`, `guard-local` (two), `azure-content-safety`, `pdp-opa` (each with screening on at every hook so all three points compile), and `monitor`'s breaker in `components.test.ts` with an evaluator handed in through `deps`. The `compiles` check reads: a loop point's chain is non-empty and every guardrail carries that hook; `egress` compiles to nothing; a boundary or the chokepoint compiles to something. Stamps are checked on every guardrail.

`pack-testkit`'s `checkComponent(component, fixture)`: well-formed (id, technique, points and verdicts from the closed sets, cost class consistent with the connection, `explain` non-empty for the fixture config); `config-parses`; `compiles` — for every declared point the fixture names, `compile` returns guardrails whose `hooks` are the point's hook (loop points) or empty hooks with a `stage` reader (boundary points, WP95); `verdicts-honest` — for every declared verdict the fixture supplies a context, the compiled chain returns that verdict kind (a fixture per adapter per verdict); `stand-in` — a component with a connection compiles offline with no fetch. The five adapters each have a fixture in their pack's conformance test.

## 8. The OTel mapping

> **Amended 2026-09-12 (built).** As written; the point is rendered `kind` or `kind@at`.

`guardrail.tripped`'s evaluation span gains `craft_a_bot.guardrail.component` and `craft_a_bot.guardrail.point` when the event carries them.

## 9. Divergences from `83-…` §6.2

- The identity test compares the fields the fit path writes; the component path *adds* `componentId` and `point`, which is the point of the phase. "Byte-identical" in the roadmap's row is read as byte-identical over the event as it stood, with the two annotations set aside; the note says so here rather than stripping them.
- The `egress-rule` components compile to no guardrail: the egress gate is not a `Guardrail` and pretending otherwise would put a rule on the trace that never runs. The component declares the mode and `egressModeOf` hands it to the host; the events for egress refusals are the session's `error` events, as today.
- `evaluator-breaker` ships from `monitor`, not `governance`: governance cannot depend on a pack, and the breaker is the pack's.

> **Amended 2026-09-12 (stage B, built).** Four more, found by the identity test and `checkComponent`:
>
> - **A component at a loop point is that point's guardrail alone.** `§5`'s table said the `policy-card` adapter compiles the card and the `guard-service` adapter compiles the whole shell; both now filter to the guardrails on the point's hook, so a card with rules on three hooks, or a service screening three, is fitted three times — one row per point, which is what a Studio can draw and a stack can carry. `componentFitsFor` emits the fits in the brick's own hook order, and the chain walk is per hook, so the sequence is unchanged.
> - **A refused service config is the floor, not an error, in the translation.** The Guard Brick runs its floor alone when the service's schema refuses its config (`29-…` §4.6, "unplugged"); `compileComponents` throws instead, because a stack that cannot compile must not run half-fitted. `componentFitsFor` mirrors the brick and drops the service — the shipped desk baselines fit `geap/model-armor` with `serviceConfig: "{}"`, which is exactly that case.
> - **The Guard Brick's `no-repetition` floor has no progress predicate**; the `governance/no-repetition` component always reads `deps.getAction(name)?.progress`, as the Safety brick does. No shipped campaign fits `repeatLimit` on a Guard Brick, so the identity test does not see it; a future one would, and the brick should gain the predicate rather than the component lose it.
> - **`@craftabot/workflow` gained `RunWorkflowOptions.guardrails`** — the one seam outside `core`/`governance` — so a book cell's stages run the same chain a session cell does.

