# @craftabot/core

Headless agent engine: `AgentSession`, the sense→think→act loop, core interfaces (bricks,
worlds, providers, guardrails, events), Zod schemas, `EventBus`, pack registry types.
See `docs/design/02-AGENT-MODEL.md` and `docs/design/01-ARCHITECTURE.md`.

**Status:** WP1 — types, Zod schemas, `EventBus`, `PackRegistry`, and `validateSpec` are real and
tested. `AgentSession`'s tick-loop implementation is a type contract only; the runtime lands in
WP3 (`docs/design/09-ROADMAP.md`).

## Public API sketch

- **Types:** `AgentSession` (+ `CreateSession` contract), `LLMProvider`, `Guardrail`/
  `GuardrailVerdict`/`GuardrailContext`, `WorldDefinition`/`WorldInstance`, `BuildProblem`.
- **Schemas** (`z.infer`-derived, with `parseX`/`safeParseX`): `AgentSpec`, `EngineEvent`,
  `KitFile` (+ `migrateKitFile`), `TraceFile` (+ `computeTraceDigest`), pack-manifest content
  types (`BrickDefinition`, `ToolDefinition`, `CartridgeDefinition`, `GoalCardDefinition`).
- **Utilities:** `createEventBus`, `createPackRegistry`, `validateSpec`.

## Not allowed to depend on

- Svelte, SvelteKit, or any DOM API (`01-ARCHITECTURE.md` §1.3).
- Any specific LLM provider or world pack — `core` defines interfaces, packs implement them.
