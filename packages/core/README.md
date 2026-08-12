# @craftabot/core

Headless agent engine: `AgentSession`, the sense→think→act loop, core interfaces (bricks,
worlds, providers, guardrails, events), Zod schemas, `EventBus`, pack registry types.
See `docs/design/02-AGENT-MODEL.md` and `docs/design/01-ARCHITECTURE.md`.

**Status:** WP3 — the engine runs. `createSession` executes the full nine-step tick loop against
a world and an `LLMProvider`, emitting the complete event catalogue. Guardrails are run as a
chain here; the three V1 Safety Brick rules that plug into it arrive with `@craftabot/governance`
in WP8 (`docs/design/09-ROADMAP.md`).

## Public API sketch

- **The engine:** `createSession({ spec, registry, provider, guardrails, options })` →
  `AgentSession` with `start`/`step`/`pause`/`resolveApproval`/`stop` and an `events` bus.
- **Types:** `LLMProvider`, `Guardrail`/`GuardrailVerdict`/`GuardrailContext`,
  `WorldDefinition`/`WorldInstance`, `ToolDefinition`/`ToolContext`, `BuildProblem`.
- **Schemas** (`z.infer`-derived, with `parseX`/`safeParseX`): `AgentSpec`, `EngineEvent`,
  `KitFile` (+ `migrateKitFile`), `TraceFile` (+ `computeTraceDigest`), pack-manifest content
  types (`BrickDefinition`, `ToolMetadata`, `CartridgeDefinition`, `GoalCardDefinition`).
- **Utilities:** `createEventBus`, `createPackRegistry`, `validateSpec`, and the loop's parts
  (`composePrompt`, `decide`, `createMemory`, `resolveBudgets`, `runGuardrailChain`).
- **`@craftabot/core/testing`:** `createMockProvider` with the `obedient` / `wanderer` /
  `mumbling` personas, and `createTestClock` for byte-reproducible traces. Deliberately a
  separate entry point so production bundles never pull test scaffolding in.

## Determinism

A session takes `now`, `newId`, and `random` from `SessionOptions`. Inject the test clock and a
recorded run reproduces byte-for-byte — that is what makes the trace an auditable artefact
(`docs/design/08-GOVERNANCE-GUARDRAILS.md` §4) rather than just a log.

## Not allowed to depend on

- Svelte, SvelteKit, or any DOM API (`01-ARCHITECTURE.md` §1.3).
- Any specific LLM provider or world pack — `core` defines interfaces, packs implement them.
