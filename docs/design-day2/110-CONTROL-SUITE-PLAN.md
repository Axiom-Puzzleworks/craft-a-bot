# 110 — The control suite: inventory, gaps and the plan to complete it

> **Status (2026-10-01):** a research note and a phased plan, reviewed and merged (PR #59); §5's five decisions settled the same day. It is the forward plan: Phase AJ is built on the `phase-aj` branch, one commit per WP, with a PR when the phase closes. It proposes Phases AJ–AN, WP132–WP150, continuing `101-DAY7-ROADMAP.md`'s numbering, and gaps G91–G118 continuing `100-…`'s register.

## 0. The ask, and the answer in one paragraph

The ask: a synthetic bank simulator with a **full repertoire of referenced controls and safety mechanisms that can be observed, tested and configured**, available as **an inventory with descriptions and status in the toolkit**.

The answer: the repertoire is already large — 45 catalogued techniques, 37 of them shipped; 64 control-map rows across nine maps; 32 policy cards, some 50 evaluators, 14 guardrail components, seven guard services, four metric families, a benchmark, a register and a reading desk — but it is **not one inventory**. It is seven inventories with seven status vocabularies on seven screens, and none of them is keyed by the thing a reader wants to point at: _this control, here, in this state_. Fourteen mechanisms that exist in code are in none of them. Eleven places say more than the code does (ceilings are measured, never enforced; every journey stage's guard list is empty; no shipped reader declares a gate; every guard stack runs a stand-in). And some two dozen techniques a bank's control framework names — contestability, disclosure, vulnerability detection, change control, timeliness, shadow mode, confidence gating — are not in the catalogue at all.

The plan therefore has three movements, in this order: **make the inventory honest and whole** (one fold, one status model, one page, a check that refuses an orphan); **wire what exists** (stage guards, reader gates, measured stacks); then **build what is missing**, catalogue entry first, mechanism second, so the inventory never claims ahead of the code.

## 1. How this was done

Read, not assumed: the generated `docs/catalogue.md` and its source (`governance/src/catalogue/entries.ts`, `core/src/schemas/catalogue.ts`); `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` §9's 38-item shortlist; `83-…` §6.4.2's survey table, which names each technique's unbuilt component; `101-…` §7's unscheduled follow-ups; `UX-AND-GAPS.md` §9's W-1–W-6; the Day 6 and Day 7 gap registers. Then two sweeps of the code: every `GuardrailComponent`, guardrail factory, predicate leaf, hosted-shell dial, workflow mechanism, gate mode, campaign gate kind, metric and desk primitive (`packages/core`, `governance`, `workflow`, `gate`, `evals`, `metrics`, `desk`, `packs/*`); and every desk pack's control map, cards, evaluators, stacks, gates, readers, knobs, ceilings and models, with every Workshop route that shows a control's status and what, if anything, it lets a person configure. File paths are given where a claim depends on one.

## 2. The current offering

### 2.1 The catalogue of techniques (`/workshop/catalogue`, `docs/catalogue.md`)

45 entries in six categories, edition 2026-09: **37 shipped, 0 connectable, 2 bespoke, 3 blueprint, 3 not applicable; 0 reviewed, 45 pending review.** Each entry carries points, maturity, OWASP threats, frameworks, sources with a year, a coverage note, the components or mechanisms that implement it, and since WP123 the latest benchmark measurement or _unmeasured_. The coverage fold (`governance/reports/coverage.ts`) joins entries to registered components, to the stacks that fit them and, through `Stack.controls`, to the register's headline effect.

| Category                  | Entries | Shipped | Not shipped                                                                                                                 |
| ------------------------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Runtime protection        | 24      | 20      | policy-conditioned classifier (blueprint), privilege scopes (blueprint), memory provenance (bespoke), rate limits (n/a)      |
| Secure by design          | 3       | 1       | formal verification (blueprint), guardrail frameworks (n/a)                                                                 |
| Identity and access       | 3       | 2       | inter-agent authentication (bespoke)                                                                                        |
| Component hardening       | 3       | 2       | sandboxed execution (n/a)                                                                                                   |
| Evaluation and assurance  | 7       | 7       | —                                                                                                                           |
| Human oversight           | 6       | 6       | —                                                                                                                           |

### 2.2 The runtime mechanisms, by point

The vocabulary is `core`'s: seven points (`pre-think`, `pre-act`, `post-act`, `stage-in`, `stage-out`, `group`, `egress`) and six verdicts (`allow`, `block-action`, `stop-run`, `pause`, `redact`, `annotate`), with `mark` riding on an allow since WP124 (`core/src/types/guardrail-component.ts`, `schemas/shared.ts`).

| Layer                                   | What exists                                                                                                                                                                                                                                                                                                                     | Where                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Components** (14 adapters)            | `step-budget`, `token-budget`, `action-blocklist`, `no-repetition`, `approval-mode`, `policy-card`, `egress-declared`, `egress-none`, `untrusted-content`, `taint`, `red-team-seat`; the factories `guardServiceComponent`, `readerComponent`, `quarantinedReaderComponent`; `monitor/evaluator-breaker`                            | `governance/src/components/*`, `packs/monitor/src/components.ts`                                           |
| **Guardrail factories** (not components) | `safety/step-budget`, `token-budget`, `action-blocklist`, `no-repetition`, `approval-mode`; `connector/tool-blocklist` (the Connector's scopes); the group token budget; `monitor/group-circuit-breaker`; the Watchbot's three observe-only rules                                                                                 | `governance/src/guardrails/*`, `core/src/session/session-group.ts`, `packs/monitor/src/rules.ts`           |
| **Policy cards**                        | The AgentSpec shape: hook → predicate → `block-action` / `stop-run` / `require-approval`; fourteen `PredicateExpr` leaves including `taint-reaches`, `content-is-untrusted`, `world-predicate`, `history-count`                                                                                                                      | `governance/src/policy-compiler.ts`, `core/src/schemas/policy-card.ts`                                     |
| **Guard services** (7)                  | Model Armor, Azure Content Safety, Llama Guard 4, Prompt Guard 2, Bedrock Guardrails, Lakera Guard, OPA — each through the hosted shell with an offline stand-in; the shell's dials (`screenObservation`/`screenResult`/`screenDecision`, `minConfidence`, `onFailure` fail-closed, `timeoutMs`) and per-hook clamp                   | `packs/{geap,azure-content-safety,guard-local,bedrock-guardrails,lakera-guard,pdp-opa}`, `governance/src/hosted/*` |
| **Engine**                              | Tick and token budgets with defaults, the 60 s provider abort, the egress guard, redaction applied to `say`, the untrusted mark applied to results, the record classification `public` / `personal` / `special-category`                                                                                                          | `core/src/session/*`, `core/src/egress.ts`, `core/src/types/desk-world.ts`                                 |
| **Workflow**                            | Stage-boundary chain (block, stop, pause→approve, redact), `validateAgainst` on every stage's input and output, `maxStages` 64 and the 16 KiB value cap, handoffs with their chain, the reader executor's confidence and steer gate (`readGate`, `STEER_THRESHOLD` 0.5), the reviewer model, autonomy levels 1–5 with ceilings | `workflow/src/{run,validate,reader,reviewer,human-load}.ts`                                                |
| **The Gate**                            | A stack over the chat-completions wire in `shadow` or `enforce`; the approval round-trip; upstream-only egress; loopback-only bind; five presets                                                                                                                                                                                | `packages/gate/src/*`                                                                                      |
| **Readers**                             | `ruleReader`, `hostedReader`, `llmReader` with the one confidence formula                                                                                                                                                                                                                                                       | `governance/src/readers/*`                                                                                 |

### 2.3 The bank's controls

Nine control maps, **64 rows, every one `unreviewed`**: the generic map (22 rows — NIST AI RMF, EU AI Act, ISO/IEC 42001, OWASP ASI) and eight desk maps (bank 13, advice 7, fraud 6, lending 4, onboarding 3, disputes 3, collections 3, servicing 3) citing Consumer Duty, COBS 4/9, CONC 5/7, DISP, FG21/1, SS1/21, SS1/23, POCA, MLR 2017, PSR APP, UK GDPR and the Equality Act. A row names its evidence by kind (`guardrail`, `policy-card`, `evaluator`, `gate`, `trace-guarantee`, `egress`, `principal`, `artefact`) and `checkControlMap` refuses a dangling id.

Behind the rows:

- **32 policy cards** on the desks (`no-recommendation-before-suitability`, `never-tip-off`, `a-hit-is-never-said`, `cohort-blind`, `reasons-are-real`, `circumstances-before-the-plan`, `record-a-disclosure`, the four-eyes cards, _Fallback_, …), every one at `pre-act` or `pre-think`.
- **~50 evaluators**: deterministic (`decision-matches-rules`, `explanation-faithful`, `hit-contained`, `no-tip-off`, `data-minimised`, `pii-contained`, `disclosure-recorded`, …), rubric (`understanding`, `support`, `price-value`, `products-services`, `distressed-call`, `social-engineering-call`), and the hosted `geap/eval/*`.
- **Campaign gates** on every baseline: `outcome-rate`, `evaluator-pass-rate`, `label-rate`, `derived-metric` (recall, false-freeze rate), `parity` (matched pairs on lending, disputes and collections; age bands on fraud and collections), `drift`, `no-regression`; the sanity gates that make the unguarded stack fail under pressure.
- **Stacks**: up to four per desk (`policy-cards`, `+local-classifier`, `+hosted-guard`, `compliance-watchbot`), with `controls[]` and `obligations[]` claims.
- **Readers**: eleven rule readers, all at confidence 1; the attack-words reader behind the quarantined reader.
- **Knobs**: `LendingPolicy` (eight knobs), the disputes `reimbursementLimit` and `excess`, the complaints `redressLimit`, the Kit's `threshold` dial.
- **Decision rights**: 25 ceilings in `fs-bank/uk-retail-banking`, each cited, each _measured as a breach rate, never enforced_ (the glossary says so).
- **Models**: `ERROR_RATES` (three decision-error rows), `REVIEWER_RATES` (accuracy, automation bias, seconds per case), `fs-bank/reviewer/case-handler` — every rate a stated assumption.
- **Obligation vocabulary**: 25 `OBLIGATION_TAGS`.

### 2.4 Measurement and assurance

- **The Control Effectiveness Register** (`controlEffectiveness`): one row per map row, status `evidenced` / `inconclusive` / `untestable` / `untested`, from eight reference experiments under `experiments/` with results in `docs/evidence/`.
- **The benchmark** (`runBenchmark`, `benchmarks/bank-adversarial.json`): every guard service, reader-as-guard and bespoke component over seven adversarial corpora (1,408 rows); every shipped service _unmeasured_ until a cassette is recorded with a key; the keyword baseline at recall 26%, precision 81%.
- **Metrics**: nine fairness metrics, seven drift statistics, ten human-load figures, four calibration figures, the intervals and tests, κ and confusion.
- **The assurance pack**: SS1/23-shaped, digested, with the control maps and each evidence item's presence (`present` / `available` / `pending` / `not-recorded` / `unresolved`).
- **The reading desk**: 260 subjects of eight kinds, each `unread` / `accepted` / `amended` / `rejected`; none read.

### 2.5 Where status is shown today — seven screens, seven vocabularies

| Screen                                      | Keyed by               | Status words                                                                                                                                       | Configure?                                   |
| ------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `/workshop/catalogue`                       | technique              | shipped · connectable · bespoke · blueprint · not-applicable; pending · reviewed; recall/precision · unmeasured                                     | no                                           |
| `/workshop/assurance`                       | control-map row        | evidenced · inconclusive · untestable · untested; present · available · pending · not-recorded · unresolved; unreviewed · pending; reviewed · disputed | a review per row                             |
| `/workshop/studio`                          | component, stack       | built in · connected · harness only · needs a battery · stand-in; verdict lamps                                                                    | **yes** — fit, settings, save, _Use in…_     |
| `/workshop/studio?tab=connections`          | guard service          | browser-capable · harness-only · checkpoint pending; recall · precision · unmeasured                                                               | **yes** — settings, test, fit                |
| `/workshop/benchmarks`                      | benchmark subject      | measured · stand-in — unmeasured · not applicable                                                                                                  | run, import                                  |
| `/workshop/readings`                        | subject of eight kinds | unread · accepted · amended · rejected                                                                                                             | accept, amend, reject, push                  |
| `/workshop/conduct`, `/model-risk`          | outcome, metric        | pass · fail · inconclusive; stable · drifted                                                                                                       | analysis inputs                              |
| `/workshop/experiments`, `/campaigns`, `/spec` | experiment, campaign, bot | verdict, gate pass/fail, ceiling-breach rate                                                                                                    | **yes** — knobs, stacks, factors             |

No screen answers, for one control, all of: _is it built, where is it fitted, did it fire last run, is it measured, what effect did it have, has anyone read it, and where do I turn it._

## 3. Findings: the gaps

Five classes. Class A is code the inventory does not name; class B is the inventory saying more than the code does; class C is catalogued techniques unbuilt; class D is techniques a bank's control framework names that the catalogue does not; class E is the inventory's own shape.

### A. In code, not in the inventory (G91–G96)

| Gap | What exists                                                                                                                                                                                                                             | Where                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| G91 | `connector/tool-blocklist` (the Connector's scopes), the nearest thing to privilege scopes; not a component, in no entry                                                                                                                  | `governance/src/guardrails/tool-blocklist.ts`, `packs/starter/src/brick-kinds.ts`      |
| G92 | The group chokepoint's controls: `monitor/group-circuit-breaker` (refusal limit), the group token budget, the Watchbot's `going-in-circles` / `all-talk` / `refusal-storm`, `workshop/monitor-judge` — prose only under _monitor-agent_ | `packs/monitor/src/rules.ts`, `core/src/session/session-group.ts`                      |
| G93 | The Gate's `shadow` / `enforce` modes, its upstream-only egress and loopback bind — absent from the catalogue; _shadow deployment_ is a recognised control with no entry                                                                 | `packages/gate/src/{gate,server}.ts`                                                   |
| G94 | The workflow's hard limits (`maxStages`, the value cap), the reader executor's confidence and steer gate, the handoff chain — only `validateAgainst` and the boundary chain are catalogued                                                | `workflow/src/{run,reader}.ts`                                                         |
| G95 | The hosted shell's fail-closed (`onFailure: stop-run`, `cause: could-not-check`), the per-hook clamp, the 60 s provider abort — runtime behaviour no entry covers                                                                        | `governance/src/hosted/verdict.ts`, `core/src/session/budgets.ts`                      |
| G96 | `readerComponent` (a reader as a guard at any loop point) has no production registrant; the desks' purpose-gating and special-category exclusion are prose under _information-flow-control_, not components                              | `governance/src/components/reader.ts`, `packs/fs-bank/src/lines/shared.ts`             |

### B. The inventory says more than the code does (G97–G107)

| Gap  | The claim                                                                               | The code                                                                                                                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G97  | _four-eyes_ and _autonomy-levels_ read as if ceilings constrain a run                   | Ceilings are breach counts in `evals/src/campaign.ts` and `monitor.ts`; nothing blocks a decision above its ceiling                                                                                                                                                                                                                                                   |
| G98  | _stage-boundary-guard_ shipped; the journeys drawn with guard points                    | Every shipped stage has `guards: { policyCards: [] }` — thirteen locations across the seven desks; no stage-boundary control is fitted anywhere                                                                                                                                                                                                                       |
| G99  | _Readers and the confidence gate_ (`104-…`, manual §60)                                 | No shipped `ReaderExecutor` declares `gate`; every reader is a rule at confidence 1, which never gates; the disputes, servicing and complaints overlays are used by no shipped configuration                                                                                                                                                                          |
| G100 | The `+local-classifier` and `+hosted-guard` stacks on every desk                        | `DESK_SCREENING.offline: true` and `HOSTED_GUARD_STAND_IN`: the stand-ins answer clean; every service _unmeasured_; no `benchmarks/cassettes`                                                                                                                                                                                                                         |
| G101 | The bank's SS1/23 `model-risk` row cites `gate no-regression`                           | No shipped campaign declares one; the row's presence can only ever read _available_                                                                                                                                                                                                                                                                                  |
| G102 | `CLAUDE.md` and `53-…` §1: two rows `pending` (DISP, SS1/21)                            | Both carry evidence and are `unreviewed`; `pending` survives only in test fixtures                                                                                                                                                                                                                                                                                    |
| G103 | The register's effect per row                                                           | An experiment's `controls` default to **every** row of the pack's map (`lib/workshop/experiments.ts:134`, `evals/src/experiment.ts:737`): every row of a desk reads the same headline, relevant or not (W-5's cause)                                                                                                                                                 |
| G104 | A reading counts as read "wherever a check asks"                                        | The pack's `review.{reviewed,unreviewed}` is computed from the shipped `row.status` alone (`assurance-pack.ts:609`); the _Unreviewed_ readout never drops                                                                                                                                                                                                             |
| G105 | `policy-card` declares `verdicts: allow, block-action, stop-run`                        | Its compiler returns `pause` for `require-approval`; a declaration mismatch between `components/policy-card.ts` and `policy-compiler.ts`                                                                                                                                                                                                                             |
| G106 | The lending stack claims obligation `consumer-duty:understanding`                       | Not in `OBLIGATION_TAGS` (`fca:cd:understanding` is); the complaints stack has no `controls`; the advice and fraud stacks no `obligations`; the Studio shows neither                                                                                                                                                                                                  |
| G107 | Thin rows                                                                               | Collections' _plan-understood_ has no evaluator for its "plain words" half; fraud's `no-auto-release-from-instructions-in-records` and advice's `execution-approved` are cited by no row; advice's `advice-boundary` cites no regulation; the Conduct lamps are hard-wired to the fraud and advice evaluators (`lib/workshop/conduct.ts`) and read _inconclusive_ on five desks |

### C. Catalogued, unbuilt (G108)

The five entries not shipped, and the five components `83-…` §6.4.2 and the entries' own notes name but no WP took: **`no-progress`** (repeated identical calls, with a progress predicate), **`memory-provenance`** (a source tag on every notebook write, a card that refuses a think over untrusted memory), **`privilege-scopes`** (minimal grants, elevation recorded), the pack **`content-digest`** checked at registration and the **tool-description integrity** check, the **policy-conditioned classifier** over any cartridge with the rulebook as policy, **inter-agent authentication**, the **Cedar** and **Bedrock automated-reasoning** connections. _Formal verification_ stays research.

### D. Not in the catalogue at all (G109–G116)

A bank's control framework — SS1/23, Consumer Duty, DISP, GDPR Art. 22, the AI Act's Arts. 14 and 86, DORA/SS1/21 — names techniques the survey categories of `19-…` did not, because that survey was of agent security, not of model risk and conduct. None of these is an entry; some exist in part as mechanisms, which makes the omission a class-A gap as well.

| Gap  | Technique (proposed entry id)                                                                                                                                                                                                                            | Framework                                       | Exists in part as                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| G109 | **Confidence gating and abstention** (`confidence-gate`); **calibration monitoring** (`calibration-monitoring`)                                                                                                                                           | SS1/23 validation; AI Act Art. 14               | `readGate`, the calibration pane — unfitted, uncatalogued                                                      |
| G110 | **Contestability and appeal** (`contestability`): a route to a person, the appeal recorded and decided                                                                                                                                                  | GDPR Art. 22(3); AI Act Art. 86; DISP           | `ledger.appeals`, `appeal-handled` on lending only                                                             |
| G111 | **Mandatory disclosure and consent recording** (`mandatory-disclosure`); **vulnerability detection** (`vulnerability-detection`) as a reader with a gate, not a regex                                                                                     | CONC 7, COBS 4, FG21/1, Consumer Duty           | collections' disclosure-as-said, `record-a-disclosure`, the `support-need` reader                              |
| G112 | **Timeliness and escalation SLAs** (`timeliness`): a case past its deadline escalates by the clock                                                                                                                                                      | DISP timescales, PSR APP, CONC 7                | DISP ticks in complaints truth; the clock's handoff queue; `time-to-decision`                                  |
| G113 | **Model inventory, version pinning and change control** (`model-change-control`): the cartridge, the stack, the knobs and the prompt digested on the kit file, a change refusing to run until re-validated or reviewed; **parameter-change governance** (`knob-change-review`) | SS1/23 principles 1 and 3; AI Act Art. 12       | the agent card, `kit-file requires`, cassette digests, knob overrides on a campaign (unrecorded)                |
| G114 | **Dependency failover and degraded mode** (`dependency-failover`); **cost budget** in money (`cost-cap`); **tool-argument schema validation** at `pre-act` (`tool-argument-validation`); the **request timeout** as a control                              | SS1/21, DORA; SS1/23                            | `provider-fault` + _Fallback_; the DGX pack's failover; `validateAgainst` at stages only; the 60 s abort        |
| G115 | **Override-reason capture** (`override-reason`): when a person overrules a bot or a bot's refusal is waived, the reason is on the trace; **adaptive approval throttling** (`19-…` #35)                                                                   | AI Act Art. 14(4); SS1/23                       | `approval.resolved.by` without a reason; `approvalsPerCase` counted only                                       |
| G116 | **Orchestrator chokepoint and cascade breaker** (`19-…` #33, #34); **shadow deployment** (`shadow-mode`); **prompt integrity** (`prompt-integrity`: the system prompt and brief digested and change-detected); **output secret scan** (`secret-scan`)      | OWASP ASI07/ASI08; SS1/23                       | the group Watchbot and breaker; the Gate's shadow; the key-leak test over the trace                            |

Three more belong in the catalogue as **not applicable, with the reason**, so the claim is not implied: data retention and deletion (local-first, nothing retained by the product); access control on the toolkit's own configuration (no tenancy); content provenance (C2PA) on what a bot says (text to a simulated customer, no media).

### E. The inventory's shape (G117–G118)

| Gap  | Finding                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G117 | **No row per control instance.** The catalogue is keyed by technique, the map by obligation, the register by row, the Studio by component, the readings by subject. "The tipping-off card on the fraud desk" is in all five and identical in none. There is no fold a page or a pack can read that says, for one control: built, fitted where, fired when, measured, effect, read, configurable where. |
| G118 | **No orphan rule.** Nothing refuses a component, card, evaluator, reader, knob or ceiling that is in no catalogue entry and no map row — which is how class A happened — and nothing refuses an entry whose `implementedBy` is prose that resolves to no id.                                                                                                                                       |

## 4. The target: one Control Inventory

### 4.1 The control instance

A **control instance** is one registered thing that constrains, measures or records a bot's behaviour, keyed `{kind}:{id}`:

| Kind          | Source of truth                                                             | Example                                            |
| ------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `component`   | `registry.listGuardrailComponents()`                                        | `governance/taint`                                 |
| `guardrail`   | the factories (`GOVERNANCE_GUARDRAIL_IDS`, the monitor's)                   | `connector/tool-blocklist`                         |
| `policy-card` | `registry.listPolicyCards()`                                                | `fs-fraud/policy/never-tip-off`                    |
| `evaluator`   | `registry.listEvaluators()`                                                 | `fs-lending/explanation-faithful`                  |
| `gate`        | the campaign files' gates, by campaign and id                               | `fs-fraud-baseline#parity:false-freeze-across-age-bands` |
| `reader`      | `registry.listReaders()` with its gate, if any                              | `fs-servicing/reader/category`                     |
| `knob`        | the world's `config.knobs` schema                                           | `fs-lending#referRatioPercent`                     |
| `ceiling`     | `DomainSpec.decisionRights`                                                 | `fs-bank/uk-retail-banking#sar-filing`             |
| `stage-guard` | a `StageSpec.guards` fit                                                    | `fs-lending/lending#decision:stage-in`             |
| `mechanism`   | declared, not registered: the engine's and the workflow's fixed behaviour   | `core/request-timeout`, `workflow/validate-against`, `gate/shadow-mode` |
| `model`       | error and reviewer models                                                   | `fs-bank/reviewer/case-handler`                    |
| `artefact`    | `CONTROL_ARTEFACT_IDS`                                                      | `assurance-pack`                                   |

`mechanism` is the new kind: a small declared list in `governance` (`controls/mechanisms.ts`) so the engine's own fixed behaviour — which a reader can observe and test but not fit — has an id the catalogue's `implementedBy` can resolve to, instead of prose.

### 4.2 The status model — eight facets, each with a source

| Facet            | Values                                                                                                   | Folded from                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Coverage**     | shipped · connectable · bespoke · blueprint · not-applicable                                             | the catalogue entry the instance implements                                                                                              |
| **Built**        | registered · mechanism · declared-only                                                                   | the registry, the mechanism list                                                                                                         |
| **Fitted**       | the shipped stacks and configurations that carry it; `unfitted`                                          | `Stack` fits, `WorkflowConfig.stack`/`stageStacks`/`guards`, the Kit's Safety brick                                                      |
| **Exercised**    | fired · checked-silent · never-ran, with the last run's date                                             | the CI campaign reports' `guardrail.checked`/`tripped`, `stage.completed.guards`, `reader.answered`, `evaluation.recorded`               |
| **Measured**     | recall · precision · unmeasured · not-applicable                                                         | the benchmark (WP123's `measured`)                                                                                                       |
| **Effect**       | evidenced · inconclusive · untestable · untested                                                         | the register, **per instance** once G103 is fixed                                                                                        |
| **Reviewed**     | unread · accepted · amended · rejected                                                                   | the reading desk, over the entry, the row and the instance's own cited values                                                            |
| **Configurable** | the surfaces that can change it (Studio, Spec Lab, Experiments, the Kit's dial) and its schema; `fixed`  | `configSchema`, `knobs`, `dial`, the stack's fit settings                                                                                |

Every value has a closed vocabulary and a fold that produces it; nothing is typed in. Where a facet does not apply, the row says _not applicable_ with the reason (tenet 28 extended from coverage to all eight).

### 4.3 The surfaces

- **`controlInventory(registry, catalogue, campaigns, results, benchmarks, readings)`** in `governance/reports/control-inventory.ts`: one row per instance, the eight facets, the catalogue entry, the map rows citing it, the obligations it claims.
- **`/workshop/controls`**: the page — a Matrix by kind × facet, a filter in the URL (so a saved view keeps it), each row opening to its description, its sources, its facets with their evidence, and _Configure in…_ / _Read in…_ / _Measure in…_ links to the surface that can.
- **`craftabot controls list | export --format markdown|json`**: the maintainer's and the auditor's copy.
- **The assurance pack's §1 inventory** gains the table; the catalogue page and the Studio read the same fold for their columns.
- **`checkControlInventory`** in `pack-testkit`, run in CI over every shipped pack: every instance maps to at least one catalogue entry or is on the declared _uncatalogued_ list with a reason; every entry's `implementedBy` resolves to an instance id; every map row's evidence resolves (already) **and** every instance of a desk is cited by at least one row of that desk's map or is declared _supporting_ (G118).

## 5. Decisions (all five settled 2026-10-01)

1. **Are ceilings enforced?** **Decided 2026-10-01: a mode, default `measure`.** Today measured only (G97). A `WorkflowConfig.ceilings: 'measure' | 'enforce'` mode, default `measure` so every golden run and experiment is unchanged; `enforce` turns a breach into a `pause` to a person at the stage boundary. The catalogue entries then say which.
2. **One page or two?** **Decided 2026-10-01: two.** The catalogue stays the page of _techniques_ and the new `/workshop/controls` is the page of _instances_; each links to the other by entry id. Folding them into one would lose the catalogue's taxonomy and sources.
3. **What is the orphan rule's severity?** **Decided 2026-10-01: a failing CI check from the first edition**, with the declared _uncatalogued_ list seeded with class A so the check is green on day one and shrinks.
4. **Which class-D entries are the bank's, and which are generic?** **Decided 2026-10-01: as proposed.** Contestability, disclosure, vulnerability, timeliness and override-reason land as `bankingRelevance: 'core'` with FCA/DISP/GDPR sources; change control, failover, cost, argument validation, shadow mode, prompt integrity as generic.
5. **The Kit.** **Decided 2026-10-01: out of scope.** Nothing here reaches purpose 1 except through the Safety brick's existing stack picker; a child-facing inventory is a Day 9 question.

## 6. The phased plan — Phases AJ–AN, WP132–WP150

Sizes as in `101-…`: **S** a session or two, **M** several, **L** a week. Every WP that adds a cited row adds it `pending` to the reading desk. Each phase closes with an exit review in §10.

### Phase AJ — The honest inventory (WP132–WP136)

_Nothing new is claimed until what is claimed is true, and until there is one place to claim it._

| WP        | What                                          | Definition of done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Size | Retires                                                                   |
| --------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------- |
| **WP132** ✅ | **Done 2026-10-01 — `86-CATALOGUE.md` §9.** **The catalogue's second edition (2026-10)**  | Entries for G91–G96 and G109–G116 (some twenty new, each cited, `pending`); the three _not-applicable_ entries with reasons; `four-eyes`/`autonomy-levels` notes corrected to _measured, not enforced_; `policy-card` declares `pause`; the `mechanism` list in `governance` and every prose `implementedBy` replaced by an id; `docs/catalogue.md` regenerated; `checkCatalogue` refusing prose                                                                                                                       | M    | G91–G96, G97 (the claim), G105, G109–G116 (the entries)                   |
| **WP133** ✅ | **Done 2026-10-01 — §10's WP133 note.** **The inventory fold and the orphan rule**    | `controlInventory` with the eight facets; `checkControlInventory` in `pack-testkit` and in CI with the seeded _uncatalogued_ list; `Exercised` folded from the shipped campaign reports; the register's effect **per instance** (`experiment.controls` must name rows the stack's fits cite, the designer's default narrowed to those); a reading counted in the pack's `review` figures                                                                                                                                  | M    | G103, G104, G117, G118                                                    |
| **WP134** ✅ | **Done 2026-10-01 — §10's WP134 note.** **The page, the CLI and the pack**            | `/workshop/controls` with the Matrix, the URL filter, the row drawer, the _Configure / Read / Measure in…_ links; `craftabot controls list \| export`; the assurance pack's §1 table; the catalogue page and the Studio reading the fold; the Studio showing a stack's `controls` and `obligations`; a visual shot and the reader's walk                                                                                                                                                                                 | M    | G106 (the Studio half), W-5                                               |
| **WP135** ✅ | **Done 2026-10-01 — §10's WP135 note.** **The rows brought into step**                | The DISP/SS1/21 "pending" lines corrected in `CLAUDE.md` and `53-…`; a `no-regression` gate on the lending book campaign so the SS1/23 row's evidence is present; the lending stack's tag fixed, `checkStack` refusing a tag outside `OBLIGATION_TAGS`; `controls`/`obligations` on the complaints, advice and fraud stacks; a _plan-understood_ evaluator on collections; the fraud card and advice evaluator cited; `advice-boundary` sourced (or its framework named as the bank's own policy); the Conduct lamps read from the desk's own map rows | S    | G101, G102, G106, G107                                                    |
| **WP136** ✅ | **Done 2026-10-01 — §10's Phase AJ exit review.** **The Phase AJ exit review**                  | Every instance has a row; CI green on the orphan rule; the catalogue has no prose `implementedBy`; the readings queue counts the new entries; `docs/manual` Part J §66 _The Control Inventory_                                                                                                                                                                                                                                                                                                                           | S    | —                                                                         |

**Exit:** a reader can open one page, point at any control and read eight true facets.

### Phase AK — What exists, wired (WP137–WP140)

_The three largest class-B gaps are controls that are built and unfitted. Fit them, with identity tests so every golden run that should not change does not._

| WP        | What                              | Definition of done                                                                                                                                                                                                                                                                                                                                                                             | Size     | Retires                     |
| --------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------- |
| **WP137** ✅ | **Done 2026-10-01 — §10's WP137 note.** **Stage guards on every journey** | Each desk's decision stage carries a `stage-in` policy card (the desk's existing four-eyes or affordability card) and a `stage-out` breaker on its headline evaluator, as content in the workflow; the golden runs re-held with the boundary verdicts on `stage.completed.guards`; the canvases show the points lit (W-3 closed); `Fitted` and `Exercised` turn green on the inventory               | M        | G98, W-3                    |
| **WP138** ✅ | **Done 2026-10-01 — §10's WP138 note.** **Reader gates declared**         | The servicing, disputes and complaints classify stages run on their reader executors with `gate: { threshold, else }` in the shipped configuration at levels 3+; the rule readers' confidence 1 means the gate never fires on them, which the identity test holds; the LLM reader cassette (WP114's) runs the same stages under the gate in CI, where the gate does fire; the calibration pane reads it | M        | G99, G109 (the mechanism)   |
| **WP139** ✅ | **Done 2026-10-01 — §10's WP139 note.** **Ceilings as a mode**            | `WorkflowConfig.ceilings: 'measure' \| 'enforce'` (decision 1); `enforce` pauses to a person at the boundary, `pause` on the trace; the book campaigns gain an `enforce` level; the register's human-oversight experiment re-run with it; the entries updated                                                                                                                                      | M        | G97 (the code)              |
| **WP140** ◐ | **Part done 2026-10-02 — §10's WP140 note: Llama Guard 3 measured; the hosted four wait on keys.** **Measured stacks**               | The benchmark cassette recorded for every service a key exists for (WP125's checkpoints, taken when keys exist; stand-ins stay the CI default); `DESK_SCREENING` documented as the stand-in config and the inventory's `Measured` reading the cassette's figures; a list price cited on the benchmark                                                                                             | S + keys | G100 (as far as keys allow) |

**Exit:** no shipped journey has an empty guard list; no classify stage lacks a gate; the inventory's `Fitted` column has no `unfitted` shipped component on the desks that use it.

### Phase AL — The unbuilt techniques (WP141–WP144)

_Catalogue entry first (already there), mechanism second, benchmark level third._

| WP        | What                                                                   | Definition of done                                                                                                                                                                                                                                                                                                                                                       | Size | Retires                                                        |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | -------------------------------------------------------------- |
| **WP141** ✅ | **Done 2026-10-02 — §10's WP141 note.** **`no-progress`, `memory-provenance`, `content-digest`** | `governance/no-progress` at `pre-act` over repeated identical calls with the world's progress predicate; `memory.updated.source` on the trace and `governance/memory-provenance` with a `memory-is-untrusted` leaf; a `digest` on every pack manifest and tool description, `checkPack` refusing a mismatch at registration; three entries to _shipped_; a benchmark level for the first two | M    | G108 (three of eight)                                          |
| **WP142** ✅ | **Done 2026-10-02 — §10's WP142 note.** **`privilege-scopes`** | A component that starts a bot with the Connector's minimal scopes and records an `elevation.requested`/`resolved` pair as events (`02-…` §7), the approval round-trip reused; `connector/tool-blocklist` folded in as its first instance; the entry to _shipped_                                                                                                           | M    | G91 (the mechanism), G108                                      |
| **WP143** | **The policy-conditioned classifier and inter-agent authentication**   | `governance/policy-conditioned` as an `llmReader` over any cartridge with the desk's rulebook as the question's guide, measured on the adversarial benchmark; a signed `group` message (`principal` + digest) verified at `pre-think` by `governance/peer-auth`, the party-line scenario its test; two entries to _shipped_                                                   | M    | G108                                                           |
| **WP144** | **The Cedar and Bedrock automated-reasoning connections**              | Two harness-only connections on the shell with stand-ins and checkpoint commands, recorded _connectable, checkpoint pending_ — the first use of the status                                                                                                                                                                                                                 | S    | G108 (the connections); _formal verification_ stays blueprint  |

### Phase AM — The bank's missing controls (WP145–WP149)

_Each is a catalogue entry from WP132, a control-map row with a regulation, a mechanism, an evaluator or gate that proves it, and an inventory row with eight true facets._

| WP        | What                                     | Definition of done                                                                                                                                                                                                                                                                                                                                                                                                                                       | Size | Retires                        |
| --------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------ |
| **WP145** | **Contestability, disclosure, vulnerability** | `appeal` as a workflow handoff kind on every desk with an adverse decision (lending, onboarding, disputes, complaints), `appeal-handled` generalised; `disclosure.given` on the trace with the wording digested, a `mandatory-disclosure` card per desk citing CONC 7 / COBS 4 / PSR APP; the servicing `support-need` reader fitted with a gate as `vulnerability-detection` on every desk's intake stage, FG21/1 cited; rows and evaluators                 | L    | G110, G111                     |
| **WP146** | **Timeliness and override reasons**      | `StageSpec.deadline` in ticks, the clock escalating a case past it (`stage.overdue`), DISP's and PSR's timescales as the content, a `timeliness` gate kind; `approval.resolved.reason` required when a person overrules a recommendation or waives a refusal, the `override-reason` evaluator; the human-oversight experiment re-run                                                                                                                       | M    | G112, G115 (the reason)        |
| **WP147** | **Change control**                       | The kit file's `digest` over cartridge, stack, knobs and prompt; `run.started.changed` when it differs from the last validated digest; a `knob-change-review` reading kind so a knob override on a campaign is read like a calibration row; `model-change-control` as an SS1/23 row on every desk                                                                                                                                                       | M    | G113                           |
| **WP148** | **Resilience and bounds**                | `dependency-failover` as a component over a provider list (the DGX pack's failover generalised), a `provider-fault` incident deck proving it; `cost-cap` in money from the cassette's list price; `tool-argument-validation` at `pre-act` against the tool's schema as a component (the registry's refusal made visible as a verdict); the request timeout and the value cap as declared mechanisms with knobs                                               | M    | G114                           |
| **WP149** | **Oversight ergonomics and the rest**    | Adaptive approval throttling (`approval-mode: 'adaptive'` raising the tier as `approvalsPerCase` climbs, measured against confirmation fatigue); `shadow-mode` as an entry over the Gate and over a stack on a campaign (`stack.mode: 'shadow'` — verdicts recorded, never applied); `prompt-integrity` and `secret-scan` as components; the orchestrator chokepoint entry over the group's existing breaker                                                 | M    | G115 (the throttle), G116      |

### Phase AN — Assurance and the tail (WP150)

| WP        | What                                                | Definition of done                                                                                                                                                                                                                                                                                                                                                                | Size |
| --------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **WP150** | **The register regenerated, the readings, the manual** | Every new control in at least one experiment (the eight designs gain levels, or a ninth _controls_ design runs each new component against `none`); `docs/evidence/` regenerated; the inventory's `Effect` column populated; the second edition's entries and every new row on the reading desk; the catalogue's and the inventory's roundels; Part J; the Phase AN exit review | M    |

## 7. Dependency sketch and sizing

```
AJ  WP132 catalogue ──► WP133 fold+check ──► WP134 page/CLI/pack ──► WP136 exit
                                 │                 ▲
                                 └── WP135 rows ───┘
AK  WP137 stage guards ─┐
    WP138 reader gates ─┼─► (inventory Fitted/Exercised green)      WP140 needs keys
    WP139 ceilings mode ┘
AL  WP141 ─ WP142 ─ WP143 ─ WP144           (each lands as a benchmark level)
AM  WP145 ─ WP146 ─ WP147 ─ WP148 ─ WP149   (each a row + mechanism + evaluator)
AN  WP150 register, readings, manual
```

Roughly: AJ a week and a half; AK a week; AL a week; AM two weeks; AN three sessions — **five to six weeks** of sessions, AJ first and alone, AK before AL and AM because the fitted journeys are what the new controls are measured on.

## 8. What "done" looks like

1. `/workshop/controls` lists every control instance in the product with eight facets, each folded, none typed; `craftabot controls export` gives the same table; the assurance pack carries it.
2. `checkControlInventory` is green in CI with an empty _uncatalogued_ list.
3. The catalogue's second edition has no `implementedBy` prose, no entry claiming more than the code does, and the class-D techniques either shipped or honestly placed.
4. No shipped journey stage has an empty guard list; every classify stage declares a gate; ceilings have a mode.
5. The five unshipped entries and the named components are shipped and benchmarked; the two new connections are _connectable_.
6. The bank has rows, mechanisms and evaluators for contestability, disclosure, vulnerability, timeliness, change control, failover, override reasons and shadow mode, each cited.
7. The register has an evidenced, inconclusive or untestable verdict for every instance a stack carries.
8. Every new cited row is on the reading desk; the count of what Andrew has to read is stated, not hidden.

## 9. Out of scope, said so it is not implied

Compliance opinions; a live reviewer fitted to observed people; a corpus of real calls; the Gate as a product (auth, tenancy, rate limits — `101-…` §7); other industries' packs; the Kit beyond the Safety brick's picker; retention, tenancy access control and C2PA, recorded _not applicable_ with reasons in WP132.

## 10. Exit reviews and work-package notes

_(Recorded here as each work package and phase closes.)_

> **WP132 — done 2026-10-01.** The catalogue's second edition, `2026-10`: 68 entries, 47 shipped, 10 bespoke, 5 blueprint, 6 not applicable, every implementation a control reference. Recorded in `86-CATALOGUE.md` §9.

> **WP133 — done 2026-10-01.** As §4 describes, with these specifics and divergences:
>
> - **The fold** is `controlInventory` in `governance/reports/control-inventory.ts`: one row per instance — components, the Connector's guardrail, cards, stacks, readers, evaluators, the declared mechanisms, gate kinds, knobs, ceilings, error and reviewer models, artefacts, and whatever else the catalogue cites — with the eight facets. *Coverage* is the citing entries, a card inheriting through `governance/policy-card`, a stack through its fits and a reader through the confidence gate. *Fitted* reads the stacks, the stage guards, the workflow configurations and, structurally, the shipped campaign and experiment files (`campaignUses`). *Exercised* is `fired` · `not-fired` · `not-run` · `no-runs`: a run summary keeps trips by guardrail id but not checks, so a guard that ran and never tripped reads *not fired*, which is all the record can say. *Effect* is the best register verdict over the map rows that cite the instance (G103). *Reviewed* folds the readings of its entries, rows, ceiling or model.
> - **Two `core` seams**, both additive: the reference kinds `ceiling` (`{domainId}#{kind}`) and `knob` (`{worldId}#{knob}`), and `WorldDefinition.knobs` (`43-…`'s dated note), declared by four worlds.
> - **The orphan rule** is `checkControlInventory` in `governance/controls/check.ts`, beside `checkCatalogue` rather than in `pack-testkit`, which does not depend on `governance`. It holds components, guardrails, cards, stacks, readers, evaluators and mechanisms; CI runs it over every pack in `harness/src/control-inventory.test.ts`. Its first run found three orphans: the rubric judge and the benchmark (now cited by *LLM as judge* and *eval harness*), and `fs-advice/execution-approved`, declared in `UNCATALOGUED_CONTROLS` until WP135 cites it.
> - **G103:** the Experiments designer no longer claims every row of the desk's map. It claims the rows a person ticks on the page's new *Controls this tests* fieldset, else the guard stack's own `controls`, else none.
> - **G104:** the assurance pack's counts honour a reading (`53-…`'s dated note).
> - **What the inventory says about the bank on its first fold** (256 rows): no reader is fitted behind a gate in any shipped configuration (G99); no shipped configuration, campaign or experiment names a stack — stacks are reached through the Studio, the Spec Lab and `?stack=`; the rubric and hosted judges are fitted in no shipped campaign; two gate kinds (`drift`, `no-regression`) gate nothing shipped (G101). The test pins the first two as the code's present truth, so WP137–WP138 must change them on purpose.

> **WP134 — done 2026-10-01.** As §4.3 describes:
>
> - **`/workshop/controls`** (`lib/workshop/controls.ts`): readouts, a kind × facet Matrix whose cell narrows the list, filters for kind, catalogue status, fitting, text and catalogue entry, all in the URL. A row opens its eight facets with links to where it is read, measured and turned. The page reads the stored runs, campaign reports, experiment results, benchmarks and readings. The rail's *Controls* sits beside *Catalogue*, which links each technique to its instances (`?entry=`).
> - **`craftabot controls list | export [--format json|markdown]`** (`harness/src/commands/controls.ts`), over the installed packs, the shipped campaigns, `experiments/` and, with `--store`, a run store. The words are `governance`'s `controlFacetWords`, so the page and the export say the same thing.
> - **The assurance pack's §1** gains *The controls on this bot*: its guardrails, fitted cards and the evaluators that judged its runs, as the inventory words them (`AssurancePack.inventory.controls`). Evaluation records now count toward *exercised*.
> - **The Studio** shows a stack's `controls` and `obligations` claims (G106's Studio half).
> - **Divergences.**
>   - The *Catalogue* facet inherits for ceilings (through the ceilings' mechanism), gate kinds (through campaigns) and artefacts (through the mechanism that makes each). Knobs and models read *not applicable*, as settings and simulation apparatus rather than techniques.
>   - `@craftabot/governance` is declared side-effect free (`01-…` §8's dated note). That took 136 KiB off the Kit's first page.
>   - The rail's `resolve` cast is now a single route, as the palette's and *Linked from*'s were. TypeScript stops matching a union of more than 25 routes against `resolve`'s overloads.
> - **The e2e.** `e2e/controls.spec.ts`; the route on the axe, access, density and palette lists; `ws-controls.png` (the knobs). The experiments e2e now ticks the row its design tests. Twenty-four win32 baselines moved with the rail's new entry and are re-taken; the Linux set comes from CI's artefact.

> **WP135 — done 2026-10-01.** As §6 lists:
>
> - **G101.** The lending book campaign gains `no-regression-on-the-book`. CI hands it a committed baseline (`campaigns/baselines/fs-lending-book.campaign-report.json`), so the gate is decided rather than inconclusive, and the bank's SS1/23 row cites a gate a shipped campaign declares.
> - **G102.** The two rows `CLAUDE.md` and `53-…` called `pending` have carried their evidence since WP72; both say so now.
> - **G106.**
>   - The lending stack's obligation is `fca:cd:understanding`.
>   - `checkStack` refuses a claimed obligation outside the vocabulary or a claimed control row no map has (`stack.claims`, with `knownObligations`/`knownControls`); `harness/src/stacks.test.ts` runs it over every stack.
>   - The complaints stack claims the bank's DISP row, and the advice and fraud stacks name their obligations.
> - **G107.**
>   - `fs-collections/plan-explained` stands behind the collections row's first half (`91-…`'s dated note, with its finding).
>   - The fraud card *no auto-release from instructions in records* has a row of its own (`records-are-data`), and the advice desk's `execution-approved` is cited on its SS1/23 mitigants row. `UNCATALOGUED_CONTROLS` is empty, which meets §8 item 2 early.
>   - The advice boundary names its framework (FCA PERG 8 and FG17/8; `unreviewed`, for a reader to confirm).
>   - The Conduct page's tipping-off, KYC and DISP lamps read every evaluator the control maps cite on a row with the lamp's obligation tag (`evaluatorsTagged`), pooled, so the onboarding desk's `hit-contained` now lights the tipping-off lamp. The vulnerability matrix still reads the advice desk's evaluator alone, because its *recognised* axis is that evaluator's own label.
> - **Baselines.** Three win32 baselines moved: the assurance page's new row, the evaluators list and the collections page.

> **Phase AJ exit review — 2026-10-01 (WP136).** The phase's exit was *a reader can open one page, point at any control and read eight true facets*. **Met.** `/workshop/controls` folds 261 controls, and `craftabot controls export` gives the same table. The DoD, item by item:
>
> - **Every instance has a row: met.** The fold enumerates every registered component, card, stack, reader and evaluator, every declared mechanism, gate kind, knob and ceiling, the models and the artefacts. `harness/src/control-inventory.test.ts` holds the refs unique and the kinds present.
> - **The orphan rule green: met locally.** The harness test is in CI's unit run, and `UNCATALOGUED_CONTROLS` is empty. CI itself has not run, since `phase-aj` is unpushed.
> - **The catalogue has no prose `implementedBy`: met.** The schema refuses prose, and `checkCatalogue` resolves every reference (`catalogue.implemented-by`).
> - **The readings queue counts the new entries: met.** 284 subjects: 68 catalogue entries and 65 control rows among them.
> - **The manual's Part J §66: met**, with Figure 31 (`ws-controls.png`, win32). The PDF is not rebuilt; that waits for WP150's Part J additions, so it is rebuilt once.
>
> Against §8's done list: item 1 is met. Item 2 is met early: the uncatalogued list is empty after WP135. Item 3 is met in part: the second edition has no prose and no overclaim, and the class-D techniques are placed honestly as bespoke or blueprint; Phases AL and AM ship them.
>
> **Findings the phase surfaced.**
> - No shipped path tells a collections customer the agreed plan in words (`91-…`).
> - No shipped configuration, campaign or experiment names a stack.
> - No reader is gated anywhere shipped.
> - 31 evaluators are named by control rows but by no catalogue entry. That is allowed by the orphan rule and shown on the page.
> - The `drift` gate kind gates nothing shipped.
> - The Kit's first page was carrying the catalogue on every visit; 136 KiB were recovered.
>
> **For Andrew's reading.** The 23 new catalogue entries and their sources; the fraud desk's new `records-are-data` row; the advice boundary's framework (FCA PERG 8 and FG17/8); the lending book's committed baseline (re-take it when the book is meant to change); the budgets (`01-…` §8).
>
> **Outstanding.**
> - The Linux baselines for the shots this phase moved come from CI's `visual` artefact on the first push, as before: 24 rail shots, `ws-controls.png`, and the three WP135 moved.
> - The PR for `phase-aj`.
>
> **Phase AJ is closed. Next: Phase AK, WP137–WP140.**

> **WP137 — done 2026-10-01.** As §6 has it, with one divergence of substance:
>
> - **The stage gates.** Every shipped journey's irreversible stage is held at `stage-in` by a card of its own: disburse, execute, redress, file the SAR, open, reimburse, agree, close. The cards are built by `fs-bank`'s `stageGateCard` and registered on the desks' manifests, but kept out of the cards their loop stacks fit, so no loop trace moved. A gate blocks unless the desk's own predicates show the steps before the stage done: identity verified, affordability assessed and a decision made before a disbursement; the alert opened and decided before a SAR; and so on. Each predicate was read to confirm it is the desk's state and never the truth. The cards are cited on each desk's four-eyes or mitigants row.
> - **The runtime.** A boundary guard's context now carries the desk's predicates (`69-…`'s dated note), so `world-predicate` works at a boundary.
> - **The divergence.** The plan named a `stage-out` evaluator breaker on each journey's headline evaluator. **None is fitted.** At `stage-out` a breaker judges the stage's own trace. The desks' process evaluators (*identity before decision*, *circumstances before plan*) need the whole case's trace, and would stop journeys that did nothing wrong. The headline evaluators that would work (*decision matches the rules*) read the truth: a breaker that knows the answer is not a control a bank could run. The breaker stays a Studio and experiment choice. The catalogue entry says so.
> - **The finding.** On its first run the collections gate held every rules-only journey at the agreement: 40 of 40. **The bank's own rule path had agreed plans — contracts on the account — for customers no step had verified.** The rules-only configuration now verifies at intake (`intake-verified-v1`); configurations with a bot verify at contact, as before. Every book campaign and the seven-desk bank day complete with the gates on.
> - **W-3 closed** (`87-…`'s dated note): the Studio offers every stage's boundaries.
> - **Tests.**
>   - `fs-bank/src/stage-gate.test.ts`: the gate blocks while any precondition is missing, allows once all hold, and is silent on any other stage.
>   - `workflow/src/run.test.ts`: a boundary guard sees the predicates.
>   - `workflow/src/journey.test.ts`: `everyBoundary`.
>   - `harness/src/control-inventory.test.ts`: every irreversible stage gated, fitted and cited.
>   - The eight journey snapshots re-taken.
> - **Exercised.** Turns green on the inventory where runs are stored: CI's book campaigns run every gate.

> **WP138 — done 2026-10-01.** As §6 has it, with two specifics:
>
> - **Where the gates stand.** The plan said levels 3 and up. At those levels the classify-shaped stages are a person's or a bot's, not a reader's, and swapping a reader in would change what those configurations are. The gated readers therefore stand **where the rules stood**: servicing's `classify` and `record`, disputes' `classify` and complaints' `root-cause`, in the rules-only and Level 2 configurations. Each has a gate at the desks' line (`fs-bank`'s `DESK_READER_LINE`, 0.8, a stated default) with the bank's own rule as the `else`. Each desk exports these as `*_GATED_READERS`.
> - **What it changes.** The shipped readers are rules, sure every time, so no outcome moves. The identity tests now take the shipped configuration with the rules put back as their baseline, and still hold byte for byte. The gate is real all the same. `fs-servicing/src/readers.test.ts` swaps in a reader that is never sure (it answers *card* at half the weight) and the gate fires: the stage records `gated`, the rule decides, the reader's answer never reaches the desk, and the journey ends as the rule's does. The inventory test pins that every reader a shipped configuration fits is gated.
> - **The divergence.** The plan named a recorded LLM reader run in CI where the gate fires. No cassette of an LLM reader on these desks exists yet; WP114's recording waits on a key. The servicing-readers reference experiment (the optional TypeSafe pack) is the measured case, and the unsure-reader test is CI's. The catalogue's *confidence gating* entry and the manual's §66 say so.

> **WP139 — done 2026-10-01.** As §5 decision 1 settled, with three specifics:
>
> - **The switch is `autonomy.enforce`**, on the autonomy record beside the ceilings it governs, rather than a separate `ceilings` field. It is off by default, recorded on the run's config, and every reference configuration still measures.
> - **Where it acts.** The runtime adds a `workflow/ceiling` guard at the output of the stage where the desk reads a decision's kind (`decisionKindOf`). On the lending desk that is `record`, where the decision is written down. A decision this configuration's level would take above its kind's ceiling pauses for a person through the boundary's own round-trip (`approval.requested`/`resolved`); a stage a person executed decided at no level. Confirmed, the decision counts at its ceiling and as that person's touch (`ceiling:<stage>`), so the breach rate falls and human load rises. Declined, the journey stops there, before anything is explained, checked or paid. `fs-lending/src/workflow.test.ts` holds both, and holds that the shipped Level 5 configuration still only measures.
> - **The divergence.** The plan named an `enforce` level on the book campaigns and a re-run of the human-oversight experiment. Adding a level changes the experiment's committed shape, so it lands with WP150's regeneration of the register, where it is run once. A campaign host answers a pause with *approved*, as it does every boundary pause; a reviewer model answering ceiling pauses is a follow-up.
> - **What now says otherwise.** The four-eyes and autonomy entries, the ceilings mechanism, the inventory's ceiling rows, the domain glossary, `core`'s domain schema comment and the manual's §66 say *measured by default, enforced where a configuration says so*.

> **Phase AK exit review — 2026-10-01.** WP137, WP138 and WP139 are done; WP140 waits. The exit, clause by clause:
>
> - **No shipped journey has an empty guard list: met.** All eight journeys hold their irreversible stage with a gate on the case file (WP137). Their other stages carry no boundary guard, deliberately: the gate sits where money or a record moves.
> - **No classify stage lacks a gate: met where a reader classifies.** Every reader a shipped configuration fits stands behind the desks' line (WP138). At Levels 3–5 the classify-shaped stages are a person's or a bot's, not a reader's.
> - **No unfitted shipped component on the desks that use it: met in substance, with a finding.** Sixteen components read *unfitted*; none is a desk's control left off.
>   - The egress pair is fitted by the host (`--egress none` in CI), not by a stack.
>   - Taint, untrusted-content marking and the quarantined reader are fitted by the Gate's presets and are the benchmark's levels. The registry cannot see the Gate's presets, so the inventory cannot either.
>   - Azure, Bedrock, Lakera, Prompt Guard and OPA are connectable services no desk stack names.
>   - The rest are general components (the blocklist, approval mode, no-repetition, the token budget, the breaker, the red-team seat) that the desks' cards and campaigns supersede.
>   - The finding is that the inventory does not see a Gate preset; registering the presets as stacks is a small follow-up.
> - **Ceilings have a mode: met** (WP139).
>
> **WP140 waits** on one of two things:
> - the hosted services' keys (WP125's checkpoints); or
> - your permission to pull the local guard models into this machine's Ollama. Ollama is running here, but holds only general chat models, not Llama Guard or Prompt Guard.
>
> With either, `craftabot benchmark run benchmarks/bank-adversarial.json --record` writes the cassettes, and the inventory's *Measured* column reads them unchanged. No list price is cited: the plan named one, and no source is in hand to cite.
>
> **Findings the phase surfaced.**
> - The collections rules-only journey agreed plans for customers it never verified; it now verifies.
> - The stage-out breaker over a stage's own trace cannot judge a whole case's process without truth (WP137's divergence).
> - The inventory cannot see the Gate's presets.
>
> **Phase AK is closed but for WP140. Next: Phase AL, WP141–WP144.**

> **WP140 — part done 2026-10-02.** The local half is taken. The hosted half waits on keys.
>
> - **Llama Guard 3 is measured.** `llama-guard3` (8B, 4.9 GB, pulled into this machine's Ollama with the builder's permission) answered all 1,408 rows of the seven adversarial corpora, live, with no errors. The cassette is `benchmarks/cassettes/guard-local--llama-guard.benchmark-cassette.json`. It holds the model's answers keyed by a digest of each request, and no key. CI's benchmark step replays it, so the reference report now carries a measurement where it had a stand-in.
> - **The figures.** Precision 92% (87–96%), recall 17% (15–20%), false alarms 3% (2–5%); tp 158, fp 13, fn 762, tn 475. By attack kind it caught exfiltration 65/196, injection 38/218, jailbreak 28/152, steer 19/173 and elicitation 8/181. The keyword baseline reads recall 26% at precision 81%.
> - **The finding.** Llama Guard is a *hazard* classifier (violent crime, privacy, specialised advice…), not an injection detector. It names the categories an attack reaches for (S7 privacy 75 times, S6 specialised advice 54, S2 non-violent crime 39) and is sure of what it flags, but it lets four in five attacks through, and steer and elicitation almost entirely. On the bank's corpora it is a precise, low-recall layer, below the keyword reader on recall. It does not replace an injection classifier.
> - **Prompt Guard is not measured.** Llama Prompt Guard 2 is a DeBERTa sequence classifier. Ollama serves only generative models, and no build of it exists in Ollama's library, so `guard-local/prompt-guard` cannot be served as the pack expects. Its fixtures remain what CI runs. Measuring it needs a host for the classifier (Hugging Face's transformers, or an ONNX runtime) behind the pack's three labels; that is not scheduled.
> - **The harness.** `craftabot benchmark run --record --only <serviceId,…>` calls just the services named live. Without it, `--record` would also have called the keyless Prompt Guard and recorded its failures. The rest answer from their cassettes or stand-ins, as without `--record` (`harness/src/commands/benchmark.test.ts`).
> - **The inventory.** `craftabot controls list --store <dir>` over a store holding the benchmark report reads 4 measured, up from 0 with no report: Llama Guard, the keyword reader, and the two marking components.
> - **What waits.** Model Armor, Azure, Bedrock and Lakera need their keys (WP125's checkpoints); then `--record --only <their ids>`. `DESK_SCREENING` is the configuration the desk stacks fit (every hook noted, offline), and the benchmark screens with each service's own defaults instead. No list price is cited: the local model costs nothing to call, and no hosted service is measured to price.

> **Phase AK follow-ups — 2026-10-02**, on `phase-al` before WP141. Both found reading `craftabot controls list`.
>
> - **Thirty-one desk evaluators read *uncatalogued*.** Each was cited by a control-map row, so the orphan rule passed, but no catalogue entry reached it. An evaluator now inherits `eval-harness` through a new mechanism, `evals/evaluators` (the evaluator contract), the way a reader inherits through the reader gate. The orphan rule does not count that generic inheritance as naming an evaluator: one nobody catalogued or cited still fails CI. Uncatalogued: 31 → 0.
> - **The inventory could not see the Gate's presets.** `@craftabot/gate/presets` is now a browser-safe subpath. `craftabot controls`, the CI inventory test and `/workshop/controls` register `GATE_CONTENT` beside the packs, so taint, untrusted-content marking, the quarantined reader and approval mode read *fitted* (in the Gate's stacks).
> - **Not changed, and why.** The desks' own stacks still read *unfitted*. The desk baselines fit the same guards as Safety bricks, and the identity test holds the two equal, but no shipped campaign names a stack. That is the true reading.

> **WP141 — done 2026-10-02.** Three techniques, each a component or a mechanism with its entry *shipped*:
>
> - **`governance/no-progress`** (`governance/guardrails/no-progress.ts`, `components/provenance.ts`). At `pre-act` it stops a run whose world has not moved for N turns (six by default), whatever was tried. A turn made progress when its call succeeded and either the world declares the action progress (WP45) or the world's state on the next `world.changed` differs from the one before. It reads the trace and nothing else, so a fork or replay judges the same.
>   - **Diverged:** the plan said "over repeated identical calls"; that is the loop-breaker (`governance/no-repetition`) already. The new rule counts turns without progress across *different* calls, the loop the loop-breaker cannot see.
>   - **What it does not catch:** talk on a desk. A `say` writes the transcript, which is the world's state.
> - **Memory provenance.** `memory.updated.source: 'untrusted'` marks a notebook write made after the bot read content marked untrusted and not quarantined (`02-…` §7's dated note). The write takes its context's label, as information-flow control does, whatever the words. Value matching cannot see an injected line's influence on what the bot writes next.
>   - The `memory-is-untrusted` leaf is in `core`, the policy compiler and the Studio's rule builder.
>   - `governance/memory-provenance` at `pre-think` stops a think over such a notebook, or annotates it.
>   - **Coarse by design:** a quarantined result does not taint, and a fork does not refold the label (as WP124's untrusted list).
> - **The content digest** (`core/src/pack-digest.ts`). `packDigest` covers what a pack tells a model and enforces as data: every tool's, action's, sense's and service operation's name, description and parameters; every goal card, policy card and stack in full; the id and description of every component, evaluator and reader. Code is not in it (a changed function is a version).
>   - The registry takes `pins` and refuses a pack whose declared `digest`, or its pin, differs. `checkManifest` reports `manifest.digest`.
>   - The harness pins every shipped pack from `packages/harness/packs.lock.json` (25 packs), written by `craftabot packs lock` and held current by `harness/src/pack-digests.test.ts`. A poisoned tool description fails registration; a stale lock fails CI.
>   - **Not done:** the Workbench does not pin yet (its edition packs differ per box), and kit files do not record digests.
> - **The catalogue:** `memory-provenance` moves from *bespoke* to *shipped* (one first-edition entry, inter-agent authentication, remains bespoke); `loop-detection` and `supply-chain-integrity` name the new parts. Two mechanisms: `core/memory-label`, `core/pack-digest`.
> - **The benchmark:** both components are levels on `bank-adversarial`, and both read *not applicable* with their reasons. They decide on proposed calls and on thoughts, and the corpus is text.
> - **Tests:**
>   - `governance/src/components/provenance.test.ts`: no progress across different calls, the reset by a moved world or a declared action, the limit; the memory refusal, its annotate mode and the leaf;
>   - `core`'s session test: a write after an unquarantined mark is labelled; one before it, or after a quarantine, is not;
>   - `core/src/pack-digest.test.ts`, `harness/src/pack-digests.test.ts` and `pack-testkit`'s `manifest.digest`.

> **WP142 — done 2026-10-02.** Least privilege with recorded elevation:
>
> - **The rule** (`governance/guardrails/privilege-scopes.ts`). It governs a set of calls and starts the bot with some of them granted. A governed call outside the grant is refused (`block-action`) or paused for a person.
>   - The pause carries `elevation: { scope }`, and the session writes `elevation.requested` and `elevation.resolved` beside the approval pair (`02-…` §7's dated note).
>   - A scope granted once is read back from the trace and stays granted for the run, so the second call does not ask again and a fork judges the same.
> - **The component** `governance/privilege-scopes` (`components/privilege.ts`): `governed`, `granted`, and `onElevation: 'ask' | 'refuse'`, with `ask` the default.
> - **The Connector's tool blocklist is its first instance.** `connector/tool-blocklist` is now the rule in refuse mode over the line's operations, granted the ones `scopes` names. It keeps its own id, description and words, so every trace reads as before (the guardrail tests are unchanged and green).
> - **Not done:** the Connector brick does not offer `ask` (a config field the Kit would render), and nothing persists a grant between runs. A bank would want both, with grants expiring.
> - **The catalogue:** `privilege-scopes` moves from *blueprint* to *shipped*. The Run Lab's trace names both events (*Asked for a wider scope*, *Scope answered*).
> - **Tests:**
>   - `governance/src/components/privilege.test.ts`: the grant, the pause with its scope, the grant read back from the trace, the refusal, the blocklist word for word;
>   - `core`'s session test: the four events in order, and none for a pause that names no scope;
>   - the starter's conformance fixture.
