# 55 — Principal, delegation and attestation on the trace (WP65)

> **Status (2026-09-06):** the design of record for WP65 (`42-DAY4-ROADMAP.md` §3 Phase O; `41-TARGET-DESIGN-V4.md` §6.8, retiring G30 and adopting `19-…` #17 and #18). Written before stage A; the stage notes at the foot say what landed. Taken up after WP67 and WP66 because the assurance pack laid out two sections as *not recorded in this build* — "the principal on each run" and "who validated" — and this is the WP that records the first and gives the second what it can honestly have.

## 1. Purpose, and who this is for

The first thing an enterprise audit asks of an action is *who, on whose authority*. The trace could answer *what* (the call and its result), *under what constraints* (`run.started`'s budgets and egress) and *which rules looked at it* (`guardrail.checked`), and could not say who started the run, which person said yes to an approval, or which agent was acting for which. This note puts three optional fields on the trace — a principal on the run, a `by` on the approval, an attestation on the action — fills them from both hosts, carries them into the summary, the Boundary map, the OTel export and the assurance pack, and shows the chain in the Run Lab. Everything is additive; every trace written before it keeps its bytes.

## 2. Where the code actually is — and what the contract test found

Read for this note: `core/src/schemas/events.ts` (`run.started`, `approval.resolved`, `action.performed`, `group.started`), `core/src/types/agent-session.ts` (`SessionOptions` — `egress` is the model: named by the host, written only then), `core/src/session/agent-session.ts` (`startRun`, `runGuards` with its per-verdict callback, `performCall`'s two `action.performed` emits, the approval wait), `core/src/session/session-group.ts` (members created with `parentRunId`), `core/src/schemas/records.ts` (`RunSummary`), `governance/src/reports/summary.ts`, `boundary.ts` (`human.principal?: undefined` — the placeholder WP57 left), `assurance-pack.ts` (`governance.principal` and `validation.validatedBy` as `NotRecorded`; the control map's `principal` evidence kind resolving to `not-recorded`), `telemetry/src/otel.ts`, the harness's `run`, `fork`, `run-duo` and `campaign` commands, `packs/starter/src/session/harness.ts` (`RunOptions.egress` threaded through the evals runner — the path a campaign cell's principal takes), the Workshop's `session.svelte.ts`, `session-group.svelte.ts`, `workshop/fork.ts`, the Play route's approval buttons, `state/settings.ts` and `keys.ts` (the `cab.*.v1` storage keys).

What the contract test found, numbered as the earlier notes number theirs:

1. **No door for a principal.** Nothing on `CreateSessionDeps` or `SessionOptions` names who is running the session. Fixed in core: `SessionOptions.principal?: Principal`, on the same terms as `egress` — written to `run.started` only when the host names one, so the golden traces do not change.
2. **A refusal by a person is anonymous.** `resolveApproval(approved)` records only the boolean. Fixed in core: `resolveApproval(approved, by?)` and `approval.resolved.by?`.
3. **An action carries no attestation.** `action.performed` has the call and the result; which checks let it through and who was behind it are elsewhere on the trace and nowhere on the event. Fixed in core: `action.performed.attestation?: { principal, approvedBy?, guardrailsPassed }`, written only when the session has a principal (the same rule again), with `guardrailsPassed` the ids of the `pre-act` guardrails that allowed this call — captured from the chain's per-verdict callback the session already has, not re-derived.
4. **A group's members do not say for whom they act.** A member session gets `parentRunId` and nothing else. Fixed in core: `CreateSessionGroupDeps.options.principal?` — the group's — and each member runs as `{ kind: 'agent', id: <its spec id>, name, onBehalfOf: <the group's principal> }`; `group.started.principal?` records the group's own. `AgentHandle.role` is WP55's and needs nothing here.
5. **The summary, the map and the pack have nowhere to put it.** `RunSummary` has no principal; the Boundary map's `human.principal` is typed `undefined`; the pack says *not recorded*. Fixed in governance: `RunSummary.principal?` (additive on schema v1, as `egress?` was), `human.principal?` filled from `run.started`, the pack's two sections recorded (§4.4).
6. **The trace digest only verified by coincidence** (found by §11 item 4's test; `12-…` D21). `buildTraceFile` computed the digest over the events *as emitted* and then parsed the file through its Zod schema, which rebuilds every event with its keys in schema order — so a trace verified only while the engine happened to emit keys in that order. A fork's `forkedFrom` (emitted before `egress`, declared after it) already broke this for any fork exported as a trace file; the new `principal` broke it in the test. Fixed in core: the file is parsed first and the digest taken over the events it carries, and the bundle's group events the same way. A trace whose emit order already matched digests exactly as before.
7. **"Who validated" has no builder to be independent of** — `41-…` §6.7 wants "a campaign run under a principal other than the builder's", and nothing records who built a bot. Decided, not changed (§8): the pack's *validated by* lists the distinct principals of the runs that carry evaluation records, with a note that independence from the builder cannot be established because the builder is not on any record. Recording the builder is an agent-record change for a later WP, if wanted.

## 3. Design principles

- **Written only when named.** Every field here is optional and appears only when a host supplied a principal — the `egress` rule. A test session with no principal writes exactly what it wrote before, so every golden trace keeps its bytes and the digest test needs no re-recording.
- **From the trace, never authored.** The summary's principal, the map's human, the pack's sections and the OTel attributes are all folds over `run.started`, `approval.resolved` and `action.performed`. Nothing here is typed into a form after the fact.
- **The digest covers it.** `buildTraceFile` hashes every event's payload; a flipped `by` or a changed `principal` fails verification with no new code — proved, not assumed (§11 item 4).
- **Nothing real** (hard rule 9). The browser's principal id is a random UUID minted once per browser, never derived from anything; the display name is whatever the person typed and is theirs to leave blank. The harness's name is `CRAFTABOT_PRINCIPAL` or the machine's hostname, which a person running their own harness on their own disk already knows; no fixture in the repo carries either.
- **The Kit's principal is "you."** The Kit's copy does not change; the Play route names the browser principal on every run it starts, and the Settings field that names it lives with the Workshop preferences.

## 4. The design

### 4.1 The fields (`core`, stage A)

```ts
interface Principal {
  kind: 'person' | 'service' | 'agent';
  id: string;
  name?: string;
  onBehalfOf?: Principal;   // recursive: who this principal acts for
}
```

`principalSchema` in `schemas/shared.ts` (recursive through `z.lazy`), exported as `Principal`. Then:

- `run.started.principal?: Principal` — who started the run and, through `onBehalfOf`, for whom.
- `approval.resolved.by?: Principal` — who answered.
- `action.performed.attestation?: { principal: Principal; approvedBy?: Principal; guardrailsPassed: string[] }` — the chain and the checks that let the action through. `guardrailsPassed` is the `pre-act` chain's allowing guardrails for this call, in order; a pause that a person then granted names them in `approvedBy`; the unavailable-action refusal (a call the world has that the build did not grant) carries the attestation too, since a person may ask who tried.
- `group.started.principal?: Principal` — the group's.

`SessionOptions.principal?: Principal`; `AgentSession.resolveApproval(approved, by?)`; `SessionGroup.resolveApproval(agentId, approved, by?)`. The session keeps the principal it was given and stamps it into `run.started` and every attestation; a `by` on an approval is the caller's, per call, since the person answering need not be the person who started the run. The catalogue (`02-…` §7) gains the four fields in the same PR; `docs/schemas` is regenerated.

### 4.2 The hosts (stage B for the harness, stage C for the Workshop)

- **The harness** — `principalFromEnv(env, hostname)` in `harness/src/principal.ts`: `{ kind: 'service', id: 'craftabot-harness', name: env.CRAFTABOT_PRINCIPAL ?? hostname }`. `run`, `fork`, `run-duo` (the group's principal) and `campaign` name it; the campaign's cells reach it through `RunMatrixOptions.principal` → the starter harness's `RunOptions.principal`, the road `egress` already travels. The harness's auto-approval answers `by` the same principal. `--principal <name>` on the CLI overrides the environment.
- **The browser** — `browserPrincipal()` in `lib/state/principal.ts`: `{ kind: 'person', id: <cab.principal.v1's UUID, minted on first read>, name?: <Settings displayName, when set> }`. `Settings.displayName` (string, at most 60 characters, default empty), a field in the Settings page's Workshop preferences: *Your name, on the trace*. `SessionViewDeps.principal?` → `options.principal`; the Play route, the duo (as the group's principal), and the Workshop's fork name it; every approval button passes `by`.

### 4.3 The folds (`governance`, `telemetry`, stage B)

- `summariseRun` copies `run.started.principal` to `RunSummary.principal?`.
- `boundaryMapFor` fills `human.principal` from `run.started` when events are given.
- The OTel mapping: the `invoke_agent` root gains `gen_ai.agent.id` (the agent id the record names) and, when the run has one, `craft_a_bot.principal.kind`, `craft_a_bot.principal.id`, `craft_a_bot.principal.name` and `craft_a_bot.principal.chain` (the chain rendered `kind:id` joined with ` <- `, innermost first); each `execute_tool` span carries `gen_ai.agent.id` and the same `craft_a_bot.principal.chain`. The group root (`invoke_group`) carries the group's principal the same way.

### 4.4 The assurance pack (stage B)

- `governance.principal`: `NotRecorded | { recorded: true; principals: Array<{ principal: Principal; runs: number; runIds: string[] }> }` — every distinct principal (by kind and id) over the bot's run summaries, with the runs each started. *Not recorded* only when no run of the bot carries one.
- `validation.validatedBy`: `NotRecorded | { recorded: true; validators: Array<{ principal: Principal; runIds: string[] }>; note: string }` — the distinct principals of the runs that carry an evaluation record, with §2 item 7's note on independence.
- The control map's `principal` evidence kind resolves *present* when any summary carries a principal, else *not-recorded*.
- Both renderers list them; the snapshot re-recorded for the new shape.

### 4.5 The Run Lab (stage C)

- The header names the run's principal when `run.started` has one (*started by <name or id>*, with the chain as the title).
- The inspector shows a **Chain** above the payload for an `action.performed` row with an attestation — the principal and every `onBehalfOf` step, who approved it, which guardrails passed — and for an `approval.resolved` row with a `by`. `Chain` is a Control Room component (`44-…` §4.3's set named it), text and tokens, no colour alone.

## 5. UX trajectory

Workshop only, but for the one Settings field. No Kit screen changes.

## 6. Determinism

The browser's id is minted once with `crypto.randomUUID()` and stored; every run after that carries the same id. Tests inject a store. The harness's name comes from the environment or `os.hostname()`, both injectable.

## 7. Non-goals

- Recording who *built* a bot (§2 item 7); a signed attestation; verifying a principal against anything — the trace records what the host said, as it records everything else.
- Per-agent *credentials* (`19-…` #17's second half): keys stay the vault's and the provider's (hard rule 2).
- Attestation on `tool.executed`: a tool call leaves the agent but changes no world; the run's principal on the OTel span is the audit's answer.

## 8. Divergences from `41-…` §6.8 and `42-…` §3, with reasons

| Doc says | This note does | Why |
|---|---|---|
| "a spawned sub-run (`parentRunId`) chains" | A group member chains through `onBehalfOf`; a fork carries the principal the host names, not the origin's | The only sub-runs are group members; a fork is a new run by whoever forked it |
| the pack's "validated by": "a campaign run under a principal other than the builder's" | The principals of the evaluated runs, with a note that the builder is not recorded | No record names a builder (§2 item 7) |
| `execute_tool` spans get "`gen_ai.agent.id`-style attributes" | `gen_ai.agent.id` and the rendered chain on the root and on `execute_tool` | The conventions have `gen_ai.agent.id`; the chain has no convention, so it is a `craft_a_bot.*` attribute |
| (silent) who the harness's auto-approval is | The harness's own principal, as `by` | It did answer; the trace should say so |
| `54-…` §4.3: a fork's `divergence` compares `{ type, tick, payload }` | Less `attestation`, `by` and `run.started.principal` | A fork is a new run by whoever forked it; a divergence is about what the bot did, not who was at the keyboard |

## 9. Risk register

| Risk | Mitigation |
|---|---|
| A recursive schema breaks the JSON Schema generation | `z.lazy` with an explicit type; the `schemas --check` on build proves the output |
| A test session starts writing a principal and the goldens change | Written only when the host names one; the golden tests are the proof |
| A display name in a trace is personal data the person did not mean to share | The field is blank by default, labelled *on the trace*, and lives with the Workshop preferences; the Kit never asks |

## 10. Implementation plan

- **Stage A — the fields in core.** `Principal`; the four event fields; `SessionOptions.principal`; `resolveApproval(approved, by?)`; the attestation with `guardrailsPassed`; the group's principal and `onBehalfOf`; `RunSummary.principal?`; `02-…` §7; `docs/schemas`; tests (a session with a principal, an approval with a `by`, a group with a nested principal, the goldens unchanged, the digest failing on a flipped `by`).
- **Stage B — the folds and the harness.** `summariseRun`, the Boundary map, the OTel attributes and their fixture, the assurance pack's two sections and the control-map resolution, both renderers; `principalFromEnv`, the four commands and `--principal`, the evals runner's `principal`.
- **Stage C — the Workshop, the close-out.** `browserPrincipal`, the Settings field, the three session paths and the approval buttons, the Run Lab's header and `Chain`; e2e; the Run Lab screenshot re-baselined for the header; the close-out.

## 11. Acceptance criteria (WP65 as a whole)

1. A session given a principal writes it on `run.started` and an attestation on every `action.performed`, naming the `pre-act` guardrails that allowed the call; a session given none writes neither, and every golden trace is unchanged.
2. A group with a principal writes it on `group.started`, and each member's `run.started.principal` is the member acting `onBehalfOf` the group's — the nested principal `41-…` §6.8 asks a test for.
3. An approval answered with a `by` records it, and the action it let through names `approvedBy`.
4. A flipped `by` or a changed `principal` fails `verifyTraceDigest`.
5. The OTel fixture carries the attributes; the assurance pack's *principal* and *validated by* sections read as recorded over a store with a principal and as not recorded over one without; the control map's `principal` evidence resolves *present*.
6. Every harness run — `run`, `fork`, `run-duo`, a campaign's cells — carries the service principal, named from `CRAFTABOT_PRINCIPAL`, `--principal` or the hostname.
7. The Play route's runs carry the browser principal with the Settings name, its approvals a `by`; the Run Lab shows the chain on an action row (e2e).

> **Stage A landed 2026-09-06.** `Principal` and `principalSchema` (recursive through `z.lazy`) with `Attestation` in `schemas/shared.ts`; `run.started.principal?`, `approval.resolved.by?`, `action.performed.attestation?` and `group.started.principal?` on the event schema, `RunSummary.principal?` beside them (`02-…` §7 amended; `docs/schemas` regenerated — the generator reads core's built `dist`, so the build comes first). `SessionOptions.principal` written to `run.started` only when named; `resolveApproval(approved, by?)` on the session and, per agent, on the group; the attestation built at the `pre-act` gate from the chain's own per-verdict callback (`runGuards` now fills a `passed` list) and carried into both `action.performed` emits — the performed call and the unavailable-action refusal; a group's members run as agents `onBehalfOf` the group's principal and `group.started` names it; `summariseRun` copies the principal into the summary. **What the tests found** (§2 item 6, `12-…` D21): `buildTraceFile` digested the events as emitted and then parsed the file, and the parse reorders keys — so the digest verified only when the engine emitted in schema order, which every golden did and a fork did not. Fixed by parsing first and digesting what the file carries, the bundle's group events the same way. The proofs (§11 items 1–4, `session/principal.test.ts`): a session with a principal writes it and an attestation naming the allowing guardrail; one without writes neither; an approval's `by` lands on the event and on the attestation's `approvedBy`; a group with a principal writes it on `group.started` and each member acts `onBehalfOf` it, a group without writes none; a flipped `by` and a changed principal each fail `verifyTraceDigest`. The goldens are unchanged. Gate: root lint, every workspace's tests, the build, the evals baseline, the default e2e and the visual set.

> **Stage B landed 2026-09-06.** The folds (§4.3–4.4): `summariseRun` copies the run's principal (stage A); `boundaryMapFor` fills `human.principal` from `run.started` (`44-…` amended); the OTel mapping puts `gen_ai.agent.id` on the `invoke_agent` root and every `execute_tool` span and, when the run names a principal, `craft_a_bot.principal.kind`/`.id`/`.name`/`.chain` (`agent:<id> <- person:<id>`), the `invoke_group` root carrying the group's own from `group.started` (`35-…` amended); the assurance pack's `governance.principal` and `validation.validatedBy` recorded when the store has them — `principalsOver` folds the distinct principals by kind and id with the runs each started, the validators are those of the evaluated runs with the note that the builder is not recorded (§2 item 7) — the control map's `principal` evidence resolving *present*, both renderers printing the chain (`person "Sam" (browser-1) for service craftabot-harness`), the snapshot re-recorded for exactly those fields (`53-…` amended). The harness (§4.2): `principalFromEnv(env, { name?, hostname? })` in `harness/src/principal.ts` — `{ kind: 'service', id: 'craftabot-harness', name }` from `--principal`, else `CRAFTABOT_PRINCIPAL`, else the hostname — named by `run`, `fork`, `run-duo` (the group's) and `campaign`; the campaign's cells reach it through `RunCampaignOptions.principal` → the starter harness's `RunOptions.principal`, the road `egress` travels; every approval the harness answers says `by` whom; the README and the usage text. Proofs (§11 items 5–6): the Boundary's human named from `run.started` and unnamed without; the OTel attributes on the root, the tool span and the group root, and none when the run names none; the pack's two sections recorded over the fixture and *not recorded* over the empty pack, the markdown printing the chain; `craftabot run` with a principal writing it on `run.started`, on every action's attestation, as `by` on every approval and on the summary, the trace file verifying; every cell of a campaign carrying it on its summary; `principalFromEnv`'s three sources. Gate: root lint, every workspace's tests, the build, the evals baseline, the default e2e and the visual set.

> **Stage C landed 2026-09-06 — WP65 closed.** The browser (§4.2): `browserPrincipal(displayName)` in `lib/state/principal.ts` — a person with an id minted once per browser under `cab.principal.v1` (a random UUID, never derived; a store that cannot be read or written still yields one) and the name Settings holds when given; `Settings.displayName` (sixty characters, trimmed, blank by default) with *Your name, on the trace* in the Settings page's Workshop preferences. `SessionViewDeps.principal` and `GroupSessionViewDeps.principal` → the sessions' `options.principal`; both views' `resolveApproval` take `by`. The Play route names the person on every run and every approval it answers; the duo names them as the group's principal, each seat acting `onBehalfOf`; the Workshop's fork names the forker and answers its approvals as them — and the harness's `divergence` now leaves attestations, `by`s and the run's principal out of the comparison (§8), since a fork is a new run by whoever forked it. The Run Lab (§4.5): a *started by* chip in the header from `run.started.principal` with the chain as its tooltip; `Chain` in the Control Room's set (`components/control-room/Chain.svelte`) above the payload of an `action.performed` row with an attestation — who, for whom, who approved, which rules passed — and of an `approval.resolved` row with a `by`. The proofs (§11 item 7): the browser principal's minting, keeping, naming and refusals (`lib/state/principal.test.ts`); the Workshop fork's identity now with a principal on both sides; the e2e sets the name, plays a run, reads *started by Sam* in the header and the chain on an action row (person Sam, nobody asked, the rules line), and a run with no name set naming the browser by its id alone. The Run Lab screenshots re-baselined for the chip. Gate: root lint, every workspace's tests, the build, the evals baseline, the default e2e and the visual set.
