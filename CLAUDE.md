# CLAUDE.md — Craft A Bot

> Place this file at the **repo root**. It is the entry point for Claude Code sessions.

## What this project is

Craft A Bot is an LLM & agent simulator styled as a 1970s/80s construction toy. Users snap together bricks (LLM, Memory, Tools, Sense, Actions, Safety) on a workbench, slot in a Goal Card, and watch their agent act inside a simulated Playroom — every prompt, decision, and action visible in a trace. Two purposes, in priority order: (1) an accessible training ground for agentic-AI concepts; (2) a proving ground for automated AI governance and guardrails, whose components will eventually be exported for real-world use.

Current scope: **V1.0 — "My Very First Agent" only.** TypeScript + Svelte 5 (runes) + SvelteKit static. Local-first, no backend. OpenAI out of the box (BYO API key); other providers arrive later as expansion packs.

## Read before coding

Design docs are the source of truth, in `docs/design/`:

| Doc | Read when |
|---|---|
| `00-PROJECT-OVERVIEW.md` | Always — vision, principles, canonical glossary |
| `01-ARCHITECTURE.md` | Touching structure, packs, cross-package boundaries |
| `02-AGENT-MODEL.md` | Touching the engine, bricks, loop, world, events |
| `03-UI-UX-DESIGN.md` | Touching any screen or interaction |
| `04-VISUAL-DESIGN-LANGUAGE.md` | Touching styling, tokens, assets |
| `05-TECH-STACK.md` | Choosing tools/libraries, project layout |
| `06-LLM-PROVIDERS.md` | Touching providers, cartridges, keys |
| `07-DATA-MODEL-PERSISTENCE.md` | Touching storage, kit files, traces |
| `08-GOVERNANCE-GUARDRAILS.md` | Touching guardrails, approval, trace guarantees |
| `09-ROADMAP.md` | Starting any work package — find your WP here |
| `10-CODING-STANDARDS.md` | Always — conventions and definition of done |
| `11-VISUAL-ASSET-MANIFEST.md` | Touching assets, placeholders, or art swap-in — the full artefact inventory and production rules |

Workflow: read `09-ROADMAP.md`, identify the current WP, read its listed docs, **propose a task breakdown before writing code**, keep one WP per branch/PR.

## Hard rules (violations are bugs)

1. **Engine/UI separation:** `packages/core`, `packages/governance`, and `packages/packs/*` never import Svelte or touch the DOM. All UI lives in `apps/workbench`.
2. **Keys are sacred:** API keys live only in `localStorage` (`cab.keys.v1`) and are read only by provider packs at call time. Never in kit files, traces, events, logs, errors, or URLs. The CI key-leak test must stay.
3. **Everything observable:** any engine occurrence the UI displays must come from a typed event on the EventBus (catalogue: `02-AGENT-MODEL.md` §7). New behaviour ⇒ new/extended event, added to the catalogue in the same PR.
4. **Packs contribute content, not mechanisms.** New slot types or hooks are deliberate `core` changes, not pack hacks.
5. **Determinism:** the world stays fully deterministic; all randomness goes through the `dice` tool and is recorded in the trace.
6. **Design tokens only:** no raw colours outside `tokens.css`; colour↔concept mapping (`04` §2.2) is fixed.
7. **Toy names in UI, real names in code:** UI says "battery", code says `apiKey` (glossary: `00` §6). Both vocabularies, never a third.
8. **Docs stay true:** if implementation must diverge from a design doc, update the doc with a dated note in the same PR.
9. **Repo is future-public:** no secrets or private notes in code, comments, or history.

## Commands

```bash
npm run dev        # Turborepo dev (core watch + workbench serve)
npm run test       # Vitest across packages
npm run e2e        # Playwright (mock provider — no key needed)
npm run demo       # workbench with mock provider preselected
npm run lint       # eslint + svelte-check + stylelint
npm run build      # all packages + static app
```

(If a command is missing, WP0 isn't done — see `09-ROADMAP.md`.)

## Testing expectations

Mock provider for all tests and E2E; live OpenAI only via explicit env-keyed smoke script. `core` ≥90% coverage; world predicates 100%; keyboard-only E2E variants for build interactions. Full definition of done: `10-CODING-STANDARDS.md` §8.
