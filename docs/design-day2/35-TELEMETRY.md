# 35 — Telemetry sinks (WP47)

> **Status:** design of record for WP47 (`27-DAY3-ROADMAP.md` Phase K, its first row), written 2026-09-02 against the codebase after WP46. This is the map for `26-TARGET-DESIGN-V3.md` §6.5; where the two differ, §7 below says why and `26-…` §12 gets a dated note when the stage lands.

---

## 1. Purpose

A run's trace leaves Craft-A-Bot one way today: the Audit Centre's OTel download, a JSON file built by `otel-export.ts` inside the workbench. Nothing streams a live run anywhere, the harness cannot send a campaign's cells to a collector, and the mapping lives where the headless host cannot reach it. WP47 makes a sink a contract — attach to a live bus, export a finished trace, flush — in a package that depends on `core` alone, moves the mapping there and widens it to group episodes, ships two sinks, and puts a Sinks screen in the Workshop and `craftabot export` in the harness. A sink is a consumer: it never slows or fails a run.

---

## 2. Where the code actually is

**`apps/workbench/src/lib/workshop/otel-export.ts`** — `otelTraceFor(run, events)`: one root `invoke_agent` span, `chat` / `execute_tool` / `evaluate_guardrail` child spans, `gen_ai.evaluation.result` span events for trips; `evaluate_guardrail` already reads only the vendor-neutral `ExternalCallRecord` fields (WP39). **`routes/workshop/export/+page.svelte`** — the Audit Centre's download. **`core/src/event-bus.ts`** — `EventBus.onAny(listener): Unsubscribe`. **`core/src/schemas/records.ts`** — `GroupRunRecord { id, memberRunIds, memberAgentIds, goalCardId, outcome, rounds, usage, startedAt, finishedAt? }`; `group.started` / `group.finished` on the merged stream. **`core/src/egress.ts`** — `createEgressGuard`, `EgressDeclaration`. **`eslint.config.js`** — the `no-restricted-imports` block that keeps `governance` on `core` only. **`packages/pack-testkit`** — `describeConformance` with per-kind checks. **`packages/harness/src/commands/run.ts`** — the session and its `events.onAny`; **`apps/workbench/src/lib/state/session.svelte.ts`** — `createSessionView`, `created.events.onAny(absorb)`.

---

## 3. Design principles

1. **A sink is a consumer.** It subscribes; the loop never awaits it; its failures are surfaced on the sink, never on the run.
2. **`core` only.** `@craftabot/telemetry` depends on `core` and nothing else in the repo; ESLint says so, as for `governance` and the testkit.
3. **The mapping is one function.** `otelTraceFor` moves unchanged (the workbench re-exports it, its fixtures byte-identical); groups add a root span per episode with one `invoke_agent` per member.
4. **A sink is configured in two places only.** The Workshop's Sinks screen and the harness (`--sink`, the campaign file). The Kit never attaches one.
5. **Egress is declared per configuration.** A sink's host is what the person typed; the declaration is a function of the config, and the guard is applied where the sink is created.

---

## 4. The design

### 4.1 The contract (telemetry, stage A)

```ts
export interface TraceExport {
  run: RunRecord; events: readonly EngineEvent[];
  group?: { record: GroupRunRecord; events: readonly EngineEvent[]; members: Array<{ run: RunRecord; events: readonly EngineEvent[] }> };
  evaluations?: readonly EvaluationRecord[];
}
export interface TraceSink {
  id: string; name: string; description: string;
  credential?: BrickKindDefinition['credential'];
  egress(config: unknown): EgressDeclaration[];
  configSchema: ZodType<unknown>;
  create(options: { config: unknown; fetch: typeof globalThis.fetch; getCredential(id: string): string | undefined; onError?(error: SinkError): void }): SinkInstance;
}
export interface SinkInstance {
  attach(events: EventBus, run: { runId: string; agentId: string }): Unsubscribe;
  export(input: TraceExport): Promise<SinkResult>;
  flush(): Promise<void>;
  status(): SinkStatus;   // { attached, buffered, sent, failed, lastError? }
}
```

`TraceExport` is what a stored run gives today; the `craftabot-bundle` format (WP48) will be one more thing a sink can be handed, built from the same fields. `attach` buffers events and flushes on `run.finished`, on `group.finished`, when the buffer reaches `batchSize`, or after `flushAfterMs`; a flush that fails is counted and kept in `status()`, and `onError` is told — the run never learns.

### 4.2 The mapping (telemetry, stage A)

`otelTraceFor(run, events)` moves to `telemetry/src/otel.ts` byte-for-byte in output (the workbench file becomes a re-export; the existing fixture tests move with it). `otelTraceForGroup(group)` — a root span `invoke_group <goalCardId>` over the episode (`craft_a_bot.group.members`, `rounds`, `outcome`), one `invoke_agent` span per member as a child, each member's own child spans beneath it, with the member's trace id set to the group's so a collector shows one trace. `otelTraceForExport(input)` picks.

### 4.3 The sinks (stage A)

**`telemetry/otlp-http`** — config `{ url, headers?: Record<string,string>, batchSize = 200, flushAfterMs = 1000 }`; `POST {url}/v1/traces` with the OTLP/HTTP JSON body; optional `bearer-token` credential `telemetry/otlp-http` as `Authorization: Bearer`; egress = the url's host, purpose `trace export`, sends `['trace']` (and `credential-header` when a credential is set). Live: the span list is built incrementally from buffered events and sent as one trace per flush with the same trace id, so a collector stitches them. **`telemetry/file`** — JSONL, one event per line, `attach` appending as it goes; it needs the file system, so it lives on the `@craftabot/telemetry/node` entry (the main entry stays browser-safe); config `{ path }`; egress none.

### 4.4 The testkit (stage A)

`checkSink(sink, fixture { config, input: TraceExport, plantedSecret })`: `create` with a rejecting `fetch` and the planted secret; `attach` to a bus, emit the fixture's events, `flush` — must not throw, must report the failure in `status()`, must not carry the secret in `lastError`; `export` must resolve `{ ok: false }` rather than throw; a sink whose `attach` throws is an issue. `describeConformance` gains `sinks`.

### 4.5 The app and the harness (stage B)

`/workshop/sinks`: the configured sinks (`cab.sinks.v1` in localStorage, config JSON per sink, enabled flag), a "Send a stored run" test, each sink's egress and status. The session view attaches every enabled sink to a live run, each behind an egress guard built from the sink's own declaration (`egress: 'declared'` for sinks as for bricks); the Audit Centre gains "Send to…" beside the download. Harness: `craftabot export --run <id> --sink <id> --config <json>` (stored) and `run … --sink <id> --sink-config <json>` (live); the campaign file gains `sinks: [{ id, config }]` and every cell's finished trace is exported to each. The e2e's collector is a Playwright route on `localhost:4318` recording the bodies — a test double where §6.5 said "test container"; the harness test's collector is an in-process `node:http` server.

---

## 5. Non-goals

Vendor sinks (Langfuse, Arize, …): the contract is theirs to implement. OTLP/gRPC and protobuf: JSON over HTTP is what a browser can send. Metrics and logs signals.

---

## 6. Stages

| Stage | Builds | DoD |
|---|---|---|
| **A** | This note; `@craftabot/telemetry` with the contract, the mapping (moved, plus groups), the two sinks, `checkSink`; the workbench re-export | The Audit Centre's OTel output is byte-identical for every existing fixture; the two sinks pass `checkSink`; a group episode exports as one trace with one `invoke_agent` per member; `checkSink` rejects a sink that throws from `attach` |
| **B** | `/workshop/sinks`, live attach, the Audit Centre's "Send to…", `craftabot export`, `--sink` on `run`, `sinks` in the campaign file | A stored run exports to the harness test's collector and the received spans match a fixture; a live Workshop run streams to the e2e's collector and, with the collector refusing mid-run, the run finishes unaffected and the sink reports the failure |
| **C** | Close-out | Notes in §7, `26-…` §12, `27-…`, `CLAUDE.md`, README |

---

## 7. Divergences from `26-…` §6.5

- **D-a — `TraceExport`, not `TraceBundle`, for now**: the bundle is WP48's; `export` takes the stored run's fields today and the bundle will be built from the same fields.
- **D-b — `egress` is a function of the config**: a sink's host is typed by the person, so a static list cannot declare it.
- **D-c — the file sink on a `/node` entry**: it needs the file system; the main entry must stay importable by the browser.
- **D-d — the e2e's collector is a route, not a container**: Playwright's request interception records what a collector would receive, and CI needs no Docker.
- **D-e — `status()` and `onError`** on the instance: §6.5 says a sink's failures are surfaced; this is where.

Stage notes are appended below.
