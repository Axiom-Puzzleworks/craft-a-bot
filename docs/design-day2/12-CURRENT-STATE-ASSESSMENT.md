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

> **Amended 2026-08-13 (WP12):** the ledger below records where each item stands after WP11 (behaviour fixes) and WP12 (test estate). Every item is now in one of four states, which is the WP12 exit condition: **fixed**, **covered** (a test would catch a regression), **test-first** (a test asserting the desired behaviour exists and is marked `it.fails` until the owning WP lands), or **blocked** (the fix has no code to test yet, recorded rather than faked).
>
> | ID | State | Where it stands |
> |---|---|---|
> | D1 | **test-first** | `safety-charter.test.ts` asserts a post-act `stop-run` ends the run, and pins the current behaviour beside it. E1, WP13. |
> | D2 | blocked | `session.deliverInput` / `declareOutcome` do not exist, so there is nothing to test. E2, WP13. Free Play now ends SUCCESS on `celebrate` (WP11), so the card is no longer un-winnable while we wait. |
> | D3 | **fixed + covered** | `shape-drift.test.ts` round-trips a fully-populated value of every mirrored shape. It immediately found that `Observation.summary` was missing from the Zod mirror, so **every re-imported trace was silently losing the memory summary** — added in the same change. The structural fix (one definition) is still E5, WP13. |
> | D4 | **test-first** | `ids.test.ts` pins qualified pack ids (passing), and marks both the unqualified world action/sense ids and the silent `wireName` collision as failing-until-E6. |
> | D5 | covered | Memory's window arithmetic, copy-on-read and absence behaviour are pinned in `brick-charters.test.ts`; the loose `windowSize` signature is documented there as schema-guarded until E7. |
> | D6 | blocked | The missing `RunRecord` fields do not exist yet. E8, WP13. |
> | D7 | blocked | No `migrateTraceFile` to test. The trace fixture pair is in place and ready for it. E8, WP13. |
> | D8 | accepted risk | Guardrail-context copying is a performance defect with no correctness symptom; measuring it belongs with E9, WP13. |
> | D9 | blocked | No agent identity to assert. E10, WP13. |
> | D10 | **part fixed, part test-first** | `celebrate` now drives the Free Play predicate (WP11). `dead-config.test.ts` audits every `AgentSpec` field against the schema and proves 15 of 16 reach the engine; `customGoalText` is marked failing-until-fixed. `maxTicks` having no ceiling is marked failing-until-WP14. Cartridge `defaults` and `retryAfterMs` are blocked on WP14/E11. |
> | D11 | blocked | The brick contract is the WP14 deliverable. |
> | D12 | blocked | No transcript strategy to test. E7, WP15. |
> | D13 | covered | `ids.test.ts` proves two packs with the same local tool name register cleanly; semver evaluation itself is WP21's conformance kit. |
> | D14–D17 | out of scope | Workbench defects, owned by WP16's P0 UX wave. |
> | T1 | blocked | The eval harness is WP19. |
> | T2 | **fixed** | `solvability.test.ts` (WP11) proves every card winnable inside its budget, and the expert card unwinnable without a bigger one. |
> | T3 | **covered** | Direct unit charters now exist for `memory`, `prompt` (via the drift and dead-config suites), `budgets`, `guardrailsForSpec` ordering, and the approval flow's re-entrant edges. |
> | T4 | **fixed** | `calculator-properties.test.ts` is the first property/fuzz suite, seeded for reproducibility. It found the missing unary minus on its first run — exactly what T4 predicted — which is now fixed. `resolveNamed` got its paraphrase corpus in WP11. |
> | T5 | out of scope | E2E gaps, owned by WP16–WP17. |
>
> Two notes where the register itself had gone stale: `guardrailsForSpec` ordering was **already** unit-tested directly (`13-…` §4.6 says otherwise), and `test-state.ts` is **not** "imported by nothing" (`13-…` §4.5) — the action, naming and sense suites all use it.

> **Amended 2026-08-14 (WP15):** **D5 and D12 are fixed**, which closes the last two engine-and-governance items and with them Phase A.
>
> | ID | State | Where it stands |
> |---|---|---|
> | D5 | **fixed + covered** | `MemoryStrategy` and `PromptStrategy` exist, with `window-v1` and `sections-v1` as the defaults (E7). `strategies.test.ts` proves each seam by handing the session a strategy of its own and watching it get used — the only test that distinguishes a seam from an interface-shaped name in front of a hard-coded implementation. `createMemory` now takes `MemorySlotConfig`; the loose `windowSize` is deliberate and explained in the E7 amendment to `14-…` §3. |
> | D12 | **fixed + covered** | `transcript-v1` composes the real function-calling conversation, and `chatMessageSchema` gained the `toolCalls` it was missing — without which a "transcript" would have been rejected by every provider, which is D12 restated rather than closed. `transcript-strategy.test.ts` holds well-formedness in both directions over prompts real runs composed, including a refused call and a mumbled tick. |
>
> Two things this turned up that were nobody's stated defect:
>
> - **The dead-config audit could not have seen a rendering-only field.** It ran one tick, where the memory window is empty and every prompt strategy composes the same thing, and it serialised messages as role-and-content, which drops the tool protocol entirely. Both are fixed; the audit is strictly stronger for every future field, not only this one.
> - **A first attempt at the leaflet-coverage exemption passed against a deliberately broken panel.** It collected control elements and read their text, and a `Rocker`'s label is a *sibling* of its checkbox — so it saw a switch with no words beside it and accepted whatever it was called. Caught by injecting the control it claimed to forbid. Same family as WP16's stale-preview false green: the test ran, went green, and was measuring nothing.

### Engine & governance

| ID | Sev | Defect | Where |
|---|---|---|---|
| D1 | A | Post-act guardrail verdicts silently discarded — the third hook can neither block nor stop. No test would catch a post-act `stop-run` doing nothing. | `agent-session.ts` (JUDGE step) |
| D2 | A | `WorldInstance.receiveInput` unreachable through `AgentSession` (world never exposed) — the Hearing channel has **no input path**; likewise no API to end Free Play as `SUCCESS` (only `STOPPED_BY_USER`). | `agent-session.ts` |

> **Amended 2026-08-14 (WP17 slice b):** both halves have a way through now. `session.deliverInput` is surfaced as "Say something to your bot" on the play route (`16-…` §2.6), and `session.declareOutcome` as the "Goal achieved!" button on Free Play (§2.5). Hearing is **off by default** — the visor opens sight and compass — so the control explains itself rather than sitting greyed out, and it distinguishes the two ways a bot ends up deaf: no brick fitted, or a brick with its ears switched off. Those look identical from the play screen and are entirely different jobs.

| D3 | B | `RunOutcome` and verdict/response/observation shapes triple-maintained (TS interface + Zod mirror + records enum) with only comments guarding drift. | `types/` vs `schemas/` |
| D4 | B | Playroom action/sense ids unqualified (`move`, `sight`) against the `{packId}/{localId}` convention; `wireName()` prefix-stripping lets same-local-name tools shadow each other; a tool wire name colliding with an action id resolves as the action. | `ids.ts`, `agent-session.ts` |
| D5 | B | No memory or prompt strategy interfaces — ring-buffer truncation and the prompt template are hard-coded; no summarisation/alternative-memory path. `windowSize` literal-typed in the spec, plain `number` in `createMemory`. | `memory.ts`, `prompt.ts` |
| D6 | A | Trace audit gaps: effective budgets, provider id and resolved wire model absent from `RunRecord`; `think.started` reports the cartridge id, not the model; `ToolResult.data` dropped from `tool.executed`; `memory.updated.notebookUpdated` misreports. The governance artefact under-records. | `trace-file.ts`, `agent-session.ts` |
| D7 | B | Kit files have a migration table; **trace files and records have none** — the long-lived governance artefact lacks forward migration. | `trace-file.ts` |
| D8 | C | `GuardrailContext` copies full history + fresh world snapshot per check per hook — O(events²) over a run, inflated by `think.token`. | `agent-session.ts` |
| D9 | B | No agent identity anywhere (events carry `runId` only); `PlayroomState.bot` singular; `observe/perform` take no agent handle — multi-agent is structurally distant. | `core/types`, `state.ts` |
| D10 | C | Dead/decorative config: `customGoalText` never reaches the prompt; `celebrate` writes state nothing reads; `CartridgeDefinition.defaults` never read by the engine; `ProviderError.retryAfterMs` unused (no retry/backoff); `safety.maxTicks` unbounded above. | various |

> **Amended 2026-08-14 (WP17 slice b):** `customGoalText` reaches the prompt. It was captured on the spec from WP5, stored, and shown back on the card holder, so Free Play looked complete from every angle except the only one that mattered — the bot was told the card's printed wording and never the child's. `composeSystemMessage` prefers the written goal (whitespace does not count as writing); the card still supplies the trace record and the success condition. WP12's dead-config probe for this field was `it.fails` with a comment saying it would start passing when the prompt carried the text: it now does, and the probe has moved into the live table with the rest.

| D11 | B | Brick kinds and config schemas **closed in core** (fixed six-slot object, closed `kind` enum, `BrickDefinition` carries no config schema) — "brick" is a taxonomy, not an extension point. Blocks every expansion pack that adds a brick. | `agent-spec.ts`, `pack-manifest.ts` |
| D12 | B | No conversational tool-result protocol: `ChatMessage` supports `role:'tool'`/`toolCallId` but `composePrompt` never uses them; the model never sees a well-formed function-calling transcript. Pedagogically defensible for V1; must become a selectable strategy. | `prompt.ts` |
| D13 | C | Pack `requiresCore`/`requires.packs` version strings stored but never semver-evaluated (presence check only). **Closed 2026-09-03 (WP52, `40-DEBTS.md` §4.2): evaluated by the registry, the kit importer and the conformance kit.** | `kit-export.ts` |

### Workbench

| ID | Sev | Defect | Where |
|---|---|---|---|
| D14 | A | **No run history UI.** Runs + events fully persist (cap 50, pinning supported in storage) but nothing lists, reopens or replays them; a trace is only visible while still on the play page. | routes |

> **Amended 2026-08-14 (WP16 slice e):** the premise here was wrong in a way worth keeping on the record. "Runs + events fully persist" was never true — `putRun` was being handed reactive `$state` proxies and IndexedDB rejected every write with "could not be cloned". The rejection surfaced only as an unhandled promise and no test had ever read the `runs` store back, so a scrapbook with nothing in it looked like a missing page rather than a missing write. Both halves are fixed: records are snapshotted, and written from `run.started` rather than only at the end.

| D15 | B | `toRunRecord` hardcodes `mode:'step'`; mid-run `setSpeed` is a silent no-op; `evictOldRuns` notice never shown; `trace-recorder.ts` incremental persistence is dead code (mid-run reload silently loses the run). | `play/+page.svelte`, `session.svelte.ts` |
| D16 | B | No global nav (Settings unreachable from Shelf); "Bin" deletes without confirmation; play route has no aria live region; EndCard/ApprovalCard don't trap focus; badge toast shows the badge **id** not its name. | various |
> **Amended 2026-08-14 (WP17 slice d):** `boxArtSeed` is rendered — a deterministic sticker on each box lid (`16-…` §2.3). The sound half of this entry is partly addressed too: `badge`, `ask` and `stopped` cues exist with their sites, leaving the guardrail/approval/badge gap from four cues down to none. `Storage.clear()` and the quarantine counts remain unsurfaced.

| D19 | B | **The harness would not start on Node 24** (found 2026-09-05, WP56 stage B; fixed there). `packs/geap/src/fixtures/eval/index.ts` (WP51) imported six JSON fixtures without `with { type: 'json' }`; Node 22+ refuses a JSON import without the attribute, so `craftabot` — every command, since the registry loads every pack — died at import with `ERR_IMPORT_ATTRIBUTE_MISSING`. Every other JSON import in `packages/` carried the attribute; unit tests never saw it because vitest transforms JSON itself. A lint rule for the attribute would make this class impossible; not written here. | `packages/packs/geap/src/fixtures/eval/index.ts` |
| D18 | B | **Solo runs' summaries never reached storage** (found 2026-09-05, WP56 stage A; fixed there). The Play route's `persistRun` handed `persistRunSummary` the `$state` proxy of the session's events; IndexedDB refused to clone it (`DataCloneError`); the write was fire-and-forget, so the rejection was unhandled and unread, and `ensureRunSummaries` folded the summary on every Workshop read — every screen was right and the store was empty. `$state.snapshot` at the call, and the end card's "Saved" now waits on the write, so a repeat would fail a spec. The lesson is D15's again: a write nothing awaits is a write nobody knows failed. | `routes/play/[agentId]/+page.svelte` |
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
