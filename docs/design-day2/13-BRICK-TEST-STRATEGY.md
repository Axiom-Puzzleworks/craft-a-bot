# 13 — Brick Test & Validation Strategy (Workstream 1)

> The systematic plan for testing every brick's design, configuration, interactions with other bricks, and behaviour in the sandbox — so we can state with confidence that each brick is well designed in its current form, well specified, modular, re-usable and extendable.
> Prerequisite reading: `12-CURRENT-STATE-ASSESSMENT.md` (the defects this plan must catch), `02-AGENT-MODEL.md` (baseline), `14-BRICK-REFERENCE-DESIGNS.md` (the target the tests defend).

---

## 1. What "confidence in a brick" means

A brick passes Day 2 review when all five statements hold, each backed by named evidence:

| Claim                                                                                                   | Evidence required                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Well designed** — its behaviour matches its teaching story and its real-world analogue                | Design-review checklist (§6) signed off against `14-…`; no open A-severity defects touching it                          |
| **Well specified** — its config schema is versioned, validated, documented, and every field is consumed | Schema round-trip + rejection fixtures; "no dead config" audit test (§4 L0)                                             |
| **Modular** — it can be absent, present, or reconfigured without special-casing elsewhere               | Brick-matrix tests (§4 L2) green for every on/off/value combination                                                     |
| **Re-usable** — a second pack could ship a variant against the same contract                            | Pack-conformance kit (§7) passes for a test-only variant brick                                                          |
| **Extendable** — adding capability is additive, not surgical                                            | A "toy extension" exercise per brick (§6) implemented behind the open-brick contract in `14-…` §2 without touching core |

## 2. The test pyramid (L0–L5)

The suite is organised in six layers. L0–L3 are deterministic and CI-blocking; L4 is the new behavioural-eval layer (scheduled, budgeted); L5 is governance assurance.

| Layer | Name                     | Runs                | Brains                 | Purpose                                                                                                                                                                                                           |
| ----- | ------------------------ | ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0    | Schema & spec            | CI                  | —                      | Zod round-trips, rejection fixtures per version, migration tables, id-convention lint, **dead-config audit** (every spec field reachable in runtime code)                                                         |
| L1    | Brick unit               | CI                  | —                      | Each brick's runtime module in isolation: memory truncation, prompt sections, decide parsing, budgets arithmetic, each guardrail as a pure function, each tool, each world action/sense/predicate (table-driven)  |
| L2    | Brick interaction matrix | CI                  | scripted               | `brick-matrix.test.ts` extended: every brick on/off × every valued control, plus **pairwise interaction charters** (§5) — the combinations where bricks genuinely couple                                          |
| L3    | Sandbox system runs      | CI                  | scripted               | Full-stack goal-card runs via the harness: **a scripted optimal solution per goal card** (solvability proofs), every outcome reachable, golden-trace byte-stability, all 19 event types produced and nothing else |
| L4    | Behavioural evals        | nightly / on-demand | mock-noisy + live LLMs | The eval harness (§8): success/loop/cost metrics per goal card × cartridge × seed. This is where "the bot doesn't perform well" becomes a number that can regress                                                 |
| L5    | Governance assurance     | CI + release        | both                   | Guardrail efficacy suite, trace completeness/digest/replay verification, key-leak gate, determinism proof, approval-flow integrity                                                                                |

> **Amended 2026-08-13 (WP12):** L0–L2 are built. Where the plan below and the code disagree, the code is right and the reason is here.
>
> - **The fixture set is the contract, so it is driven uniformly.** `core/src/schemas/fixtures.test.ts` runs every boundary schema through the same four checks (parse valid, reject invalid, round-trip, re-parse stable) plus a key-leak check on the two shareable artefacts, and asserts the *set itself* is complete — a new boundary schema with no fixture fails the suite.
> - **The drift guard earns its place immediately.** §3's single-source-of-truth check was specified as a type-level assertion. Types alone would not have caught what was actually wrong: `Observation.summary` existed on the interface and not on the Zod mirror, so Zod deleted it from every re-imported trace. The suite therefore round-trips *fully-populated values* as well as comparing unions — the value-level half is the half that finds dropped fields.
> - **The dead-config audit lives in `pack-starter`, not `core`.** `core` cannot import `governance`, so an audit there could not watch the Safety brick consume anything. In the pack it sees the whole stack and covers all sixteen spec fields.
> - **Two claims in this document were already out of date** and are corrected in place below: `guardrailsForSpec` ordering *is* unit-tested directly, and `test-state.ts` *is* used by the action, naming and sense suites.
> - **Test-first is spelled `it.fails`.** Five assertions describe behaviour the engine does not have yet (D1, D4 ×2, D10 ×2). Each states the desired behaviour, is marked `it.fails`, and sits beside a test pinning what happens today. When the owning WP lands, the desired test starts passing, which makes `it.fails` itself fail — so the marker cannot be forgotten.

## 3. L0 — Schema & specification tests

- Round-trip + rejection fixtures for `AgentSpec`, `KitFile`, `TraceFile`, `PackManifest`, `AgentRecord`, `StoredEvent` — one valid and one invalid fixture **per historical version**, accumulating forever (the fixture files are the compatibility contract).
- **Migration tests for traces**, not just kits (closes D7): `migrateTraceFile` table with a v1 fixture from the golden trace.
- **Single-source-of-truth test** (closes D3): a compile-time/`expect-type` check that `RunOutcome`, `GuardrailVerdict`, `ChatResponse` and `Observation` derive from one definition; the duplicated mirrors deleted per `14-…` §7.
- **Id-convention lint** (closes D4): every registered content id matches `{packId}/{localId}`; registry rejects unqualified world action/sense ids after the migration in `14-…` §7.3; `wireName` collision test (two packs, same local tool name → explicit error, not shadowing).
- **Dead-config audit**: a test enumerating `AgentSpec` fields and asserting each is consumed by the engine (kills `customGoalText`-class regressions; D10).

## 4. L1 — Per-brick unit charters

For each brick: existing coverage, and the Day 2 additions. (New tests marked ●.)

### 4.1 Brain (LLM) brick

Existing: temperature/maxTokens/personality reach `ChatRequest` (brick-matrix); malformed re-prompt; provider error kinds; timeout abort.
● Cartridge defaults honoured once `14-…` §4.1 lands (fit-time copy vs engine fallback — pick one, test it). ● `think.started` carries wire model + provider id (D6). ● Reasoning-effort mapping per cartridge asserted against the wire body. ● Empty-`cartridgeId` half-built state through validate→GO. ● Token-starvation scenario: scripted `length` finishes with empty text → exactly one re-prompt, correct feedback, correct usage accounting.

### 4.2 Memory brick

Existing: window presence/growth/cap; notebook gating; refusal-memory entries.
● `createMemory` accepts only spec-legal window sizes (type + runtime). ● Summary content contract: entries carry observation summary **with position/direction** once C1's fix lands. ● Absence contract: without the brick, prompt has exactly 2 messages _and failure feedback still appears in "Right now:"_ (C2's fix — this is the loop-killer test). ● `memory.updated.notebookUpdated` truthful (D6). ● Property test: window never exceeds N; oldest-first order stable.

### 4.3 Tools brick

Existing: per-tool offer/withhold/execute; unknown-tool skip; notebook dependency; calculator/dice/notebook/manual behaviour.
● Calculator property fuzz (unary minus, precedence, division-by-zero, junk) — fix or document each surprise. ● `ToolResult.data` present in `tool.executed` (D6). ● Wire-name collision rejection (D4). ● Tool risk-tier metadata (`14-…` §4.3, shipped WP24) flows to approval tiering — proved for actions (`brick-matrix.test.ts`'s approval-fatigue test); tools themselves stay `'observe'` in starter content bar `notebook_write`, so there is no tool-side approval case yet to test.

### 4.4 Sense brick

Existing: each channel individually; progress-line gated on sight; senseless message.
● Verbatim-format snapshot tests per channel (sight nine-liner, compass, clock, hearing drain semantics). ● **Hearing input path end-to-end** once `session.deliverInput()` exists (D2). ● Observation `summary` includes bearings/coordinates after C1's fix, with a regression test that the summary alone suffices for a scripted brain to navigate back to a seen item. ● Clock semantics: world tick vs session tick divergence documented and asserted.

### 4.5 Actions brick

Existing: every action granted/refused both ways; unknown-action world routing; narration paths.
● Table-driven legality matrix per action × world state (the `test-state.ts` helpers exist and are imported by nothing — put them to work). ● `resolveNamed` paraphrase suite: a corpus of ~50 phrasings ("blue block", "the A block", "key", "chest") with expected resolve/ambiguous/miss outcomes; extend resolution rules until the corpus passes (C4). ● `celebrate` ends Free Play as SUCCESS once `14-…` §4.5 lands (D2/D10). ● Adjacency teaching: bump narration includes the reach rule hint (C8).

> **Amended 2026-08-13 (WP11):** the paraphrase corpus lives in `world/naming-corpus.test.ts` — 58 rows across items, people and containers, all passing. Writing it first paid immediately: it caught the bare word "block" resolving _confidently to the blue one_ through an id-normalisation quirk, which is the silent-wrong-object failure C4 exists to prevent, and which the pre-existing tests had encoded as correct. The rule the corpus forced is that an article never ends a phrase, so `block-a`'s trailing letter survives normalisation. Celebrate-ends-Free-Play and the bump's reach rule are also done; the legality matrix is still outstanding and moves to WP12.

### 4.6 Safety brick

Existing: all four rules as pure functions; compiled e2e via `guardrailsForSpec`; outcomes and end cards; refusal memory.
● `guardrailsForSpec` **ordering and conditional inclusion unit-tested directly** (currently only e2e). ● Post-act hook honoured (D1): a post-act `stop-run` guardrail ends the run — the missing test that let the bug survive. ● `maxTicks` upper bound enforced (D10). ● No-repetition v2 semantics per `14-…` §4.6 (windowed non-consecutive detection; movement exemption) with the two documented failure cases as fixtures. ● Approval re-entrancy: `stop()` during await; double `resolveApproval`; approval + play-mode interleaving (T-gap).

## 5. L2 — Interaction charters (where bricks couple)

The full 2⁶ on/off space is covered cheaply by the existing matrix; these named charters cover the couplings that carry meaning:

| Charter                | Interaction under test                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Memory × Sense         | Summary quality determines navigation: scripted brain must relocate a previously-seen item using only the memory window  |
| Memory × Safety        | Refusals recorded; no-repetition depends on refusal memory; blocked attempt visible in next prompt                       |
| Tools × Memory         | Notebook tools appear/disappear with notebook flag; notebook lines injected; write-then-read round trip                  |
| Actions × Safety       | Blocklist refuses before world; approval pauses only actions; both fed back and remembered                               |
| Brain × Safety         | Step-budget off-by-one (N tick.started, N−1 thinks) asserted as _intended_ and displayed correctly by the gauge          |
| Sense × World          | Progress lines gated on sight; compass never leaks item/character bearings (anti-cheat regression)                       |
| Actions × World × Goal | Every goal card's predicate flips only on the intended world state (table-driven per predicate, 100% branch target)      |
| All × Absence          | Any single brick absent → run still completes with the documented degraded behaviour and correct build-checks beforehand |

## 6. Design-review checklist (per brick, human + Claude review, recorded in `14-…`)

1. Teaching story and real-world analogue stated and still true of the implementation.
2. Config schema: versioned, bounded, defaults sane, every field consumed, every control labelled in both registers (toy + real).
3. Events emitted are sufficient to reconstruct the brick's behaviour from the trace alone.
4. Absence behaviour defined and delightful (designed failure, not crash).
5. Extension exercise: sketch one expansion-pack variant (e.g. a summarising Memory, a vision-only Sense) against the `14-…` §2 contract; note anything that would require touching core — that's a contract gap to fix now.
6. Multi-agent readiness notes: what changes when two bots share the world.

## 7. Pack-conformance kit

A published test suite (`@craftabot/pack-testkit`) any pack must pass — the mechanical half of "re-usable":

- Manifest validates; ids qualified and collision-free; semver ranges evaluated (D13).
- Every world: layouts load; actions have Zod+JSON-schema pairs that agree; illegal actions never throw and never mutate; determinism (replay action list ⇒ identical state, byte-stable snapshots); every predicate reachable by a scripted solution; narration strings present for every failure path.
- Every tool: executes offline; deterministic under injected random; output non-empty; schema honest.
- Every guardrail: pure over `GuardrailContext`; verdict shape legal; description present.
- Every cartridge: catalogue entry complete; defaults consumed (post-`14-…` §4.1).
- Golden-trace: a scripted run in the pack's world produces only catalogued event types.

> **Built 2026-08-16 (WP21).** `@craftabot/pack-testkit` ships as two halves: a plain assertion
> library (`checkManifest`/`checkWorld`/`checkTool`/`checkGuardrail`/`checkCartridge`/`checkGoldenTrace`,
> each returning `ConformanceIssue[]` rather than throwing) and a Vitest adapter
> (`describeConformance`) that wraps whichever categories a fixture supplies in `it()` blocks. A pack
> opts in with a small fixture — example tool args, a scripted action sequence per world script, a
> configured guardrail plus one representative context — the same "hand the harness data, not code"
> shape `pack-starter/testing` already used for WP19's eval harness. `starter` and `openai` both pass
> it (`contract.test.ts` in each), and the kit's own suite proves it rejects a deliberately broken
> fixture pack usefully — a bad verdict shape, a mutating guardrail, a throwing tool, an unqualified
> id, an illegal action that mutates state, a script that does not replay deterministically, an
> unreachable predicate — each with a message naming the offending id.
>
> **Four things this section did not anticipate**, three of them gaps between this list and what the
> engine actually does today, found by trying to check against it rather than by reading the code:
>
> 1. **"Semver ranges evaluated (D13)" is not built anywhere.** `requiresCore` and kit-file
>    `requires.*` are stored as non-empty strings and never parsed — there is no evaluator in `core`
>    to call. `checkManifest` checks what exists: the metadata shape parses, every id is qualified
>    `{packId}/{localId}`, and registering the pack does not collide. Range evaluation stays an
>    unchecked bullet until D13 itself lands; faking it would have meant asserting behaviour the
>    codebase does not have.
> 2. **"Cartridge defaults consumed (post-`14-…` §4.1)" is gated on work that has not shipped.**
>    Nothing reads `.defaults.temperature` or `.defaults.maxTokens` — `catalogue.ts`'s own Penny
>    Thinker comment says so. `checkCartridge` validates the catalogue entry's shape and stops there.
> 3. **"Actions have Zod+JSON-schema pairs that agree" cannot be checked as a schema comparison.**
>    `WorldActionDefinition.parameters` carries only the JSON Schema `z.toJSONSchema()` derived at
>    registration; no pack is required to expose the Zod schema it came from, and none does. The
>    check that shipped is a black-box proxy instead: it compiles each action's advertised schema
>    with `ajv` and confirms a fixture's own legal call satisfies it. That catches a schema that lies
>    about what a real call needs, which is most of what "agree" was protecting against, without
>    requiring a contract change to expose a schema `14-…` §2 never promised.
> 4. **"Illegal actions never mutate" needed a narrower reading than the words**, discovered
>    against the Playroom itself. `world/playroom.ts`'s `perform` advances `state.tick` on every
>    call, legal or not — turns are turns even when wasted, and that is a deliberate, documented
>    design, not a violation. Failing every illegal-action fixture on the clock ticking forward would
>    have made the check useless for the one world V1.0 ships. `WorldConformanceFixture` gained
>    `volatileStateKeys`, a pack-named allowlist of top-level `WorldState` keys a turn may change
>    regardless of legality; the mutation check excludes them and nothing else.

## 8. L4 — The behavioural eval harness (`@craftabot/evals`) — the new build

The instrument Andrew's manual trials were approximating. Design:

- **Runner:** a matrix executor over `{goalCard × cartridge × brickConfig × seed}`; each cell runs `createSession` to completion and scores the trace. Deterministic worlds + injected randomness make cells reproducible; live-LLM cells record full traces for replay.
- **Brains:** three tiers — `scripted-optimal` (solvability floor, CI), `scripted-noisy` (optimal plan with injected error rates: misnamed entities, wasted moves, premature celebrates — CI, catches information-design regressions without API cost), `live` (real cartridges, nightly/on-demand behind an env key, spend-capped).
- **Metrics per cell** (all computable from the trace alone — the trace is the interface):
  - `outcome`, `ticksUsed`, `tokensIn/Out`, estimated cost;
  - **loop score**: longest identical-signature streak + count of repeated failing calls (the C3 phenomenon, measured);
  - **wasted-tick ratio**: ticks with failed/blocked/mumbled outcomes ÷ total;
  - naming-miss count (world narrations matching the miss/ambiguity strings);
  - guardrail trips by rule; approvals requested/denied;
  - time-to-first-productive-action.
- **Baselines & gates:** per goal card an expected band, e.g. Say Hello ≥95% success ≤8 ticks (Quick Thinker, 20 seeds); Snack ≥70%; post-C6-fix Tidy ≥60%, Locked Chest ≥40%; loop score median ≤3. Nightly report diffs against the stored baseline; regressions fail the report, not the build (live models drift — the gate is on _our_ changes via scripted-noisy, the live numbers are telemetry).
- **Output:** an `EvalReport` JSON (schema-versioned, stored like traces) + a markdown scorecard in CI artefacts. The professional mode's Eval Matrix screen (`17-…` §5.4) renders the same records — build the data model once.

> **Built 2026-08-15 (WP19).** `@craftabot/evals` ships the runner, both scripted tiers, the metrics fold, the `EvalReport` schema, the baseline gate and the scorecard. Scripted baselines are recorded and committed; **the live lane is not run** — see below.
>
> **Three things this section did not anticipate.**
>
> 1. **"Six cards × three cartridges" is a live-only requirement.** Six is exactly right — the pack ships seven goal cards and one is flagged `expert`. But the pack ships *no cartridges*: the three are Quick, Deep and Penny Thinker in the OpenAI pack, so those 360 runs are real API calls against somebody's key. The scripted matrix (6 cards × 2 tiers × 20 seeds = 240 cells) is what CI can run on every commit, and it is a different measurement, not a cheaper version of the same one.
>
> 2. **The scripted-optimal plans had to move.** They lived in `solvability.test.ts`; the optimal tier *is* that solvability floor, so a second copy would have given the matrix a floor nothing had proved. They are now data in `pack-starter`'s `session/plans.ts`, reachable through a new `@craftabot/pack-starter/testing` subpath.
>
> 3. **The naming-miss metric matches prose, and that is a real weakness.** Ambiguity is structured — `ActionResult.didYouMean` has carried the candidates since WP16 §2.4 — but nothing equivalent exists for a name that matched *nothing*, so a miss is recognised by matching the narration. It is mitigated by a test that drives a real bot into a real miss, so a reworded refusal fails loudly rather than silently zeroing the metric. The actual fix is a structured field on `ActionResult`, which is an engine change and an event-catalogue amendment.
>
> **What the scripted numbers say**, 20 seeds at default noise: optimal wins every card; noisy scores say-hello 80%, snack 45%, tidy 20%, locked-chest 15%, sums and free-play 100%, expert 0%. The gradient is the finding — the same 12% error rate costs almost nothing on a four-step card and everything on a thirteen-step one, because a wasted move desynchronises the plan and every later step compounds it.

## 9. L5 — Governance assurance suite

- **Trace completeness:** for a fully-instrumented run, assert the trace answers the audit questions: what model, what budgets, what policies, what was proposed/blocked/approved, what changed (requires D6 fields).
- **Digest & tamper:** mutate one event → `verifyTraceDigest` fails; export→import→verify round trip.
- **Replay:** recorded action sequence against a fresh world ⇒ identical final state and identical predicate history (08 §7.5, kept green forever).
- **Key-leak gate:** existing CI test retained; extended to eval reports and any new export surface.
- **Guardrail efficacy:** for each rule, a scripted adversarial brain that would violate it → assert the violation is impossible and the trace shows checked+tripped (the "prove the brake works by driving at the wall" suite).
- **Approval integrity:** no path performs an action between `approval.requested` and `approval.resolved`.

## 10. Sequencing & exit criteria

Order of work (mirrors `18-DAY2-ROADMAP.md` Phase A): (1) L0 fixtures + solvability proofs — they pin current behaviour before refactors; (2) L1/L2 gap-fill alongside each `14-…` engine fix (test lands in the same PR as the fix, per `10-CODING-STANDARDS.md`); (3) the eval harness skeleton with scripted-noisy brains; (4) live-model nightly once budgets/keys are set; (5) pack-conformance kit extracted once starter passes it.

**Exit criteria for the "rock-solid baseline" gate:** every §3–§7 suite green; every goal card has a passing scripted-optimal solution within budget; every D-register item has either a fix + regression test or an explicit accepted-risk note in `14-…`; eval baselines recorded for all six cards × three cartridges × 20 seeds; scorecard published in the repo.
