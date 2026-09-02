# 36 — The trace bundle and multi-agent completion (WP48)

> **Status:** design of record for WP48 (`27-DAY3-ROADMAP.md` Phase K, its last row), written 2026-09-02 against the codebase after WP47. This is the map for `26-TARGET-DESIGN-V3.md` §6.7 (the bundle) and §6.12 (the group observers, the Hearing queue); where the two differ, §7 below says why and `26-…` §12 gets a dated note when the stage lands.

---

## 1. Purpose

Three things `23-MULTI-AGENT-DESIGN.md` left recorded as undone. A group episode has no export: the Audit Centre lists solo runs only, and a member's trace, picked on its own, says nothing about the episode it was part of (§4.7's WP34 amendment). A monitor can watch one robot but not a group: the Watchbot brick sits on a chassis and reads one session's history, while the merged stream, where a duo's trouble shows, has no reader with a hand on the chokepoint (§6.12's "cross-agent monitor"). And the Hearing channel's queue is one per room: a message delivered between two robots' turns is heard by whichever observes first, never both (§9's risk row). WP48 closes all three — a bundle with a digest over the whole, group observers who contribute group guardrails, and a per-seat Hearing cursor on the pattern Radio already uses.

---

## 2. Where the code actually is

**`core/src/schemas/trace-file.ts`** — `traceFileSchema { format, formatVersion: 2, run, events, evaluations?, traceDigest }`, `computeTraceDigest(events)` (SHA-256 over the events' JSON); **`core/src/persistence/trace-export.ts`** — `buildTraceFile(run, events, { secrets, evaluations })`, `verifyTraceDigest`. **`core/src/session/session-group.ts`** — `createSessionGroup(deps)`: one root world, a facade per member, a merged `events` bus and `mergedHistory`, `groupGuardrails` run at the chokepoint before each member acts (`checkGroupGuardrails`, through `runGuardrailChain`, emitting `guardrail.checked`/`guardrail.tripped` as group events), `deliverInput(text)` to the live member's facade. **`core/src/types/session-group.ts`** — `CreateSessionGroupDeps { members, registry, goalCardId, groupGuardrails?, options? }`. **`packs/monitor/src/rules.ts`** — `watcher(id, description, look(history))` returning `{ allow: true, note }` at `post-act`; `rulesFor(watchFor)`. **`packs/starter/src/world/senses.ts`** — Hearing drains `state.heard`; Radio reads through `state.radioCursors[agentId]`. **`routes/workshop/export/+page.svelte`** — a solo-run picker; **`routes/workshop/runs/[runId]`** — the integrity badge over `buildTraceFile` + `verifyTraceDigest`, skipped for a group. **`harness/src/commands/bundle.ts`** — `bundleRun(storage, runId, secrets)`.

---

## 3. Design principles

1. **A bundle is trace files plus a digest over them.** Every member trace inside is a complete `TraceFile` a reader already knows; the group section carries the merged stream and its own digest; the bundle digest is over every digest inside, in order.
2. **Verification recomputes.** `verifyBundleDigest` re-hashes every member's events, the merged events and the bundle — a changed byte anywhere fails.
3. **An observer is a reader with the group's ear.** `options.observers` subscribe to the merged bus; what they contribute as policy goes through `groupGuardrails` and the chokepoint that already exists.
4. **Hearing follows Radio.** A per-seat cursor into an append-only `heard`; the solo path is the seat `'solo'`, so a solo run reads exactly as before.

---

## 4. The design

### 4.1 The bundle (core, stage A)

```jsonc
{ "format": "craftabot-bundle", "formatVersion": 1, "exportedAt": "…", "exportedBy": "…",
  "runs": [ /* TraceFile v2 each */ ],
  "group": { "record": GroupRunRecord, "events": [ /* the merged stream */ ], "groupDigest": "sha256 over the merged events" },   // optional
  "evaluations": [ /* EvaluationRecord */ ],
  "campaign": { "id": "…", "cellId": "…" },                                    // optional
  "bundleDigest": "sha256 over JSON of [runs[].traceDigest…, group.groupDigest ?? null, evaluations[].id…]" }
```

`buildTraceBundle({ runs: [{ run, events }], group?, evaluations?, campaign?, secrets, exportedBy })` builds each member through `buildTraceFile` (so redaction and per-run digests are the ones the reader knows), the group section with `computeTraceDigest` over the redacted merged events, and the bundle digest. `verifyBundleDigest(bundle)` recomputes all three levels. Both live in `core/persistence/bundle.ts` beside `buildTraceFile`.

### 4.2 Group observers (core, monitor — stage A)

`CreateSessionGroupDeps.options.observers?: Array<(events: EventBus, group: { groupRunId: string }) => Unsubscribe>` — installed on the merged bus before any member starts, detached when the group finishes. `@craftabot/pack-monitor` gains `createGroupWatchbot({ watchFor, refusalLimit? })` → `{ observe, guardrails }`: `observe` emits a `brick.state` note on the merged bus when a watched rule's condition holds over the merged history (`slot: 'safety', kind: 'monitor/group-watchbot'`), and `guardrails` are the monitor's rules at the group's `post-act`-shaped chokepoint (`pre-think`, since that is where the group checks) plus a circuit breaker: `monitor/group-circuit-breaker` stops the group once the merged stream holds `refusalLimit` trips.

### 4.3 Hearing per seat (starter, stage A)

`PlayroomState.heardCursors?: Record<string, number>`; the Hearing sense reads `state.heard.slice(cursor)` for the acting seat (`state.bot.id ?? 'solo'`) and advances the cursor; `heard` is no longer spliced. A scheduled line (WP44) is still appended when due. The solo path reads exactly as before; a duo card fitting Hearing on both robots delivers a mid-episode `deliverInput` to both seats.

### 4.4 The app and the harness (stage B)

The Audit Centre's picker lists group episodes beside solo runs; a group's bundle downloads as `<card>.craftabot-bundle.json`; a solo run's download is the trace file it always was. The Run Lab's integrity badge, for a group, builds the bundle from storage and verifies it. `craftabot bundle --group <groupRunId>` writes the bundle from file storage.

---

## 5. Non-goals

Importing a bundle into a Workshop (a bundle is an audit artefact; the kit file is the import format). A Kit UI for group observers. N > 2 UX.

---

## 6. Stages

| Stage | Builds | DoD |
|---|---|---|
| **A** | This note; the bundle schema, builder and verifier; `observers` on the group; `createGroupWatchbot`; Hearing per seat | A group episode's bundle verifies after a JSON round trip and fails after one byte changes; a group Watchbot's note is on the merged stream and its circuit breaker stops the group through the chokepoint over `tidy-together`; a duo with Hearing on both robots hears a mid-episode message on both seats; every existing hearing and radio test green; the golden traces byte-identical |
| **B** | The Audit Centre's group picker and bundle download, the Run Lab's badge for groups, `craftabot bundle --group` | A group episode exports from the Audit Centre and the harness as one bundle that verifies; the badge reads `✓ trace integrity` on a group's Run Lab (e2e) |
| **C** | Close-out | Notes in §7, `26-…` §12, `27-…`, `23-…` §4.7 and §9, `CLAUDE.md`, README |

---

## 7. Divergences from `26-…` §6.7 and §6.12

- **D-a — the group section carries its own digest** (`groupDigest`) so the bundle digest is over digests only, never over raw events twice.
- **D-b — the observer signature gains the group id** (`(events, { groupRunId })`) so an observer can stamp what it emits.
- **D-c — the group Watchbot is two things**, `observe` for the note and `guardrails` for the chokepoint, because an observer has the group's ear but not its hand; the host passes both.

Stage notes are appended below.

> **Amended 2026-09-02 (stage A done).** As §4.1–4.3. The bundle's builder is reproducible (the same input, the same digest) and redacts through `buildTraceFile` for members and `redactSecrets` for the group section and the evaluations; `verifyBundleDigest` recomputes every member's digest, the group's and the bundle's. `SessionGroup` installs observers before `mergedHistory` exists and detaches them from `finishGroup`. `createGroupWatchbot` re-hosts the monitor's rules at `pre-think` (the group's chokepoint hook) and evaluates them itself on the merged stream for the note — a `brick.state` on the group's own run id, once per distinct note — and `createGroupCircuitBreaker(refusalLimit)` is the one rule that stops. Hearing keeps `heard` append-only with `heardCursors` per seat; `runGroupToCompletion` gained `observers`, `groupGuardrails` and `deliverAfterRound` so a test can put a line between turns. Tests: `core/persistence/bundle.test.ts` (round trip, one byte changed in a member, the merged stream, an evaluation, the digest), `monitor/group-watchbot.test.ts` (the note on the merged stream and the checked verdict at the chokepoint; the breaker stopping the group over `tidy-together`), `starter/session/duo-hearing.test.ts` (both seats hear a mid-episode line, once each), `senses.test.ts` (the cursor). The golden traces are byte-identical; every hearing and radio test is green.

> **Amended 2026-09-02 (stage B done).** As §4.4. `lib/workshop/bundles.ts` — `exportForGroup` (the `TraceExport` a sink gets for an episode), `bundleForGroup`, `bundleForRun`; the Audit Centre's picker lists episodes as `group:<id>` with a "Download bundle" and "Send to…" for each configured sink, and a solo run gained "Download bundle" beside its trace; the Run Lab's badge verifies a group through its bundle (`digest-badge` on the group header, `✓ trace integrity`). `craftabot bundle --group <id>` writes the bundle; `--run` is unchanged. Proven by `bundles.test.ts`, `harness/commands/bundle-group.test.ts` (the CLI's file verifies after a round trip), and `duo-persistence.spec.ts`, whose group Run Lab now shows the verified badge.

> **Amended 2026-09-02 (stage C — WP48 closed; Phase K closed).** Gate: core (+3), monitor (+2), starter (+2), harness (+1), workbench (+2); lint, build within budget, e2e green. `23-…` §4.7's WP34 amendment and §9's Hearing row point here. `27-…` §8 item 17 carries the summary.
