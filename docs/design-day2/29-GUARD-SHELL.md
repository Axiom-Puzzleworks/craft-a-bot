# 29 — The Guard Shell (WP39): a vendor-neutral hosted-guardrail contract, extracted from the Armour Brick

> **Status:** design of record for WP39 (`27-DAY3-ROADMAP.md` Phase I), written 2026-09-02 against the codebase as it stands after WP38. This is the map for `26-TARGET-DESIGN-V3.md` §6.1; where the two differ, §8 below says why and `26-…` §12 gets a dated note when the stage lands. Read `25-ARMOUR-BRICK.md` first — everything here is that brick's mechanism pulled out and given a name.

---

## 1. Purpose, and who this is for

The Armour Brick (`pack-geap`, WP35) proved that a hosted content guard can sit in the `safety` socket, screen three hooks, fail closed, pause for approval and leave an honest `guardrail.external` row on the trace — for one vendor. Everything a second vendor would need is in that pack, and none of it is vendor-specific: the disposition ladder, the per-hook clamp, the strictest-wins fold, the fail-closed rule, the "nothing to check" short-circuit, the latency measurement and the record assembly. Building a second vendor by copying `pack-geap` would prove nothing and leave two copies of the policy to drift (`27-…` §3 principle 2).

WP39 extracts that mechanism into `@craftabot/governance` behind one contract in `@craftabot/core`, `GuardrailService`, and puts `pack-geap` back on top of it with its golden trace unchanged. After it, a vendor pack ships a `GuardrailService` — a client, a reading, some strings, some fixtures — and nothing else; the Workshop's generic Guard brick makes it fittable with no brick of its own. The test for the whole WP is `27-…` §7 rule 3: **could a third party ship the next vendor as a pack, touching nothing in `core`, `governance`, `evals` or `harness`?**

Two readers: the person building WP42 (the second vendor) and WP45 (the external policy decision point, which is a `GuardrailService` that gates actions rather than content), who need the contract to be enough; and the person auditing a trace, who needs `guardrail.external` to say the same things about every vendor.

---

## 2. Where the code actually is (the load-bearing facts)

Quoted so the stages below are anchored, not aspirational.

**`packages/packs/geap/src/armor/` — 17 files, 1,720-line golden trace.** `guardrails.ts` (228 lines) holds `verdictFor` — the pure mapping from a client result to a verdict: `SEVERITY` ladder `off < note < block < ask < stop`; `hookDial` (observation/decision/result); `clampForHook` (`block`/`ask` → `stop` off `pre-act`); `effectiveDisposition` with `csam` hard-wired to `stop` and the other seven filter keys resolved through `OVERRIDE_KEY_FOR` to the four config overrides; `verdictForUnreachable` on `onFailure`; the strictest-wins fold; `composeMatchReason` from `strings.ts`. The same file holds `runArmorCheck` — selector → `NOTHING_TO_CHECK` short-circuit → method choice → `Date.now()` latency → `verdictFor` → an `ExternalCallRecord` assembled **in this key order**: `service, endpoint, template, latencyMs, charsScreened, outcome, filters?` — and `armorGuardrail`, the `Guardrail` with `check` delegating to `checkWithRecord`. `text.ts` (84 lines) is three pure selectors over `ctx.history`/`ctx.proposed`: `observationText` (the last `sense` event's text), `decisionText` (last `decision.thought` + the proposed call rendered `say("…")`, with the observation as `userPrompt`), `resultText` (newer of `action.performed` narration / `tool.executed` result). `config.ts` (62 lines) is `armorConfigSchema`: three service fields (`projectId`, `location`, `templateId`), three hook dials, `filters` with four `inherit`-able overrides, `injectionMinConfidence` (vendor vocabulary, `LOW_AND_ABOVE|MEDIUM_AND_ABOVE|HIGH`), `onFailure`, `timeoutMs`, `maxTicks`, `repeatLimit?`, `offline`. `reading.ts` (179 lines) parses the wire envelope into `ArmorReading { outcome, matched, filters: Record<8 keys, {ran, matched, confidence?}>, redactedText? }`. `client.ts` (171 lines) never throws, builds only regional URLs, scrubs the token, exposes `describeEndpoint`. `brick-kind.ts` (295 lines) is `geap/armor`: defaults, `controlHints`, `validate` (credential presence when not offline), `createRuntime` = step budget + optional no-repetition + up to three `armorGuardrail`s.

**The golden trace** `src/fixtures/trace.geap-armour-offline.v1.json` is `say-hello` with the brick fitted `offline: true, screenDecision: 'note'`; `golden-trace.test.ts` runs the session and compares byte-for-byte. It contains the **spec snapshot** (so `armorConfigSchema`'s fields and defaults are frozen) and four `guardrail.external` rows `{ guardrailId, hook, service: 'model-armor', endpoint, template, latencyMs: 0, charsScreened, outcome: 'offline', filters: { injection: {ran, matched}, hate…, csam… } }` (so the record's key order, the `service` literal, the filter keys and the confidence vocabulary are frozen too).

**`packages/core`.** `schemas/shared.ts:155` `externalCallRecordSchema` — `service: z.literal('model-armor')`, `template` required, ten outcomes, `filters?`. `schemas/events.ts:282` `guardrail.external` = that record + `guardrailId` + `hook`. `types/guardrail.ts:22` `GuardrailContext` — `hook, tick, spec, usage, proposed?, worldState, history` (a live view, E9). `session/agent-session.ts:375` `guardrailContext(hook, proposed?)` builds it; the session has `observation` from line 672 (SENSE, before `pre-think`), `response` from line 526 (THINK, before `pre-act`) and the composed messages before the provider call. `session/guardrail-chain.ts` prefers `checkWithRecord`. `types/brick.ts:266` `BrickRuntimeContext` — `random, getPolicyCard, getAction, fetch, getCredential`; `:358` `ControlSource` — five values, `policyCards` the last added (WP22). `schemas/pack-manifest.ts:171` `guardrails?: GuardrailDefinition[]` — the dead lane (`26-…` §2 G-register: nothing reads it but `pack-registry.ts:104`'s insert and `getGuardrail`); `:179` `policyCards?`.

**`packages/governance`.** `createStepBudgetGuardrail`, `createNoRepetitionGuardrail`, `compilePolicyCard` — the local floor every safety brick composes. No hosted machinery.

**`packages/pack-testkit`.** `checks/guardrail.ts` `checkGuardrail(guardrail, context)` — description present, pure (context unchanged by JSON comparison), verdict in the closed union. `describeConformance(fixture)` drives the checks from a `PackConformanceFixture`. Nothing about services, fetch, or credentials.

**`apps/workbench`.** `components/bench/panels/SchemaPanel.svelte:42–45` resolves `ControlSource` by `if` chain (`tools`, `actions`, `senseChannels`, `policyCards`); `pack-geap`'s nested `filters` object is drawn by the schema panel's existing handling, not by a dedicated panel — `25-…` §8's "`ArmourPanel.svelte`" never became a file (`27-…` §7's WP52 row asks to verify this; it is verified here). The Workshop pack (`packages/packs/workshop`) ships a world, goal cards and session plans — **no brick kinds yet**; `workshop/guard` will be its first.

**`packages/packs/geap/src/armor/*.test.ts`** — 162 tests; `guardrails.test.ts` alone is 585 lines table-testing `verdictFor` over hook × dial × filter × confidence × outcome, asserting `strings.ts`'s exact reason text.

---

## 3. Design principles

1. **The golden trace is the gate.** `trace.geap-armour-offline.v1.json` stays byte-identical through stage D. That single constraint fixes the record's key order, the `service` literal, the filter keys and the confidence vocabulary on the trace, and `armorConfigSchema`'s exact shape in the spec snapshot. Every choice below that looks fussy is this principle applied.
2. **Additive core, mechanism in governance, vocabulary in the pack.** Core gains types and optional fields; governance gains the shell; the pack keeps its wire client, its reading, its strings and its fixtures. No disposition, clamp, timeout, scrub or record-assembly code remains in `pack-geap/src` when stage D closes (the row's diff test).
3. **Vendor words survive beside neutral ones, never instead of them.** A finding carries a `FindingCategory` *and* the vendor's own label and confidence string. The safety case quotes the category; the audit quotes the label.
4. **Fail closed is the shell's rule, not the vendor's.** `partial`, `failure`, transport error, timeout — the shell decides through `onFailure`; a service only reports.
5. **Offline is mandatory.** Every service ships `createOffline()` (tenet 10): the canned all-clear that makes a guarded run reproducible with no key and no network, and that the campaign baseline already relies on.
6. **Guardrails stay pure** (D3): the shell *returns* the record via `checkWithRecord`; core emits it.

---

## 4. The design

### 4.1 `ExternalCallRecord`, widened (core, stage A)

```ts
export const externalCallRecordSchema = z.object({
  service: z.string().min(1),          // was z.literal('model-armor') — the service's own record name (§8 D-a)
  method: z.string().optional(),       // the vendor's own call name: 'sanitizeUserPrompt', 'ApplyGuardrail', 'isAuthorized'
  endpoint: z.string(),
  template: z.string().optional(),     // was required — Model Armor's word for a policy reference
  policyRef: z.string().optional(),    // the vendor-neutral word for the same thing
  latencyMs: …, charsScreened: …,      // unchanged
  outcome: z.enum([ …the ten… ]),      // unchanged
  filters: z.record(z.string(), z.object({ ran, matched, confidence?: z.string() })).optional()   // unchanged
});
```

Every stored trace parses unchanged: `'model-armor'` is a string, `template` present is fine, the new keys are optional. **Nothing writes `method` or `policyRef` for `pack-geap`** — writing them would change the golden bytes; a later vendor writes what it has. `guardrail.external` keeps its shape.

### 4.2 `GuardrailContext`, widened (core, stage A)

```ts
export interface GuardrailContext {
  … existing seven fields …
  /** The current observation — present at every hook once SENSE has run this tick. */
  observation?: Observation;
  /** The composed prompt — present from `pre-think`. */
  messages?: readonly ChatMessage[];
  /** The brain's answer — present at `pre-act` and `post-act` for a brain-driven tick; absent for a reflex. */
  response?: ChatResponse;
}
```

`agent-session.ts`'s `guardrailContext(hook, proposed?)` gains the three as optional arguments, threaded from the three places the session already holds them. `pack-geap`'s selectors are **not** rewritten onto these fields in WP39 (their `history`-walking form is what the golden trace exercises and what a host that has not been updated still needs); the shell's *default* selectors (§4.5) read the new fields first and fall back to the history walk, which is the same answer on every fixture. Testkit's `checkGuardrail` keeps working — the fields are optional and the purity check is a JSON comparison of whatever is there.

**Not chosen, recorded:** a `post-think` hook (`26-…` §6.1's own paragraph). The enum stays at three.

### 4.3 The contract: `GuardrailService` (core, stage B)

`packages/core/src/types/guardrail-service.ts`, exported from the barrel:

```ts
export type FindingCategory =
  | 'injection' | 'jailbreak' | 'harmful' | 'sensitive-data' | 'malicious-link' | 'policy-violation' | 'other';
export const findingCategorySchema = z.enum([…]);

export interface ScreenFinding {
  category: FindingCategory;
  /** The vendor's own name for the check — the key under which it appears in `guardrail.external.filters`. */
  vendorLabel: string;
  ran: boolean;
  matched: boolean;
  confidence?: 'low' | 'medium' | 'high';
  /** The vendor's own confidence string, when it has one — what the trace records (§8 D-b). */
  vendorConfidence?: string;
}

export interface ScreenReading {
  outcome: 'ok' | 'partial' | 'failure';
  matched: boolean;
  findings: ScreenFinding[];
  /** Noted only, never substituted (`25-…` §4.4). */
  redactedText?: string;
}

export interface ScreenRequest {
  hook: GuardrailHook;
  text: string;
  /** Extra context a vendor may take — the observation for a response screen. */
  context?: string;
  /** The proposed call, for a service that gates actions (WP45's PDP). */
  proposed?: GuardrailContext['proposed'];
  /** Pointers a service may forward, never the whole trace. */
  envelope: { runId?: string; agentId: string; tick: number };
}

/** What the service knows about the call it made, less what the shell measures. */
export type ScreenRecord = Omit<ExternalCallRecord, 'latencyMs' | 'charsScreened' | 'filters'>;

export type ScreenResult =
  | { reading: ScreenReading; record: ScreenRecord }
  | { error: { kind: ExternalOutcomeKind; message: string }; record: ScreenRecord };

export interface GuardrailServiceClient {
  screen(request: ScreenRequest, signal?: AbortSignal): Promise<ScreenResult>;
}

export interface GuardrailService {
  id: string;                          // qualified, like every other pack contribution: 'geap/model-armor'
  name: string;
  description: string;
  hooks: GuardrailHook[];              // a PDP is ['pre-act']; a content filter is all three
  credential?: BrickKindDefinition['credential'];
  egress: EgressDeclaration[];         // §4.9
  /** Vendor labels that stop the run regardless of any dial — `csam` for Model Armor (§8 D-c). */
  alwaysStop?: string[];
  configSchema: ZodType<unknown>;      // the service block of a fitted brick's config
  create(options: { config: unknown; fetch: typeof globalThis.fetch; getCredential(id: string): string | undefined; timeoutMs: number }): GuardrailServiceClient;
  createOffline(config: unknown): GuardrailServiceClient;
}
```

`ExternalOutcomeKind` is the record's ten outcomes less `ok|partial|failure|offline` — the six transport kinds `pack-geap/errors.ts` already normalises to; it becomes a named core type in stage A so the pack and the shell name the same set.

**Registration.** `PackManifest.guardrailServices?: GuardrailService[]` (validated as data: id qualified with the pack id, `hooks` non-empty, `configSchema` present, both factories functions). `PackRegistry.getGuardrailService(id)` / `listGuardrailServices()`. `BrickRuntimeContext.getGuardrailService(id)` and `BrickValidationContext.hasGuardrailService(id)` — the `getPolicyCard`/`hasPolicyCard` pair again, for the same reason: the generic brick must resolve the service at `createRuntime`, and must refuse at `validate` when the id names nothing. `PackManifest.guardrails` and `getGuardrail` are marked `@deprecated` with a pointer here; removal is WP52's if nothing has adopted it by then.

### 4.4 The shell (governance, stage C)

`packages/governance/src/hosted/`:

```ts
export const hostedScreenConfigSchema = z.object({
  screenObservation: z.enum(['off','note','stop']).default('off'),
  screenDecision:    z.enum(['off','note','block','ask','stop']).default('ask'),
  screenResult:      z.enum(['off','note','stop']).default('off'),
  perCategory: z.record(findingCategorySchema, z.enum(['inherit','off','note','block','ask','stop'])).default({}),
  minConfidence: z.enum(['low','medium','high']).default('medium'),
  onFailure: z.enum(['stop-run','allow-with-note']).default('stop-run'),
  timeoutMs: z.number().int().min(500).max(10000).default(3000),
  offline: z.boolean().default(false)
});
export type HostedScreenConfig = z.infer<typeof hostedScreenConfigSchema>;

export interface HostedStrings {          // defaults in governance; a vendor may hand its own (`pack-geap/strings.ts`)
  allClear: string; nothingToCheck: string; didNotFinish: string;
  transport(kind: ExternalOutcomeKind): string;
  match(matches: Array<{ label: string; confidence?: string }>): string;
}

export type TextSelector = (ctx: GuardrailContext) => { text: string; context?: string } | undefined;

export function verdictForReading(
  result: ScreenResult, hook: GuardrailHook, screening: HostedScreenConfig,
  alwaysStop: readonly string[], strings: HostedStrings
): GuardrailVerdict;

export function createHostedGuardrails(options: {
  idPrefix: string;                        // 'geap/armor' → 'geap/armor:observation' | ':decision' | ':result'
  names?: Partial<Record<GuardrailHook, { name: string; description: string }>>;
  service: GuardrailService;
  serviceConfig: unknown;                  // already parsed by service.configSchema
  screening: HostedScreenConfig;
  ctx: Pick<BrickRuntimeContext, 'fetch' | 'getCredential'>;
  envelope: () => ScreenRequest['envelope'];
  selectors?: Partial<Record<GuardrailHook, TextSelector>>;
  strings?: HostedStrings;
}): Guardrail[];
```

`verdictForReading` is `pack-geap`'s `verdictFor` with the vendor removed: `alwaysStop` label matched → `stop-run`; each matched finding with `confidence` at or above `minConfidence` (a finding with no confidence always counts) resolves its disposition — `perCategory[category]` if not `inherit`, else the hook dial — clamped for the hook; `off` drops it; none left → `ok` gives `allClear`, otherwise `onFailure`; strictest wins; `note`/`block-action`/`pause`/`stop-run` by the ladder. The transport row is `onFailure`. **Table-tested once**, in governance, over hook × dial × category × confidence × outcome × clamp × failure, with a test-only service; `pack-geap`'s `guardrails.test.ts` keeps its own table as a regression net over the same function through the pack's strings.

`createHostedGuardrails` returns one `Guardrail` per hook the service supports whose dial is not `off`: `screening.offline ? service.createOffline(serviceConfig) : service.create({...})` once; per check — selector → `nothingToCheck` allow with no record → `Date.now()` around `client.screen` with an `AbortSignal.timeout(timeoutMs)` → `verdictForReading` → the record assembled **`{ ...result.record, latencyMs, charsScreened, outcome, filters? }`** with `outcome` = `'offline'` when offline, else the error kind or the reading's outcome, and `filters` = `Object.fromEntries(findings.map(f => [f.vendorLabel, { ran, matched, confidence: f.vendorConfidence ?? f.confidence }]))` when there is a reading. Because `result.record` from `pack-geap` is `{ service: 'model-armor', endpoint, template }` in that order and the shell appends the rest in the golden order, the bytes match.

Default selectors: `pre-think` → `ctx.observation?.text ?? observationText(ctx.history)`; `pre-act` → `ctx.proposed` rendered after the last thought (`ctx.response?.text ?? last decision`), with the observation as `context`; `post-act` → the history walk (there is no context field for a result yet). The rendering helpers (`renderCall`, `stringifyToolResult`) move to governance with them; `pack-geap/text.ts` becomes re-exports over the shell's selectors, kept so its 122-line test stays as-is.

### 4.5 `pack-geap` on the shell (stage D)

`reading.ts` gains `toScreenReading(armorReading): ScreenReading` — eight findings with `vendorLabel` = today's key (`injection`, `hate`, `harassment`, `dangerous`, `sexual`, `sensitiveData`, `maliciousUri`, `csam`), `category` by the map `injection→injection`, the four RAI keys→`harmful`, `sensitiveData→sensitive-data`, `maliciousUri→malicious-link`, `csam→harmful`; `confidence` normalised `LOW_AND_ABOVE→low, MEDIUM_AND_ABOVE→medium, HIGH→high` with `vendorConfidence` the raw string. `service.ts` is the `GuardrailService`: `id: 'geap/model-armor'`, `hooks` all three, `credential: { id: 'geap', … }` as the brick has, `alwaysStop: ['csam']`, `configSchema` = the three service fields + `injectionMinConfidence`, `create` wrapping `createModelArmorClient` and `createOffline` wrapping the offline client, `screen` choosing `sanitizeUserPrompt` at `pre-think` and `sanitizeModelResponse` elsewhere with `request.context` as `userPrompt`, and returning `record: { service: 'model-armor', endpoint: describeEndpoint(config, method), template: config.templateId }`.

`armorConfigSchema` **does not change** — its fields and defaults are in the golden spec snapshot. `brick-kind.ts` splits a parsed config in two at `createRuntime`: the service block, and a `HostedScreenConfig` where `perCategory` is derived from `filters` (`injection→injection`, `harmfulContent→harmful`, `sensitiveData→sensitive-data`, `maliciousLinks→malicious-link`) and `minConfidence` from `injectionMinConfidence`. Its guardrail list becomes `[stepBudget, noRepetition?, ...createHostedGuardrails({ idPrefix: 'geap/armor', names: HOOK_NAME/HOOK_DESCRIPTION, service, serviceConfig, screening, ctx, envelope, strings: armorStrings })]`. `guardrails.ts` and `config.ts`'s disposition code are deleted; `errors.ts`, `client.ts`, `strings.ts`, the fixtures and the brick kind stay. The manifest adds `guardrailServices: [modelArmorService]` beside `brickKinds`.

### 4.6 The generic Guard brick (workshop pack, stage E)

`workshop/guard`, slot `safety`, `audience: 'workshop'`, in `packages/packs/workshop/src/bricks/guard.ts` — the Workshop pack's first brick kind:

```ts
config: { serviceId: string; service: unknown; screening: HostedScreenConfig; maxTicks: number; repeatLimit?: number }
```

`validate` resolves `serviceId` through `ctx.hasGuardrailService` and parses `service` through the resolved service's `configSchema`, reporting each issue as a `BrickConfigProblem` on the `service` path; `createRuntime` composes exactly as §4.5 does with the shell's default names and strings. `controlHints.serviceId.source = 'guardrailServices'` — `ControlSource` gains its sixth value, and `SchemaPanel.svelte`'s chain gains the branch, listing `registry.listGuardrailServices()`. The nested `service` block is drawn by the panel's `'object'` case: today the panel draws the geap `filters` object already, so this is "verify and cover", not a new panel (`27-…` §7's WP52 row asks exactly this).

Faces (hard rule 7). Toy: **Guard Brick** — "Sends what your robot sees, thinks and says to a guard you choose, who checks it before it goes any further." Real: **Hosted guardrail service (vendor-neutral)**.

### 4.7 Conformance (testkit, stage E)

`checkGuardrailService(service, fixture: { config, offlineRequests: ScreenRequest[], plantedSecret: string })`:

- `guardrailService.id-qualified`, `hooks-non-empty`, `config-parses` (the fixture config through `configSchema`);
- `guardrailService.offline-answers` — `createOffline(config).screen(r)` resolves to a `ScreenResult` for every fixture request, with `record.service` non-empty and every finding's `vendorLabel` unique;
- `guardrailService.create-never-throws` — `create` with a fetch that rejects, then one that returns 500, then one that returns `{}`; every `screen` resolves to `{error}` with `kind` in `ExternalOutcomeKind`;
- `guardrailService.no-secret-leaks` — with `getCredential` returning `plantedSecret`, the above results, `JSON.stringify`ed, never contain it (`25-…` §11 stage A's test made generic);
- `guardrailService.egress-declared` — every host the wrapped fetch saw matches a declared `egress[].host` pattern.

`describeConformance`'s fixture gains `guardrailServices?: Array<{ service, fixture }>`.

### 4.8 What the trace says

Unchanged in shape. A reader tells vendors apart by `guardrail.external.service` (the vendor's record name) and by the `guardrailId` prefix; the `filters` keys are the vendor's own labels. The vendor-neutral `category` is **not** on the trace in WP39 — putting it there changes the golden bytes; WP47 (telemetry sinks) reads it from the `ScreenReading` at the sink, and WP49's drift dashboard folds it from the summary. Recorded as a deferral, not an oversight.

### 4.9 Egress, declared not enforced

`EgressDeclaration` (`26-…` §6.6) becomes a core type and schema in stage B — `{ host, purpose, sends[] }` — because `GuardrailService.egress` needs it. Enforcement (the wrapping fetch, `createSession({ egress })`, the `--egress none` flag) is WP41's and is not built here; `checkGuardrailService`'s `egress-declared` check is the first consumer. `pack-geap` declares `{ host: 'modelarmor.*.rep.googleapis.com', purpose: 'content screening', sends: ['observation','decision','result','credential-header'] }`.

---

## 5. UX trajectory

Nothing in the Kit changes (D2 holds). In the Workshop: the bench offers **Guard Brick** beside **Armour Brick** with the door open; its panel has a service picker (one entry, Model Armor, until WP42), the service's own fields beneath it, and the same dials as the Armour Brick. A run with either brick reads identically in the Run Lab. A vendor that ships only a service appears in the picker with no other work.

---

## 6. Determinism

Unchanged. `createOffline` is the canned client; `latencyMs` is 0 offline (the golden trace says so); `AbortSignal.timeout` is the one clock the live path uses and it is never on the offline path. The shell has no randomness.

---

## 7. Non-goals (recorded so they are decisions)

- No second vendor (WP42). No PDP (WP45). No egress enforcement (WP41). No `category` on the trace (§4.8).
- No rewrite of `pack-geap`'s selectors onto the widened context (§4.2) — the fallback form is the one the golden trace proves.
- No migration of `armorConfigSchema` to `{service, screening}` — the Armour Brick keeps its config as its users saved it; the split is internal.
- No removal of `PackManifest.guardrails` — deprecated only.

---

## 8. Divergences from `26-…` §6.1, with reasons

- **D-a — `ExternalCallRecord.service` is the service's record name, not its registry id.** §6.1 says "a registered `GuardrailService` id". The golden trace says `'model-armor'`; registry ids are `pack/name`. The link from a row to the registry is `guardrailId`'s prefix (the brick's), which is already on the event.
- **D-b — findings carry `vendorConfidence`.** §6.1's `confidence: 'low'|'medium'|'high'` alone would put `'medium'` on the trace where `'MEDIUM_AND_ABOVE'` is today. Both are kept; the trace gets the vendor's.
- **D-c — `alwaysStop` is a list of vendor labels, not categories.** `csam` maps to the `harmful` category with three dialable siblings; a category-level always-stop would make every RAI hit un-dialable.
- **D-d — `ScreenRecord` excludes `filters`;** the shell writes them from findings so every vendor's row has the same `{ran, matched, confidence?}` cells.
- **D-e — `createOffline(config)` takes the config;** the offline record still needs the endpoint and template the config names (the golden rows have both).
- **D-f — `timeoutMs` reaches `create` as an option** rather than living in the service block, so one dial governs every vendor.
- **D-g — `screenObservation`/`screenResult` keep the narrower `off|note|stop` enums** the Armour config has, rather than §6.1's single `dispositionSchema` for all three; the clamp makes `block`/`ask` meaningless there and the spec snapshot freezes the enums anyway.

Stage-level notes are appended below as each lands.

> **Amended 2026-09-02 (Stage B).** The contract landed as §4.3 and §4.9 describe — `types/guardrail-service.ts` (`GuardrailService`, `GuardrailServiceClient`, `ScreenRequest`/`ScreenReading`/`ScreenFinding`/`ScreenRecord`/`ScreenResult`, `findingCategorySchema`, `findingConfidenceSchema`, `egressDeclarationSchema`), `PackManifest.guardrailServices`, `getGuardrailService`/`listGuardrailServices` on the registry, `getGuardrailService` on `BrickRuntimeContext` and `hasGuardrailService` on `BrickValidationContext`, both wired in the three places core builds those contexts (the session, `validateSpec`, `capabilitiesOf`), and `guardrails`/`getGuardrail` marked `@deprecated`. Two notes. **`ScreenRecord` also omits `outcome`** — the shell writes it (offline, the error kind, or the reading's) so a service cannot contradict its own result; §4.3's sketch had left it on the service side. **The registry validates a service as data on registration** (`describeGuardrailServiceProblems`: id, non-empty hooks, well-formed egress rows, a `configSchema`, both factories) and throws naming the pack and the problem, the way it already throws on a duplicate id; `pack-testkit`'s manifest check adds `guardrailService` ids to its qualification sweep. Every hand-built `BrickRuntimeContext` in the repo's tests (eight in core, one in geap, five in starter) gained the one-line lookup. Found on the way and fixed: `pack-testkit`'s non-deterministic fixture tool rolled a real die and so matched itself one run in six — it counts calls now. Gate: core 40 / 599 with thresholds (two tests added so the new one-liners are exercised through `validateSpec` and the session); testkit 25; every package's suite, lint (28 tasks) and the build green.

> **Amended 2026-09-02 (Stage A).** The widening landed as §4.1–§4.2 describe, with two notes. **`ExternalOutcomeKind` is a Zod enum in `schemas/shared.ts`** (`externalOutcomeKindSchema`), and the record's `outcome` is built from it plus the four reading outcomes, so the two sets cannot drift; `pack-geap`'s `ArmorErrorKind` is proven assignable both ways in `record-compat.test.ts`, which also parses every event and every `guardrail.external` row of the golden trace through the widened schemas. **The session threads the three fields through one closure value** (`inHand`, reset at `tick.started`, set after SENSE, COMPOSE and THINK) spread into every context of the tick, rather than three new parameters on `guardrailContext`; `agent-session.test.ts` proves `pre-think` sees the observation and the prompt but no response, and `pre-act`/`post-act` see all three. One consumer needed a change: the Audit Centre's OTel export wrote `template` unconditionally and now writes `template`, `policyRef` and `method` each only when present. Gate: core 39 files / 580 tests with thresholds; geap 12 / 166; both golden traces byte-identical; every package's suite, `npm run lint` (28 tasks) and the full build green.

---

## 9. Risk register

| Risk | Mitigation |
|---|---|
| The golden bytes drift through key order or a defaulted field | Stage D's first test is the golden trace; the record is assembled by spread in the frozen order and nothing new is written for geap |
| `guardrails.test.ts`'s 585 lines assert vendor strings the shell no longer owns | The pack passes its own `HostedStrings`; the table stays green through the shell |
| Widening `GuardrailContext` reaches every guardrail test's hand-built context | All three fields optional; `checkGuardrail`'s purity check is shape-agnostic |
| `ControlSource` widening touches the schema panel | One branch, one e2e |
| `EgressDeclaration` lands before its enforcer and rots | It has one consumer on day one (`egress-declared`) and WP41 is next in phase |

---

## 10. Implementation plan

| Stage | Builds | Definition of done |
|---|---|---|
| **A — Schema widening** | `externalCallRecordSchema` widened; `ExternalOutcomeKind`; `GuardrailContext` + `guardrailContext()` threading; old-trace fixtures | Every stored trace fixture in the repo parses; both golden traces byte-identical; core ≥ 90 % |
| **B — The contract** | `GuardrailService` & friends in core; `EgressDeclaration`; `PackManifest.guardrailServices` + validation; registry, runtime- and validation-context lookups; `guardrails` deprecated | Registry tests for duplicate ids and cross-pack qualification; a stub service resolves through `BrickRuntimeContext` |
| **C — The shell** | `hosted/` in governance: schema, strings, selectors, `verdictForReading`, `createHostedGuardrails` | Table test with a test-only service over hook × dial × category × confidence × outcome × clamp × failure; all three hooks through the chain; the offline path writes `outcome: 'offline'` |
| **D — `pack-geap` on the shell** | `toScreenReading`, `service.ts`, brick kind on `createHostedGuardrails`; `guardrails.ts`/`text.ts` reduced | **Golden trace byte-identical**; 162 tests green; no disposition/clamp/timeout/scrub/record code under `packs/geap/src` |
| **E — Guard brick, conformance, close-out** | `workshop/guard`; `ControlSource: 'guardrailServices'` + panel branch; `checkGuardrailService`; dated notes in §8, `26-…` §12, `27-…` §8/row, `CLAUDE.md` | Guard brick fits with the door open, invisible shut; runs `starter/warning-sign` offline with `geap/model-armor` and the same verdicts as `geap/armor`; `checkGuardrailService` rejects a broken fixture service on every check |

---

## 11. Acceptance criteria (WP39 as a whole)

1. `fixtures/trace.geap-armour-offline.v1.json` and `pack-starter`'s golden trace are byte-identical at every stage.
2. `pack-geap`'s full suite is green on the shell, and a diff of `packages/packs/geap/src` shows no disposition, clamp, timeout, scrub or record-assembly code.
3. A test-only `GuardrailService` in governance's suite is exercised at all three hooks and every disposition through the shell.
4. `checkGuardrailService` rejects a deliberately broken fixture service on every check it makes.
5. `workshop/guard` fits with the door open, is invisible shut, and runs `starter/warning-sign` against the offline Model Armor service with the same verdicts as `geap/armor`.
6. Every trace written before WP39 still parses; `guardrail.external` keeps its shape.
7. The "next vendor" test: a pack shipping only a `GuardrailService` is fittable through `workshop/guard` with no change outside `packages/packs/<vendor>`.
