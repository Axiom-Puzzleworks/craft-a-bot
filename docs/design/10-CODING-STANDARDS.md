# 10 — Coding Standards

> Conventions for all code in the Craft A Bot repo. Written to be enforceable by tooling wherever possible; the rest is review discipline.
> Prerequisite reading: `05-TECH-STACK.md`.

---

## 1. TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any` (use `unknown` + narrowing); `as` casts need a comment justifying them; `!` non-null assertions banned (lint).
- **Types come from Zod schemas** where a runtime boundary exists (storage, imports, provider wire, pack manifests): define the schema, `z.infer` the type. Pure in-memory types are hand-written interfaces.
- Discriminated unions over enums; string literal unions over `enum` keyword (no TS `enum`).
- Public APIs of `core`/`governance`/packs get TSDoc comments — these packages are future public libraries; comments explain *why*, not *what*.
- Errors: typed error objects (`ProviderError`, `MigrationError`…) with `kind` discriminants; never throw strings; never swallow — errors either surface as events/UI states or fail the operation loudly.

## 2. Svelte 5

- Runes only: `$state`, `$derived`, `$effect`, `$props`, `$bindable`. No `writable/readable` stores, no `$:` legacy reactivity in new code.
- Shared reactive state lives in `*.svelte.ts` modules under `lib/state/` — components stay thin; logic lives in state modules or the engine.
- Components: PascalCase filenames; one component per file; props typed via `$props<{...}>()`; snippets over slots.
- `$effect` is a last resort (DOM measurement, engine subscription bridging) — derive, don't effect. Every `$effect` gets a one-line comment saying why derivation can't do it.
- Engine access only via `AgentSession` / the `sessionState` adapter (`05-TECH-STACK.md` §4). Components never import provider packs directly.

## 3. CSS

- Design tokens from `tokens.css` only — raw hex values outside that file are lint-flagged (stylelint `declaration-property-value-allowed-list` on `color`-ish props). Any new colour goes through `04-VISUAL-DESIGN-LANGUAGE.md` first.
- Scoped Svelte styles; the only global styles: resets, tokens, texture layers, focus ring.
- Class naming inside components: plain descriptive names (`.socket`, `.socket--occupied`); no utility-class frameworks.
- Motion: durations/easings as tokens (`--cab-snap-ms` etc.); every animation has a `prefers-reduced-motion` branch.

## 4. Naming & structure

- Packages: `@craftabot/{core,governance,pack-*}`. Files: kebab-case (`agent-session.ts`); Svelte components PascalCase; tests colocated as `*.test.ts` (unit) or under `e2e/` (Playwright).
- Content IDs: `"{packId}/{localId}"`, kebab-case, stable forever once shipped (they live in users' kit files — renaming is a breaking change requiring a migration).
- Toy vocabulary (Workbench, Brick, Cartridge, Battery, Goal Card, Playroom, Flight Recorder…) is **UI-and-docs language**. Engine code uses the real terms (`provider`, `apiKey`, `world`, `trace`) — the glossary in `00-PROJECT-OVERVIEW.md` §6 is the bridge. A `BatteryCompartment.svelte` component managing `apiKey` values is exactly right.
- UK English in user-facing copy ("colour" in copy); US English in code identifiers (`color` in CSS/TS, per platform convention).

## 5. Testing discipline

- Every WP's DoD tests land in the same PR as the feature. A PR that lowers coverage on `core`/`governance` needs an explicit justification.
- Unit tests are deterministic: no network, no timers without fake clocks, no real randomness (seed or inject).
- The mock provider is the default in every test and E2E run; the live OpenAI smoke test runs only via explicit script with an env key, never in CI.
- World/predicate logic: table-driven tests. Schema code: round-trip + rejection fixtures (valid + invalid file per version).
- E2E: the six tutorial chapters are the canonical journeys; keyboard-only variants for build interactions.

## 6. Git & PR hygiene

- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), enforced by commitlint. Scope = package (`feat(core): …`).
- Trunk-based: short-lived branches `wp{n}-{slug}` or `fix-{slug}`, PRs into `main`, `main` always green and demoable.
- PR description: what, why, WP link, deviations from design docs (if any — and the doc gets a dated deviation note in the same PR).
- No secrets in the repo, ever (repo becomes public); `.env.example` documents the smoke-test key variable. History is public history from day one.

## 7. Docs discipline

- `docs/design/` is the source of truth. Code comments link to doc sections (`// see docs/design/02-AGENT-MODEL.md §5`) rather than restating them.
- When implementation legitimately diverges from a doc, update the doc in the same PR with a dated note: `> **Amended 2026-08-30:** one-tool-per-tick relaxed to … because …`.
- Each package has a short `README.md`: purpose, public API sketch, "not allowed to depend on" list.

## 8. Definition of done (every PR)

1. Lint, `svelte-check`, unit/component tests, build, E2E (if UI-touching) all green.
2. New boundaries validated with Zod; new events added to the catalogue in `02-AGENT-MODEL.md` §7.
3. Keyboard path + reduced-motion + AA contrast for any new UI.
4. No new production dependency without justification line.
5. Docs updated if behaviour differs from design.
