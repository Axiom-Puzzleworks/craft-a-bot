# 12 — Current-State Assessment (Day 2 baseline)

> What V1.0 actually is at the end of Day 1: what works, what is fragile, why the bot underperforms in live play, and the defect register that Day 2 workstreams must burn down.
> Evidence: full source review of `packages/core`, `packages/governance`, `packages/packs/*`, `apps/workbench` (2026-08-13), the existing test suites, and Andrew's live-trial observations ("solves some tasks, gets stuck on others, sometimes loops").
> Feeds: `13-BRICK-TEST-STRATEGY.md` (every defect becomes a regression test), `14-BRICK-REFERENCE-DESIGNS.md` (every design debt becomes a target-design decision), `16-TEACHING-AID-UIUX-IMPROVEMENTS.md`, `18-DAY2-ROADMAP.md`.

---

## 1. Where the project stands

WP0–WP10 delivered in one day. The monorepo matches `01-ARCHITECTURE.md`: `@craftabot/core` (headless engine, 19-event Zod catalogue, deterministic and injectable throughout), `@craftabot/governance` (four guardrails + spec compiler), `@craftabot/pack-starter` (Playroom world, 7 actions, 4 senses, 6 goal cards, 5 tools), `@craftabot/pack-openai` (GPT-5 family cartridges, SSE streaming, error taxonomy, key scrubbing), and `apps/workbench` (SvelteKit SPA: Shelf, Bench, Playroom, Settings, six-chapter tutorial, Flight Recorder). Release-ready **except art** (`11-VISUAL-ASSET-MANIFEST.md`: 0 of 156 assets produced) and the held `v1.0.0` tag.

**The architecture bet has paid off.** The following are real, verified strengths to build on — not to rebuild:

1. **Event-sourced everything.** The UI renders exclusively from the typed `EngineEvent` stream (`createSessionView` is the single seam). Replay, scrubbing, alternative visualisations and the entire professional mode are architecturally free.
2. **Determinism and injectability.** `now/newId/random` injected; traces digest-signed (SHA-256), key-scrubbed, byte-reproducible. This is precisely the property the industry's replay/time-travel tooling depends on (see `19-…` §5.4).
3. **Two-tier governance made visible.** Platform floor (30 ticks / 100k tokens / 60s) vs user policy (Safety brick → compiled guardrails), with *different outcomes and end cards* — the player observes the distinction rather than being told it.
4. **True tool-calling loop.** Tools/actions go through the provider's native tool API, never prompt-stuffed; one decision per tick; the composed prompt is shown verbatim in the trace.
5. **The failure→fix pedagogy machine.** Spec-aware demo-brain variants + data-driven leaflet chapters + observed-progress advancement, proven end-to-end in Playwright.
6. **A clean pack seam for content.** Tools, worlds, cartridges, goal cards and guardrails all register through `PackRegistry`; a pack-contributed guardrail is enforced identically to built-ins (tested).

## 2. Why the bot underperforms — root-cause analysis

The observed behaviour ("solves Say Hello and Sums, struggles with Snack, fails Tidy/Locked Chest, sometimes loops") is **not primarily a model-intelligence problem**. It is an *information-design* problem: the agent is denied the information it needs, in the place it needs it. Ranked causes, each grounded in code:

| # | Cause | Evidence | Likelihood |
|---|---|---|---|
| C1 | **The bot cannot build a map.** Sight radius 1; compass gives bearings for furniture/containers only (never Teddy, never items); the memory summary stores *names without directions or coordinates* (`sightSummary()` → "you could see a stripy ball; your hands are empty"). Exploration degenerates into wandering. | `senses.ts` (SIGHT_OFFSETS, compassLines), `memory.ts` | High |
| C2 | **World failures are invisible where it matters.** Only guardrail/human refusals and mumble-scolding enter the prominent "Right now:" feedback section. Physical failures ("too far away", "locked", "bump into wall") live only inside the memory window — and **don't exist at all without the Memory brick**. The bot re-tries the salient idea whose failure it cannot see. | `agent-session.ts` feedback paths; `memory.ts` | High |
| C3 | **No-repetition is off by default**, so the reported hello-loop is confirmed-by-test default behaviour. When on, exact-signature matching misses alternating-failure loops and false-positives on legitimate straight-line walking. | `no-repetition.ts`, `safety-brick.test.ts` | High |
| C4 | **Entity naming still traps plausible phrasings.** `resolveNamed` rejects "blue block" and treats "the A block" as ambiguous across all three blocks; each miss burns a tick and small models re-phrase into another miss. | `state.ts` resolveNamed, `naming.test.ts` | Med-high |
| C5 | **Reasoning-token starvation** on GPT-5 cartridges → empty replies → malformed re-prompt cycle costing 2 completions + 1 tick each episode. Mitigated (reasoning_effort caps, raised defaults) but not eliminated; Penny Thinker at 400 tokens on hard cards is the likeliest victim. | `catalogue.ts` §WP7 notes | Medium |
| C6 | **Two goal cards are unwinnable inside the 30-tick floor.** Tidy the Blocks ≈ 34 optimal turns, Locked Chest ≈ 45. Recorded in `02-AGENT-MODEL.md` §9 and `chapters.ts`; never fixed. Any user "trying to win" them gets OUT_OF_STEPS regardless of build or model. | `chapters.ts` comments | Certain (by construction) |
| C7 | **The `celebrate` decoy invites terminal loops.** The system prompt mentions it every run; no predicate reads `state.celebrated`; a bot convinced it has finished celebrates repeatedly until the budget ends. | `prompt.ts`, `predicates.ts` | Low-med |
| C8 | **Adjacency semantics untaught.** Teddy/chest/table occupy impassable cells; reach requires adjacency, but nothing in the observation states the rule (it lives only in the manual). Bots push into blockers. | `state.ts` blockerAt, `manual.ts` | Low |

**Design implication (carried into 14):** the fixes are mostly *world/sense/memory information-design* changes plus *defaults* changes — richer observation summaries (positions and directions), failure feedback promoted into "Right now:", a progress/`describeProgress` extension, saner no-repetition defaults, winnable cards, and a `celebrate`-ends-free-play rule. All are engine/pack work, none require UI redesign, and all are testable with scripted brains before a single live-LLM run.

## 3. Defect register

Severity: **A** = blocks purpose 1 or 2 in practice; **B** = design debt that will compound if the build-out starts on top of it; **C** = polish/hygiene.

### Engine & governance

| ID | Sev | Defect | Where |
|---|---|---|---|
| D1 | A | Post-act guardrail verdicts silently discarded — the third hook can neither block nor stop. No test would catch a post-act `stop-run` doing nothing. | `agent-session.ts` (JUDGE step) |
| D2 | A | `WorldInstance.receiveInput` unreachable through `AgentSession` (world never exposed) — the Hearing channel has **no input path**; likewise no API to end Free Play as `SUCCESS` (only `STOPPED_BY_USER`). | `agent-session.ts` |
| D3 | B | `RunOutcome` and verdict/response/observation shapes triple-maintained (TS interface + Zod mirror + records enum) with only comments guarding drift. | `types/` vs `schemas/` |
| D4 | B | Playroom action/sense ids unqualified (`move`, `sight`) against the `{packId}/{localId}` convention; `wireName()` prefix-stripping lets same-local-name tools shadow each other; a tool wire name colliding with an action id resolves as the action. | `ids.ts`, `agent-session.ts` |
| D5 | B | No memory or prompt strategy interfaces — ring-buffer truncation and the prompt template are hard-coded; no summarisation/alternative-memory path. `windowSize` literal-typed in the spec, plain `number` in `createMemory`. | `memory.ts`, `prompt.ts` |
| D6 | A | Trace audit gaps: effective budgets, provider id and resolved wire model absent from `RunRecord`; `think.started` reports the cartridge id, not the model; `ToolResult.data` dropped from `tool.executed`; `memory.updated.notebookUpdated` misreports. The governance artefact under-records. | `trace-file.ts`, `agent-session.ts` |
| D7 | B | Kit files have a migration table; **trace files and records have none** — the long-lived governance artefact lacks forward migration. | `trace-file.ts` |
| D8 | C | `GuardrailContext` copies full history + fresh world snapshot per check per hook — O(events²) over a run, inflated by `think.token`. | `agent-session.ts` |
| D9 | B | No agent identity anywhere (events carry `runId` only); `PlayroomState.bot` singular; `observe/perform` take no agent handle — multi-agent is structurally distant. | `core/types`, `state.ts` |
| D10 | C | Dead/decorative config: `customGoalText` never reaches the prompt; `celebrate` writes state nothing reads; `CartridgeDefinition.defaults` never read by the engine; `ProviderError.retryAfterMs` unused (no retry/backoff); `safety.maxTicks` unbounded above. | various |
| D11 | B | Brick kinds and config schemas **closed in core** (fixed six-slot object, closed `kind` enum, `BrickDefinition` carries no config schema) — "brick" is a taxonomy, not an extension point. Blocks every expansion pack that adds a brick. | `agent-spec.ts`, `pack-manifest.ts` |
| D12 | B | No conversational tool-result protocol: `ChatMessage` supports `role:'tool'`/`toolCallId` but `composePrompt` never uses them; the model never sees a well-formed function-calling transcript. Pedagogically defensible for V1; must become a selectable strategy. | `prompt.ts` |
| D13 | C | Pack `requiresCore`/`requires.packs` version strings stored but never semver-evaluated (presence check only). | `kit-export.ts` |

### Workbench

| ID | Sev | Defect | Where |
|---|---|---|---|
| D14 | A | **No run history UI.** Runs + events fully persist (cap 50, pinning supported in storage) but nothing lists, reopens or replays them; a trace is only visible while still on the play page. | routes |
| D15 | B | `toRunRecord` hardcodes `mode:'step'`; mid-run `setSpeed` is a silent no-op; `evictOldRuns` notice never shown; `trace-recorder.ts` incremental persistence is dead code (mid-run reload silently loses the run). | `play/+page.svelte`, `session.svelte.ts` |
| D16 | B | No global nav (Settings unreachable from Shelf); "Bin" deletes without confirmation; play route has no aria live region; EndCard/ApprovalCard don't trap focus; badge toast shows the badge **id** not its name. | various |
| D17 | C | `boxArtSeed` stored but never rendered; sound has 4 cues and misses guardrail/approval/badge moments; `Storage.clear()`/"Forget everything" and quarantine counts unsurfaced; expansion shelf purely fictional. | various |

### Test estate

| ID | Sev | Gap |
|---|---|---|
| T1 | A | **No eval harness**: every test brain is scripted; success/loop rates per goal card per cartridge are unmeasured — exactly the phenomenon Andrew observed by hand. |
| T2 | A | The two hardest goal cards have **no proven-solvable regression run** (and are in fact unwinnable — C6). |
| T3 | B | No direct unit tests for `prompt.ts`, `memory.ts`, `decide.ts`, `budgets.ts`, `event-bus.ts`, `pack-registry.ts`, `validate-spec.ts`, persistence modules, or `guardrailsForSpec` ordering. `packs/openai` has tests in-repo but the wire/error suite must be confirmed against all seven error kinds. |
| T4 | B | No property-based tests (calculator fuzz would have caught the missing unary minus; `resolveNamed` vs generated paraphrases; repetition-streak invariants). |
| T5 | C | E2E gaps: touch/mobile, import/duplicate/bin, OUT_OF_STEPS/ERROR end cards, speed-preference effect, eviction notice, axe/contrast automation. |

## 4. Conclusions

1. **The foundation is sound and true to life.** The tick loop, native tool calling, event spine, deterministic replay, and two-tier governance mirror production agent architecture (see `19-…` §5.3's "what a good agent trace contains" — the EventBus maps almost 1:1). Day 2 should *harden and open* this foundation, not replace it.
2. **Behaviour first, features second.** The highest-value engineering hours this week are C1–C6: they turn the flagship demo ("watch it succeed once Memory is on") from flaky to reliable, and they are all cheap, testable, engine-side changes.
3. **Open the brick taxonomy before building packs.** D11 is the single structural decision that determines whether the ages 5–11 kit line (planner, monitor, radio bricks…) is an addition or a rewrite. It must land before any expansion pack is started — this is Phase A's centrepiece in `18-DAY2-ROADMAP.md`.
4. **Measure, then tune.** T1's eval harness is the project's own medicine: Craft-a-Bot preaches evaluation as governance; it should measure its own agents' success/loop rates as a CI artefact.
