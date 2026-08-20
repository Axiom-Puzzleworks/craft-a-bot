# CLAUDE.md — Craft A Bot

## What this is

An LLM & agent simulator styled as a 1970s/80s construction toy. Users snap bricks (LLM, Memory, Tools, Sense, Actions, Safety) onto a workbench, slot in a Goal Card, and watch their agent act in a simulated Playroom with every prompt, decision and action visible in a trace.

Two purposes, in priority order: (1) an accessible training ground for agentic-AI concepts; (2) a proving ground for automated AI governance and guardrails, whose components will eventually be exported for real-world use.

Stack: TypeScript + Svelte 5 (runes) + SvelteKit static. Monorepo (npm workspaces + Turborepo). Local-first, no backend. OpenAI out of the box (BYO key).

**Where we are (2026-08-20):** V1.0 ("My Very First Agent") shipped WP0–WP10. Day 2 Phases A–D are closed (WP11–WP25): engine trust fixed, the brick contract opened, teaching-aid UX and the professional Workshop both shipped, plus a full governance layer (policy cards, Safety Brick v2, three scenario cards). **Phase E (expansion era) is fully closed**: WP26, WP27, WP28 and WP29 (multi-agent core — `SessionGroup`, the Playroom's `forAgent`, group-altitude events, a minimal Workshop surface; full design of record and close-out in `docs/design-day2/23-MULTI-AGENT-DESIGN.md`) are all done. **Phase F ("Agent Builder" kit, WP30–34) is under way: WP31 (Radio brick + the Robot Friends duo experience, including the ASI07 spoofed-message scenario) is done**, full design of record and close-out in `docs/design-day2/24-ROBOT-FRIENDS-DESIGN.md`, **and WP33's identity badge half (the Passport, and its Agent Card export) is done too** — sized down before it started, per its own dated amendment in `14-…` §5.8. WP33's other half (kit-line packaging) stays genuinely blocked on WP30/WP32 shipping real content to bundle, not merely unstarted. WP30, WP32, the rest of WP33, and WP34 remain — see "Next up" below.

## Source of truth: `docs/design-day2/`

**`docs/design/` is superseded. Do not read it or cite it.** Everything lives in `docs/design-day2/`, which contains the Day 1 baseline (00–11, carried forward with status banners) plus the Day 2 documents (12–19). Paths below are relative to that folder.

| Doc | Read when |
|---|---|
| `README.md` | First, if you want the full Day 2 map |
| `00-PROJECT-OVERVIEW.md` | Vision, principles, canonical glossary |
| `01-ARCHITECTURE.md` | Structure, packs, cross-package boundaries |
| `02-AGENT-MODEL.md` | Engine, bricks, loop, world, **event catalogue (§7)** |
| `03-UI-UX-DESIGN.md` | Any Kit screen or interaction |
| `04-VISUAL-DESIGN-LANGUAGE.md` | Styling, tokens, assets |
| `05-TECH-STACK.md` | Tooling, libraries, project layout |
| `06-LLM-PROVIDERS.md` | Providers, cartridges, keys |
| `07-DATA-MODEL-PERSISTENCE.md` | Storage, kit files, traces |
| `08-GOVERNANCE-GUARDRAILS.md` | Guardrails, approval, trace guarantees |
| `10-CODING-STANDARDS.md` | Always — conventions and definition of done |
| `11-VISUAL-ASSET-MANIFEST.md` | Assets, placeholders, art swap-in |
| `12-CURRENT-STATE-ASSESSMENT.md` | Always at Day 2 start — root causes C1–C8, defect register D1–D17/T1–T5 |
| `13-BRICK-TEST-STRATEGY.md` | Writing tests; the L0–L5 pyramid, per-brick charters, eval harness, conformance kit |
| `14-BRICK-REFERENCE-DESIGNS.md` | Touching any brick or engine shape — the open brick contract, evolutions E1–E12, v2 schemas |
| `15-UIUX-DUAL-MODE.md` | Anything spanning Kit and Workshop |
| `16-TEACHING-AID-UIUX-IMPROVEMENTS.md` | Kit UX work — P0/P1/P2 with acceptance criteria |
| `17-PRO-MODE-UI-DESIGN.md` + `mockups/pro-mode-mockup.html` | Workshop (professional mode) work |
| `18-DAY2-ROADMAP.md` | **Starting any work package** — Phases A–F, WP11–WP34 |
| `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` | Governance features — the 38-control catalogue, dip in as needed |

`09-ROADMAP.md` is history only (the WP0–WP10 record); `18-…` supersedes its forward plan.

Where a Day 2 doc and its Day 1 counterpart differ, **Day 2 wins** — the banner on each carried-forward file says what changed.

## Workflow

Find the WP in `18-…` §3, read the docs it names, **propose a task breakdown before writing code**, then build. One WP per branch (`wp{n}-{slug}`) and PR.

Next up per `18-…` §7 (most recent entry: item 24, 2026-08-20): Phase E is fully closed (WP26–29 all shipped). Phase F has WP31 fully done and WP33 half done:

- **WP30:** Planner + If/Then bricks (`14-…` §5.1–5.2) with their leaflet chapters. Not yet sized against the real post-WP31 codebase — `14-…` §5.1's own "second socket in the Agent Builder chassis" line has not been checked against the fact that `SLOT_IDS` still holds only the original six; that check belongs at the start of whichever session picks this WP up, the same way `23-…`/`24-…` re-derived their own sizing before building.
- **WP32:** Librarian + Connector bricks (`14-…` §5.5–5.6) + scope-permission leaflet chapter.
- **WP33 (remaining):** kit-line packaging (`14-…` §5.8's own dated amendment) — box art per expansion pack, the 5–11 kit as a curated pack bundle. Genuinely blocked, not merely unstarted: it needs WP30/WP32's actual bricks to exist before there is a bundle to curate, and no purchase/licensing mechanism exists in this local-first, no-backend app for "purchasable" to mean anything yet. Do not pick this up before WP30 and WP32 have shipped something real.
- **WP34:** Workshop maturity (audit centre) — see `18-…` §3 for its own row and DoD.

None of the remaining three buildable WPs (WP30, WP32, WP34) is fixed as "the" next one by this file — read `18-…` §3/§7 and confirm with the user which to start.

Use your judgement inside a WP — the docs fix the destination and the contracts, not every step. Where a doc is silent, decide and note it. Where implementation must diverge from a doc, change the doc in the same PR with a dated note (`> **Amended 2026-08-13:** …`); don't leave the two disagreeing.

## Hard rules (violations are bugs)

1. **Engine/UI separation:** `packages/core`, `packages/governance` and `packages/packs/*` never import Svelte or touch the DOM. All UI lives in `apps/workbench`.
2. **Keys are sacred:** API keys live only in `localStorage` (`cab.keys.v1`), read only by provider packs at call time. Never in kit files, traces, events, logs, errors or URLs. The CI key-leak test stays.
3. **Everything observable:** anything the UI shows about engine behaviour arrives as a typed event on the EventBus. New behaviour ⇒ new or extended event, added to the catalogue in `02-…` §7 in the same PR.
4. **Packs contribute content, not mechanisms.** New slot types or hooks are deliberate `core` changes, never pack workarounds.
5. **Determinism:** the world is fully deterministic; all randomness goes through the `dice` tool and is recorded in the trace.
6. **Design tokens only:** no raw colours outside `tokens.css`; the colour↔concept mapping (`04-…` §2.2) is fixed. (Not yet lint-enforced — review discipline.)
7. **Toy names in UI, real names in code:** UI says "battery", code says `apiKey` (glossary: `00-…` §6). Both vocabularies, never a third.
8. **Repo is future-public:** no secrets or private notes in code, comments or history.

## Commands

```bash
npm run dev            # Turborepo dev (core watch + workbench on Vite)
npm run test           # Vitest across all packages (workbench runs with coverage)
npm run e2e            # Playwright, mock provider — no key needed
npm run check          # svelte-check / tsc across workspaces
npm run lint           # prettier --check + eslint + check
npm run format         # prettier --write
npm run build          # all packages + static app + bundle budget
npm run preview        # serve the built app
npm run budget         # bundle-size budget only
npm run smoke:openai   # live OpenAI smoke test — explicit env key, never in CI
```

## Testing

Mock provider everywhere; live OpenAI only via `smoke:openai`. `core` ≥90% coverage, world predicates 100%, keyboard-only E2E variants for build interactions. Deterministic tests only — no network, no real clocks, no unseeded randomness. Full DoD: `10-…` §8; the Day 2 test estate to build out is `13-…` §L0–L5.
