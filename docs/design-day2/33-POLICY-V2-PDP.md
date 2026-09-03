# 33 — Policy-as-code v2 and the external policy decision point (WP45)

> **Status:** design of record for WP45 (`27-DAY3-ROADMAP.md` Phase J, its last row but one), written 2026-09-02 against the codebase after WP44. This is the map for `26-TARGET-DESIGN-V3.md` §6.4; where the two differ, §7 below says why and `26-…` §12 gets a dated note when the stage lands.

---

## 1. Purpose

A policy card can say four things about a proposed call today — its kind, its name, one argument's exact value, and how much the run has used — and nothing about what the bot can see, what the world is like, or what it has already done. The Studio builds the same four. And the only decision point is the card itself: an organisation that keeps its rules in OPA has no way to make the bot ask. WP45 widens the vocabulary by six leaves, gives `evaluatePredicate` the context those leaves need (all of it already on `GuardrailContext`), retires the one place a guardrail hard-codes a world's action name, and makes an external PDP a `GuardrailService` at `pre-act` with a stable input document — `19-…` #14 in hosted form.

---

## 2. Where the code actually is

**`packages/core/src/schemas/policy-card.ts`** — `PredicateExpr` with four leaves and three combinators, `predicateExprSchema` as a lazy discriminated union, `POLICY_CARD_SCHEMA_VERSION = 1`. **`packages/governance/src/policy-compiler.ts`** — `evaluatePredicate(expr, { proposed?, usage })` and `compilePolicyCard`, which hands each rule only `proposed` and `usage` from the full `GuardrailContext`. **`core/src/types/guardrail.ts`** — `GuardrailContext` already carries `hook`, `worldState`, `history`, `observation`; nothing carries the world's own `test()`. **`governance/src/guardrails/no-repetition.ts`** — `const MOVEMENT = new Set(['move'])` decides which successful action is progress; the comment on it says policy cards will let the world declare this. **`packs/starter/src/brick-kinds.ts:808`** — the safety brick creates the guardrail with `ctx.getAction` in scope. **`packs/starter/src/world/actions.ts`** — `defineAction` builds `WorldActionDefinition` from a spec. **`governance/src/hosted/guardrails.ts`** — the shell builds a `ScreenRequest` from `ctx` per hook; **`core/src/types/guardrail-service.ts`** — `ScreenRequest { hook, text, context?, proposed?, envelope }`, `findingCategorySchema` already has `policy-violation`. **`packs/azure-content-safety`** — the shape a service pack takes (service, client, reading, fixtures, conformance). **`apps/workbench/src/lib/workshop/policy-studio.ts`** — `ConditionRow`/`LeafKind` and `conditionToExpr`; the page's `CONDITION_KINDS` list and per-kind inputs.

---

## 3. Design principles

1. **v1 is valid v2.** Additive leaves under the same discriminator; the schema version stays 1; every shipped card parses and compiles unchanged.
2. **A leaf reads what the context already has.** No new engine state for a predicate; one new optional field on `GuardrailContext` (`world`) so a card can ask the world its own questions.
3. **A world declares what progress is.** The guardrail that exempts progress from repetition takes the answer as a function; the Playroom marks `move`; governance stops knowing any action's name.
4. **A PDP is a guard service, not a new mechanism.** Same shell, same hooks, same findings, same record; the input document is built once in governance and rides on the request.
5. **A regular expression a card carries cannot hang the loop.** A bounded subset, checked at parse time, no groups, no backreferences.

---

## 4. The design

### 4.1 Six leaves (core, stage A)

| Leaf | Fields | True when |
|---|---|---|
| `argument-contains` | `path`, `value: string` | the argument at `path` is a string containing `value`, or an array containing it |
| `argument-matches` | `path`, `pattern` | the argument at `path` is a string the bounded pattern matches |
| `observation-contains` | `value` | the current observation's text contains `value` |
| `world-predicate` | `predicateId` | the world's own `test(predicateId)` is true |
| `history-count` | `type`, `name?`, `atLeast` | at least `atLeast` events of `type` (and, named, with that `payload.name`) are on the trace so far |
| `hook-is` | `hook` | the rule is being checked at that hook |

`argument-matches` patterns are the bounded subset: at most 200 characters; no `(`, `)`, `{`, `}`, and no backslash followed by a digit; must compile. `isSafePattern` is exported so the Studio can say why a pattern is refused. Matching is case-sensitive and anchored only where the pattern says.

### 4.2 The context and the wart (core, governance, starter — stage A)

`GuardrailContext.world?: { test(predicateId): boolean; predicates: readonly string[] }` — the session fills it from the goal card's world (the instance's `test`, the definition's predicate ids). `PredicateEvalContext` becomes `{ proposed?, usage, hook?, worldState?, history?, observation?, world? }` and `compilePolicyCard` hands a rule the whole context. `WorldActionDefinition.progress?: boolean` — "a successful call of this action is progress and never counts as a repeat" — declared by the Playroom on `move`; `createNoRepetitionGuardrail(limit, { isProgress })` takes the answer, and the starter safety brick supplies `(name) => ctx.getAction(name)?.progress === true`. The `MOVEMENT` constant goes.

### 4.3 The PDP input and the OPA pack (governance, new pack — stage B)

`pdpRequestFor(ctx)` in governance: `{ version: 1, hook, tick, agent: { id, name, goalCardId }, proposed?, usage, world: { predicates: Record<id, boolean> } }` — spec identity, the proposed call, usage, every world predicate the world declares, evaluated now. The shell attaches it to every `ScreenRequest` as `policyInput` (additive, optional on the type), so any service may read it and a PDP needs nothing else. `@craftabot/pack-pdp-opa` ships `pdp-opa/opa`: `hooks: ['pre-act']`, config `{ url (localhost only, as `guard-local`), decisionPath }`, `POST {url}/v1/data/{decisionPath}` with `{ input: policyInput }`, reading `result.allow` and `result.violations[{ policy, message? }]` into `policy-violation` findings whose `vendorLabel` is the policy id (an allow with no violations is one unmatched `policy-violation` finding so the reading is never empty); no credential; egress `localhost`/`127.0.0.1`; `browserCapable: true` (OPA sets no CORS by default — the rack's live test says so when it fails); fixtures from a real OPA `v1/data` response; an offline client answering the allow fixture.

### 4.4 The Studio (workbench, stage C)

`LeafKind` gains the six; `ConditionRow` gains `pattern`, `predicateId`, `eventType`, `hook`, `count`; the page lists them and renders each kind's inputs. Still a flat AND, explicitly (`17-…` §4.5's recorded choice): the builder is for the common case, the JSON view for the rest.

---

## 5. Non-goals

Cedar and vendor PDPs (the same contract; a pack each, later). OPA over a non-local URL (egress is static per service; a hosted OPA is a second service with its host declared). Policy bundles pushed *to* OPA from Craft-A-Bot. Nested combinators in the Studio.

---

## 6. Stages

| Stage | Builds | Definition of done |
|---|---|---|
| **A** | This note; the six leaves, the widened context, `world` on the context, `progress` on actions, the wart retired | Every shipped card parses and compiles unchanged; each leaf proven by a scripted run; `no-repetition` behaves identically on the golden trace; the governance test names `move` itself now |
| **B** | `pdpRequestFor`, `policyInput` on the request, `@craftabot/pack-pdp-opa` installed in the app and the harness | The pack passes `checkGuardrailService`; the PDP fits through `workshop/guard` and stacks with `starter/safety` in one run; a live checkpoint against a local OPA recorded dated here |
| **C** | The Studio's new leaves; close-out | The Studio builds a card with each new leaf and its replay finds the hit; notes in §7, `26-…` §12, `27-…`, `CLAUDE.md`, README |

---

## 7. Divergences from `26-…` §6.4

- **D-a — `GuardrailContext.world`**: §6.4 says the leaves read what is "already on `GuardrailContext`"; the world's `test()` was not. One optional field, filled by the session.
- **D-b — `policyInput` on `ScreenRequest`**: §6.4 has `pdpRequestFor(ctx)` in governance and the pack shipping the client, but a service only ever sees a `ScreenRequest`; the shell attaches the document so the pack never needs the context.
- **D-c — progress as an action flag**: §6.4's "world-declared `world-predicate`" for retiring the wart is read as a declaration on the action, not a predicate — a predicate answers about the world's state now, and what the guardrail needs is which past action counted.

Stage notes are appended below.

> **Amended 2026-09-02 (stage A done).** As §4.1–4.2. `argument-matches` patterns are checked by `describeUnsafePattern` at parse time (exported from core so the Studio can say why); the evaluator caches compiled patterns. `history-count` reads `payload.name` for any event type that has one (`action.performed`, `tool.executed`, `guardrail.tripped`'s `guardrailId` is not a name — count those by type). The session fills `GuardrailContext.world` from the goal card's world definition even when a host hands in its own instance (the predicate ids come from the definition, `test` from the instance). Proven by `core/schemas/policy-card.test.ts` (each leaf, the unsafe patterns named), `governance/policy-compiler.test.ts` (each leaf's semantics, `predicateContextFor`, a compiled rule on a world predicate), `starter/policy-v2.test.ts` (each leaf in a scripted run on the greeting card — the observation leaf fires because the greeting room has a chest in sight), and the governance no-repetition tests, which now name `move` themselves; the starter golden trace is byte-identical.

> **Amended 2026-09-02 (stage B done, live checkpoint taken).** As §4.3. `pdpRequestFor` in `governance/src/pdp.ts` with `pdpInputSchema` beside it; the shell attaches `policyInput` at every hook. `@craftabot/pack-pdp-opa` — `pdp-opa/opa`, config `{ url, decisionPath, fixture }` (the third only for the offline client), fixtures `allow`, `deny` and `undefined` — installed in the app and the harness and through `describeConformance`; `evals/src/pdp-stack.test.ts` runs OPA through `workshop/guard` beside `starter/safety` (a deny stops the run with `outcome: 'offline'`, `service: 'opa'`, `policyRef` on the record and the same guardrail id on the trip; an allow leaves the blocklist to do its job). **Live checkpoint, 2026-09-02:** `docker run -p 8181:8181 openpolicyagent/opa:latest run --server` — OPA 1.20.1, image digest `sha256:39daf255ae7f25d81103f03a0c18308a50b7b5bb67907bed6166f70e24a970ff` — loaded with a nine-line Rego module (`package craftabot`, `default decision := {"allow": true, "violations": []}`, a deny when `input.proposed.name == "say"` and the text contains `7734`). Its `v1/data` answers were byte-identical to the three fixtures (`{"result":{"allow":false,"violations":[{"message":…,"policy":"craftabot.no_secrets_out_loud"}]}}`, `{"result":{"allow":true,"violations":[]}}`, `{}` for an unloaded path). A real session — the Guard Brick not offline, `egress: 'declared'`, real `fetch` — saying the code ended `STOPPED_BY_GUARDRAIL` with `guardrail.external` `outcome: 'ok'`, `service: 'opa'`, `filters: { 'craftabot.no_secrets_out_loud': { ran, matched } }`, 40 ms; saying hello was allowed with `filters: { allow: { matched: false } }` on every act. The CORS question is not settled by this (a Node session, not a browser); `browserCapable: true` stands with the note in `service.ts`, to be checked from the rack's live test by someone running OPA with `--set decision_logs…`/CORS enabled.

> **Amended 2026-09-02 (stage C — WP45 closed; Phase J closed).** The Studio lists the six leaves with their own inputs (`argument-matches` shows `describeUnsafePattern`'s reason under a bad pattern); `ConditionRow` gained `pattern`, `predicateId`, `eventType`, `hook`, `count`; the replay now stands where `pre-act` stood — the events so far as history, the last `sense` as the observation, `hook: 'pre-act'` — so five of the six leaves replay over a stored run; a `world-predicate` never fires in replay (the world's questions are not on a trace) and shows in the scripted probe and a real run instead. Gate: core, governance (+3, +7), starter (+6), evals (+2), the OPA pack 11 + conformance, workbench (+2); lint (36 tasks), build within budget, e2e green. `27-…` §8 item 14 carries the summary. **A correction:** WP44's close-out called Phase J closed; Phase J is WP43–WP46, so it closes with WP46 — `27-…` item 13 and `CLAUDE.md` say so now.
