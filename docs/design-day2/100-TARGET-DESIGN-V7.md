# 100 — Target Design V7: The bank made fallible — readers, corpora, the person modelled, adversarial assurance, and the Gate

> **Status: proposed, 2026-09-29.** The Day 7 target, written against `main` at `406a7b0` (Day 6 merged as PR #50; the `jev-servicing` branch merged as PRs #51–#53 and one last commit; the manual at v1.4; the catalogue PDF added 2026-09-22). It extends `83-TARGET-DESIGN-V6.md` and does not replace it: every contract in `41-…` §6, `64-…` §6 and `83-…` §6 stands, and every section below names the one it grows. The implementation plan is `101-DAY7-ROADMAP.md` (Phases AC–AI, WP111–WP131), which cites this document section by section. The numbers `98-` and `99-` are two research notes from that branch (`98-JEV.md`, `99-DGX-SPARK.md`), outside any work package and not yet in the index; this document assumes they are read before it is judged, and §2 facts 1–4 come from them.
>
> **What changed in the brief.** Six days built the bank, its seven desks and eight journeys, the metrics, the clock, the experiments, the components, the Studio, the catalogue and the blueprint. Day 7 is asked for one thing above all: that the bank's evidence **mean something**. A read of `docs/evidence/` on 2026-09-29 finds that every reference experiment's outcome metric reads 100% against 100% (§2 fact 5): the scripted actors cannot err, the scripted reviewer is always right, and so no control has ever been shown to *do* anything. The one experiment on the project with a measured effect ran on the `jev-servicing` branch, with real models reading real (synthetic) text, and it found that the bank's own rules are the weakest reader in the building (§2 fact 1). Day 7 therefore makes the bank **fallible** on purpose — actors that err at cited rates, a person who is a model rather than an oracle, readers that answer with calibrated confidence — and gives it **corpora** worth reading, so that a control's effect can appear and be measured. It then turns outward: every connectable guard measured on the same adversarial corpus, and the first path from a Studio-built stack to a real agent's traffic — **the Gate** — which is the proving ground's exit toward purpose 2. Through all of it, the two hundred readings that await Andrew get a desk of their own.

---

## 1. Purpose

### 1.1 The vision, restated for this phase

A governance professional opens an experiment and reads an effect with an interval: the policy-card stack cut over-approval by so many points on a book worked by a bot that errs the way a bot errs, reviewed by a person who agrees with the recommendation more often than they should. They open a desk's classify stage and see three readers side by side — the bank's rule, a hosted classifier, a local model — each scored on a corpus that was labelled blind by someone other than its author, each with a reliability plot, and a gate that hands the uncertain cases to a person at a measured cost. They open the Guard Rack and see, for every vendor, what it caught and what it missed on the same two hundred attacks, at what latency and price. They save the stack they built in the Studio and run it in front of a real agent, in shadow mode, and the verdicts land on the same trace with the same digest. And every entry, row and right that is still marked *pending* sits in one queue where a reading takes a minute and leaves a record.

At the end of Day 7:

- **Every actor can err, and the error is on the trace.** A **fallible tier** (§6.1) errs at a cited rate, in a cited direction, from the seed; a **live tier at scale** runs a real model over a book through a **provider cassette** so CI replays it byte for byte. The seven reference experiments are re-run on both, and the Control Effectiveness Register records effects for the first time.
- **The person is a model with a citation.** A **reviewer model** (§6.2) answers a `human` stage with an accuracy, an automation bias, a time per case and a fatigue curve, each a calibration row with a source and a pending review. Human load gains a cost and a quality. The human-oversight experiment says what oversight *buys*, not only what it *costs*.
- **A judgment is a typed question with a calibrated answer.** A **Reader** (§6.3) takes a state and typed questions and returns typed answers with probabilities and a confidence. The bank's regex rules become the first readers, at confidence 1 and byte-identical to today; a hosted classifier and any chat model with constrained output become the second and third. A **`reader` executor** with a **confidence gate** is the workflow's fifth executor kind. `@craftabot/metrics` gains calibration.
- **A corpus is content.** A **Corpus** (§6.4) carries its rows, labels, tags, guide, question set, freeze digest, blind annotators with their agreement, and the readers that have seen it. `checkCorpus` refuses a corpus scored on data it has seen. A book can be drawn from a corpus. The Jev experiment's three servicing corpora are the first; every desk's classify stage gets one.
- **The bank is honest about its truth.** `checkDesk` (§6.5) refuses a truth leaf computed by a rule the desk runs. The servicing journey records before it acts. `touches` counts a review once. Disputes gets its matched pair. The four Phase AA books' incidences become calibration rows. Report v4 carries `workflowId` and `pairId`. The hosted-guard baselines are plugged in.
- **Every connectable guard is measured before it is fitted.** An **adversarial corpus** per desk and a **benchmark campaign** (§6.6) run every `GuardrailService` and every reader-as-guard over the same rows, recorded to cassettes, and the Guard Rack shows precision, recall, latency and cost per vendor. Four of the catalogue's *bespoke* components are built: untrusted-content marking, taint, the quarantined reader, the red-team seat. The live checkpoints are taken.
- **The Gate runs what the Studio builds.** `@craftabot/gate` (§6.7) is an OpenAI-compatible proxy that applies a saved stack to any agent's traffic at the three hooks, in shadow or enforce mode, and writes the same events to any `TraceSink`. An identity test holds the chain through the Gate equal to the chain in a session. `@craftabot/governance` goes to 1.0.0.
- **Readings have a desk.** `/workshop/readings` (§6.8) queues every pending catalogue entry, calibration row, control row, decision right and blueprint item with its source beside it, and a reading leaves a `review` record the checks then honour.

### 1.2 What this design is not

Everything in `41-…` §11, `64-…` §11 and `83-…` §11 stands: nothing real, no fitted model of the product's own, no compliance opinion, no hosted compute, no production deployment. Added here: **the Gate is a reference implementation, not a product gateway** — it has no authentication, no TLS termination, no multi-tenancy, and it says so on its first page. **No reader is trained**: readers are rules, hosted services and prompted models; the product tunes questions, never weights. **No real call is ingested**: every corpus row is authored or generated (hard rule 9); a corpus of real calls is the missing test, and this design names it as missing rather than building a door for it. **No error model claims to be a bot**: the fallible tier is a calibrated stand-in whose parameters are cited and reviewed, and the live tier is the measurement it stands in for.

### 1.3 New words (glossary additions to `00-…` §6, `41-…` §1.3, `64-…` §1.3, `83-…` §1.3)

| Word | Meaning |
|---|---|
| **Fallible tier** | A scripted brain that errs at a cited rate and direction, drawn from the seed, with every fault on the trace. |
| **Live tier at scale** | A real provider run over a book, recorded once to a provider cassette and replayed in CI. |
| **Provider cassette** | A cassette (`47-…`) over provider calls rather than line calls, keyed by the prompt's digest. |
| **Reviewer model** | The person at a `human` stage as a model: accuracy, automation bias, seconds per case, fatigue — each a calibration row. |
| **Reader** | A thing that answers typed questions about a state with typed answers and a confidence: a rule, a hosted classifier, a chat model constrained to the options, a person. |
| **Typed question** | A *choice* over options, a *noul* (yes/no), or a *score* on ordered levels, with instructions and criteria. |
| **Confidence gate** | The rule that acts on a reader's answer at or above a threshold and hands the rest to another executor. |
| **Steer** | A caller's attempt to dictate the label; caught by its own noul, not by confidence. |
| **Corpus** | Labelled rows as content: text or state, labels, tags, a guide, a question set, a freeze digest, annotators, and the readers that have seen it. |
| **Held out** | A corpus written after a question set was frozen, so scoring it measures the questions rather than the tuning. |
| **Truth independence** | The property that no truth leaf is computed by a rule the desk runs. |
| **Benchmark** | A campaign that runs every connectable guard or reader over one corpus and reports each side by side. |
| **The Gate** | `@craftabot/gate`: an OpenAI-compatible proxy running a stack over an agent's traffic, in shadow or enforce mode. |
| **Shadow mode** | The Gate annotating verdicts on the trace without changing a request or response. |
| **Reading** | A person's recorded review of a catalogue entry, calibration row, control row, decision right or blueprint item. |

---

## 2. Where the code actually is (the load-bearing facts)

Read before any contract below is judged. Every path was checked on `main` at `0ad78bf` on 2026-09-29, and facts 1–4 on `jev-servicing` at `f407ecc`.

1. **The bank's rules are the weakest reader, and the only measured effect on the project came from replacing them.** On `jev-servicing`, `packages/packs/typesafe/` rebuilt the servicing journey with its `classify` and `record` stages read by the desk's regexes (`fs-servicing/src/world/rules.ts`), by TypeSafe's hosted classifier, and by two local models through the same typed-question contract. Over 306 synthetic calls in three corpora (`experiment/README.md` §0): the regex reads the request right 54–64% of the time and the support need 59–62%, and misses two-thirds of disclosed vulnerabilities; every model beats it by 30–45 points; wording the questions with the labelling guide's rules lifts every model alike (held-out need 85→94%); the hosted classifier is the best calibrated, so its gate catches its errors at 5–7% reviewed; a caller who dictates the label is caught by a *steer* noul, not by confidence. Every other desk classifies with the same kind of regex.
2. **A classifier has no contract; the branch bent a service line to it.** `typesafe/jev` and `dgx-spark/classifier` are `ServiceLine`s whose one operation, `system-one`, takes `{ model, state, questions }` and returns typed answers (`src/jev/types.ts`). The workflow reaches them through the `line` executor with an `arguments` shaper, and the gate is four hand-written stages (reader → gate → review → commit) per judgment (`src/servicing/workflow.ts`). Nothing in `core` knows a question, an answer, a confidence or a gate.
3. **The servicing desk's truth was the rule under test.** `assembleServicingCase` computed the truth's `category` with `classificationOf`, so `classified-correctly` measured agreement with the regex. The branch added `ServicingItemPayload.label?.category` (`fs-servicing/src/world/cases.ts`) so a labelled item's truth is its label. No other desk has been audited for the same shape; `checkDesk` (`pack-testkit/src/checks/desk.ts`) has no property for it.
4. **Three more findings came with it; two are still open on `main`.** `fs-servicing/servicing` runs `act` (stage order line 331) before `record` (line 345) while `disclosure-recorded` demands the record before the act — 13 of 13 mid-call disclosures fail under every reader; `packages/workflow/src/human-load.ts` counts a review twice when its answer is not the stage's first option (`human:` plus `escalated:`); the synthetic sweep read long floats as card numbers (rounded at source, now on `main`). The label hook and the rounding are on `main`; the stage order and the touches count are not. The work came with two design notes and a lab record (`packages/packs/typesafe/experiment/README.md`) that regenerates every number offline.
5. **The Control Effectiveness Register records no effect.** `docs/evidence/timings.md`: seven reference experiments, verdicts *inconclusive* ×5 and *not-supported* ×2. Read closer (`docs/evidence/*/*.experiment-result.md`): every outcome metric — `agreement`, over-approval, the fraud decision — reads **+100.0 against +100.0, Δ +0.0, underpowered** under every factor level, including `bot-everywhere` against `rules-only`. Only the structural metrics move: `touches` (0.48 → 2.0 → 0) and `breaches` (0 → 0.63 at Level 5). The `scripted-noisy` tier the designs name (`experiments/lending-stack.json` line 77) does not err on the decision, and the scripted person at every `human` stage answers from truth (`packages/workflow/src/run.ts` `humanStage`, `options.human` absent → `suggest` → truth). A control cannot be shown to prevent an error nobody makes. `80-…` §5's register table is, in consequence, a table of *untested*.
6. **The person is perfect by construction.** `Executor { kind: 'human'; prompt; options; default? }` and `StageSpec.suggest(input, state, truth)` (`core/src/types/workflow.ts`): the campaign's person follows the recommendation, which the desk computes from truth. `humanLoad` (`workflow/src/human-load.ts`, `metrics/src/human-load.ts`) counts touches and escalations; it has no cost, no time, no error, no fatigue. The decision-rights ceilings (`73-…`, `DECISION_RIGHTS_SOURCE`) are tested against this person.
7. **Live models never run at scale.** `BrainChoice.live` exists for a duo's counterpart seat (`56-…`) and for `craftabot run --provider openai`; a campaign or experiment over a book runs the scripted tiers only (`docs/evidence/README.md`: "the brains are the scripted tiers"). Cassettes (`47-…`, `craftabot-cassette`) record **service lines**, keyed by the arguments' digest; there is no cassette over a **provider** call, so a live experiment cannot replay in CI. `createMockProvider` plays scripted plans (`PlanSource`, `harness/src/plans.ts`).
8. **`@craftabot/metrics` has no calibration.** `packages/metrics/src/`: `confusion`, `drift`, `fairness`, `human-load`, `intervals`, `tests`, `normal`. No expected calibration error, Brier score, reliability bins or gate curve; the branch computes them in `scripts/analyse.ts` outside the package.
9. **Corpora are scripts.** The branch's three corpora are TypeScript arrays (`src/servicing/corpus{,-v2,-v3}.ts`) with labels, tags, `contested`, `secondNeed`, a guide in prose, freeze hashes in a README, and second-labeller files under `experiment/`. `PackManifest` (`core/src/schemas/pack-manifest.ts`) has twenty-two content kinds and no corpus. `scenarios` (`32-…`) carry injections, not labels; a book (`67-…`) carries work items, not text to be read. The seven desks' classify stages have no labelled corpus at all.
10. **The hosted-guard baselines have run unplugged since WP42.** *(Amended 2026-09-29, WP113: three desk baselines, not four; the injection baseline's Azure fit carries its endpoint and was never refused.)* `89-STACKS.md` §8, `84-…` §8 item 5: the desk baselines' `+hosted-guard` guard and the injection baseline's `azure-content-safety` guard fit their service with `serviceConfig: '{}'`, which the service refuses, so the chain has run the floor only. Every register row that cites a hosted-guard stack cites a stack that did nothing. Fixing the configs changes CI's gates' inputs and was left for review.
11. **Seven connectable guards, none measured against another.** `geap/armor`, `guard-local/llama-guard`, `guard-local/prompt-guard`, `azure-content-safety`, `pdp-opa`, `bedrock-guardrails`, `lakera-guard` (`30-…`, WP99) each pass `checkGuardrailService` on their own fixtures. The Guard Rack (`Connections.svelte`) shows a connection lamp and a *Test it*; nothing runs two services over the same rows. The catalogue (`docs/catalogue.md`: 33 shipped, 6 bespoke, 3 blueprint, 3 not applicable) records maturity from sources, never a measurement. Four live checkpoints are pending on a key (Azure, Bedrock, Lakera, the Gen AI evaluation service).
12. **Governance is a library with one example.** `@craftabot/governance` 1.0.0-rc.1 (README line 16: "the API is what 1.0 will be"), `examples/plain-node-agent` gating seven scripted tool calls, `docs/governance-mapping.md`'s table. A stack saved from the Studio (`88-…`) runs in a campaign, a configuration and an experiment — all inside the product. Nothing takes it to an agent the product did not write. Purpose 2 (`00-…`: components "eventually exported for real-world use") has no exit.
13. **Two hundred readings await one reader.** Catalogue entries 45 of 45 `review: 'pending'`; calibration rows 44 of 44; control-map rows 64 `unreviewed` (52 plus twelve from Phase AA); the domain spec's twenty decision rights; the three blueprint notes' 36 checkboxes; the onboarding screening list. `control-review` (WP110, `core/src/schemas/control-review.ts`) records a reading of a control row in-product; nothing records a reading of anything else, and no screen queues them.
14. **The engineering seams the exit reviews named.** `cell.workflow.workflowId` inferred from stage ids (`79-…` §3, "report v4"); book cells carry no pair id, so the Model-risk page reads *no pairs*; the runtime carries one `spec` per run, so a followed handoff onto another desk runs the target's rules (`90-…` §7, a `specFor` seam); every route's chunk ships in every edition and the seven desk packs ride in every bundle (+250 kB, `84-…` §8 item 16); no release tag has ever been cut (`git tag` is empty; `release.yml` untested); `USER-MANUAL.md` §41 and `UX-AND-GAPS.md` §0/§4 carry lines Day 6 made stale.
15. **The scale is real.** Thirty-four workspace packages, about 245,000 lines of TypeScript and Svelte, 485 Vitest files with about 3,600 tests, 81 Playwright specs, four CI jobs, budgets at 2.17–2.24 MB per edition with a 1.16 MB Worker, IndexedDB at v8 with ten stores, 27 event types, 17 published schemas. Nothing here asks for a second engine, store or UI system; every contract below is additive.

### 2.1 Foundations: what this phase needs that Day 6 did not build, and eight decisions

| Need | What exists | What is missing | Decision |
|---|---|---|---|
| An actor that can err | `scripted`, `scripted-noisy`, `expert`, `live` tiers (fact 5, 7) | Error on the decision, cited; a live model over a book in CI | **D14** — two tiers, one seam. The **fallible tier** is the scripted brain with an `ErrorModel` per stage drawn from `dice` and stamped on the trace; the **live tier at scale** is a real provider over a book through a **provider cassette**, the same `craftabot-cassette` file with `kind: 'provider'`, keyed by the prompt digest. Neither changes the engine's loop; both are brains (§6.1). |
| A person who is a model | `human` executor, `suggest` from truth (fact 6) | Accuracy, bias, time, fatigue, cited | **D15** — a `ReviewerModel` on `WorkflowConfig`, applied by the runtime's scripted person, each parameter a calibration row (`66-…`) with a source and `review: 'pending'`. The oracle stays as `accuracy: 1` and is byte-identical to today (§6.2). |
| A judgment with a contract | Service lines bent to it (fact 2); regex rules on seven desks (fact 1) | `Reader`, typed questions, a `reader` executor with a gate | **D16** — `Reader` in `core` as registered content, three adapters in `governance` (rule, hosted, constrained chat model), the `reader` executor with `gate` as the fifth executor kind. The seven desks' rules become `rule` readers at confidence 1, byte-identical (§6.3). |
| A corpus as content | TypeScript arrays and READMEs (fact 9) | The kind, the check, the labelling tool, the book source | **D17** — `Corpus` on the manifest and in the content store, `checkCorpus` with the held-out rule, `craftabot corpus label \| agreement`, `Book.source.corpus` (§6.4). |
| Truth the rule did not write | One desk fixed on a branch (fact 3) | A property in `checkDesk`, an audit of seven | **D18** — `checkDesk`'s **truth-independence** property: every truth leaf a rule also computes must disagree with that rule on at least one row of the pack's corpus, or be declared derived and excluded from scoring (§6.5). |
| Guards measured, not described | Seven services on their own fixtures (fact 11) | One corpus, one benchmark, one table | **D19** — a `benchmark` campaign kind in `evals` over an adversarial corpus, every connectable service and reader-as-guard a level, recorded to cassettes; the Guard Rack and the catalogue read its report (§6.6). |
| A path to a real agent | A library and an example (fact 12) | A runtime that applies a stack to traffic | **D20** — `@craftabot/gate`, a Node package with no UI and no world: an OpenAI-compatible proxy applying a stack file at `pre-think`/`pre-act`/`post-act`, shadow or enforce, events to any `TraceSink`; the identity test is the contract (§6.7). |
| A place to read | `control-review` for one kind (fact 13) | A queue over every reviewable, one record kind | **D21** — `review` generalises `control-review` over a `subject: { kind, id }`; `/workshop/readings` is the queue; `checkCalibration`, `checkCatalogue`, `checkControlMap` and `checkDomainPack` read the records (§6.8). |

Nothing here asks for a second engine, a second UI system or a second store. Three additive changes reach `core`: `Reader` and the `reader` executor (D16), `Corpus` (D17), `review` (D21); the provider cassette reuses the cassette schema with one more `kind`.

---

## 3. Gap register (what stands between today and §1.1)

Severity: **A** — the phase fails without it; **B** — the phase is weaker; **C** — folds in where it falls. Numbering continues from `83-…` §3.

| ID | Sev | Gap | Where |
|---|---|---|---|
| G72 | A | The register records no effect: every reference experiment's outcome metric is 100% vs 100%; the scripted tiers cannot err on the decision | fact 5 |
| G73 | A | The person is an oracle: every `human` stage answers from truth; human load has no cost or quality | fact 6 |
| G74 | A | A judgment has no contract; the bank's seven desks read with regexes that score 54–64% | facts 1, 2 |
| G75 | A | Truth computed by the rule under test, found on one desk, unaudited on six, unchecked by the kit | fact 3 |
| G76 | A | A corpus is a script: no kind, no labels, no agreement, no held-out rule, no labelling tool | fact 9 |
| G77 | A | The hosted-guard baselines have run unplugged since WP42; the register rows citing them cite nothing | fact 10 |
| G78 | A | Seven connectable guards, none measured on the same corpus; the catalogue records maturity, never a measurement | fact 11 |
| G79 | A | No path from a stack to an agent the product did not write; governance is at rc.1 | fact 12 |
| G80 | B | A live model cannot run over a book in CI: no provider cassette | fact 7 |
| G81 | B | No calibration metrics in `@craftabot/metrics`; the branch computes them in a script | fact 8 |
| G82 | B | Servicing acts before it records; `touches` double-counts; disputes has no matched pair; four books' incidences are stated, not calibrated | fact 4, `84-…` §8 item 16 |
| G83 | B | Report v4 seams: `workflowId` and `pairId` on book cells; one spec per run for followed handoffs | fact 14 |
| G84 | B | Six *bespoke* and three *blueprint* catalogue entries unbuilt; the ones that answer indirect injection (untrusted-content, taint, quarantined reader) are the ones a benchmark would exercise | `84-…` §7 |
| G85 | B | Two hundred readings pending, one record kind, no queue | fact 13 |
| G86 | C | Budgets +250 kB over Phase AA; no per-desk chunk; every route in every edition | fact 14 |
| G87 | C | Four live checkpoints pending; no release tag cut; `release.yml` untested | facts 11, 14 |
| G88 | C | Stale lines in the manual's §41, the UX register's §0/§4, and three "awaiting review" notes | fact 14 |
| G89 | C | Purpose 1 idle: no Kit content since the Playground box; confidence and gating are the teachable idea Day 7 adds | `96-…` §4 |
| G90 | C | The two notes `98-`/`99-` sit outside the index; `@craftabot/pack-dgx-spark`, whose four hosts are the builder's, is in the harness's default pack list | fact 4, `99-…` §3 |

G72–G79 are the phase. G80–G85 are what it builds on. G86–G90 fold in where they fall.

---

## 4. Design tenets (V7 additions to the thirty-two)

33. **An effect that cannot appear is not evidence.** Every actor in a reference experiment can err, the error is on the trace, and a register row over a perfect actor reads *untestable*, not *inconclusive*.
34. **The person is a model with a citation, never an oracle.** A `human` stage's answer comes from a reviewer model whose parameters are calibration rows; the oracle is the `accuracy: 1` corner and is named as such wherever it is used.
35. **A judgment is a typed question with a calibrated answer.** The rule is one reader among several; a reader's confidence is what a gate reads; the truth is never a reader.
36. **A corpus is content, frozen, labelled by someone other than its author, and never scored on data it has seen.** A corpus records who labelled it and which readers have seen it; the check refuses the rest.
37. **Every connectable guard is measured on the same corpus before it is fitted in a baseline.** A Guard Rack row without a benchmark number reads *unmeasured*; a baseline that fits an unplugged service is a red test.
38. **What the Studio builds, the Gate runs, and the same chain is the proof.** A stack's chain through the Gate is byte-identical to its chain in a session, and the identity test runs on every push.

---

## 5. Target architecture

```
                         ┌──────────────────────── apps/workbench ────────────────────────┐
                         │  /workshop/readings   /workshop/corpora   /workshop/benchmarks   │
                         │  Guard Rack (measured)   Experiments (effects)   Studio (Use in… Gate) │
                         └──────────────┬─────────────────────────────┬────────────────────┘
                                        │                             │
   ┌──── @craftabot/harness ────┐   ┌───▼──── @craftabot/evals ───────▼───┐   ┌── @craftabot/gate ──┐
   │ corpus label | agreement   │   │ benchmark campaign · experiment     │   │ OpenAI-compatible   │
   │ benchmark · gate · record  │   │ over fallible / live tiers          │   │ proxy · shadow /    │
   │ --provider cassette        │   │ reviewer model on human-load        │   │ enforce · TraceSink │
   └──────────┬─────────────────┘   └───────────────┬─────────────────────┘   └──────────┬──────────┘
              │                                     │                                    │
   ┌──────────▼──────── @craftabot/workflow ─────────▼───────┐            ┌───────────────▼─────────┐
   │ reader executor + gate · ReviewerModel · touches v2     │            │ @craftabot/governance   │
   │ specFor seam · human-load v2                            │            │ 1.0.0: readers/*,        │
   └──────────┬──────────────────────────────────────────────┘            │ components, chain       │
              │                                                            └───────────────┬─────────┘
   ┌──────────▼──────────────────── @craftabot/core ────────────────────────────────────────▼─────────┐
   │ Reader · TypedQuestion/Answer · Executor 'reader' · Corpus · review · cassette kind 'provider'    │
   │ ErrorModel on the trace · reader.answered · decision.fault · stage.completed.by.model             │
   └──────────┬──────────────────────────────────────────────────────────────────────────────────────┘
              │
   ┌──────────▼──── @craftabot/metrics ────┐   ┌──── packs ───────────────────────────────────────────┐
   │ calibration: ECE, Brier, reliability, │   │ fs-*: rule readers, corpora, truth independence,     │
   │ gate curve; human-load v2             │   │ adversarial corpora; typesafe (optional); readers-llm │
   └───────────────────────────────────────┘   └──────────────────────────────────────────────────────┘
```

The engine's loop, the world, the desk runtime, the Control Room and the stores are unchanged. Every arrow above is a call into a contract that already exists, widened.

---

## 6. The contracts

### 6.1 Fallible actors and the live tier at scale (retires G72, G80; decision D14; tenet 33)

**Extends** the brain tiers (`13-…` §8, `28-…` §3), `PlanSource` (`49-…`), the cassette (`47-…`). **Packages** `core` (the error model on the trace, the cassette kind), `evals` (the tiers), `harness` (`--provider` cassettes, `record --experiment`), `fs-*` (the per-stage error rows).

**The fallible tier.** A scripted brain that plays the desk's plan but errs on the decision stages at a rate and in a direction drawn from `dice`:

```ts
interface ErrorModel {
  /** Per stage id, else the default. */
  stages?: Record<string, StageErrorSpec>;
  default: StageErrorSpec;
}
interface StageErrorSpec {
  /** P(the decision is wrong), a calibration row id — cited, review pending. */
  rate: string;
  /** Which way: uniformly over the other options, or toward one (over-approve, under-refer). */
  direction: 'uniform' | { toward: string };
  /** Optional bias by cohort: the rate multiplied for rows whose truth carries the cohort. */
  cohortFactor?: Record<string, number>;
}
```

`BrainChoice` gains `{ tier: 'fallible'; errorModel: string }` naming a model a pack ships (`PackManifest.errorModels`). Every fault is an event: `decision.fault { stageId, planted: true, chose, shouldHave }` written beside the `decision` it corrupts, so an evaluator, the register and Explain can see that the error was planted. The seed reaches the model through the campaign cell (`52-…`'s seam), so the same seed plants the same faults. `rate` and `direction` are calibration rows in `fs-bank`'s table with sources (the FCA's and the academic literature's stated error rates for the task class, cited like every row, `review: 'pending'`); the doc says plainly that a planted rate is a stand-in for the live tier's measured one.

**The live tier at scale.** `BrainChoice.live` reaches a campaign and an experiment over a book. The **provider cassette** is the cassette file with `kind: 'provider'`: an entry per provider call keyed by the digest of the composed prompt (messages, tools, cartridge id, temperature), holding the streamed response as the provider returned it, its usage and its latency. `craftabot record --experiment <file> --provider openai` runs the design live under the provider's declared egress and writes the cassette; a campaign or experiment naming `brains: [{ tier: 'live', cassette: 'path' }]` replays it with no network, and a prompt the cassette has not seen is a loud `cassette-miss` and never sent. `createMockProvider` gains a cassette source beside its plan source. A live tier's temperature is 0 and its `seed` is the cell's where the provider honours one; the cassette records what the provider actually said, so a re-run is byte-identical whatever the provider does.

**The seven experiments, re-run.** Each of `experiments/*.json` gains two factor levels on `brains` — `fallible` and `live` (cassette) — and `analyseExperiment` marks a comparison whose both sides are at ceiling as **untestable** (a new verdict beside `supported`/`not-supported`/`inconclusive`), which is what the seven read today. `docs/evidence/` is regenerated; the register's §5 table says, for the first time, what each control did.

**Tests.** The fallible tier over the lending book plants faults at the row's rate within the Wilson interval over 5,000 cases; every fault has its `decision.fault` event; the `rules-only` and `expert` tiers are byte-identical to today; a provider cassette recorded from the mock provider replays to the same trace digest; a cassette miss never reaches `fetch` (the egress guard test); `analyseExperiment` reads a 100%-vs-100% metric as *untestable*.

### 6.2 The reviewer model (retires G73; decision D15; tenet 34)

**Extends** `Executor 'human'`, `RunWorkflowOptions.human`, `humanLoad` (`69-…`, `73-…`), the calibration table (`66-…`). **Packages** `core` (the model on the config and the record), `workflow` (the scripted person), `metrics` (human load v2), `fs-bank` (the rows).

```ts
interface ReviewerModel {
  id: string;
  /** P(the reviewer's answer is the truth's), a calibration row. */
  accuracy: string;
  /** P(the reviewer follows the recommendation when it is wrong), a calibration row — automation bias. */
  automationBias: string;
  /** Seconds per case at the stage, a calibration row; a distribution, not a constant. */
  secondsPerCase: string;
  /** Accuracy lost per hour of the shift, a calibration row; the clock supplies the hour. */
  fatigue?: string;
}
```

`WorkflowConfig.reviewer?: string` names a model; absent, the runtime's person is the oracle as today, and `stage.completed.by` carries `{ model: 'oracle' }` so a report can say so. With a model, the scripted person draws from `dice`: follow the recommendation, or answer from truth, or err — and `stage.completed.by` carries `{ model, followed: boolean, correct: boolean, seconds }`. Human load v2 (`metrics/src/human-load.ts`) folds **cost** (seconds summed by level), **quality** (the reviewer's accuracy at the stage, and the *catch rate*: the share of the bot's planted or live faults a reviewer reversed) and **touches** counted once per `*-review` stage (the double count retired). The Monitor's queue reads `secondsPerCase` as capacity. The `human-oversight` experiment's hypothesis becomes testable: Level 3 catches so many of the bot's errors at so many seconds per case.

**Tests.** `reviewer: undefined` is byte-identical to today on every golden run; an `accuracy: 1, automationBias: 0` model is the oracle; a model at the row's rates reproduces them within the interval over the loan book; `touches` on the branch's servicing experiment reads 5 at 0.80, not 10; the rows carry sources and `review: 'pending'`.

### 6.3 Readers, typed questions and the confidence gate (retires G74, G81; decision D16; tenet 35)

**Extends** `ServiceLine` (`47-…`), `Executor` (`69-…`), `GuardrailComponent` (`85-…`), `@craftabot/metrics`. **Packages** `core` (the contract, the executor, the event), `governance` (`readers/*` adapters), `workflow` (the executor), `metrics` (calibration), `fs-*` (rule readers), a new optional `pack-typesafe` (merged from the branch), a new `pack-readers-llm`.

```ts
type TypedQuestion =
  | { type: 'choice'; instructions: Json; criteria: Record<string, string | null> }   // ≤ 255 options
  | { type: 'noul';   instructions: Json; criteria?: { true: string; false: string } }
  | { type: 'score';  instructions: Json; criteria: string[] };                        // 2–10 levels
type TypedAnswer =
  | { choice: string; probabilities: Record<string, number>; confidence: number }
  | { noul: number }
  | { score: number; legend: string[]; probabilities: number[]; confidence: number };

interface Reader {
  id: string; name: string; description: string;
  kind: 'rule' | 'hosted' | 'llm' | 'human';
  egress: EgressDeclaration[]; credential?: CredentialKind; browserCapable: boolean;
  /** Which question types this reader answers. */
  answers: ('choice' | 'noul' | 'score')[];
  ask(state: Json, questions: Record<string, TypedQuestion>, ctx: ReaderContext): Promise<Record<string, TypedAnswer>>;
  createOffline?(): Reader;
}
```

`PackManifest.readers`; the registry indexes them. **Confidence** is one formula for every reader — a choice's `(n·p_max − 1)/(n − 1)`, TypeSafe's, adopted as the product's so that a threshold means the same function of the distribution whoever answered (`99-…` §4). The three adapters in `governance/readers/`: **`rule`** wraps a function `(state) → option` as a choice at confidence 1 with the whole mass on its answer; **`hosted`** wraps a `ServiceLine` whose operation answers the contract (the branch's `typesafe/jev` line unchanged); **`llm`** wraps any `LLMProvider` with one completion per question, the system prompt fixed, the output constrained to the option keys where the provider can (`structured_outputs`/`response_format`), the first token's log-probabilities folded onto the options where the provider returns them, and a plain argmax at confidence `null` where it returns neither — the answer says which (`ReaderContext.method`). A reader records `probabilities` to six places (the sweep read full doubles as PANs).

**The `reader` executor.**

```ts
| {
    kind: 'reader';
    readerId: string;
    questions: (input: unknown, state: WorldState) => Record<string, TypedQuestion>;
    /** Acts at or above the threshold; below, the stage runs `else` instead. */
    gate?: { threshold: number; else: Executor; steer?: string /* a noul id; P ≥ 0.5 → else */ };
    /** The stage's output from the answers. */
    output: (answers: Record<string, TypedAnswer>, input: unknown) => unknown;
  }
```

One stage, not four: the runtime asks, gates, and either commits the reader's output or runs the `else` executor (a `human` or a `rule`) on the same input, recording `reader.answered { stageId, readerId, questionIds, confidence, gated: boolean, steer?: number }` and, on a gate, the `else` executor's own record. `WorkflowConfig.executors[stageId]` swaps readers as it swaps anything else, so a configuration is `regex` / `jev` / `llm:openai/gpt-…` / `jev-gate-0.80`. The seven desks' classify-shaped stages (`classificationOf`, `needIn`, the disputes `classificationOf`, the complaints root cause, the fraud coaching markers) are re-expressed as `rule` readers; the golden runs are byte-identical because a rule reader at confidence 1 never gates.

**A reader as a guard.** A `reader` component adapter (`governance/components/reader.ts`) fits a noul at any point — *is this a steer?*, *does this say hold?*, *is this an injection?* — with `block`/`annotate` at a threshold. This is how the benchmark (§6.6) compares a reader with a service.

**Calibration in `@craftabot/metrics`.** `calibration.ts`: expected calibration error over ten bins, the Brier score, the reliability table, and the **gate curve** (reviewed share and residual accuracy at each threshold), each with a hand case in `68-…`'s style, a planted case and a null in the validation suite, and rows in `docs/metrics.md`. The campaign report v4 carries a `calibration` pane per reader stage.

**The optional packs.** `@craftabot/pack-typesafe` stays as it is — outside the harness's default list, the Workshop's and every edition, installed by `--config` — with its line become a `hosted` reader and its journey collapsed onto the `reader` executor. `@craftabot/pack-dgx-spark` **leaves the harness's default list** and becomes opt-in the same way: its four hosts are the builder's, and a default pack that names them is not content every user of the harness should carry (hard rule 8's spirit). Its classifier is generalised into `pack-readers-llm`, whose `llm` reader takes any registered provider and cartridge, so a local vLLM, Ollama, OpenAI or Anthropic model reads through the same contract; the DGX pack's classifier line then delegates to it. The lab record moves to `docs/evidence/servicing-readers/` as the eighth reference experiment, its cassettes shipped.

**Tests.** The identity: every desk golden run and campaign baseline byte-identical with rule readers; `checkReader` in `pack-testkit` (a fixture per question type, the confidence formula, six-place rounding, egress declared, offline stand-in answers); the `llm` reader over the mock provider constrained and unconstrained; the gate sends exactly the rows under the threshold to `else`; the steer noul routes independently of confidence; the calibration metrics against the branch's published figures (ECE 0.023, Brier 0.014 on v1) recomputed from the shipped cassette.

### 6.4 Corpora as content (retires G76; decision D17; tenet 36)

**Extends** the content store (`34-…`), scenarios (`32-…`), books (`67-…`), the synthetic sweep (`45-…`). **Packages** `core` (the schema), `evals` (the book source), `harness` (`corpus label | agreement | freeze`), `pack-testkit` (`checkCorpus`), the Workshop (`/workshop/corpora`).

```ts
interface Corpus {
  id: string; name: string; version: string;
  /** What each row's `state` is: a caller's words, a transcript, a merchant's note, a case. */
  stateKind: string;
  labels: Record<string, { options: string[]; guide: string }>;   // one closed set per label
  rows: CorpusRow[];
  /** The question set the corpus was written against, if any, by id and digest. */
  questions?: { id: string; digest: string };
  /** Who labelled, blind or not, and agreement with the primary on each label. */
  annotators: { id: string; blind: boolean; kappa?: Record<string, number> }[];
  /** True when every row was written after `questions` was frozen. */
  heldOut: boolean;
  /** Readers (with their question digest) whose answers this corpus has been scored against. */
  seenBy: { readerId: string; questions: string; on: string }[];
  /** SHA-256 over the canonical rows and labels; frozen before any recording. */
  digest: string;
}
interface CorpusRow {
  id: string; state: Json; tags: string[];
  labels: Record<string, string>;
  contested?: { reason: string; alternatives: Record<string, string> };
}
```

`PackManifest.corpora`; the `corpus` content kind on all three stores; the `corpus` evidence kind. **`checkCorpus`** holds: the digest matches the rows; every row passes the synthetic sweep; every label is in its set; a corpus with one annotator carries the `single-annotator` finding on its record (a warning the pack's page shows, not a refusal); a corpus marked `heldOut` names a question digest and its rows carry no `seenBy` for it; and **the held-out rule**: a campaign or experiment that scores reader *R* with questions *Q* on a corpus whose `seenBy` names *(R, Q)* is refused unless the cell is marked `regression`. `craftabot corpus freeze` writes the digest; `craftabot corpus label --as <annotator> --blind` walks the rows with the guide and no labels and writes a second-label file; `craftabot corpus agreement` computes κ per label and records the annotator. `/workshop/corpora` lists, shows the guide, the tags, the agreement and which readers have seen it.

**A book from a corpus.** `Book.source: { kind: 'corpus'; corpusId; itemFrom: (row) → WorkItem }` — the branch's `corpusBook` generalised: one work item per row, a population customer each, **the row's labels as the truth's leaves**. This is the shape that makes reader experiments run through a whole journey.

**The corpora that ship.** The three servicing corpora (95, 115, 96 rows, with their guides, second labels and κ) as `fs-servicing`'s; and, written under this design's rules, one corpus for each other desk's classify-shaped stage: disputes (the claim's classification and the merchant's note), fraud (the coaching markers in a call), complaints (root cause and *is it a complaint?*), onboarding (the purpose of account), lending and advice (the reason a customer gives). Each is authored, tagged, frozen, blind-labelled by a second annotator with κ recorded, and — where a question set exists — split into a seen and a held-out part. The design says in every corpus's guide that the rows are synthetic English written by the product's authors, and that a real-call sample labelled by someone else is the missing test.

**Tests.** `checkCorpus`'s six refusals; the held-out rule refuses a re-score and admits a `regression` cell; `corpus label` never shows a label; the digest is stable across formatting; a corpus book runs the servicing journey to the branch's experiment result byte for byte.

### 6.5 The honest bank (retires G75, G77, G82, G83, G86; decision D18)

**Extends** `checkDesk` (`43-…`, `45-…`), `fs-servicing` (`92-…`), `human-load`, the report (`74-…`), the workflow runtime (`94-…`), the editions (`59-…`). **Packages** `pack-testkit`, `fs-*`, `workflow`, `evals`, the Workshop build.

**Truth independence.** `checkDesk` gains the property: for every desk with a corpus, for every truth leaf that a registered rule reader also computes from the revealed state, the rule's answer must differ from the truth on at least one row, **or** the leaf is declared `derivedFrom: <ruleId>` on the world's `truth()` and every evaluator reading it is marked `derived` on the record and excluded from `classified-correctly`-shaped verdicts. A leaf computed by the rule and scored against the rule is a red test. The seven desks are audited under it, and each finding is a dated note in the desk's doc.

**The servicing order.** `fs-servicing/servicing` runs `record` before `act`, its golden run re-taken, the divergence noted in `92-…`; `disclosure-recorded` is unchanged.

**The rest of the audit.** `touches` counts a `*-review` stage once (§6.2); the disputes desk gets its matched pair and parity gate (`90-…` §7); the onboarding, disputes, collections and servicing books' incidences become calibration rows with sources and `review: 'pending'`; the report v4 carries `cell.workflow.workflowId` and `cell.pairId` with the v3 reader; `RunWorkflowOptions.specFor(worldId)` lets the host fit the bot to a followed handoff's desk, and `craftabot workflow run --follow --kit` uses it; the per-desk chunk lands (`$edition-packs` splitting each `fs-*` pack into its own dynamic import) and the budgets are re-stated in `01-…` §8 with the reclaimed figure.

**The hosted-guard baselines, plugged in.** Every baseline that fits a service with `serviceConfig: '{}'` fits it with the service's offline stand-in config instead, the chain runs, and the identity test is re-baselined with a dated note in `89-…` §8 and `28-…`. This changes CI's gates' inputs, which is why it is a WP with Andrew's name on its stage A and a default the roadmap states: the stand-in config, because a baseline that fits a guard should run it.

**Tests.** The property is red on `main`'s servicing desk with the label hook removed and green with it; each desk's audit note names the leaves; the servicing golden run's stage order; `touches` v2 against the branch's figures; the disputes pair fails on the planted skew; every hosted-guard baseline shows `guardrail.checked` events from the service's stand-in; the per-desk chunk's byte-identity on every edition's smoke spec.

### 6.6 Adversarial assurance: corpora, the benchmark, the bespoke four (retires G78, G84, G87; decision D19; tenet 37)

**Extends** campaigns (`28-…`), the adversary tier, scenarios (`32-…`), the Guard Rack (`88-…`), the catalogue (`86-…`), components (`85-…`). **Packages** `evals` (the benchmark), `governance` (the four components), `fs-*` (the adversarial corpora), the vendor packs (cassettes), the Workshop (`/workshop/benchmarks`, the Rack's numbers).

**The adversarial corpus.** A `Corpus` whose `stateKind` is an attack surface and whose labels are `attack: none | steer | injection | jailbreak | exfiltration | elicitation` and `target: the-label | the-tool | the-secret | the-person`, one per desk over the surfaces the desk has: the caller's words (steers, elicitation of a screening hit), the merchant's note (the disputes injection), a tool result (a poisoned bureau file, a `SYSTEM:` line in a transaction narrative), a counterpart's message (the group chokepoint), and benign rows the guards must pass. Authored under §6.4's rules, frozen, blind-labelled, about 200 rows per desk, with the branch's 27 steers as the seed.

**The benchmark.** `campaign.kind: 'benchmark'` (the schema's third kind beside the matrix and the book): a corpus, a point, and a set of **subjects** — every connectable `GuardrailService`, every `reader` noul fitted as a guard, and the four bespoke components — each a level. Every subject runs over every row through its offline stand-in in CI and through its cassette when recorded (`craftabot benchmark run --record` under each subject's egress), and the report carries per subject: precision, recall and the confusion matrix by `attack` and by `target`, latency p50/p95, tokens and list price where the subject prices, and the rows each subject alone caught or missed. The Guard Rack's row for each service reads the latest benchmark's numbers or *unmeasured*; the catalogue entry that a subject implements gains `measured: { benchmarkId, on }` beside its coverage status, and the assurance pack's *Coverage* table shows it.

**The bespoke four.** From `84-…` §7, the four that a benchmark exercises: **`untrusted-content`** marking at `post-act` (every tool result and counterpart message carries `provenance: untrusted` into the prompt with a delimiter the composer honours, and a card leaf `content-is-untrusted`); **`taint`** labels flowing from untrusted content into memory and arguments, with the `taint-reaches` leaf refusing a call whose argument is tainted; the **quarantined reader**, a two-seat configuration in which one seat reads untrusted content and may only answer typed questions (a `reader`) while the other acts; and the **red-team seat**, a counterpart tier `adversarial` that draws its lines from the adversarial corpus. Each is a component with its point, verdict class and cost, a catalogue entry moved from *bespoke* to *shipped*, and a level in the benchmark.

**The live checkpoints.** Azure, Bedrock, Lakera and the Gen AI evaluation service, each one command with a key, recorded dated in `30-…`/`39-…`, and each service's benchmark cassette recorded the same day so the benchmark's live column fills.

**Tests.** The benchmark over the stand-ins is deterministic and its report shape held; a subject's cassette replays to the same confusion matrix; the four components' `checkComponent` fixtures; a planted `SYSTEM:` line in a bureau file is caught by `untrusted-content` and blocked by `taint-reaches` at `pre-act`; the quarantined seat cannot call a tool; the red-team seat's lines are corpus rows and no others; the Rack shows *unmeasured* for a service with no benchmark.

### 6.7 The Gate (retires G79; decision D20; tenet 38)

**Extends** `@craftabot/governance` (`38-…`), the hosted shell (`29-…`), stacks (`89-…`), sinks (`35-…`), the egress guard (`41-…`). **Packages** a new `@craftabot/gate` (Node only, no Svelte, no world, no pack), `governance` (1.0.0), `harness` (`craftabot gate`), `examples/gated-agent`.

**What it is.** An HTTP server speaking the OpenAI chat-completions wire on one route, forwarding to one upstream named at start, and running a stack from a file at three points: **`pre-think`** over the incoming messages (every `user`, `tool` and injected message marked untrusted); **`pre-act`** over every `tool_call` in the upstream's response, one chain per call; **`post-act`** over the assistant's text. It is the session's `runGuardrailChain` with `GuardrailContext` built from the wire instead of from a world: `proposed` from a `tool_call`, `messages` from the request, `response` from the upstream, `usage` accumulated per conversation id, `worldState` absent (a card leaf that needs it reads `false` and the Gate's page says which leaves are unavailable off-world).

**Modes.** `shadow`: nothing is changed; every verdict is written to the trace and echoed in a response header the client may ignore. `enforce`: `block-action` removes the `tool_call` and inserts a tool message stating the refusal so the agent can continue; `stop-run` returns the assistant's turn with `finish_reason: 'stop'` and the reason; `pause` returns `202` with an approval id the operator resolves through `craftabot gate approve <id>` (the approval mode's contract, `08-…`); `redact` rewrites the text; `annotate` records.

**The trace.** The same event types — `run.started` per conversation, `prompt.composed`, `guardrail.checked`/`tripped` with `componentId` and `point`, `action.performed` for a forwarded call, `run.finished` — to any `TraceSink` (`telemetry/file`, `telemetry/otlp-http`, the evidence store), with the trace digest, so a Gate's day is a bundle the Audit Centre opens and the assurance pack reads. Principal from `--principal`; the upstream key from the environment only, never on the trace (hard rule 2's harness form).

**The identity test.** The same messages and the same stack, once through a session over the mock provider and once through the Gate in front of the mock provider served on a port, produce byte-identical `guardrail.checked` sequences. It runs on every push over the five preset stacks and one Studio-built stack fixture. The Studio's *Use in…* gains **the Gate**: it writes the stack file and the command line.

**Governance 1.0.0.** `readers/*` and the reader component join the export list; the TSDoc audit covers them; `docs/governance-mapping.md` gains the Gate's rows; the tarball check is unchanged; the version is cut. `examples/gated-agent` is `plain-node-agent` with its loop replaced by an OpenAI client pointed at the Gate, proving that an agent that knows nothing of Craft A Bot is governed by a stack it never saw.

**What it is not.** Not authenticated, not TLS-terminated, not multi-tenant, not rate-limited, not a queue: a reference implementation of the chain over the wire, with a page that says so first.

**Tests.** The identity test; each verdict's wire effect in `enforce` and its absence in `shadow`; `pause` round-trips an approval; the key-leak sweep over the Gate's trace and logs; the egress guard refuses any host but the upstream; the example's four outcomes through the Gate.

### 6.8 The reading desk (retires G85, G88, G89, G90; decision D21)

**Extends** `control-review` (`97-…`, GAP-1), `checkCalibration({ requireReview })` (`93-…`), `checkCatalogue` (`86-…`), `checkControlMap` (`53-…`), `checkDomainPack` (`93-…`). **Packages** `core` (the `review` kind), `pack-testkit` (the checks read it), the Workshop (`/workshop/readings`), the manual.

```ts
interface Review {
  id: string;
  subject: { kind: 'catalogue-entry' | 'calibration-row' | 'control-row' | 'decision-right' | 'blueprint-item' | 'screening-list' | 'error-model' | 'reviewer-model'; id: string };
  verdict: 'accepted' | 'amended' | 'rejected';
  note?: string;
  by: Principal; on: string;
  /** For `amended`: the field and the value the reader would put, which a maintainer then edits into the content. */
  amendment?: { field: string; value: Json };
}
```

`review` replaces `control-review` (kept as an alias for one release with a migration note), lives on all three stores and the evidence store, and is what `checkCalibration({ requireReview })`, `checkCatalogue`, `checkControlMap` and `checkDomainPack` read: a row is *reviewed* when a `review` names it with `accepted` or `amended`. `/workshop/readings` is a queue: every pending subject across the eight kinds, grouped, with the source beside it (the citation, the row's numbers, the entry's description, the right's ceiling) and three buttons; a progress readout per kind; a filter in the URL; push to the evidence store; `craftabot readings export`. The seven readings Day 5 and Day 6 named for Andrew are the queue's first contents.

**The tail, under the same WP.** The stale lines in `USER-MANUAL.md` §41, `UX-AND-GAPS.md` §0/§4 and the three "awaiting review" notes corrected; the `jev-servicing` notes renumbered into the index (`98-`, `99-` kept, listed in `README.md`); the first release tag cut and `release.yml` exercised; the practitioner walk of `84-…` §9 performed and recorded; the manual's Part I and the PDF; five roundels (`reader`, `corpus`, `benchmark`, `gate`, `reading`); and the Kit's one Day 7 card — **Sure or unsure**, on the Front Desk, where the bot's reader answers with a confidence chip and the child decides the threshold that hands the rest to a person, the teachable form of §6.3 (G89).

**Tests.** A `review` for a calibration row turns `checkCalibration({ requireReview })` green for that row and only that row; the queue's count equals the pending set across the kinds; `control-review` records read as `review`; the screen passes the visual, axe and keyboard passes; the roundels pass `wave2.test.ts`'s contract.

---

## 7. Data model v7 (summary of record)

| Artefact | Schema | Store | New |
|---|---|---|---|
| Reader | `core/types/reader.ts` | registry (`PackManifest.readers`) | yes |
| Typed question / answer | `core/schemas/reader.ts` → `docs/schemas/reader.schema.json` | on events and cassettes | yes |
| Executor `reader` | `core/types/workflow.ts` | on `WorkflowSpec` | yes (additive) |
| Error model | `core/schemas/error-model.ts` | registry (`PackManifest.errorModels`) | yes |
| Reviewer model | `core/schemas/reviewer-model.ts` | on `WorkflowConfig` | yes |
| Provider cassette | `craftabot-cassette` with `kind: 'provider'` | files under the packs and `docs/evidence/` | one field |
| Corpus | `core/schemas/corpus.ts` → `corpus.schema.json` | content (all three stores), evidence kind `corpus`, registry | yes |
| Benchmark campaign and report | `evals` campaign schema `kind: 'benchmark'`; report v4 | campaign reports | one kind |
| Campaign report v4 | `campaign-report.schema.json` v4 with the v3 reader | as today | version |
| Review | `core/schemas/review.ts` → `review.schema.json` | content, evidence kind `review` | replaces `control-review` |
| Gate trace | `craftabot-trace` unchanged | any `TraceSink` | none |
| Calibration rows | as `66-…` | `fs-bank` | +≈20 rows |

IndexedDB stays at v8: `corpus` and `review` are content kinds on the existing `content` store.

## 8. Events catalogue changes (`02-…` §7, additive only)

- `decision.fault { stageId?, planted: true, chose, shouldHave, errorModelId }` — written beside a `decision` the fallible tier corrupted.
- `reader.answered { stageId?, readerId, questionIds, method, confidence?, gated, steer?, cassette? }` — one per `reader` executor run or reader component check.
- `stage.completed.by` gains `{ model, followed?, correct?, seconds? }` when a reviewer model answered.
- `run.started.gate?: { mode, upstream, stackId }` — written by the Gate only.
- `provider.cassette` on `think.completed` — the entry digest when a provider cassette answered.

No event is removed or renamed; every golden trace is unchanged.

## 9. Workshop surfaces (target IA)

`/workshop/readings` (new, on the Assurance lens's guided path first); `/workshop/corpora` (new, under the Playground group); `/workshop/benchmarks` (new, beside Campaigns; the Guard Rack's rows deep-link to it); Experiments gains the *untestable* verdict lamp and a *brains* axis; the Pipeline's stage card shows a reader's answer with its confidence and whether it gated; the Studio's *Use in…* gains the Gate; the Model-risk page's fairness workbench reads `pairId`; the Kit's Front Desk gains *Sure or unsure*. Every new drawing ships its twin (tenet 29).

## 10. Determinism and reproducibility (four additions)

- A fallible tier's faults are a function of the seed and the error model id; the same cell plants the same faults on any machine.
- A provider cassette replays a live run to the same trace digest; a miss is an error, never a call.
- A corpus's digest is over canonical JSON of rows and labels; `seenBy` is appended, never rewritten; the held-out rule is a refusal in the runner, not a convention.
- The Gate's identity test pins the chain over the wire to the chain in a session on every push.

## 11. Non-goals (recorded so they are decisions)

- **No reader is trained or fine-tuned**; questions are tuned, and a tuned question set is a new digest.
- **No corpus of real calls** is ingested, imported or linked; the design names it as the missing test.
- **The Gate is not a gateway product**: no auth, TLS, tenancy, rate limits or persistence beyond the sink.
- **No builder-specific hardware in the repo**: the DGX Spark pack stays a local config; the `llm` reader is the general form.
- **No vendor is endorsed by the benchmark**: it reports numbers on synthetic rows and says so on the page.
- **No second industry**, no mortgages, pensions, insurance or business banking (`83-…` §6.5.1 stands).
- **No new store, engine or UI system.**

## 12. Divergences from earlier docs, with reasons

| Earlier | Now | Why |
|---|---|---|
| `80-…` §5: the register's rows read *inconclusive* or *not-supported* | A comparison at ceiling on both sides reads **untestable** | An interval around zero over perfect actors is not a finding about the control (fact 5, tenet 33) |
| `73-…`: the scripted person answers from truth | The oracle is one reviewer model, `accuracy: 1`, named as such | Tenet 34; the human-oversight experiment is untestable otherwise |
| `47-…`: a cassette records a service line | A cassette also records a provider, keyed by the prompt digest | The live tier at scale needs CI replay (G80) |
| `98-…` §8: the classifier is a service line and the gate is four stages | `Reader` is a contract and the gate is one executor | Hard rule 4: a mechanism belongs in `core`, not bent from a line |
| `99-…`: the DGX Spark pack in the harness's default list | Opt-in by `--config`, like `pack-typesafe`; the `llm` reader is the general form | The hosts are the builder's; hard rule 8's spirit |
| `89-…` §8: the unplugged hosted guards left for review | Plugged in with the stand-in config; the baselines re-taken | Tenet 37; a default is stated so the WP is not blocked |
| `97-…`: `control-review` for control rows | `review` over eight subject kinds | One record kind for every reading (D21) |
| `84-…` §7: the bespoke components unscheduled | Four scheduled, as benchmark levels | A benchmark with nothing bespoke to compare measures only vendors |

## 13. Risks

| Risk | Mitigation |
|---|---|
| The fallible tier's rates are made up and read as findings | Every rate is a calibration row with a source and `review: 'pending'`; the report's brains axis names the tier on every effect; the live tier is beside it |
| Provider cassettes are large and drift as models move | One cassette per experiment under `docs/evidence/`, gzip, the model id pinned in every entry; a re-record is a dated evidence change |
| The regex readers' byte-identity breaks a golden run | The rule adapter is a function wrap; the identity test is stage A of the WP and the last thing checked |
| A corpus written by the product's authors flatters the readers | The guide says so; the second annotator is blind; the held-out rule is enforced; the *single-annotator* finding is visible |
| The benchmark endorses a vendor by accident | Synthetic rows, stated on the page; no ranking, a table; the catalogue's status is unchanged by a number |
| The Gate is run as if it were production | Its README's first line, its `--i-know-this-is-a-reference-implementation` flag on any non-loopback bind, no auth by design |
| Two hundred readings still wait | The desk makes each a minute; the checks stay green with `pending`; the count is a readout on the Assurance entry, not a gate |
| Budgets | Corpora and cassettes are files, never in a chunk; the per-desk chunk lands in Phase AC before anything is added |

## 14. Acceptance (the design as a whole)

1. Every reference experiment re-run on the fallible and live tiers records at least one effect with an interval that excludes zero, and every ceiling comparison reads *untestable*; `docs/evidence/` and the register's §5 are regenerated and dated.
2. A `human` stage under a reviewer model at the rows' rates reproduces them over the loan book; the oracle is byte-identical to today; human load v2 reports cost, quality and catch rate by level.
3. Every desk golden run and campaign baseline is byte-identical with its classify-shaped stages on `rule` readers; a hosted reader and an `llm` reader run the servicing journey through the `reader` executor with a gate, and the calibration pane shows ECE, Brier, the reliability table and the gate curve.
4. Seven corpora ship with a guide, a digest, a blind second annotator with κ, and a held-out part where a question set exists; `checkCorpus` refuses a re-score; a corpus book runs a journey end to end.
5. `checkDesk`'s truth-independence property is green on every desk and red on the servicing desk without its label hook; the servicing order, `touches`, the disputes pair, the four incidence rows, report v4's two fields, `specFor` and the per-desk chunk are landed with their tests.
6. Every hosted-guard baseline runs its service's stand-in, and the identity test is re-baselined with a dated note.
7. The benchmark runs every connectable service, every reader-as-guard and the four bespoke components over one adversarial corpus per desk in CI; the Guard Rack shows each service's numbers or *unmeasured*; the four catalogue entries read *shipped* with `measured`; the four live checkpoints are recorded dated.
8. The Gate's identity test is green over six stacks on every push; `examples/gated-agent` is governed by a stack it never saw; `@craftabot/governance` is 1.0.0 and the tarball check passes.
9. `/workshop/readings` queues every pending subject across the eight kinds, a reading turns the corresponding check green for that subject, and the first release tag is cut.
10. The stale lines are corrected, the two branch notes are in the index, the practitioner walk is recorded, the manual carries Part I with a rebuilt PDF, and the Kit's *Sure or unsure* card runs on the Front Desk.
11. Every new screen passes the visual, axe, keyboard and reduced-motion passes with a list twin; the budgets are re-stated and met on every edition.
12. Nothing real, nothing trained, nothing deployed: `checkSynthetic` is green over every corpus and cassette; no reader carries weights; the Gate binds loopback by default.

*End of document.*
