> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward as the V1.0 baseline. Extended by `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` (state-of-the-art control catalogue) and `14-BRICK-REFERENCE-DESIGNS.md` §4.6 (Safety brick target design).
> This file is a verbatim copy of `docs/design/08-GOVERNANCE-GUARDRAILS.md` carried into the standalone Day 2 set; only this banner has been added.

# 08 — Governance & Guardrails

> Purpose 2 of the project: Craft A Bot as a proving ground for automated AI governance — what ships in V1, the architecture that grows into the AI Architect governance suite, and the path to exporting components for real-world use.
> Prerequisite reading: `00-PROJECT-OVERVIEW.md`, `02-AGENT-MODEL.md`.

---

## 1. Philosophy

Governance in Craft A Bot is **not a bolted-on afterthought and not a compliance chore** — it is a first-class part of the toy. The Safety Brick sits in the parts tray beside the LLM brick; the Flight Recorder runs on every flight. The strategic bet: if governance mechanisms are designed well enough to be *fun and legible in a toy*, they are legible enough to explain to a board, a regulator, or an engineering team — and the simulator becomes the place to prototype them cheaply against a deterministic world before exporting them to messy reality.

Three governance capabilities exist in embryo in V1:

1. **Observability** — the trace: complete, ordered, exportable, reproducible.
2. **Preventive controls** — guardrails that check intent *before* execution.
3. **Human oversight** — approval mode: a human in the loop for actions.

Everything later (policy engines, evaluations, red-teaming, monitoring, permissions — the AI Architect box) grows from these three roots without changing their interfaces.

## 2. The guardrail interface (`@craftabot/governance`)

Guardrails are pure, synchronous-or-async checkers over engine events and proposed steps. They cannot mutate the world or the prompt — they can only **observe, allow, deny, or pause** (this constraint keeps them auditable):

```ts
export type GuardrailVerdict =
  | { allow: true; note?: string }
  | { allow: false; reason: string; disposition: 'block-action' | 'stop-run' }
  | { pause: true; reason: string };            // → approval flow

export interface Guardrail {
  id: string;                                    // "safety/step-budget"
  name: string;                                  // "Step Budget"
  description: string;
  hooks: Array<'pre-think' | 'pre-act' | 'post-act'>;
  check(ctx: GuardrailContext): Promise<GuardrailVerdict> | GuardrailVerdict;
}

export interface GuardrailContext {
  hook: 'pre-think' | 'pre-act' | 'post-act';
  tick: number;
  spec: AgentSpec;                               // read-only
  usage: { ticks: number; inputTokens: number; outputTokens: number };
  proposed?: { kind: 'tool' | 'action'; name: string; arguments: unknown };  // pre-act
  worldState: Readonly<WorldState>;              // read-only snapshot
  history: ReadonlyArray<EngineEvent>;           // the trace so far
}
```

Engine integration (`02-AGENT-MODEL.md` §5 steps 3 & 6): the session runs its guardrail chain at each hook; **first non-allow verdict wins**; every check — pass or fail — emits `guardrail.checked` / `guardrail.tripped`, so the trace shows governance *working*, not just governance *intervening*. Denied actions are reported back to the agent in its next observation ("You tried to open the toy chest, but a safety rule stopped you: {reason}") — the agent experiences governance, which is itself a rich thing to study.

## 3. V1: the Safety Brick

One brick, three rules — deliberately the smallest set that spans the three capability roots:

| Rule | Hook | Behaviour | Real-world analogue |
|---|---|---|---|
| **Step budget** | pre-think | ≤ N ticks per run (dial: 5–50, default 30) | Cost/runaway limits |
| **Action blocklist** | pre-act | Named actions are forbidden (checkbox list, e.g. block `open`) | Permissions / capability scoping |
| **Approval mode** | pre-act | Every world action pauses for human Allow/Deny | Human-in-the-loop approval |

UI: hazard-striped brick, chest socket; its panel is the "safety control panel" (dial + checkboxes + big approval toggle). Tripping produces the proud safety-brick end card, never a scolding tone — a tripped guardrail is presented as the system *succeeding*.

Also always-on, brick or no brick (engine-level, not optional): token budget per run, request timeout, and the malformed-output re-prompt rule. Frame: the brick is *user-configurable* governance; the engine floor is *platform* governance. That two-tier frame (platform floor + configurable policy) is exactly how real deployments work and is worth teaching implicitly from day one.

> **Amended 2026-08-12 (WP3):** the engine floor now has concrete values, recorded here because it is a governance contract rather than an implementation detail — **tick budget 30** (per `02-AGENT-MODEL.md` §5; the Safety Brick's `maxTicks` dial overrides it), **token budget 100,000 per run**, **request timeout 60s**. A host embedding the engine may override all three via `SessionOptions.budgets`; the workbench never offers that, so for users the floor is exactly a floor. Exhausting either budget ends the run as `OUT_OF_STEPS` — the outcome vocabulary in `02` §5 has no separate "out of tokens" state, and inventing one would mean a new end card for a case users will almost never hit.
>
> The **malformed-output re-prompt rule** is defined narrowly: a reply counts as malformed only when it contains *neither* a tool/action call *nor* any thought text. A bot that thinks without acting is thinking, not mumbling. A call naming a tool or action the bot does not have is likewise not malformed — it is routed to the world, which refuses it in character.

> **Amended 2026-08-12 (WP8):** the `maxTicks` dial no longer *overrides* the engine floor, as the WP3 note above said it did. The dial is now enforced by the `safety/step-budget` guardrail in `@craftabot/governance`, and the floor became a pure backstop that never sits below the dial (`Math.max(30, dial)`).
>
> The reason is the two-tier frame this section already argues for. While the dial was just a budget, a run stopped by the builder's own rule and a run stopped by the platform were indistinguishable — both ended `OUT_OF_STEPS` with the same "Ran out of steps" card. Now:
>
> | Situation | Outcome | End card |
> |---|---|---|
> | Safety Brick fitted, dial reached | `STOPPED_BY_GUARDRAIL` | 🛡 "The Safety Brick did its job" |
> | No Safety Brick, floor of 30 reached | `OUT_OF_STEPS` | 😴 "Ran out of steps" |
>
> The distinction between *platform governance* and *configurable policy* is therefore something the player observes rather than something this document merely asserts. The backstop must never drop below the dial: a builder who sets 50 turns would otherwise be cut off at 30 by a limit no UI ever showed them, and the guardrail their brick installed would never fire.
>
> Two related points of definition, settled by the implementation:
>
> - **Approval mode pauses for world actions only, never for tools.** §3's table already says "every world action"; the lesson is that looking is free and *changing things* is what needs a signature — the same tools/actions split the bricks teach in `02-AGENT-MODEL.md` §2.
> - **The blocklist's disposition is `block-action`, never `stop-run`.** A forbidden action is a refused step, not a failed run: the refusal goes back into the next observation and the bot carries on, which is the behaviour §2 means when it says the agent *experiences* governance.

> **Amended 2026-08-12 (WP10.1):** the Safety Brick gains a **fourth** rule, **No repetition** (`safety/no-repetition`, pre-act, `block-action`), configured by an optional `repeatLimit` on the brick. It blocks a call — same kind, same name, same arguments — proposed more than *N* turns running.
>
> | Rule | Hook | Behaviour | Real-world analogue |
> |---|---|---|---|
> | **No repetition** | pre-act | Blocks the same call after N consecutive attempts (dial: 2–10, off by default) | Runaway/loop detection |
>
> It arrived from real play: a bot at the toy chest calling out to Teddy over and over until its steps ran out. The obvious fix — have the engine notice and nudge — was rejected deliberately. Baking it into the loop would give every bot a policy nobody chose, and would hide one of the most instructive agent failure modes behind engine machinery, which is precisely the opposite of what this simulator is for. As a fitted rule it is inspectable, optional, and its trip shows up in the trace like any other.
>
> **Off by default, and honest about a false positive.** It counts *identical* calls, so a bot genuinely walking four squares east in a straight line will trip a limit of three. A bot pressing into a wall and a bot crossing a room look the same from inside a guardrail — only the goal distinguishes them, and a guardrail does not get to see the goal. The builder turns it on and picks the number; the panel says so.
>
> It also depends on the refusal-memory fix landed alongside it: `TickMemory` now records blocked and denied attempts, so a bot can see it has been stopped before rather than rediscovering the same idea a few turns later.

## 4. The trace as a governance artefact

`07-DATA-MODEL-PERSISTENCE.md` defines the trace; governance requirements on it:

- **Complete:** every prompt, response, decision, action, world change, guardrail check — nothing off-record. If it isn't in the trace, it didn't happen.
- **Ordered & tamper-evident (lightweight):** monotonic `seq`; export includes a SHA-256 digest of the event array so a shared trace can be integrity-checked. (Full signing is deferred; the field exists: `traceDigest`.)
- **Reproducible:** `specSnapshot` + `packVersions` + deterministic world (all randomness confined to the `dice` tool, whose results are recorded) ⇒ an exported trace can be *replayed* and independently verified. Replay tooling itself is a later milestone, but V1 records everything replay needs — this is the discipline that pays for purpose 2.
- **Reviewable:** the Flight Recorder UI is the *toy* face; the exported JSON is the *audit* face. Same data.

## 5. Growth path (design now, build later)

Mapped to the AI Architect box art (guardrails, permissions, human approval, monitoring, red team, evaluation):

| Stage | Capability | Builds on |
|---|---|---|
| V1 | Safety Brick + trace + approval | — |
| V1.x | **Policy cards**: declarative guardrail configs as slottable cards (JSON: hooks + conditions + dispositions), authored, shared, and versioned like Goal Cards | `Guardrail` interface unchanged — policy cards compile to guardrail instances |
| Agent Builder era | Guardrail *packs* (content-filter checks, world-invariant checks e.g. "never take the snack from Teddy"); test & checks bricks (assertion suites run against traces) | Pack system + trace format |
| AI Architect era | Evaluation harness (run matrix: N cartridges × M goal cards × K seeds → scorecards); red-team challenge cards (adversarial goals/worlds); monitoring dashboards over stored runs (success rates, token drift, guardrail trip rates); permission models; multi-level approvals | Deterministic worlds + RunRecords + the event stream |
| Export | `@craftabot/governance` published as a standalone library: the `Guardrail` interface, policy-card compiler, trace schema + integrity tooling — usable in real agent stacks | Everything above; the package boundary that exists **now** |

The reason `governance` is a separate package from day one (`01-ARCHITECTURE.md` §2) is this last row: it must never grow a dependency on the toy UI or the Playroom — only on `core` types. CI enforces the dependency direction.

## 6. Framework alignment (reference posture, not compliance claims)

The governance features should be *describable* in the vocabulary of the major frameworks — useful for credibility, for teaching materials, and for the export story. Andrew's staging library (EU AI Act consolidated text, NIST AI RMF & companion documents, OECD AI Recommendation, etc.) is the source set. Alignment notes, not certification:

- **NIST AI RMF** functions map cleanly: *Govern* → policy cards & platform floor; *Map* → the spec + world binding (context is explicit); *Measure* → traces, budgets, future evaluations; *Manage* → guardrail dispositions, approval, stop conditions. A future doc page can present the mapping as a table for each shipped feature.
- **EU AI Act** vocabulary worth mirroring in copy and data: human oversight (Art. 14 ↔ approval mode), record-keeping/logging (Art. 12 ↔ the trace), transparency, accuracy/robustness. The simulator itself is out of scope of the Act (it controls nothing real) — which is precisely its value as a rehearsal space; never claim "compliance", claim *"lets you prototype the mechanisms these frameworks ask for"*.
- Keep a `docs/governance-mapping.md` (V1.x) tracing each feature → framework clause. Sales-pitch-free, checkable.

## 7. V1 acceptance criteria for purpose 2

1. Every run produces a complete exportable trace with digest, spec snapshot, and pack versions; the CI key-leak test passes.
2. The Safety Brick's three rules work, emit checked/tripped events, and produce their end cards; denied actions are fed back into the next observation.
3. A guardrail can be added by a pack without touching engine code (prove with a test-only guardrail in the test suite).
4. `@craftabot/governance` builds standalone with only `core` as a dependency.
5. Replaying a recorded action sequence against a fresh world instance reproduces the same final world state (determinism test).
