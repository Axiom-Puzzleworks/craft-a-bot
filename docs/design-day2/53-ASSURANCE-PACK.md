# 53 — The assurance pack and the control map (WP67)

> **Status (2026-09-06):** the design of record for WP67 (`42-DAY4-ROADMAP.md` §3 Phase O; `41-TARGET-DESIGN-V4.md` §6.7). Written before stage A; the stage notes at the foot say what landed. Taken up out of order — after WP63, before WP64–WP66 — because Phase O's only hard dependency for it is WP63 (`42-…` §4), and the two sections that need WP65 and WP66 (who validated, and a decision's explanation) are laid out here with an honest "not yet recorded" until those land. Every framework named here is named as a source a row can be *described under*; nothing in this pack is a claim of compliance (`41-…` §1.2, §11; `docs/governance-mapping.md`'s posture).

## 1. Purpose, and who this is for

The first artefact in the product meant to be read by someone who has never opened the app: a second-line reviewer, an internal auditor, a model-risk committee. One bot's evidence — its safety case, the campaign reports a build of it ran in (with their confusion matrices, cohort slices and obligation tables), its incident log, its drift series, its egress rows, its inventory entry (the agent card and the kit file's `requires`) — filed against the obligations a UK retail firm is audited against and against the generic frameworks, sectioned so a reader finds what they came for: PRA SS1/23's principles in order as the spine, the Consumer Duty's four outcomes as the second axis. Rendered as markdown and as one self-contained HTML file, printable, with every number citing the run ids behind it (`17-…` §4.4's "no unexplainable aggregates", applied to the document a regulator might see). The control map is the other half: rows of *relevance* — "this obligation is evidenced by these ids" — shipped as content by `governance` (the generic rows) and by the bank and each desk (the UK rows), every evidence id checked to resolve.

## 2. Where the code actually is — and what the contract test found

Read for this note: `governance/src/reports/` (`safetyCaseFromSummaries` with `EvaluationEvidence` and `CampaignEvidence`, `incidentsFromSummaries`, `telemetrySeries`/`driftIn` with `TelemetryExtras`, `summariseRun`, `reasonsUsed`), `core/src/storage/storage.ts` (`Storage`: agents, runs, summaries, campaign reports, evaluations, content), `core/src/persistence/agent-card.ts` (`buildAgentCard(spec, registry)` → `AgentCard { name, goalCardId, bricks, provenance }`), `core/src/persistence/kit-export.ts` (`buildKitFile` → `requires { core, packs, brickKinds }`), `core/src/schemas/trace-bundle.ts` (the SHA-256 digest pattern), `core/src/pack-registry.ts` (`getPolicyCard`, `getEvaluator`, `getGuardrailService`, `getGoalCard`, `getWorld`, `listPacks`), `core/src/schemas/events.ts` (the event types — what a `trace-guarantee` id names), `pack-testkit` (`checkManifest`, `describeConformance`), `harness/src/commands/report.ts` (`reportSafetyCase` — the WP37 equality pattern), the Workshop's `/workshop/safety-case` and `/workshop/export` (the Audit Centre's downloads), `fs-bank/src/controls/rows.ts` (`ControlMapRow`, `BANK_CONTROL_ROWS`) and the three desks' rows, `docs/governance-mapping.md` (the generic rows' source).

**Where the contract was found wanting:**

1. **The control-map row type lives in the bank.** `ControlMapRow` was declared in `fs-bank` (WP59) "to be registered by WP67"; `PackManifest.controlMaps` needs the type in `core`, which cannot import a pack. **Fixed in `core`:** `ControlMap` and `ControlMapRow` as a content type (`core/src/types/control-map.ts`, exported from the barrel) with `PackManifest.controlMaps?: ControlMap[]`; the bank re-exports the type it used to own. Stage A.
2. **Two of the bank's evidence ids dangle.** `fs-bank/policy/fallback` and `fs-advice/complaint-handled` are WP72's (the operational-incident and complaints decks). `checkControlMap` must refuse a dangling id, so the rows cannot ship as they are. **Fixed in `fs-bank`, recorded here:** a row may carry `status: 'pending'` with a `note` naming the WP; a pending row has no evidence and the pack renders it as *pending*, never as evidenced. The DISP and SS1/21 rows are the two. Stage A.
3. **No row says who reviewed it.** `42-…` §5 rule 3: a row ships marked `unreviewed` where no compliance reader was available, and the pack says so. **Added to the type:** `status?: 'unreviewed' | 'pending'` — absent means reviewed, and the PR description says by whom. Every row in this repo ships `unreviewed` until a reader has read it; the pack's front matter counts them. Stage A.
4. **A trace guarantee has no id.** `08-…` §4 names the guarantees in prose (complete, ordered and tamper-evident, reproducible, reviewable) and the rows cite event types (`approval.requested`, `tool.executed`). **Decided, not changed:** a `trace-guarantee` id is an event type from `core`'s catalogue — "this event is always on the trace" is the guarantee a row can cite — and `checkControlMap` resolves it against `EVENT_TYPES`. §8.
5. **Artefact ids are a vocabulary.** An `artefact` evidence id names a thing the pack itself contains: `agent-card`, `kit-file-requires`, `campaign-report`, `drift-series`, `incident-log`, `safety-case`, `trace-bundle`, `assurance-pack`. `checkControlMap` refuses any other. Stage A.
6. **Who validated, and what a decision saw, are WP65's and WP66's.** The pack's "validated by" section reads `run.started.principal` and the "incidents" section quotes `decisionExplanation`; neither exists yet. The sections are laid out and say *not recorded in this build* with the WP that records it, so the document's shape is stable across the two PRs. Not a contract change; §7.

## 3. Design principles

1. **A fold, not a form.** `assurancePackFor` is pure over what the store already holds and the registry already knows; nothing is authored into it, nothing invented (the safety case's rule, kept).
2. **Every number cites its runs.** A figure in the pack carries the run ids (or the report ids, or the evaluator ids) it came from; the renderers print them; a figure with no source does not appear.
3. **Relevance, never compliance.** Every row is a claim that an obligation is *evidenced by* named ids; the front matter says so in the reader's vocabulary; unreviewed and pending rows are counted and marked.
4. **One fold, two hosts** (the WP37 pattern): the harness and the Workshop call the same function on the same inputs and a test proves the JSON equal.
5. **Readable with no app**: the HTML is one file, tokens inlined, no script needed to read it, printable, axe-clean, contrast-checked against the same ratios the app's tokens are.

## 4. The design

### 4.1 The control map (`core`, stage A)

```ts
export type ControlEvidenceKind = 'guardrail' | 'policy-card' | 'evaluator' | 'gate' | 'trace-guarantee' | 'egress' | 'principal' | 'artefact';
export interface ControlEvidence { kind: ControlEvidenceKind; id: string; note?: string }
export interface ControlMapRow { framework: string; ref: string; title: string; obligation: string; evidence: ControlEvidence[]; tags: string[]; status?: 'unreviewed' | 'pending'; note?: string }
export interface ControlMap { id: string; title: string; description: string; rows: ControlMapRow[] }
```

`PackManifest.controlMaps?: ControlMap[]`; the registry keeps them (`getControlMap`, `listControlMaps`). **Resolution** (`checkControlMap(map, registry)` in `pack-testkit`, and `checkManifest` over a manifest's maps): `policy-card` → `getPolicyCard`; `evaluator` → `getEvaluator`; `guardrail` → a guardrail service (`getGuardrailService`) or one of `governance`'s own guardrail ids (`safety/…`, the ones `08-…` §3 names, passed in by the caller as `knownGuardrails`); `gate` → one of the campaign gate kinds (`outcome-rate`, `evaluator-pass-rate`, `assertion-pass-rate`, `metric`, `no-regression`, `derived-metric`, `label-rate`, `parity`); `trace-guarantee` → an event type; `egress` → `declared` | `none`; `principal` → `run.started.principal` (WP65; resolves by name now, the pack says "not recorded"); `artefact` → the vocabulary in §2 item 5. A pending row must have no evidence; a non-pending row must have at least one. Every tag must be an obligation tag or a threat tag the caller lists. Duplicate `ref`s within a map are refused.

**The generic map (`governance/reports/control-map.ts`, `genericControlMap`)**: NIST AI RMF (Govern 1.2/1.5/1.7, Map 5.1, Measure 2.3–2.8, Manage 1.3/2.2/2.4/4.1), the EU AI Act (Arts. 9, 12, 14, 15, 72), ISO/IEC 42001 (5.2, 6.1, 8.4, 9.1, A.6.2.4–8, A.8.3, A.9.2), OWASP ASI01–ASI10 — one row per clause, its evidence the mechanisms `docs/governance-mapping.md` already lists under it (guardrail ids, trace guarantees, gates, artefacts). `governance` is not a pack, so the map is an export a host registers under a synthetic manifest (`governance/control-map`), the way the Workshop registers `local`.

**The UK rows**: `fs-bank`'s `BANK_CONTROL_ROWS` become `bankControlMap` on its manifest; each desk's rows become its own map on its manifest. The desks' maps are checked by their conformance fixtures (`describeConformance` gains `controlMaps`).

### 4.2 `assurancePackFor` (`governance/reports/assurance-pack.ts`, stage B)

```ts
assurancePackFor(input: { agent: { id, name, spec }, registry, runs, summaries, evaluations, campaignReports, controlMaps, now }): Promise<AssurancePack>
```

Pure over its inputs (the host gathers them — the harness from a file store, the Workshop from IndexedDB — and `assurancePackFromStorage(agentId, storage, registry)` in `governance/reports` does the gathering once for both, the WP37 pattern). `AssurancePack` v1:

- `format: 'craftabot-assurance-pack'`, `formatVersion: 1`, `generatedAt`, `digest` (SHA-256 over the canonical JSON of everything below, the bundle's pattern), `posture` (the fixed relevance-not-compliance sentence), `review { unreviewedRows, pendingRows }`.
- `inventory`: the agent card, the kit file's `requires`, the pack versions, the world and its purpose, the goal card — SS1/23 principle 1.
- `governance`: the safety stack (guardrail ids from the safety case), approvals recorded (count over the summaries, the run ids), egress (the safety case's rows), `principal: 'not recorded in this build (WP65)'` — principle 2.
- `development`: the campaign evidence per report (`campaignEvidenceFor`), each with its gates, its confusion matrices, its cohort slices with the `matched` caveat quoted, and its obligation table grouped by `fca:cd:*` first — principle 3.
- `validation`: `validatedBy: 'not recorded in this build (WP65)'`, the evaluation evidence (`EvaluationEvidence` rows with the run ids they count) — principle 4.
- `mitigants`: the safety case's `inability` and `reach`, budgets, the kill switch as a trace guarantee, the fallback card where fitted — principle 5.
- `monitoring`: the drift series (`telemetrySeries` with the evaluations and the reports as extras) and its flags, the incident log (`incidentsFromSummaries`) with each incident's run id and findings, `explanations: 'not recorded in this build (WP66)'`.
- `outcomes`: the Consumer Duty's four outcomes as the second axis — for each, the control rows tagged with it and the evaluator evidence those rows name, with the run ids.
- `controlMap`: every registered map's rows, each evidence item annotated *present in this build* (the id resolves and — for an evaluator — has verdicts over this bot's runs; for a card — is fitted on the spec; for a gate — appears in a stored report), *available* (resolves, unused by this bot) or *pending*.
- A bot with no runs, no campaign or no evaluations gets a section that says so in words, never an empty table or a zero that reads as a rate.

**Renderers**: `renderAssurancePackMarkdown(pack)` and `renderAssurancePackHtml(pack)` — the HTML one file, the app's tokens inlined as CSS variables (a copy the test checks against `tokens.css`), semantic headings, tables with captions, a print stylesheet, no script, every run id an anchor to an appendix of run rows. Both cite ids after every number.

### 4.3 The hosts (stage C)

`craftabot assurance --agent <id> [--out runs] [--file pack.json] [--markdown pack.md] [--html pack.html]`. `/workshop/assurance`: pick a bot, the pack rendered through the Control Room components (Readout, CaseTable, Strip) with the same sections, and three downloads (JSON, markdown, HTML); the Audit Centre (`/workshop/export`) gains "Download the assurance pack" beside the bundle. The HTML report is opened by an e2e in a blank page and run under axe; the contrast test covers the inlined tokens.

## 5. UX trajectory

Workshop only. The Kit shows nothing of this. The `/workshop/assurance` screen ships a screenshot in the visual set.

## 6. Determinism

The pack is a pure fold; `generatedAt` is injected (`now`), the digest covers everything but itself, and the snapshot test pins a fixture bot with one campaign report and one incident.

## 7. Non-goals

- No evidence store (WP70's); no publishing (WP69's); no principal or delegation (WP65's); no decision explanations (WP66's) — the sections say so.
- No new event types. No claim of compliance anywhere in code, copy or docs.

## 8. Divergences from `41-…` §6.7 and `42-…` §3, with reasons

| Doc says | This note does | Why |
|---|---|---|
| `ControlMap` "in `governance/reports`" | The type in `core`; the generic rows and the fold in `governance` | `PackManifest` cannot name a governance type |
| "every row's evidence must resolve" | A row may be `pending` with no evidence, naming its WP | Two of the bank's rows cite WP72's content; a dangling id is refused, a pending row is honest |
| a trace guarantee is one `08-…` §4 names | An event type from the catalogue | The rows already cite event types; "always on the trace" is the guarantee |
| `assurancePackFor(agentId, storage, registry)` | A pure `assurancePackFor(input)` and `assurancePackFromStorage(agentId, storage, registry)` | The fold is testable without a store; the storage wrapper is the two hosts' shared path |
| the pack's "validated by" section, "who acted" | Present, saying *not recorded in this build* with the WP | WP65 is unbuilt; the document's shape should not change when it lands |

## 9. Risk register

| Risk | Mitigation |
|---|---|
| The HTML reads as a compliance certificate | The posture sentence at the top and the foot; unreviewed and pending counts in the front matter |
| A number without a source | The renderers refuse a figure with no ids — a test asserts every table row cites at least one |
| The Workshop and the harness drift | The equality test over the same fixture store |

## 10. Implementation plan

- **Stage A — the control map.** The type in `core`, `PackManifest.controlMaps`, the registry's lookups; `checkControlMap` in `pack-testkit` and in `checkManifest`; `genericControlMap` in `governance`; the bank's and the desks' maps registered, the two pending rows; every fixture updated.
- **Stage B — the pack.** `assurancePackFor`, `assurancePackFromStorage`, the two renderers, the snapshot and digest tests, the no-campaign pack.
- **Stage C — the hosts, the close-out.** `craftabot assurance`, `/workshop/assurance` with its screenshot, the Audit Centre download, the axe and contrast checks, the equality test, `docs/governance-mapping.md` pointed at the map, the close-out.

## 11. Acceptance criteria (WP67 as a whole)

1. `checkControlMap` refuses a dangling evidence id, an unknown artefact, a pending row with evidence, a duplicate ref; every row in the bank's and the three desks' maps resolves.
2. The pack's digest changes when any constituent does; a fixture bot with one campaign and one incident is snapshot-tested.
3. A pack for a bot with no campaign says so in every section.
4. The HTML report opens with no app, passes axe and the contrast test, and cites a run id for every number.
5. The harness and the Workshop render the same pack for the same bot.
6. No row or sentence claims compliance; unreviewed and pending rows are counted in the front matter.

> **Stage A landed 2026-09-06.** The control map as a content type in `core` (`types/control-map.ts`: `ControlMap`, `ControlMapRow` with `status` and `note`, the evidence kinds, and the vocabularies a `gate`, `egress`, `principal` and `artefact` id may name; `EVENT_TYPES` from the event schema for a `trace-guarantee` to resolve against), `PackManifest.controlMaps` with the registry's `getControlMap`/`listControlMaps`; `checkControlMap` in `pack-testkit` (a dangling id of every kind, an unknown artefact, a pending row with evidence or without its note, a row with none, a duplicate ref, a tag outside the vocabulary — each refused and tested) and `checkManifest` running it over a manifest's maps, with `controlMaps.resolve: false` for a map that spans packs; `genericControlMap` in `governance/reports` — twenty-two rows over NIST AI RMF, the EU AI Act, ISO/IEC 42001 and OWASP ASI, every one `unreviewed`, none citing a pack's content, resolved in the testkit against governance's own guardrail ids under its synthetic manifest — registered by the harness and the Workshop; the bank's rows as `bankControlMap` and each desk's as its own map, every row `unreviewed`, the bank's DISP and SS1/21 rows `pending` naming WP72 (§2 item 2), the type re-exported from the bank for the desks that imported it there. The harness's new test resolves every installed map against the full registry with the obligation and threat vocabularies. Gate: root lint, every workspace's tests, the build at 1276 kB of 1465, the evals baseline, the default e2e and the visual set (two load-sensitive live-play specs flaked under the full run and passed alone, as CI's `retries: 1` allows).

> **Stage B landed 2026-09-06.** `assurancePackFor` in `governance/reports/assurance-pack.ts` (§4.2): pure over the bot, the registry, its runs and summaries, the evaluations and the campaign reports (a structural `AssuranceCampaignReportLike`, so `governance` imports nothing from `evals`); `AssurancePack` v1 sectioned by SS1/23's five principles then ongoing monitoring, the Consumer Duty's four outcomes as the second axis, every registered control map with each evidence item annotated *present*, *available*, *not-recorded* or *unresolved* (a pending row carries none), a `review` count of reviewed, unreviewed and pending rows, the run appendix every citation points into, and a SHA-256 digest over the canonical JSON of everything but `digest` and `generatedAt` — so the same evidence digests the same and any constituent's change is a different digest. The principal (WP65) and each decision's explanation (WP66) are laid out as *not recorded in this build*. `assurancePackFromStorage` is the gathering both hosts share, proved equal to the pure fold over a memory store. The renderers: markdown, and one HTML file with the app's tokens inlined (a test reads `tokens.css` and checks them value for value), no script, printable, every run id an anchor into the appendix, tables with captions, the posture sentence at the head and the foot. Tests: the snapshot over a fixture bot with one campaign (a matched parity gate, a matrix, an obligation row) and one incident; the empty pack saying so in every section with no zero that reads as a rate; the digest's coverage; the store path's equality; the markdown citing runs on every top-level figure; the HTML's shape. Two things the fold taught the note: a store lists runs newest first, so the fold sorts a bot's runs oldest first before anything is counted; and the drift series reads a report's cells' verdicts, so the structural report type carries them.

> **Stage C landed 2026-09-06 — WP67 closed.** `craftabot assurance [--agent] [--out] [--file] [--markdown] [--html]` (`harness/src/commands/assurance.ts`): the pack from a file store through `assurancePackFromStorage` with the harness's own report reader (a stored report this version cannot parse is skipped, never fabricated), its test proving the JSON equal to the Workshop's fold over the same store — the WP37 pattern — and the "which bot?" resolution the safety case has. `/workshop/assurance` (§4.3) on the rail beside the safety case: a bot picked, the posture at the head and the foot, six readouts, the inventory, governance, campaigns (a `CaseTable`), validation, mitigants, monitoring, the outcomes and the control map (a `CaseTable` of every filed row with each evidence item's presence), and the three downloads; its screenshot joins the visual set. The Audit Centre gains "Download the assurance pack" beside the bundle and the card. The e2e (`assurance.spec.ts`): the empty shelf; a built bot's pack saying what is not there yet with the page under axe; the HTML downloaded, opened in a blank page with no app, and axe over it; a run cited in the report from the Audit Centre's download. `docs/governance-mapping.md` points at the map; the harness README carries the command. **Who reviewed the rows:** nobody yet — every row in every map ships `unreviewed`, as `42-…` §5 rule 3 allows, and the pack's front matter counts them. Gate: root lint, every workspace's tests, the build at 1309 kB of 1465, the evals baseline, the default e2e and the visual set (four screenshots).


> **Amended 2026-09-06 (WP65, `55-PRINCIPAL.md` §4.4).** The two sections laid out as *not recorded* are recorded when the store has what they read. `governance.principal` is `{ recorded: true, principals: [{ principal, runIds }] }` — every distinct principal (by kind and id) over the bot's run summaries with the runs each started — and *not recorded* only when no run carries one; `validation.validatedBy` is `{ recorded: true, validators, note }` — the distinct principals of the runs an evaluator judged, with a note that independence from the builder cannot be established because no record names who built the bot (`55-…` §2 item 7). The control map's `principal` evidence kind resolves *present* when any summary carries a principal. Both renderers print the chain (`person "Sam" (browser-1) for service craftabot-harness`). The snapshot re-recorded.

> **Amended 2026-09-06 (WP72, `61-LAST-DECKS.md` §2 item 8).** The two `pending` rows §2 item 2 recorded — DISP and SS1/21 on the bank's map — now carry their evidence (the complaints evaluators and the redress card; *Fallback* and *told plainly*) and read `unreviewed`, as every other row does until a compliance reader has read it.
