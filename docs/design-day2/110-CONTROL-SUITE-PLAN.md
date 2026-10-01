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
| **WP137** | **Stage guards on every journey** | Each desk's decision stage carries a `stage-in` policy card (the desk's existing four-eyes or affordability card) and a `stage-out` breaker on its headline evaluator, as content in the workflow; the golden runs re-held with the boundary verdicts on `stage.completed.guards`; the canvases show the points lit (W-3 closed); `Fitted` and `Exercised` turn green on the inventory               | M        | G98, W-3                    |
| **WP138** | **Reader gates declared**         | The servicing, disputes and complaints classify stages run on their reader executors with `gate: { threshold, else }` in the shipped configuration at levels 3+; the rule readers' confidence 1 means the gate never fires on them, which the identity test holds; the LLM reader cassette (WP114's) runs the same stages under the gate in CI, where the gate does fire; the calibration pane reads it | M        | G99, G109 (the mechanism)   |
| **WP139** | **Ceilings as a mode**            | `WorkflowConfig.ceilings: 'measure' \| 'enforce'` (decision 1); `enforce` pauses to a person at the boundary, `pause` on the trace; the book campaigns gain an `enforce` level; the register's human-oversight experiment re-run with it; the entries updated                                                                                                                                      | M        | G97 (the code)              |
| **WP140** | **Measured stacks**               | The benchmark cassette recorded for every service a key exists for (WP125's checkpoints, taken when keys exist; stand-ins stay the CI default); `DESK_SCREENING` documented as the stand-in config and the inventory's `Measured` reading the cassette's figures; a list price cited on the benchmark                                                                                             | S + keys | G100 (as far as keys allow) |

**Exit:** no shipped journey has an empty guard list; no classify stage lacks a gate; the inventory's `Fitted` column has no `unfitted` shipped component on the desks that use it.

### Phase AL — The unbuilt techniques (WP141–WP144)

_Catalogue entry first (already there), mechanism second, benchmark level third._

| WP        | What                                                                   | Definition of done                                                                                                                                                                                                                                                                                                                                                       | Size | Retires                                                        |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | -------------------------------------------------------------- |
| **WP141** | **`no-progress`, `memory-provenance`, `content-digest`**               | `governance/no-progress` at `pre-act` over repeated identical calls with the world's progress predicate; `memory.updated.source` on the trace and `governance/memory-provenance` with a `memory-is-untrusted` leaf; a `digest` on every pack manifest and tool description, `checkPack` refusing a mismatch at registration; three entries to _shipped_; a benchmark level for the first two | M    | G108 (three of eight)                                          |
| **WP142** | **`privilege-scopes`**                                                 | A component that starts a bot with the Connector's minimal scopes and records an `elevation.requested`/`resolved` pair as events (`02-…` §7), the approval round-trip reused; `connector/tool-blocklist` folded in as its first instance; the entry to _shipped_                                                                                                           | M    | G91 (the mechanism), G108                                      |
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
