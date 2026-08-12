# @craftabot/governance

Guardrail interface + chain, the V1 safety-brick rules, approval flow, engine-floor budgets,
trace digest. Kept separate from `core` because purpose 2 (the governance proving ground)
requires exporting it for real-world use. See `docs/design/08-GOVERNANCE-GUARDRAILS.md`.

**Status:** WP0 scaffold only — real API arrives in WP8 (`docs/design/09-ROADMAP.md`).

## Public API sketch

Real exports land in WP8. Currently: `CRAFTABOT_GOVERNANCE_VERSION`.

## Not allowed to depend on

- Svelte, SvelteKit, or any DOM API (`01-ARCHITECTURE.md` §1.3).
- Anything beyond `@craftabot/core`'s event/types surface (`01-ARCHITECTURE.md` §2).
