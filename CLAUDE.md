# CLAUDE.md — Craft A Bot

## What this is

An LLM & agent simulator styled as a 1970s/80s construction toy. Users snap bricks (LLM, Memory, Tools, Sense, Actions, Safety) onto a workbench, slot in a Goal Card, and watch their agent act in a simulated Playroom with every prompt, decision and action visible in a trace.

Two purposes, in priority order: (1) an accessible training ground for agentic-AI concepts; (2) a proving ground for automated AI governance and guardrails, whose components will eventually be exported for real-world use.

Stack: TypeScript + Svelte 5 (runes) + SvelteKit static. Monorepo (npm workspaces + Turborepo). Local-first, no backend. OpenAI out of the box (BYO key).

**Where we are (2026-08-21):** V1.0 and Day 2 Phases A–F are fully shipped — every WP `18-…` names, WP0 through WP34, is done. The roadmap's forward plan has nothing left in it. **Amended 2026-09-01:** Phase G is now fully closed — **WP35, the Armour Brick** (`25-ARMOUR-BRICK.md`, `18-…` §3 Phase G), all five stages built and the live Google Cloud checkpoint (a real Model Armor verdict, the CORS go/no-go on direct browser calls) confirmed clear. **Amended 2026-09-02:** a fresh planning pass produced `26-TARGET-DESIGN-V3.md` (the target design) and `27-DAY3-ROADMAP.md` (Phases H–L, WP36–WP52); the forward plan is `27-…`, and nothing in it has been built yet. Full history — what each WP built, in what stages, with what divergences — lives in `18-…` §7 (the dated close-out log) and in each WP's own dated amendment inside the doc it touched; this file doesn't restate it. **Starting new work needs a fresh planning pass first** — see Workflow below.

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
| `12-CURRENT-STATE-ASSESSMENT.md` | Root causes C1–C8, defect register D1–D17/T1–T5 — check before planning new work |
| `13-BRICK-TEST-STRATEGY.md` | Writing tests; the L0–L5 pyramid, per-brick charters, eval harness, conformance kit |
| `14-BRICK-REFERENCE-DESIGNS.md` | Touching any brick or engine shape — the open brick contract, evolutions E1–E12, v2 schemas |
| `15-UIUX-DUAL-MODE.md` | Anything spanning Kit and Workshop |
| `16-TEACHING-AID-UIUX-IMPROVEMENTS.md` | Kit UX work — P0/P1/P2 with acceptance criteria |
| `17-PRO-MODE-UI-DESIGN.md` + `mockups/pro-mode-mockup.html` | Workshop (professional mode) work |
| `18-DAY2-ROADMAP.md` | The full WP0–WP34 record and close-out log (§7) — read before proposing new phases |
| `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` | Governance features — the 38-control catalogue, dip in as needed |
| `25-ARMOUR-BRICK.md` | WP35 (Phase G) — the Armour Brick: Model Armor as a hosted, Workshop-only safety brick; the credential/network seams, `guardrail.external`, decisions D1–D5, stages A–E |
| `26-TARGET-DESIGN-V3.md` | **The current target design** (Day 3) — the safety proving ground: gap register G1–G20, the vendor-neutral guardrail-service shell, evaluators, scenarios, campaigns, egress, telemetry sinks, the headless harness, socket capacity; read before any Phase H–L work |
| `27-DAY3-ROADMAP.md` | **The current forward plan** — Phases H–L, WP36–WP52, each mapped to a `26-…` section and the gaps it retires; §8 is the session-sized to-do |
| `38-GOVERNANCE-1-0.md` | WP50 (Phase L) — `@craftabot/governance` 1.0.0-rc.1: README, TSDoc audited by a test, `examples/plain-node-agent`, `docs/governance-mapping.md`, the tarball check in CI; stages A–C |
| `37-DRIFT-SAFETY-CASE-RUN-LAB.md` | WP49 (Phase K) — drift: `telemetrySeries`/`driftIn` and the `/telemetry` time axis; the safety case's evaluation evidence and campaign results (`campaignEvidenceFor`, `builds` on the campaign report); the engine's resume, breakpoints as a preference, the live-run bus and the Run Lab trailing it; campaign tiles on the Bench; stages A–C |
| `36-BUNDLE-AND-GROUPS.md` | WP48 (Phase K) — the trace bundle (`buildTraceBundle`/`verifyBundleDigest`, `craftabot-bundle` v1), group observers and the group Watchbot with its circuit breaker, Hearing per seat, episodes in the Audit Centre, the Run Lab's badge over a bundle, `craftabot bundle --group`; stages A–C |
| `35-TELEMETRY.md` | WP47 (Phase K) — telemetry sinks: the `TraceSink` contract in core, `@craftabot/telemetry` (the OTel mapping moved and extended to groups, the batcher, `telemetry/otlp-http`, `telemetry/file` on `/node`), `checkSink`, `/workshop/sinks`, live attach, the Audit Centre's send, `craftabot export`, `run --sink`, a campaign's `sinks`; stages A–C |
| `34-CONTENT-STORE.md` | WP46 (Phase J) — the Workshop content store: `ContentRecord` and the synthetic `local` pack, content on all three stores, the registry's `local/` guard, `requires.localContent` in kit files, save on four Workshop screens, the Kit's gated picker, `--content` and `craftabot content`; stages A–C |
| `33-POLICY-V2-PDP.md` | WP45 (Phase J) — policy-as-code v2 and the external PDP: the six `PredicateExpr` leaves, `describeUnsafePattern`, `GuardrailContext.world`, `WorldActionDefinition.progress` (the `MOVEMENT` wart retired), `pdpRequestFor` and `ScreenRequest.policyInput`, `@craftabot/pack-pdp-opa`, the Studio's leaves; stages A–C, live OPA checkpoint taken |
| `32-SCENARIOS.md` | WP44 (Phase J) — scenarios: `ScenarioDefinition` + `injectionSchema`, `WorldInstance.inject?` and the Playroom's four doors, `ToolContext.worldState`, the four cards as scenarios, `runScenario`, the JSONL corpus importer and scenario packs, campaigns by `scenarioId`, the by-tag table, `craftabot scenarios`, `/workshop/scenarios`; stages A–C |
| `31-EVALUATORS.md` | WP43 (Phase J) — evaluators: the `Evaluator` contract and `EvaluationRecord`, cards as evaluators, the rubric judge pack, campaign gates on verdicts, `/workshop/evaluators`, the Monitor Judge, `craftabot evaluate`, `checkEvaluator`; stages A–D |
| `30-SECOND-VENDORS.md` | WP42 (Phase I) — the second and third guard services: the vendor comparison, `pack-guard-local` (Llama Guard, Prompt Guard over Ollama), `pack-azure-content-safety`, the Guard Rack at `/workshop/guards`, the baseline's stacks; the Azure live checkpoint's status |
| `29-GUARD-SHELL.md` | WP39 (Phase I) — the guard shell: `GuardrailService` contract, `createHostedGuardrails` in governance, `pack-geap` on the shell with its golden trace byte-identical, `workshop/guard`, `checkGuardrailService`; stages A–E |
| `28-CAMPAIGNS.md` | WP38 (Phase H) — campaigns: the campaign file and its gates, the adversary tier, the report and its three renderings, the baseline campaign and CI job, `craftabot campaign`, `/workshop/campaigns`; stages A–E |

`09-ROADMAP.md` is history only (the WP0–WP10 record); `18-…` supersedes its forward plan.

Where a Day 2 doc and its Day 1 counterpart differ, **Day 2 wins** — the banner on each carried-forward file says what changed.

## Workflow

**Phase G is closed — WP35, the Armour Brick, shipped in full** (`25-ARMOUR-BRICK.md`, opened 2026-09-01, closed the same day across stages A–E plus the live Google Cloud checkpoint; `18-…` §7 items 30–32). `18-…`'s forward plan is exhausted (WP0–WP35 all done).

**The fresh planning pass is done (2026-09-02):** `26-TARGET-DESIGN-V3.md` is the target design and `27-DAY3-ROADMAP.md` is the forward plan — Phases H–L, WP36–WP52. **Amended 2026-09-02, later the same day:** WP36 and WP37 are done (`27-…` §8 items 1–6 — the storage contract and the analytic folds live in `core`/`governance`, run summaries retire the N+1 screens, and `@craftabot/harness` runs, bundles and reports headless). **Amended 2026-09-02, later still:** WP38 (campaigns) is done too (`27-…` §8 item 7, `28-CAMPAIGNS.md` §8) — **Phase H is closed.** **Amended 2026-09-02, later still:** WP39 (the guard shell) is done — `29-GUARD-SHELL.md` §8, `27-…` §8 item 8: `GuardrailService` in core, `createHostedGuardrails` in governance, `pack-geap` on the shell with its golden trace byte-identical, `workshop/guard`, `checkGuardrailService`. **Amended 2026-09-02, later still:** WP40 (socket capacity) is done — `27-…` §8 item 9: `SLOT_CAPACITY` (`safety: 4`), the Kit's one-well rule kept with a chip, the Spec Lab's Safety stack. **Amended 2026-09-02, later still:** WP41 (egress and credentials v2) is done — `27-…` §8 item 10: the session's `fetch` guard under `egress: 'declared' | 'none'`, every provider and hosted brick declaring its hosts, `--egress none` in CI, timed vault entries and "Test the guard" on the kind. **Amended 2026-09-02, later still:** WP42 is done — `30-SECOND-VENDORS.md` §7, `27-…` §8 item 11: two more service packs, the Guard Rack, the baseline's stacks; **Phase I is closed** (the Azure live checkpoint remains to be taken by someone with a key). **Amended 2026-09-02, later still:** WP43 (evaluators) is done — `31-EVALUATORS.md` §8, `27-…` §8 item 12. **Amended 2026-09-02, later still:** WP44 (scenarios) is done — `32-SCENARIOS.md` §7 and stage notes, `27-…` §8 item 13. **Amended 2026-09-02, later still:** WP45 (policy v2 + the OPA PDP) is done — `33-POLICY-V2-PDP.md` §7 and stage notes, `27-…` §8 item 14, the live OPA checkpoint taken. (Phase J is WP43–WP46; WP44's note that it had closed was wrong.) **Amended 2026-09-02, later still:** WP46 (the content store) is done — `34-CONTENT-STORE.md` §7 and stage notes, `27-…` §8 item 15; **Phase J is closed.** **Amended 2026-09-02, later still:** WP47 (telemetry sinks) is done — `35-TELEMETRY.md` §7 and stage notes, `27-…` §8 item 16. **Amended 2026-09-02, later still:** WP48 (the bundle and multi-agent completion) is done — `36-BUNDLE-AND-GROUPS.md` §7 and stage notes, `27-…` §8 item 17. (Phase K is WP47–WP49; the note that it had closed was wrong.) **Amended 2026-09-03:** WP49 (drift, the safety case v2, the live Run Lab) is done — `37-DRIFT-SAFETY-CASE-RUN-LAB.md` §7 and stage notes, `27-…` §8 item 18; **Phase K is closed.** **Amended 2026-09-03, later:** WP50 (`@craftabot/governance` 1.0) is done — `38-GOVERNANCE-1-0.md` §7 and stage notes, `27-…` §8 item 19. Next is **WP51** (the hosted evaluator), then WP52, which closes Phase L.

Once there's a WP to build (from a new plan, or a defect worth fixing): read the docs it names, **propose a task breakdown before writing code**, then build. One WP per branch (`wp{n}-{slug}`) and PR. Use your judgement inside a WP — the docs fix the destination and the contracts, not every step. Where a doc is silent, decide and note it. Where implementation must diverge from a doc, change the doc in the same PR with a dated note (`> **Amended 2026-08-13:** …`); don't leave the two disagreeing.

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
npm run craftabot -- … # the headless host (WP37/38): packs | run | bundle | report | campaign — see packages/harness/README.md
npm run smoke:harness  # live harness run on OpenAI — CRAFTABOT_CREDENTIAL_OPENAI in the env, never in CI
```

## Testing

Mock provider everywhere; live OpenAI only via `smoke:openai`. `core` ≥90% coverage, world predicates 100%, keyboard-only E2E variants for build interactions. Deterministic tests only — no network, no real clocks, no unseeded randomness. Full DoD: `10-…` §8; the Day 2 test estate to build out is `13-…` §L0–L5.
