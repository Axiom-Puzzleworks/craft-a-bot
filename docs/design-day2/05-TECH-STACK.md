> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward unchanged.
> This file is a verbatim copy of `docs/design/05-TECH-STACK.md` carried into the standalone Day 2 set; only this banner has been added.

# 05 — Tech Stack & Tooling

> Concrete technology choices for V1, with rationale. These are decisions, not suggestions — deviate only with a written note in this file.
> Prerequisite reading: `01-ARCHITECTURE.md`.

---

## 1. Core choices

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript 5.x, `strict: true`** everywhere | Non-negotiable per project brief; strict mode from day one is far cheaper than retrofitting |
| UI framework | **Svelte 5 (runes)** | Per project brief. Runes (`$state`, `$derived`, `$effect`) are the only state idiom used — no legacy stores API in new code |
| App framework | **SvelteKit 2 + `adapter-static`** | Static output = local-first, deployable to any static host (GitHub Pages/Netlify) for build-in-public; SvelteKit gives routing, layouts, and a future server-side path if Supabase arrives |
| Monorepo | **npm workspaces + Turborepo** | Workspaces are zero-magic; Turborepo caches builds/tests across `core`/`packs`/`governance`/`workbench` |
| Build | **Vite** (via SvelteKit) · `vite-plugin-svelte` | Default, fast, no exotic config |
| Schema/validation | **Zod 3** | Runtime validation of kit files, provider responses, pack manifests; `z.infer` keeps TS types and runtime checks single-sourced |
| Persistence | **IndexedDB via `idb`** (agents, traces) + `localStorage` (settings, keys) | See `07-DATA-MODEL-PERSISTENCE.md` |
| IDs / time | `crypto.randomUUID()` · ISO-8601 strings | No date libraries in V1 |
| Styling | **Vanilla CSS + custom properties** (design tokens from `04-VISUAL-DESIGN-LANGUAGE.md`), scoped Svelte styles | No Tailwind: the aesthetic is bespoke; tokens-in-CSS-variables is the whole system. One global `tokens.css` + component-scoped styles |
| Icons/art | SVG assets from `assets/` imported as components/URLs | No icon-font/library dependencies |

## 2. Testing

| Kind | Tool | Scope & bar |
|---|---|---|
| Unit | **Vitest** | `core`, `governance`, packs: the loop, world physics, prompt composition, guardrails, schema round-trips. Target: `core` ≥90% line coverage; world predicates 100% |
| Component | **Vitest + @testing-library/svelte** | Brick panels, build-checks ribbon, trace rows |
| E2E | **Playwright** | The six tutorial chapters as scripted journeys with a **mock provider** (see §4); keyboard-only build test; kit export/import round-trip |
| Static | `svelte-check`, `eslint` (typescript-eslint + eslint-plugin-svelte), `prettier` | CI-blocking |

The **mock provider** (`packs/mock` or a test util in `core`) implements `LLMProvider` with scripted responses — no network, fully deterministic. It exists from the first milestone: everything except the real OpenAI call must be testable offline, and it doubles as the "demo mode" if we ever want a keyless preview.

## 3. Project layout (workbench app)

```
apps/workbench/src/
├── routes/                 # SvelteKit routes: / (shelf), /bench/[agentId], /play/[agentId], /settings
├── lib/
│   ├── packs.ts            # explicit pack registry (imports starter, openai)
│   ├── state/              # runes-based app state: agents.svelte.ts, session.svelte.ts, settings.svelte.ts
│   ├── components/
│   │   ├── bench/          # PartsTray, Baseplate, BrickPanel, GoalCardRack, BuildChecks
│   │   ├── play/           # WorldStage → WorldView | DeskView (WP53), HeadUp, RunControls, ThoughtBubble, EndCard
│   │   ├── trace/          # TraceDrawer, TraceRow, PayloadView
│   │   ├── kit/            # KitBox, Shelf, Leaflet, Badge, Dial, Rocker, Meter, GoLever
│   │   └── settings/       # BatteryCompartment
│   ├── dnd/                # pointer-based drag-and-drop (see §5)
│   └── styles/tokens.css   # the design tokens
└── app.css                 # resets + global texture layers
```

## 4. Engine/UI boundary rules

- `@craftabot/core`, `@craftabot/governance`, and all packs: **no Svelte imports, no DOM access** (except `fetch`/`crypto` platform APIs). Enforced by an ESLint `no-restricted-imports` rule per package.
- The UI subscribes to the `EventBus` and renders; it never mutates engine state directly — all writes go through `AgentSession` methods or `AgentSpec` editing before a session starts.
- Svelte 5 interop: a thin `sessionState.svelte.ts` adapter subscribes to engine events and mirrors them into `$state` — the *only* place engine events become reactive state.

## 5. Drag-and-drop implementation

Custom, small, pointer-events-based (no library):

- `lib/dnd/draggable.svelte.ts` — attachment/action making an element draggable: lift (scale 1.05 + shadow + 2° tilt), pointer capture, move via CSS transform.
- `lib/dnd/dropzone.svelte.ts` — registers sockets with an accepts-predicate (`(brickType) => boolean`); proximity snap radius ~24px; highlight/reject states.
- A tiny `dndState` store coordinates the pair (what's being dragged, current candidate target) and emits placement events the bench state consumes.
- Keyboard path implemented in the same module as first-class API (`03-UI-UX-DESIGN.md` §4.4), not bolted on.
- Rationale: existing Svelte DnD libraries are list-reorder oriented; a construction-toy snap model is different and small enough to own (~300 lines with tests).

## 6. LLM calls from the browser

- Direct `fetch` to the provider endpoint with the user's key; streaming via SSE (`text/event-stream` parsing in `pack-openai`). Details and CORS notes in `06-LLM-PROVIDERS.md` §5.
- All provider calls behind `LLMProvider` so the mock provider slots in for tests/demo.
- `AbortController` wired to STOP — a stopped run cancels in-flight requests.

## 7. Quality gates & CI

GitHub Actions on every PR: install → lint → `svelte-check` → unit/component tests → build all packages → Playwright E2E (chromium) → bundle-size check (fail if `workbench` JS exceeds 1.5MB gz budget from `01-ARCHITECTURE.md` §8).

Conventional Commits enforced (commitlint) — useful for changelogs when building in public.

## 8. Developer experience

- `npm run dev` at repo root = Turborepo dev pipeline (core watch-build + workbench dev server).
- `npm run demo` = workbench with the mock provider pre-selected (no key needed) — used by E2E and for public demo deployments.
- Node LTS (≥20) pinned via `.nvmrc` + `engines`.
- `README.md` quickstart must stay under ten lines from clone to running app.

## 9. Dependency policy

Small and boring on purpose: production deps in V1 are essentially `svelte`, `@sveltejs/kit`, `zod`, `idb` — plus dev tooling. Every new production dependency needs a one-line justification in the PR description. No runtime CSS/UI frameworks, no state libraries, no date libraries, no LLM SDKs (raw `fetch` keeps us honest about what's on the wire, which is itself teaching material).
