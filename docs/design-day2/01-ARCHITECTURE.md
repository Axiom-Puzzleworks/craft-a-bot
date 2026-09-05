> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward as the V1.0 architecture record. Day 2 target evolutions (open brick registry, session I/O API, multi-agent seams) are specified in `14-BRICK-REFERENCE-DESIGNS.md`.
> This file is a verbatim copy of `docs/design/01-ARCHITECTURE.md` carried into the standalone Day 2 set; only this banner has been added.

# 01 — System Architecture

> How Craft A Bot is structured so that V1.0 ("My Very First Agent") ships simply, and the Agent Builder / AI Architect kits bolt on later without rewrites.
> Prerequisite reading: `00-PROJECT-OVERVIEW.md`.

---

## 1. Architectural goals

1. **Simple to run:** V1 is a static web app. `npm run dev` and a browser is the entire stack. No servers, no accounts, no database.
2. **Grows by addition, not modification:** new capability arrives as *packs* that register content behind stable interfaces. Core code should almost never change when a pack is added.
3. **Engine/UI separation:** the agent engine is a headless TypeScript library with zero Svelte imports. The UI renders and drives it. This makes the engine testable, embeddable, and exportable (purpose 2: governance components must be usable outside the toy).
4. **Public/private split by packaging:** any capability can be withheld from a public release by not shipping its pack. Public code never imports private code.
5. **Everything observable:** the engine emits structured events for every significant occurrence; the UI, the trace, and future governance tooling are all *consumers* of the same event stream.

## 2. High-level structure

A single repo, organised as an npm workspace monorepo:

```
craft-a-bot/
├── CLAUDE.md                  # Claude Code instructions (see design/CLAUDE.md)
├── docs/
│   └── design/                # These design documents
├── packages/
│   ├── core/                  # @craftabot/core — headless agent engine (no UI deps)
│   ├── packs/
│   │   ├── starter/           # @craftabot/pack-starter — V1 bricks, tools, Playroom, goal cards
│   │   └── openai/            # @craftabot/pack-openai — OpenAI model cartridges
│   └── governance/            # @craftabot/governance — trace, guardrails, policy seed (exportable)
├── apps/
│   └── workbench/             # SvelteKit app — the visible product
└── assets/                    # Source art (box art, brick sprites, textures)
```

Notes:

- **`core`** knows nothing about OpenAI, the Playroom, or Svelte. It defines the interfaces (bricks, worlds, providers, guardrails, events) and runs the loop.
- **`packs/starter`** is the content of the V1 box: the five brick definitions, the toy tools, the Playroom world, the starter Goal Cards.
- **`packs/openai`** is deliberately separate from `starter` even in V1 — it proves the cartridge/expansion mechanism works, and it is the template for every future LLM pack.
- **`governance`** is separate from `core` because purpose 2 requires exporting it for real-world use. It depends only on `core`'s event/types surface.
- **`apps/workbench`** is the only package with Svelte in it.

> **Amended 2026-09-05 (WP53 stage B, `43-DESK-WORLDS.md` §4.4):** `packages/desk/` — `@craftabot/desk`, the business-world runtime: `createDeskWorld(spec)` turns records, a transcript, a queue and a handful of handlers into a `WorldDefinition` drawn as a Desk. Depends on `core` (and `zod`) only, held there by ESLint as `governance` and `telemetry` are; a desk pack (`pack-workshop` today, the Playground's desks later) depends on it, never the other way round. Not published in this WP.
- A future private repo can host `@craftabot/pack-*` packages that install into the same slots. The public app discovers packs via an explicit registry list — nothing dynamic or magical in V1.

## 3. Runtime architecture (V1)

```
┌────────────────────────────  Browser  ────────────────────────────┐
│                                                                    │
│  apps/workbench (SvelteKit, static)                                │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Workbench UI   │  │ Playroom UI  │  │ Trace / Inspector UI   │  │
│  │ (build mode)   │  │ (run mode)   │  │ (always available)     │  │
│  └──────┬────────┘  └──────┬───────┘  └───────────┬────────────┘  │
│         │  reads/writes     │ renders              │ subscribes    │
│         ▼                   ▼                      ▼               │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              AgentSession (from @craftabot/core)            │   │
│  │   AgentSpec ──▶ validate ──▶ loop: sense → think → act      │   │
│  │        events out ──▶ EventBus ──▶ trace, UI, guardrails    │   │
│  └───────┬──────────────────┬─────────────────────┬───────────┘   │
│          ▼                  ▼                     ▼               │
│   World (Playroom)   LLM Provider (OpenAI)   Guardrails           │
│   [pack-starter]     [pack-openai]           [governance]         │
│                             │                                     │
│  Persistence: IndexedDB (agents, traces) · localStorage (settings,│
│  API keys — never exported) · JSON kit files (import/export)      │
└─────────────────────────────┼─────────────────────────────────────┘
                              ▼  HTTPS (user's own API key)
                       api.openai.com
```

Key decisions:

- **The only network calls are to the LLM provider**, made directly from the browser with the user's own key. No telemetry, no analytics in V1.
- **`AgentSession`** is the single runtime object: it owns the loop, the world instance, the provider client, the guardrail chain, and the event bus. The UI never reaches around it.
- **The EventBus is the spine.** UI panels, the trace recorder, and guardrails all subscribe to the same typed event stream. Adding an observer never touches engine code. (Event catalogue in `02-AGENT-MODEL.md` §7.)

## 4. The pack system

A **pack** is a plain TypeScript module exporting a `PackManifest`. Packs contribute *content*, not *mechanisms*:

```ts
// @craftabot/core — packs/types.ts
export interface PackManifest {
  id: string;                    // "starter", "openai", "llm-multipack"
  name: string;                  // Box name: "My Very First Agent — Starter Parts"
  version: string;               // semver
  requiresCore: string;          // semver range of @craftabot/core
  bricks?: BrickDefinition[];    // brick types this pack adds
  tools?: ToolDefinition[];      // tools for the Tools brick
  worlds?: WorldDefinition[];    // simulated environments
  cartridges?: CartridgeDefinition[]; // LLM provider+model configs
  goalCards?: GoalCardDefinition[];
  guardrails?: GuardrailDefinition[];
  artwork?: PackArtwork;         // box art, brick sprites (URL refs)
}
```

Rules:

- Packs are **registered explicitly** in the app (`apps/workbench/src/lib/packs.ts` imports and lists them). V1 has no dynamic loading, no marketplace — but the manifest shape is designed so a future pack browser can exist.
- Pack IDs are namespaced and stable; content IDs are `"{packId}/{localId}"` (e.g. `"starter/tool-calculator"`, `"openai/gpt-5-mini"`). Kit files reference content by these IDs, so a kit file names its required packs.
- A pack **cannot** patch core behaviour or another pack's content. If a capability needs a new *mechanism* (a new slot type, a new event), that is a core change, made deliberately.
- **The expansion-pack fiction is enforced in the UI, not the code:** the LLM Multi-Pack ships as ordinary packs; the UI presents non-installed packs as "expansion packs on the shelf". Whether acquiring one is a click, a download, or a purchase is a product decision for later — the architecture only cares that a pack is present or absent.

## 5. Public/private split — how it works in practice

- Everything above is public in the first release.
- A private capability (say, an advanced policy engine) is developed as `@craftabot/pack-policy-pro` in a **separate private repo**, versioned against the public `@craftabot/core` interface.
- The public app never lists it; a private build of the app (or a future pack-loading mechanism) does.
- **Discipline required now:** interfaces in `core` are the compatibility contract. Breaking changes to `core` interfaces require a major version bump and a migration note in `docs/`, from the very first release.

> **Amended 2026-09-05:** "a packaging decision, not a rewrite" becomes concrete as **editions** (`41-TARGET-DESIGN-V4.md` §6.14, decision D3; built by WP69): one codebase, three static builds — `simulator`, `workshop`, `playground` (and `full`, today's build) — from a build-time `CAB_EDITION`, each with its own pack list, route allow-list, `paths.base` and bundle budget. No runtime flag decides what a visitor sees; whether a section is access-controlled is a hosting rule in front of its folder, and the app never knows. The first breaking `core` change under the rule above is WP56's removal of the long-deprecated `PackManifest.guardrails` lane, taking `core` from `0.0.1` to `1.0.0` with a fixture proving every shipped manifest and kit file still loads (`42-…` §3, `14-…` §7).

## 6. Where a backend fits (when it becomes necessary)

V1 needs none. The first features that will genuinely require one: sharing kit files by link, community galleries, classroom/team spaces, cloud trace archives. When that happens:

- **Supabase** is the chosen platform (Postgres + Auth + Storage + Row-Level Security).
- The local-first design is preserved: Supabase becomes a *sync target*, not the source of truth for a solo user. `07-DATA-MODEL-PERSISTENCE.md` keeps every entity UUID-keyed and timestamped so sync can be added without schema surgery.
- **API keys never go to the backend.** Server-side key custody, if ever offered, is a separate, explicit product decision — the default remains keys-stay-in-the-browser.

## 7. Security & privacy posture (V1)

- User API keys: stored in `localStorage`, entered via the "battery compartment" UI, sendable only to the provider's official endpoint, **never** included in kit files, traces marked exportable, or logs. See `06-LLM-PROVIDERS.md` §6.
- Kit files and exported traces are plain JSON the user can read — nothing opaque.
- No third-party scripts, no CDN-hosted code at runtime (fonts/assets bundled), CSP as strict as SvelteKit static output allows.
- The simulator makes no real-world side effects by construction: the only effectful boundary is the LLM HTTP call, and every tool/action executes against the in-memory world.

## 8. Non-functional targets (V1)

| Concern | Target |
|---|---|
| First load | < 2s on a mid-range laptop, < 1.5 MB JS (excluding art) — **per build** from 2026-09-05, see the note below |
| Agent tick latency | UI reflects each loop phase in < 100ms after the provider responds |
| Trace capacity | 10,000 events per run without UI degradation (virtualised list) |
| Browsers | Latest Chrome, Edge, Firefox, Safari; no IE/legacy |
| Accessibility | Keyboard-operable workbench; WCAG 2.1 AA contrast within the retro palette (see `04-VISUAL-DESIGN-LANGUAGE.md` §7) |

> **Amended 2026-09-05:** the JS budget is a budget **per build**, not one number over everything (`41-TARGET-DESIGN-V4.md` §2.1 G42, §6.14). `scripts/bundle-budget.mjs` takes a limit and reports per-route sizes (WP56); the `full` build keeps 1.5 MB, and each edition (`simulator`, `workshop`, `playground`) is measured against its own budget once WP69 builds them. A single budget would have made the Kit and the Playground compete for the same bytes.
| Offline | App shell loads offline (static PWA-ready); running a bot obviously needs the network for the LLM |
