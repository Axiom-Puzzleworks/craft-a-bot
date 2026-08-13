> **DESIGN DAY 2 STATUS (2026-08-13):** V1.0 work-package history remains the record of what was built. **Everything beyond V1.0 in §4 is superseded by `18-DAY2-ROADMAP.md`.**
> This file is a verbatim copy of `docs/design/09-ROADMAP.md` carried into the standalone Day 2 set; only this banner has been added.

# 09 — Roadmap & Work Packages

> V1.0 broken into ordered, Claude Code-sized work packages, plus the horizon beyond.
> Prerequisite reading: all previous docs. Each work package (WP) lists its deliverables, key docs, and its definition of done (DoD).

---

## 1. Sequencing logic

Engine before UI, mock before real API, boring before beautiful: every WP leaves `main` green and demonstrable. Art arrives in parallel (separate visual workstream) — early WPs use crude placeholder shapes with correct colours/silhouettes so no WP blocks on final art.

```
WP0 → WP1 → WP2 → WP3 → WP4 ─┬→ WP5 → WP6 → WP7 → WP8 → WP9 → WP10
                              └→ (visual workstream feeds art in from WP5 onward)
```

## 2. Work packages

### WP0 — Repo scaffold
Monorepo per `01-ARCHITECTURE.md` §2 and `05-TECH-STACK.md`: workspaces, Turborepo, SvelteKit app shell (blank shelf page), ESLint/Prettier/svelte-check, Vitest, Playwright, CI pipeline, CLAUDE.md and docs copied in.
**DoD:** `npm run dev` serves a page; CI green on lint+test+build; engine/UI import-boundary lint rule active.

### WP1 — Core types, schemas, event bus
`@craftabot/core`: all interfaces from `02-AGENT-MODEL.md` §6–7, Zod schemas per `07-DATA-MODEL-PERSISTENCE.md` §6, `EventBus`, `validateSpec` with the full build-problem catalogue, pack manifest types + `PackRegistry`.
**DoD:** ≥90% coverage on validation & bus; kit-file schema round-trips fixtures.

### WP2 — The Playroom world
`pack-starter` worlds: grid model, items/characters/containers, actions with JSON-schema params, sense channels, predicates, narration strings, layouts for the six starter Goal Cards.
**DoD:** world unit tests 100% on predicates & action legality; determinism test (replay action list ⇒ identical state, `08` §7.5) passes.

### WP3 — Agent loop with mock provider
`AgentSession`: full tick sequence (sense→compose→guard→think→decide→act→remember→judge), run modes, budgets, outcome states, malformed-output re-prompt rule, mock `LLMProvider` with scripted personas (obedient / wanderer / mumbling).
**DoD:** scripted mock runs complete "Say Hello!" and "Snack" goals end-to-end in tests; every event type observed in a captured trace fixture.

### WP4 — Persistence
IndexedDB stores, `Storage` interface + in-memory test impl, agent/run/event records, kit export/import, trace export with digest, LRU eviction + pinning.
**DoD:** export→import round-trip preserves spec; eviction tested; key-leak CI test in place (fails if a stored key appears in any export).

### WP5 — Workbench UI (build mode)
Shelf, baseplate + sockets, parts tray, custom DnD (pointer + keyboard paths), brick panels with dials/toggles, flip sides, Goal Card rack, build-checks ribbon, GO lever → play route. Placeholder art, correct tokens/silhouettes.
**DoD:** Playwright: build a valid bot mouse-only AND keyboard-only; invalid builds show correct checks; spec edits persist.

### WP6 — Playroom UI (play mode) + Flight Recorder
World renderer, head-up bar, STEP/PLAY/STOP + speed, thought bubble, trace drawer (virtualised, colour-coded, expandable payloads, prompt view), end cards, trace export button.
**DoD:** Playwright with mock provider: full snack-goal run visible tick-by-tick; trace shows exact composed prompt; 10k-event trace scrolls smoothly.

### WP7 — OpenAI pack (the real brain)
`pack-openai` per `06-LLM-PROVIDERS.md`: SSE streaming chat, tool calling, three cartridges + catalogue file, key validation ping, error normalisation table, battery compartment UI.
**DoD:** live smoke test behind an env-var key (excluded from CI); all error kinds unit-tested against canned wire fixtures; streaming tokens visible in thought bubble.

### WP8 — Safety Brick & governance seed
`@craftabot/governance`: guardrail interface + chain, the three V1 rules, approval flow (pause/resolve, UI cards), engine-floor budgets, denied-action feedback into observations, trace digest.
**DoD:** `08-GOVERNANCE-GUARDRAILS.md` §7 acceptance criteria all pass.

### WP9 — Instruction Leaflet & teaching arc
Six-chapter tutorial overlay per `03-UI-UX-DESIGN.md` §6 wired to the designed failure→fix moments; merit badges; empty/error states from `03` §9; settings & preferences.
**DoD:** Playwright walks all six chapters with the mock provider; every designed teaching moment reachable.

### WP10 — Polish, art integration, release
Final art swap-in, motion & sound, reduced-motion audit, AA contrast audit, bundle budget, README + demo deployment (`npm run demo` build to static host), licence decision recorded, tag `v1.0.0`.
**DoD:** non-functional targets in `01-ARCHITECTURE.md` §8 measured and met; a stranger can go from URL → built bot → snack success with no help.

> **Amended 2026-08-12 (WP10):** delivered as *release-ready except art*. Motion and sound, the reduced-motion audit, the AA contrast audit, the bundle budget, the offline app shell, trace capacity, README and the licence are all done and measured. **Held deliberately:** the final art swap-in (the artwork does not exist yet — `11-VISUAL-ASSET-MANIFEST.md` records what is owed), the demo *deployment* (needs a host), and the **`v1.0.0` tag**, which should not be cut on placeholder art. Tagging is a separate, deliberate step once the art lands.

## 3. Suggested Claude Code prompting pattern per WP

Start each WP session with: *"Read CLAUDE.md, then docs/design/09-ROADMAP.md WP{n} and its listed design docs. Propose a task breakdown before writing code."* Keep one WP per branch/PR; PR description links the WP and lists any deliberate deviations from the docs (deviations also get a dated note in the relevant doc — the docs stay true).

## 4. Beyond V1.0 (unscheduled, in likely order)

1. **V1.1 — Compare bench & demo mode polish:** side-by-side cartridge comparison (`06` §8), public keyless demo w/ mock provider.
2. **V1.2 — Policy cards** (`08` §5): declarative guardrails as slottable, shareable cards.
3. **LLM Multi-Pack:** Anthropic + Gemini + Ollama packs, persona cartridges, battery bay growth, the boxed expansion fiction in the shelf UI.
4. **Sharing era:** Supabase (accounts, published kits gallery, trace publishing) per `07` §7 — the first backend.
5. **Agent Builder kit:** planner/sequencer brick, if/then bricks, short/long-term memory split, MCP connector bricks, new worlds, test & checks bricks.
6. **AI Architect kit:** evaluation matrix runner, red-team cards, monitoring dashboards, permissions/approval chains — and the standalone release of `@craftabot/governance`.

## 5. Open questions (park, don't block)

- ~~Licence: Apache-2.0 vs MIT (+ trademark on the brand?). Decide by WP10 (`00` §4).~~ **Decided 2026-08-12 (WP10): Apache-2.0**, for the express patent grant and trademark clause, with `@craftabot/governance` intended for separate release. `LICENSE` is at the repo root. Trademark on the brand remains open and is not blocking.
- Sound design: source or commission? (Off-by-default regardless.)
- Name check: "Craft A Bot" trademark/domain search before public release.
- Whether the public demo ships with a rate-limited shared key (probably not — mock-provider demo avoids all custody questions).
- Playroom localisation strategy for goal/narration strings (V1 structures copy in one strings module per pack; translation itself deferred).
