# @craftabot/core

Headless agent engine: `AgentSession`, the sense→think→act loop, core interfaces (bricks,
worlds, providers, guardrails, events), Zod schemas, `EventBus`, pack registry types.
See `docs/design/02-AGENT-MODEL.md` and `docs/design/01-ARCHITECTURE.md`.

**Status:** WP0 scaffold only — real API arrives in WP1 (`docs/design/09-ROADMAP.md`).

## Public API sketch

Real exports land in WP1. Currently: `CRAFTABOT_CORE_VERSION`.

## Not allowed to depend on

- Svelte, SvelteKit, or any DOM API (`01-ARCHITECTURE.md` §1.3).
- Any specific LLM provider or world pack — `core` defines interfaces, packs implement them.
