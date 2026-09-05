# 47 — Service lines and cassettes (WP58): registered lines, recorded sandboxes

> **Status:** design of record for WP58 (`42-DAY4-ROADMAP.md` Phase M), written 2026-09-05 against the codebase as it stands after WP55 (`main` at `3b3e149`). This is the map for `41-TARGET-DESIGN-V4.md` §6.4; where the two differ, §8 below says why and `41-…` §12 gets a dated note when the stage lands. This note takes `47-`, so the bank's note becomes `48-FS-BANK.md` and the Advice Desk's `49-FS-ADVICE.md` — moved a third time, recorded in `42-…` §8.

---

## 1. Purpose, and who this is for

Every desk in Phase N reaches things outside itself: a customer record, a balance, a payment rail, a credit bureau, an order desk. Today the only "outside" a bot can reach is a catalogue of one — `services.ts` hardcodes the Weather Line, no pack can declare a line, no line can be backed by a recording of a real system, and the egress guard has nothing business-shaped to guard (`41-…` G27). Three things change. **Lines are registered content**: a pack ships `ServiceLine`s the way it ships worlds, and the Connector brick picks one from the registry. **A line answers three ways**: `simulate` from the world's own state, deterministic; a **cassette**, a recording replayed byte-for-byte with a loud miss; or **live**, reaching a real sandbox under declared egress — harness-only, and used to *record*. **The trace says which.** A cassette is content, redacted at write time and swept like every other fixture (hard rule 9).

This note is for WP59–WP63's desk authors (nine `fs-bank/*` lines will be written against this contract), for the Connector brick's users in the Kit (whose picker now lists every line an installed pack ships), and for whoever re-records a cassette when a sandbox changes.

## 2. Where the code actually is (the load-bearing facts)

Verified against `main` at `3b3e149`.

**The catalogue of one.** `packs/starter/src/world/services.ts` (78 lines): `ServiceId = 'weather'`, `ServiceOperation { id, service, name, description, failureChance, riskTier, respond() }`, `SERVICES`, `OPERATIONS` (`forecast` with the tool-poisoning payload; `alert`, irreversible), `operationsFor`. `tools/connector.ts` wraps each operation as a `ToolDefinition` with id `starter/connector_<service>_<op>` — the wire name `connector_weather_forecast` is what every trace and plan names — drawing `failureChance` from `context.random()`, honouring a scenario's `worldState.serviceOverrides[toolId]` (the `tool-result` injection, WP44), then `respond()`. `brick-kinds.ts` line 464: `connectorConfigSchema { serviceId: string, scopes: string[] }`; `connectorBrickKind` describes, validates (`unknown-service`, `unknown-scope` warnings) and, at runtime, `contributeCalls` offers every operation's tool id and `contributeGuardrails` blocklists the ones `scopes` does not name. The WP32 confused-deputy scenario is `session/false-alarm.test.ts` over `starter/false-alarm`.

**How a tool reaches a session.** `agent-session.ts` `resolveTools(offeredIds)` looks each id up in `registry.getTool(id)` — a tool must be in the registry's `tools` map to be offered. `ToolContext { tick, notebook, random, worldState? }` — no `fetch`, no credentials: a session never makes a live call from a tool. `ToolResult { ok, output, data? }`.

**Contexts a brick sees.** `BrickValidationContext { hasTool, hasAction, hasSenseChannel, hasCartridge, hasPolicyCard, hasCredential, hasGuardrailService }` (built in `validate-spec.ts` line 75 and `capabilities.ts`); `BrickRuntimeContext { random, getPolicyCard, getAction, fetch, getCredential, … }` (built in `agent-session.ts` line 172). `describeFitted?(config)` takes no context. `ControlSource = 'tools' | 'actions' | 'senseChannels' | 'cartridges' | 'policyCards' | 'guardrailServices'`; the bench's `SchemaPanel.svelte` `catalogue(source)` switches on it, fed by `panel-props.ts` (`guardrailServices: GuardrailService[]`) through `BrickPanel.svelte`.

**The registry.** `pack-registry.ts`: one `Map` per lane, `insertUnique` at `registerPack`, `get*`/`list*` pairs; `guardrailServices` and `evaluators` are the two function-valued lanes added by WP39 and WP43; `PackManifest` (`schemas/pack-manifest.ts` line 200–215) declares each.

**Egress and secrets.** `core/egress.ts` `createEgressGuard({ mode, fetch, onRefused }) → { fetch, allow(declarations), hosts() }`; `EgressDeclaration { host, purpose, sends: ('prompt'|'observation'|'decision'|'result'|'trace'|'credential-header')[] }`; `BrickKindDefinition['credential']`; `GuardrailService.browserCapable?` ("set from a live CORS checkpoint, `false` until one has been taken"). `persistence/redact.ts` `redactSecrets(value, secrets)`, `containsSecret`. `computeTraceDigest` is SHA-256 over JSON through `crypto.subtle`. The harness's `key-leak.test.ts` plants one secret per declared credential, runs and bundles, and sweeps every file written and every line printed.

**Artefacts.** `schemas/trace-bundle.ts` is the model for a file format (`format`, `formatVersion`, a parse function); `scripts/json-schema.mjs` `artefactSchemas()` lists six; `evals/src/json-schema.test.ts` counts them.

**The desk.** `DeskState.toolOverrides` — "`tool-result` injections, by tool id, for a service line to read (WP58). Carried, not consumed, in WP53."

**Events.** `error { message, kind? }` with `kind` open (`'engine'`, `'egress-refused'`); `tool.executed { name, arguments, result, durationMs }`.

## 3. Design principles

1. **A line is content; the wrapper is core.** A pack declares operations and how they answer; the registry turns each operation into the `ToolDefinition` the session already knows how to offer, under the id the Connector brick already names. No pack ships a tool for a line.
2. **Three answers, one order, on the trace.** For an operation: the failure draw (as today), then the world's override (a scenario's `tool-result`), then `simulate`, then the cassette, then a loud miss. Never `live` — a session's tool has no `fetch`, by construction.
3. **A cassette is a fixture.** Written redacted, dated, with the egress it was recorded under; parsed by a schema; swept by `checkSynthetic` and the key-leak test; replayed byte-for-byte; a miss is `error.kind: 'cassette-miss'` and a failed call, never a call out.
4. **Recording is the harness's job.** `craftabot record` is the only path that runs a line's `live`, under `--egress declared` with the line's own hosts allowed and nothing else.
5. **Byte-identical before and after.** The Weather Line moves onto the contract with every id, string and draw unchanged; the confused-deputy scenario and both starter goldens hold.
6. **The picker is the registry.** The Connector's `serviceId` lists `serviceLines`; a line from any installed pack is fitted the same way; unknown ids remain warnings, never schema failures.
7. **Additive.** A new manifest lane, three optional context methods, one optional `ToolResult` field, one `ControlSource` member, one file format.

## 4. The design

### 4.1 `ServiceLine` in core (stage A)

```ts
// types/service-line.ts
export interface ServiceOperation {
  id: string;                       // bare: 'forecast'
  name: string;
  description: string;
  /** JSON Schema for the arguments; `{}` (no arguments) is the common case. */
  parameters?: JsonSchema;
  riskTier: RiskTier;
  /** Chance (0–1) the call comes back as a simulated connection failure, drawn from `random()`. */
  failureChance?: number;
}

export interface ServiceLineContext {
  worldState?: Readonly<WorldState>;
  random(): number;
}

export interface ServiceLine {
  id: string;                       // 'starter/weather', 'fs-bank/crm'
  name: string;
  description: string;
  operations: ServiceOperation[];
  /** Simulated: answers from the world's own state, deterministic over (state, args, random). */
  simulate?(op: string, args: unknown, ctx: ServiceLineContext): ToolResult;
  /** Recorded: answers from a cassette; a miss is a failed call, never a live one. */
  cassette?: CassetteFile;
  /** Live: reaches a real sandbox — harness-only, under declared egress; used to record. */
  live?: {
    egress: EgressDeclaration[];
    credential?: BrickKindDefinition['credential'];
    /** From a live checkpoint; `false` until one has been taken. */
    browserCapable?: boolean;
    call(op: string, args: unknown, deps: { fetch: typeof globalThis.fetch; getCredential(id: string): string | undefined; signal?: AbortSignal }): Promise<ToolResult>;
  };
}
```

`PackManifest.serviceLines?: ServiceLine[]`; `PackRegistry.getServiceLine(id)` / `listServiceLines()`. **The registry synthesises the tools** at `registerPack`: for every operation, a `ToolDefinition` with id `${packId}/connector_${bare(line.id)}_${op.id}` — `starter/weather` + `forecast` → `starter/connector_weather_forecast`, the id every trace carries today — inserted into the `tools` lane like any tool (`insertUnique`, so a pack cannot ship both). Its `execute(args, context)`:

1. `failureChance` — `context.random() < chance` → `{ ok: false, output: <the line's busy string> }` (the same draw, in the same place, as `tools/connector.ts` today);
2. the world's override — `worldState.serviceOverrides?.[toolId]` (the Playroom) or `worldState.toolOverrides?.[toolId]` (a desk: WP53's field, consumed at last) → `{ ok: true, output }`;
3. `simulate(op, args, { worldState, random })` when the line has one;
4. the cassette — `replayFromCassette(cassette, op, args)` by `op + argsDigest`;
5. a miss — `{ ok: false, output: <miss string>, errorKind: 'cassette-miss' }`.

`ToolResult.errorKind?: string` is the one additive field: the session, on a failed tool result that names a kind, emits `error { message, kind }` beside its `tool.executed` — so a cassette miss is on the trace as `error.kind: 'cassette-miss'` the way an egress refusal is `'egress-refused'`, and a reader filtering the error lane sees it. `ControlSource` gains `'serviceLines'`; `BrickValidationContext.hasServiceLine(id)` and `getServiceLine(id)` on both contexts (`validate-spec.ts`, `capabilities.ts`, `agent-session.ts`).

**The Connector brick** reads lines from the registry: `validateConfig(config, ctx)` warns `unknown-service` when `!ctx.hasServiceLine` and `unknown-scope` against the line's operations; `createRuntime(config, ctx)` offers `ctx.getServiceLine(id).operations` under the synthesised ids and blocklists the rest; `serviceId`'s control is `{ control: 'choice', source: 'serviceLines' }`; `scopes` stays a checklist the panel fills from the chosen line's operations (the bench already does this for tools by source — a `serviceLineOperations` source would need the chosen line, so `scopes` keeps its `idList` control and the panel's existing behaviour; §8). `describeFitted(config)` has no context, so the starter names its own line and shows any other by id (§8).

**The Weather Line** becomes `packs/starter/src/world/service-lines.ts`: `weatherLine: ServiceLine` with `simulate` returning the two `respond()` strings, `failureChance` 0.2/0.1, tiers as today; `services.ts` shrinks to derived re-exports (`SERVICES`, `OPERATIONS`, `operationsFor`, `ServiceId`) so nothing that imports it moves; `tools/connector.ts` is deleted (the registry synthesises what it built). **Proof of byte-identity:** `false-alarm.test.ts` runs unchanged; a new test in the starter runs the confused-deputy plan and compares the `tool.executed` events against a snapshot taken before the move (committed in stage A from the pre-move code); both starter goldens unchanged.

### 4.2 Cassettes (stage B)

```ts
// schemas/cassette.ts
export const CASSETTE_FORMAT_VERSION = 1;
cassetteFileSchema = {
  format: 'craftabot-cassette', formatVersion: 1,
  lineId, recordedAt, recordedBy,
  egress: EgressDeclaration[],
  entries: Array<{ op, argsDigest, args, result: ToolResult, latencyMs }>
}
argsDigest(args): Promise<string>   // SHA-256 of canonical JSON (keys sorted), through crypto.subtle
replayFromCassette(cassette, op, args): Promise<ToolResult | undefined>
```

A cassette is one line's recording; a pack ships it as a JSON import under `src/cassettes/` (a `cassettes/` directory, so `checkSynthetic`'s sweep already covers it) and sets `line.cassette`. Synchronous replay: `execute` may be async, and the digest is awaited. `docs/schemas/craftabot-cassette.schema.json` joins the generator's list (`json-schema.test.ts` counts seven).

**`craftabot record --line <id> --script calls.json [--out ./cassettes] [--egress declared]`** (harness-only): loads the registry, finds the line, refuses one with no `live`; builds an egress guard in `declared` mode with the line's `live.egress` allowed and nothing else (`--egress none` refuses every call and writes nothing); reads `calls.json` as `Array<{ op, args }>`; calls `live.call` for each with the guarded `fetch`, `getCredential` from the environment and a timeout; measures `latencyMs`; writes `<out>/<lineId with / → ->.craftabot-cassette.json` **redacted** against every secret the process holds — and, because `redactSecrets` is an exact-match scrub by design (`redact.ts`), **refuses to write at all** when a secret survives inside a result string: a line that embeds its key in what it returns is a line that leaks, not a cassette to keep (decided in stage B). The harness's key-leak test gains a recording over a stub line whose `live.call` echoes its credential into the result, and sweeps the cassette and the CLI's output for the planted secret.

### 4.3 `checkServiceLine` (stage B, `pack-testkit`)

`checkServiceLine(line, fixture?: ServiceLineConformanceFixture)`; `PackConformanceFixture.serviceLines?: Record<lineId, fixture>`; `describeConformance` runs it for every line a manifest ships.

- `service-line.operation-tier` — every operation names a `riskTier`; `failureChance`, when present, is within 0..1; `parameters`, when present, is a schema Ajv compiles.
- `service-line.simulate-pure` — for each fixture example, `simulate` twice with identically seeded contexts gives identical results, under the throwing stubs for the clock and platform randomness (the desk check's device).
- `service-line.cassette-replays` — every entry replays to its own result twice, byte-identical; an unknown `op` or changed args replays to `undefined`.
- `service-line.no-live-in-replay` — the synthesised tool for a line with a cassette and no `simulate`, run with a throwing `fetch` planted on `globalThis`, answers a miss (`errorKind: 'cassette-miss'`) and never throws.
- `service-line.live-declares-egress` — a `live` block has at least one egress declaration with a host and a purpose.
- `service-line.no-secret-leaks` — a `live.call` run against a stub `fetch` (refusing, as `checkGuardrailService` does) with a planted credential never puts the secret in its result; a cassette's entries never contain the fixture's planted secret.

### 4.4 The first recorded line and the live checkpoint (stage B–C)

A second starter line, **`starter/open-meteo`** (Open-Meteo's free forecast API, `api.open-meteo.com`, no key, CORS-open): one operation `forecast { latitude, longitude }`, tier `observe`, `live.egress: [{ host: 'api.open-meteo.com', purpose: 'the forecast for a place', sends: ['decision'] }]` (what leaves is the tool's arguments — a decision's), `live.call` fetching `/v1/forecast?latitude=…&longitude=…&current=temperature_2m,weather_code` and answering one line of text plus the JSON as `data`. No `simulate`: in a session it answers from its shipped cassette, `packs/starter/src/cassettes/starter-open-meteo.craftabot-cassette.json`, recorded by `craftabot record` at stage C over a fixed script of two places. **The live checkpoint** (stage C, dated in `42-…` §8 when taken): the recording itself — the egress guard allowing exactly one host, the latency measured, and `browserCapable: true` set on the line if the response carries `access-control-allow-origin: *` (Open-Meteo does), recorded the way `25-…` §11 stage B recorded Model Armor's. If the network is unavailable when stage C runs, the checkpoint is recorded as pending and the cassette is recorded when it is taken; the line ships without a cassette until then and its conformance fixture says so.

### 4.5 What the trace says

No new event type. `tool.executed` unchanged; `error.kind: 'cassette-miss'` (an existing open field, a new value — `02-…` §7 notes it beside `'egress-refused'`). `run.started.egress.hosts` never gains a line's host, because a line's `live` never runs in a session.

## 5. UX trajectory

The Connector's "Line" picker lists every line an installed pack ships, with its description; the Weather Line is the first, Open-Meteo the second. A miss shows on the story strip as a failed call and in the timeline's error lane with its kind. Nothing in the Kit says "cassette" — that word is the Workshop's and the harness's.

## 6. Determinism

`simulate` draws only from `ctx.random`; the failure draw is the session's `random`; a cassette answers by digest; `argsDigest` is over canonical JSON so key order cannot move a replay. The harness's recording is the only nondeterministic step, and its output is a fixture.

## 7. Non-goals (recorded so they are decisions)

- No `live` in a session or a campaign cell; `budget`-gated live lines are a later WP's.
- No re-record on miss; a miss is loud and a person re-records.
- No `scopes` picker from the chosen line (`idList` stays); WP71's re-cut.
- No line in the Workshop's content store (a line is code, not authored content).

## 8. Divergences from `41-…` §6.4, with reasons

| `41-…` says | This note does | Why |
|---|---|---|
| `42-…`: the bank's note is `47-FS-BANK.md` | `47-` is WP58's; the bank's is `48-`, the Advice Desk's `49-` | The notes are numbered in the order they are written |
| A line's operations are offered by the Connector brick | The registry synthesises a `ToolDefinition` per operation under the Connector's existing id scheme | The session offers tools by registry id and nothing else; synthesising keeps the session and every trace unchanged |
| "a miss is `error.kind: 'cassette-miss'` on the trace" | Through `ToolResult.errorKind?`, which the session turns into an `error` event | A tool has no event bus; one optional field is the smallest honest path |
| `cassette` on the line as a value | A value, loaded by the pack from a JSON import under `src/cassettes/` | So the sweep and the key-leak test see it as a file |
| `craftabot record … --out cassettes/` | `--out ./cassettes`, file named after the line id | A path a pack can commit under `src/cassettes/` |
| The live checkpoint "against a public sandbox API chosen at stage A" | Open-Meteo, chosen here; taken at stage C by the recording itself | The recording is the checkpoint: one host allowed, latency measured, CORS read from the response |
| `describeFitted` names any line | The starter names its own; another pack's line shows by id | `describeFitted` has no context; giving it one is a wider change than this WP needs |

## 9. Risk register

| Risk | Handling |
|---|---|
| The Weather Line's move changes a trace | The tool ids, strings, tiers and the failure draw's place are unchanged; the pre-move snapshot test and both goldens hold |
| Two packs ship a line with the same bare name | Tool ids carry the pack id; the registry's `insertUnique` refuses a collision |
| A cassette carries a secret | Redacted at write against every secret the process holds; the key-leak test plants one; the sweep reads `cassettes/` |
| No network at stage C | The checkpoint recorded as pending; the line ships without a cassette and says so |
| A sandbox changes under a cassette | Dated, loud miss, one command to re-record |

## 10. Implementation plan

**Stage A — lines in core, the Weather Line on them.** `types/service-line.ts`, the manifest lane, the registry's lookups and synthesised tools, `ToolResult.errorKind` and the session's `error` on it, the three context methods, `ControlSource`; the Connector brick on the registry; `service-lines.ts` and the shrunk `services.ts`; `tools/connector.ts` deleted; the pre-move snapshot test; `02-…` §7, `14-…` §7 notes.

**Stage B — cassettes and the kit.** `schemas/cassette.ts`, the schema artefact, `replayFromCassette`; `craftabot record` with its key-leak test; `checkServiceLine` in the testkit with `describeConformance`; the desk's `toolOverrides` consumed; the Open-Meteo line (no cassette yet) with its fixture.

**Stage C — the picker, the checkpoint, the close-out.** `serviceLines` in the bench's catalogue with an e2e that fits the Connector and picks a line; the live checkpoint and the Open-Meteo cassette (or its pending note); `42-…` §8, `41-…` §12, `CLAUDE.md`, `README.md`, `13-…` §7, `14-…` §5.6.

## 11. Acceptance criteria (WP58 as a whole)

1. The WP32 confused-deputy scenario runs byte-identically before and after (the snapshot test), and both starter goldens are unchanged.
2. A cassette replays twice identically; a miss is on the trace as `error.kind: 'cassette-miss'` with no `fetch` (a throwing `fetch` on `globalThis` during the run).
3. `checkServiceLine` rejects an operation without a tier and a `live` without egress; `describeConformance` runs it for every line the starter ships.
4. `craftabot record` writes a cassette redacted against a planted secret, under an egress guard that allows the line's hosts only.
5. The Connector's picker lists registered lines; the Kit e2e fits one.
6. The live checkpoint against Open-Meteo taken and dated, with `browserCapable` and latency recorded — or recorded as pending with the reason.

*(Stages append dated notes here as they land, per `10-…` §7.)*

> **Stage A landed 2026-09-05.** `types/service-line.ts` (§4.1) and `schemas/cassette.ts` (the file's shape, `argsDigest` over canonical JSON, `replayFromCassette` — brought forward from stage B because the tool wrapper replays); `service-line-tools.ts` synthesising one `ToolDefinition` per operation under `${packId}/connector_${line}_${op}` with the fixed answer order — failure draw, the world's override (`serviceOverrides` in the Playroom, `toolOverrides` on a desk, consumed at last), `simulate`, the cassette, a loud miss; its empty-arguments schema is the exact object `z.toJSONSchema(z.object({}))` gave the Connector since WP32, so a prompt that lists tool schemas is byte-identical. `PackManifest.serviceLines`, the registry's lane with `getServiceLine`/`listServiceLines` and the synthesis at `registerPack` (`insertUnique`, so a pack cannot ship both), `ToolResult.errorKind?` and the session's `error { kind }` on a failed result that names one, `ControlSource: 'serviceLines'`, `getServiceLine?` on both brick contexts (optional; built by the session, `validateSpec` and `capabilitiesOf`). The starter: `world/service-lines.ts` (`weatherLine`, `starterServiceLines`), `services.ts` a derived view of it (`SERVICES`, `OPERATIONS`, `operationsFor` kept for every reader), `tools/connector.ts` a re-synthesis for the pack's own tests and **out of `starterTools`**, the manifest's `serviceLines`, the Connector brick reading its line from the context (a bare `weather` is `starter/weather`; a qualified id is any pack's) with the picker hint `source: 'serviceLines'`. **The byte-identity proof:** `trace.confused-deputy.v1.json`, the WP32 scenario's whole event stream recorded from the pre-move code and held after (its `tool.executed.durationMs` zeroed in the test — the one wall-clock field the session writes). Core's `service-line-tools.test.ts` (ids, the answer order, the digest's key independence, the replay and the miss under a throwing `fetch`, the lane and the collision), the session's `error` on a miss, `validateSpec`'s context; `02-…` §7 and `14-…` §7 notes. Gate: root lint clean, every suite green with core's thresholds, build within budget with the schema check, default e2e 168/168, visual 3/3, baseline campaign with no regressions, all three goldens byte-identical.

> **Stage B landed 2026-09-05.** `craftabot record --line <id> --script calls.json [--out ./cassettes] [--egress declared|none]` (`commands/record.ts`, §4.2): the registry's line, its `live` required and its credential checked, an egress guard in `declared` mode allowing the line's own hosts, each call timed under an abort timeout, the cassette written through `redactSecrets` — and **refused outright** when a secret survives inside a result string, since the scrub is exact-match by design and a line that embeds its key in a result is a line that leaks (`record.test.ts` proves the refusal, the redaction, the egress refusal of an undeclared host, and that the CLI never prints a planted key). The probe sends an `Origin` header so the browser checkpoint reads what a page would get. `checkServiceLine` in the testkit (§4.3) with `PackConformanceFixture.serviceLines` and `describeConformance` running it for every line a manifest ships, proven on a tierless operation, a clock-reading simulation, a mute and a leaky live client and a broken cassette; `13-…` §7's note. `docs/schemas/craftabot-cassette.schema.json` joins the generator (seven artefacts). **The Open-Meteo line** (§4.4, `world/open-meteo.ts`): `forecast { latitude, longitude }`, live over `api.open-meteo.com` sending the tool's arguments, a refused or failed call answered as a plain failure so no transport text is ever recorded. **The live checkpoint was taken in this stage rather than stage C:** two places recorded under the guard (one host allowed, nothing refused) at 36–355 ms across two recordings, the response carrying `access-control-allow-origin: *` once the probe sent an Origin — `browserCapable: true` on the line, dated in its source. The cassette ships at `packs/starter/src/cassettes/starter-open-meteo.craftabot-cassette.json` (under `cassettes/`, so the synthetic sweep reads it — green) and the line replays it: `session/open-meteo-replay.test.ts` runs a Connector on `open-meteo` with a throwing `fetch` on `globalThis` for the whole run, gets the recorded London answer byte for byte and an `error.kind: 'cassette-miss'` for the pole. Gate: root lint clean, every suite green with core's thresholds, build within budget with the schema check (seven schemas), default e2e 168/168, visual 3/3, baseline campaign with no regressions, all four goldens byte-identical.
