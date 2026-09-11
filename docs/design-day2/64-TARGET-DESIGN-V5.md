# 64 — Target Design V5: The Bank in Motion — workflows, evidence and the three lenses

> **Status: proposed, 2026-09-09.** The Day 5 target, written against `main` at `4acafc1` (WP0–WP73 done, both UX fix passes merged, the UX register closed). It extends `41-TARGET-DESIGN-V4.md` — the Retail Financial Services Playground — and does not replace it: every contract in `41-…` §6 stands, and every section below names the one it grows. The implementation plan is `65-DAY5-ROADMAP.md` (Phases R–W, WP74–WP93), which cites this document section by section.
>
> **Revised 2026-09-09, later the same day**, after a conversation about where this goes: the simulator is to be published on axiom-verity.com as a member-gated section and presented beside the site's thought experiment — *Can a Small Team Govern an AI Bank?* — as the bottom-up half of one question. §6.9, tenet 26, the human-load metrics in §6.4, the `human-oversight` experiment and the autonomy-level labels on the reference configurations are that revision; nothing earlier in the document was removed.
>
> **What changed in the brief.** Day 4 built the bank, the desks, the decks, the metrics and the assurance pack. Day 5 is asked for something different in kind: *empirical evidence* — real outputs from simulation that show whether a control works, over enough representative, realistic (but synthetic) data that the numbers mean something, with every stage's inputs and outputs visible, the workflow variable enough to compare designs against each other, a bank that runs rather than a case that is played, and screens a board member, a conduct reviewer and a model-risk analyst can each read as their own. The end product is not a demonstration; it is a dataset of what the controls did, and a way to make more of it.

---

## 1. Purpose

### 1.1 The vision, restated for this phase

A UK retail bank is deciding what IT-governance and Responsible-AI automations to put around its assistants — what to gate, what to measure, what to log, what to review, and what each of those costs in decisions changed, customers referred, and pounds of model spend. Today that decision is made from principle and vendor claims. Craft A Bot can make it from evidence: the same assistant, run over the same ten thousand synthetic applications, alerts and conversations, under stack A and under stack B, with the difference measured, bounded, and filed against the control it tests.

At the end of Day 5:

- **The bank is a population, not a case.** Thousands of customers, months of transactions, a loan book, an alert queue and a complaints register, all generated from one seed with distributions calibrated to published UK aggregates and cited row by row, so a reviewer can ask "is this bank plausible?" and be shown the table that made it so (§6.1).
- **A workflow is a first-class thing with stages, and every stage has visible input and output.** The lending journey is nine stages — intake, identity, bureau, affordability, decision, explanation, four-eyes, disbursement, appeal — each executed by a rule, a bot, a person or a service line, each recorded on the trace with what went in and what came out. The same is true of the fraud and advice journeys. A stage's executor is configuration, so the same journey can be run rules-only, bot-everywhere, or bot-with-a-person-at-the-decision, and compared (§6.2).
- **What the bot knows is an experimental axis.** A cell can hand the assistant the application alone, the case file, the case file with its relations, or a typed ontology of the bank's entities and their relationships — and the report says which context produced which agreement rate, at which token cost, with which data-minimisation findings (§6.3).
- **The metrics are functionally correct and proven so.** Fairness (parity, disparate impact, equal opportunity, equalised odds, conditional parity, matched-pair discordance) and drift (PSI per feature, outcome-mix distance, agreement-with-the-rule over time, fairness over time) are defined once, with intervals and sample-size honesty, and each is validated by a planted effect of known size that the metric must recover and a null case it must not flag (§6.4).
- **A bank runs.** A clock advances; applications, transactions, alerts and complaints arrive at calibrated rates; the desks work them; a monitor shows the bank's day — throughput, outcomes, approval rate by cohort, guardrail trips, escalations, drift — live, replayable from a seed, in a Worker so the tab stays alive (§6.5).
- **Three people can read it as their own.** The Assurance lens (a board or CRO), the Conduct lens (compliance, including the MLRO) and the Model-risk lens (data science) each open on a page built for their question, in their vocabulary, over the same stored facts (§6.7).
- **The simulator answers the thought experiment from below.** axiom-verity.com's *Can a Small Team Govern an AI Bank?* argues top-down — an autonomy spectrum, decision rights with ceilings, a nine-role control architecture, a scenario model of FTEs — and says of itself that the model has not been challenged. The simulator measures the same things bottom-up: for each autonomy level and control stack, how many human touches a thousand cases need, how often a decision is taken above its ceiling, and what that costs in outcomes. The two are published together, on one site, behind one account (§6.9).
- **The output is a register of what the controls did.** An experiment is an artefact: a hypothesis, a factorial design over stacks, contexts and executors, the runs, the effect sizes with intervals, the verdict. Experiments fold into the **Control Effectiveness Register**: for every policy card, guard and evaluator the bank might adopt, the measured effect across every experiment that tested it, mapped to the control-map row it evidences (§6.8). That register is the empirical answer to "what should a full-scale bank implement".

### 1.2 What this design is not

Everything in `41-…` §11 stands. In particular: nothing real (tenet 15 — the calibrated population is *shaped like* the published aggregates, it contains no record from anywhere); no credit-scoring model (the rule stays the judge, §6.1.4 says exactly how far a synthetic performance label goes); no compliance opinion (a register of effects is evidence, not a verdict on adequacy); no production deployment (the bank in motion is a simulator with a clock, and its ingest seam is designed, not connected).

### 1.3 New words (glossary additions to `00-…` §6 and `41-…` §1.3)

| Word | Meaning |
|---|---|
| **Population** | The whole synthetic bank at one seed: customers, accounts, transactions over a period, the loan book, the alert stream, the complaints register. `bankCase(seed)` draws one customer; `population(seed, size)` draws the bank. |
| **Calibration table** | The distributions the generators draw from, each row citing the published aggregate it was set to and when. Content, reviewed, tested. |
| **Workflow** | A journey as a sequence of **stages** with typed input and output. Each stage has an **executor**: `rule`, `agent`, `human` or `line`. |
| **Stage record** | The trace's account of one stage: input digest, output digest, executor, guard verdicts, duration, and the agent run id if a bot did it. |
| **Context** | What a bot is given about the case before it acts, on a ladder: `minimal`, `case-file`, `relational`, `ontology`. A campaign axis. |
| **Ontology** | The bank's entities and relationships as a typed graph — classes, relations, instances — handed to a bot as a knowledge card and reachable through a `graph` line. |
| **Bank clock** | The scheduler that advances simulated time and emits work items at calibrated rates. |
| **Work item** | One thing for a desk to do: an application, an alert, a complaint, an advice request. Arrives by the clock or by a book. |
| **Book** | A batch of work items drawn from the population without the clock — the loan book, an alert batch — for a batch run. |
| **Monitor** | The live view of the bank in motion. |
| **Lens** | A stakeholder's arrangement of the Workshop: which screens, in which order, in which words. |
| **Experiment** | A pre-registered comparison: factors, metrics, the runs, the analysis. An artefact with a schema. |
| **Effect** | One measured difference an experiment found: metric, baseline, treatment, delta, interval, n. |
| **Control Effectiveness Register (CER)** | Every effect ever measured, folded by the control that produced it. |
| **Metric validation suite** | For each metric: a hand-computable case, a planted effect it must recover, a null it must not flag. |
| **Autonomy level** | The thought experiment's five-tier spectrum (`axiomverity/src/lib/thought-experiment.ts`): 1 *Human as Operator*, 2 *Collaborator*, 3 *Consultant* (the AI recommends, the human decides), 4 *Approver* (the AI initiates, the human authorises before execution), 5 *Observer* (the AI acts within parameters, monitored retrospectively). A workflow configuration is an autonomy level applied to a journey. |
| **Decision-rights ceiling** | The highest autonomy level a decision kind may run at, keyed to legal significance, harm and reversibility — the thought experiment's table, carried as configuration and measured as a breach rate. |
| **Touch** | One occasion on which a person had to act in a case: an approval, an escalation, a `human` stage, a returned decision. |
| **Human load** | Touches per case, minutes per touch (a stated assumption), and FTE at a volume — the bottom-up input to the thought experiment's scenario model. |

---

## 2. Where the code actually is (the load-bearing facts)

Read before any contract below is judged. Every path was checked at `4acafc1`.

1. **The bank is a case generator.** `packages/packs/fs-bank/src/generate/case.ts` — `bankCase(seed, options)` threads one `seededRandom(seed)` through `generateCustomer → generateAccounts → generateTransactions → generateComplaints → generateBureau` and returns one `BankCase`: one customer, their accounts, about 24 transactions per account over 30 relative days, a complaint or two, a bureau file, and the shared shelf. There is no population, no clock, no calendar date (a transaction's `day` is "days before the case"), and no loan book. The distributions are hand-set weights in `generate/customer.ts` (`AGE_WEIGHTS`, `incomeFor`) with no source cited.
2. **The cohort and the vulnerability model are already right in shape.** `model.ts` carries `CohortBlock { ageBand, incomeBand, protectedProxies, supportNeeds, literacyBand }`, six opaque proxies `proxy-a … proxy-f`, and FG21/1's four vulnerability groupings with a `disclosed` subset. `DeskTruth.cohort` (`50-…` §4.3) is what fairness slices read. Nothing here changes; the population reuses it.
3. **The lending rule is pure and closed.** `packages/packs/fs-lending/src/world/rules.ts` — `affordabilityVerdict(application, bureau)` at one flat rate (`LENDING_RATE = 0.079`), a repayment formula, a ratio over disposable income, and thresholds fixed in code: decline on `poor` / defaults ≥ 2 / ratio > 100%, refer on `fair` / a default / arrears / searches ≥ 3 / ratio > 60%. Nine layouts in `world/desk.ts` (`lendingLayouts`), each a handwritten case kind in `world/cases.ts`. There is no way to vary a threshold without editing the pack, and no batch of applications — a campaign is scenarios × seeds.
4. **A campaign has five axes and no context axis.** `packages/evals/src/campaign.ts` — `campaignSchema { scenarios, builds, guards, brains, counterpart?, seeds, noise?, assertionCards, sinks, evaluators, gates, budget? }`; a cell is `{ scenario, build, guard, brain, tier, seed … }`. What the bot is given is whatever the desk's layout `reveal`s; it is not a variable.
5. **The gates already know parity, as a bound.** `gateSchema`'s `parity` kind takes `across`, `of` (label-rate, derived-metric, evaluator-pass-rate, outcome-rate, metric), `maxDifference`, `minRatio`, `matched`, and the verdict carries `values`. `50-…` §7 records the decision: *no statistical test on parity — a bound on a spread or a ratio.* There is no interval, no sample-size floor, no equal-opportunity or equalised-odds form, no conditional parity.
6. **Drift is two comparisons and a threshold.** `packages/governance/src/reports/drift.ts` — `telemetrySeries` buckets by day; `driftIn` holds a day against the pooled days before it by total-variation distance on the trip mix, plain difference on the loop rate, and a `seriesThreshold` (default 0.3) on any domain series. Honest and small. There is no input-distribution drift (nothing reads the applications' features), no reference window, no PSI, and no validation that a planted drift is detected.
7. **Per-case metrics are five numbers.** `packages/desk/src/metrics.ts` — ticks, tokens, approvals, decisions, pressure withstood — folded once for every desk. The campaign summary (`50-…` §4.5) slices by scenario × guard × brain × cohort and by obligation tag.
8. **The trace already records a tick's stages.** `packages/core/src/schemas/events.ts` — `tick.started` (the observation), `prompt.composed`, `think.started/completed`, `tool.executed`, `guardrail.checked/tripped/external`, `approval.requested/resolved`, `action.performed`, `world.changed`, `tick.completed`, plus `run.*`, `group.*`, `input.delivered`, `memory.updated`, `brick.state`, `provider.retried`. Stage-level input and output for *an agent's tick* exist. What does not exist is the *business* stage: nothing says "the affordability stage took this in and put that out", because the desk is one agent doing every stage in one run.
9. **`configure(config)` is a seam nothing reads.** `43-…` §4.4: the desk runtime stores `configure`'s argument in `extra.config` "and nothing reads it yet". This is where a context ladder and a policy-threshold set can enter a desk without a new core seam.
10. **Fork and restore exist.** `WorldInstance.restore?` and `forkSession` (WP66) replay a run to a tick and continue. A workflow that re-runs from stage *n* is a fork at the stage's first tick.
11. **The harness scales; the browser does not.** `packages/harness/src/commands/campaign.ts` with `cell-pool.ts`, `campaign-worker.ts`, `merge.ts`: `--jobs`, `--shard`, `--resume`, an index. The browser runs a campaign on the main thread (UX-12's open half, `docs/manual/UX-AND-GAPS.md` §4): 930 cells is a minute and a half of a tab that will not answer.
12. **The Control Room is a component system with thirteen instruments.** `apps/workbench/src/lib/components/control-room/` — `Boundary`, `CaseFile`, `CaseTable`, `Chain`, `Lamp`, `Matrix`, `Meter`, `Queue`, `Readout`, `Roundel`, `Strip`, `Tape`, `Transcript` — with a lint rule that every Workshop chart goes through `Matrix`/`Tape`/`Meter`. New screens compose these; they do not add a chart library.
13. **The Workshop is one arrangement for one reader.** `apps/workbench/src/routes/workshop/` has twenty routes on one rail (`WorkshopRail.svelte`), ordered for an engineer. There is no notion of who is looking.
14. **The Boundary map's labels collide** (UX-7, deferred to a `Boundary.svelte` rewrite). Any new layer on the map (§6.2.5) lands on that rewrite, not beside it.
15. **Editions share an origin's service worker** (CLOSE-2 in the UX register): the worker is scoped to `base` but the cache name is not per edition; two sections served from one origin can leave the second blank. A `docs/publishing.md` rule and a cache name.
16. **Evidence has a home and a schema.** `@craftabot/evidence` (`EvidenceStore`, `EvidenceItem`, `docs/schemas/evidence-item.schema.json`), the assurance pack (`governance/src/reports/assurance-pack.ts`, sectioned by SS1/23 with the Consumer Duty as the second axis), and the control map (`control-map.ts`, rows as content with `unreviewed` status). An experiment and a register are new artefact kinds for the same store and the same pack.
17. **The site already has the gate, the shelf and the other half.** `axiomverity` (a separate repository) runs Supabase magic-link auth with `public`/`member`/`premium` tiers gating individual files; `/labs/craft-a-bot` is a published Labs entry; `src/docs/v4-labs-security-policy.md` classifies a demo whose logic runs in the visitor's browser against the visitor's own key as **client-only** — publishable with no further gate — and reserves its spend-cap and abuse controls for anything server-proxied. `/thought-experiment` is *Can a Small Team Govern an AI Bank?* with an autonomy spectrum, a decision-rights table (`autonomyCeiling` per decision kind), a nine-role *Minimum Accountable Control Architecture* and a scenario model of FTEs that describes itself as unchallenged. Craft A Bot is client-only by construction (`41-…` §11: no auth, no SSR, no server, BYO key).
18. **Obligations are twenty-one tags.** `fs-bank/src/obligations.ts` — Consumer Duty ×4, COBS 9 and 4, CONC ×2, DISP, FG21/1, SS1/23 ×5, SS1/21, POCA, MLR, UK GDPR ×2, Equality Act. A control-effectiveness row cites one or more of these; none need adding for Day 5.

### 2.1 Foundations: what this phase needs that Day 4 did not build, and five decisions

Day 4's foundations assessment (`41-…` §2.1) found the engine and its contracts sound and named six weaknesses, all since retired. The question for Day 5 is narrower: *what does empirical evidence at scale need that a playable case does not?* Four things, and they are additive.

| Need | What exists | What is missing | Decision |
|---|---|---|---|
| Volume with plausible shape | `bankCase` at any seed; `checkSynthetic` | A population; a calibration table with sources; a calendar | **D5** — the population is a pure fold of `bankCase`-style generators over a seed and a size, in `fs-bank`, with a calibration table as reviewed content. No database; a population of 50,000 customers is regenerated from its seed in seconds and never stored whole (§6.1). |
| A truth label for outcome-fairness | The rule's verdict (`agree` / `over-approve` / `over-decline`) | Whether a loan *performed* — needed by equal opportunity and equalised odds, which compare decisions to what was actually so, not to a rule | **D6** — a synthetic twelve-month performance label drawn from a stated hazard over the affordability ratio and the bureau file, documented as synthetic, used only as the positive class for the outcome-conditioned fairness metrics, and never as a training target. The rule remains the judge of a *decision*; performance is the judge of an *outcome*. `41-…` §11's "no credit-scoring model" holds: nothing fits anything (§6.1.4). |
| Concurrency in the browser | A main-thread runner | A Worker | **D7** — one Worker hosts the campaign runner, the book runner and the bank clock. The engine is already browser-safe and side-effect-free; the Worker is a host, exactly as the harness is (§6.6). This is UX-12's other half and it is a foundation here, not a fix. |
| A vocabulary for evidence | Reports, packs, evidence items | Experiments, effects, a register | **D8** — an experiment is a campaign-shaped artefact with a design and an analysis, and the register is a governance fold over experiments; both are JSON with schemas in `docs/schemas/` and both are evidence items (§6.8). No new store. |
| A reader | One Workshop | Lenses | **D9** — a lens is configuration over the existing routes and folds (`lens.ts`, three entries), not a second application; it changes order, entry page and vocabulary, never data (§6.7). |

Nothing in this table asks core for a new seam. `configure` (fact 9), `restore` (fact 10), the event catalogue's additive rule and the pack manifest carry all of it.

---

## 3. Gap register (what stands between today and §1.1)

Numbering continues `41-…` §3 (G21–G42, all retired). Severity as before: **A** blocks purpose in practice; **B** compounds if built on; **C** hygiene.

| ID | Sev | Gap | Where |
|---|---|---|---|
| G43 | A | **No population.** One customer per seed; no bank-wide distribution to slice, no loan book to batch, no stream to monitor. Every fairness or drift number today rests on scenarios × seeds — a dozen to a few hundred runs of designed cases, not a bank's worth of ordinary ones. | `fs-bank/src/generate/case.ts` |
| G44 | A | **Distributions are uncited.** Hand-set weights; a reviewer cannot ask "why 18% aged 25–34?" and be shown a source. The numbers a register reports inherit that. | `fs-bank/src/generate/customer.ts`, `accounts.ts`, `transactions.ts`, `bureau.ts` |
| G45 | A | **No business workflow.** A desk is one agent with all the actions; a journey's stages are implicit in a goal card's predicate. Nothing can run the affordability stage by rule and the explanation by bot; nothing records stage input and output as such; nothing shows a pipeline. | `packages/desk/src/desk-world.ts`, every `world/desk.ts` |
| G46 | A | **Context is fixed.** What a bot knows is whatever the layout reveals. No way to give less, more, or structured knowledge, and no report axis for it. | `DeskCase.revealed`, `campaign.ts` |
| G47 | A | **Fairness is a bound with no interval.** `parity` compares point estimates; a 0.1 spread over twelve cells and over twelve thousand read the same. No equal opportunity, equalised odds, conditional parity or discordance; no truth outcome to condition on. | `evals/src/campaign.ts` (`parity`), `campaign-summary.ts` |
| G48 | A | **Drift reads outputs only, against no reference.** No feature distributions, no PSI, no fixed reference window, no detection-delay or false-alarm validation. | `governance/src/reports/drift.ts` |
| G49 | A | **No experiment, no effect, no register.** A campaign report says pass or fail per gate; nothing states "stack B changed over-decline by −4.1 points [−6.0, −2.2], n = 4,800" or folds that across runs by the control that caused it. | `evals/src/report.ts`, `governance/src/reports/` |
| G50 | B | **The lending desk cannot be configured.** Thresholds and the rate are constants; the five policy cards are fixed content; nothing varies for a comparison except the guard stack. | `fs-lending/src/world/rules.ts`, `cards/policy.ts` |
| G51 | B | **Nothing runs on a clock.** No simulated time, no arrivals, no queues fed by anything but a layout, no monitor. | `fs-bank`, `desk` |
| G52 | B | **The browser runs everything on the main thread.** Campaigns hold the tab; a bank in motion would freeze it. | `apps/workbench/src/routes/workshop/campaigns/+page.svelte` |
| G53 | B | **One reader.** Twenty routes for an engineer; a board member and a conduct reviewer have no page of their own and no vocabulary of their own. | `WorkshopRail.svelte`, `routes/workshop/` |
| G54 | B | **The Boundary map's labels collide** (UX-7) and it has no place for a workflow's stages. | `control-room/Boundary.svelte` |
| G55 | C | **Two reports cannot be compared side by side** (GAP-6); the cohort axis lives only in a report (GAP-3); no guided path (GAP-2). | `routes/workshop/campaigns`, `telemetry` |
| G56 | C | **The service-worker cache is not per edition** (CLOSE-2). | `apps/workbench/src/service-worker.ts`, `docs/publishing.md` |
| G57 | B | **The simulator lives in a repository, not on the site.** The editions build but are not served; a professional cannot open it without a checkout; nothing a visitor does survives their browser; the thought experiment and the simulator do not know each other exists. | `docs/publishing.md`, `axiomverity/src/lib/labs.ts`, `axiomverity/src/routes/thought-experiment/` |
| G58 | B | **The simulator measures decisions and outcomes but not people.** Approvals per decision and escalation rate exist per case; nothing folds them to touches, minutes or FTEs, and nothing knows a decision's autonomy ceiling. | `packages/desk/src/metrics.ts` |

G43–G49 are the phase. G50–G54 are what the phase builds on. G55–G56 are folded in where they fall. G57–G58 are the site and the bridge to it (§6.9).

---

## 4. Design tenets (V5 additions to `41-…` §4's seven)

19. **A number carries its provenance or it is not shown.** Every rate has an *n* and an interval; every distribution the bank draws from cites its source; every effect names its experiment and every experiment its runs. A screen that cannot say where a number came from says nothing there (`41-…`'s "no cost model" honesty, generalised).
20. **A metric is defined once, validated once, and read everywhere.** Fairness and drift live in one package with one definition each, a planted-effect test each, and every consumer — gate, report, monitor, register — calls the same function. No screen folds its own version.
21. **The workflow is the unit of comparison; the stage is the unit of evidence.** A journey is stages with typed input and output. Two designs are compared by running the same stages with different executors, contexts or guards over the same work; the evidence is what each stage took in and put out.
22. **What the bot knows is a variable, and is measured.** Context is a first-class axis. Giving a bot more is not assumed better; the report says what more bought and what it cost, including under the data-minimisation obligation.
23. **The rule judges the decision; the outcome judges the rule.** The affordability rule remains the ground truth for *did the bot decide as the bank's policy says*. A synthetic performance label is the ground truth for *was the policy itself fair in outcome*. The two questions are kept apart on every screen.
24. **The bank runs deterministically, or it is not a bank.** The clock, the arrivals, the queues and the desks' work are a function of the seed and the configuration; a day can be replayed to the event; a monitor's number at 14:03 is reproducible. Live brains and live counterparts break this by declaration, as they do today, and are labelled.
25. **One fact, three lenses.** A lens rearranges and renames; it never recomputes. The board's "control effectiveness" and the analyst's "effect size" are the same fold with two labels.
26. **The simulator challenges the model; it does not confirm it.** Where the thought experiment states an assumption — a ceiling, a headcount, a rate — the simulator produces the measured figure beside it, with its interval, and the two are shown together whether or not they agree. A bottom-up number that always matched the top-down one would be evidence of nothing.

---

## 5. Target architecture

```
                         ┌──────────────────────────────────────────────────────┐
                         │  Content packs                                       │
   calibration table ───►│  fs-bank  ─ population · book · clock · ontology     │
   (cited rows)          │  fs-lending ─ workflow · policy knobs · performance   │
                         │  fs-fraud / fs-advice ─ workflows on the same seam    │
                         └───────────────┬──────────────────────────────────────┘
                                         │ WorkflowSpec · ContextSpec · WorkItem
                                         ▼
   ┌───────────────┐      ┌──────────────────────────┐      ┌───────────────────────┐
   │ @craftabot/   │      │ @craftabot/workflow       │      │ @craftabot/metrics     │
   │ desk (as is)  │◄────►│ stages · executors ·      │─────►│ fairness · drift ·     │
   │ createDeskWorld│     │ stage records · fork-from │      │ intervals · validation │
   └───────────────┘      └─────────────┬────────────┘      └──────────┬────────────┘
                                        │ traces + stage records              │ one definition
                                        ▼                                     ▼
   ┌───────────────────────────────────────────────────────────────────────────────┐
   │ @craftabot/evals — campaign (+ contexts axis, + book source) · experiment ·    │
   │ analysis fold (effects, intervals) · report v3                                 │
   └───────────────┬───────────────────────────────────────────────┬───────────────┘
                   │                                               │
                   ▼                                               ▼
   ┌───────────────────────────────┐       ┌───────────────────────────────────────┐
   │ @craftabot/governance          │       │ Hosts                                 │
   │ CER fold · assurance pack §5   │       │ harness: campaign · book · experiment │
   │ control map · drift (delegates)│       │ browser: Worker (campaign · book ·    │
   └───────────────────────────────┘       │ clock) · Monitor · Pipeline · Lenses  │
                                           └───────────────────────────────────────┘
```

Two new packages (`@craftabot/workflow`, `@craftabot/metrics`), both browser- and Node-safe, both depending on `core` (and `workflow` on `desk`), built and tested like `desk`. `governance/reports/drift.ts` keeps its API and delegates its arithmetic to `metrics` (tenet 20). `evals` grows a `contexts` axis, a `book` source and the experiment; `fs-bank` grows the population, the calibration table, the clock and the ontology; `fs-lending` grows the workflow, the knobs and the performance label. The Workshop grows a Worker host, three screens (Pipeline, Monitor, Experiments) and the lens system.

---

## 6. The contracts

Each section names what it extends, what it retires, and the tests that prove it. Everything is additive to `core`; the one core change is an event kind (§8).

### 6.1 The population, the calibration table and the book (retires G43, G44; decision D5, D6)

**Extends** `fs-bank`'s generators (`48-FS-BANK.md` §4.2). **Package** `fs-bank`.

#### 6.1.1 The population

```ts
export interface PopulationOptions {
  size: number;                       // customers; browser default 2,000, harness default 20,000
  periodDays: number;                 // the calendar the transactions and the book cover; default 180
  startDate: string;                  // ISO date, the calendar's day 0 — synthetic, default '2026-01-05'
  calibration?: CalibrationTable;     // default: the shipped table
}

export interface Population {
  seed: number; options: Required<PopulationOptions>;
  customers: Customer[];              // as model.ts, unchanged
  accounts: Account[];
  transactions: TransactionStream;    // lazily generated per account per day — see below
  bureau: Map<customerId, BureauFile>;
  book: LoanBook;                     // §6.1.3
  alerts: AlertStream;                // the fraud desk's arrivals — the alert rule (§6.1.3) over the transactions
  complaints: Complaint[];
  digest: string;                     // SHA-256 over a canonical sample — the population's identity
}

export function population(seed: number, options?: Partial<PopulationOptions>): Population;
export function customerCase(pop: Population, customerId: string): BankCase;   // the existing shape, for a desk
```

The generators are the existing ones, called in the existing order per customer, with the seed derived per customer as `hash(seed, index)` so that customer *k* of a population is the same whatever `size` is (a population of 2,000 is the first 2,000 of the population of 20,000 — the sharding property the harness needs). A `Transaction` gains a calendar `date` beside its relative `day`; nothing that reads `day` changes.

`TransactionStream` is not an array: it is `{ forAccount(id, day): Transaction[]; between(from, to): Iterable<Transaction> }` over the per-account generator, memoised, so a 20,000-customer population over 180 days (several million rows at the current rate of about 24 per account per 30 days) is never materialised. `checkSynthetic` runs over a sample of 1,000 customers and every book row.

#### 6.1.2 The calibration table

```ts
export interface CalibrationRow {
  id: string;                         // 'age-band', 'income-band-by-employment', 'vulnerability-prevalence', 'card-fraud-by-channel', 'unsecured-application-outcome', …
  distribution: Record<string, number>;   // category → weight, or bin → weight
  source: { publisher: string; title: string; edition: string; url?: string; retrieved: string };
  note?: string;                      // what was simplified, and why
  tolerance: number;                  // the calibration test's allowed absolute deviation on the marginal
}
export const CALIBRATION: CalibrationTable;   // the shipped rows
```

The rows the generators read, each cited: age structure of UK adults (ONS mid-year estimates); income band by employment status (ONS / HMRC survey of personal incomes); prevalence of characteristics of vulnerability by the four FG21/1 drivers (FCA *Financial Lives*); digital confidence (FCA *Financial Lives*); card and payment fraud by channel and APP-scam share (UK Finance *Annual Fraud Report*); unsecured-lending application outcomes and typical loan size and term (Bank of England *Money and Credit*, FCA credit-reference data where published); complaint categories (FCA complaints data, DISP returns). **The values in the table are taken from the publications at build time and recorded with the edition and retrieval date; this design does not state them**, so that a reviewer checks a row against its source rather than against a designer's memory (tenet 19). Where a publication gives no breakdown the row says so in `note` and carries a stated simplification.

A **calibration test** generates a 20,000-customer population and asserts each row's marginal within its `tolerance`; a **stability test** asserts the population's `digest` for the shipped seed and table, so a change to either is deliberate.

The table is content: `PackManifest.calibrations?`, a `checkCalibration` in `pack-testkit` (every row cited, weights positive, categories matching the model's enums), rendered on the Playground's bank page as *Where this bank's shape comes from* (§9).

#### 6.1.3 The loan book, the alert stream and the book contract

```ts
export interface LoanApplication {     // one row of the book
  id: string; customerId: string; date: string;
  application: Application;            // fs-lending's shape, re-exported through fs-bank as a plain record
  cohort: CohortBlock;                 // from the customer — truth, never on the desk
  verdict: Verdict;                    // the rule's, computed at generation (truth)
  performance?: PerformanceLabel;      // §6.1.4
}
export interface LoanBook { rows: LoanApplication[]; byOutcome: Record<Outcome, number> }

export interface WorkItem<Kind extends 'application' | 'alert' | 'complaint' | 'advice-request'> {
  id: string; kind: Kind; customerId: string; arrivedAt: string;   // ISO datetime on the calendar
  payload: …;                          // the application, the alert, the complaint, the request
  truth: DeskTruth;                    // the case's truth block, as a desk would compute it
}
export interface Book<Kind> { kind: Kind; items: WorkItem<Kind>[]; source: { populationDigest: string; filter?: string } }
export function loanBook(pop: Population, filter?: BookFilter): Book<'application'>;   // BookFilter: date range, cohort, amount band, outcome
export function alertBook(pop: Population, filter?): Book<'alert'>;
```

A **book** is what a batch run consumes (§6.6) and what the clock emits one at a time (§6.5). It carries the truth per item so evaluators need nothing else.

**The alert rule.** Today the Fraud Desk's alerts are built by hand per case (`fs-fraud/src/world/alerts.ts`: *"never a random departure the bank happened to generate"*), and `generate/transactions.ts` plants departures at a fixed 12% with no label. At scale an alert has to come from somewhere, so `fs-bank` gains two things, both rules: the transaction generator draws a *planted* truth on a departure (`planted?: 'fraudulent' | 'mule-in'`, at an incidence from a calibration row for fraud by channel) and an **`alertRule`** — a stated, pure detector over an account's stream (velocity, a new device, a foreign country, a night-time card-not-present burst, the shapes the generator already makes) that raises an `alert` work item carrying the planted label as truth. The desk's handwritten alerts stay for the decks; the book and the clock use the rule. Because the rule's true labels are known, the rule's own precision and recall are a calibration test, and the fraud workflow's `rules-only` configuration is "the detector alone" — the baseline every stack is compared against. No fraud model is fitted (§11). The applications' amounts, terms and purposes are drawn from the calibration rows; the declared income and outgoings are drawn from the customer's bureau affordability with a stated declaration noise (the "customers round up" effect, itself a calibration row where a source exists and a stated assumption where not).

#### 6.1.4 The performance label (decision D6)

```ts
export interface PerformanceLabel {
  defaultedWithin12m: boolean;
  /** The hazard the draw was made from, so a reader can see it is a function, not a fact. */
  hazard: number;
  basis: 'synthetic-hazard-v1';
}
export function performanceLabel(random, application, bureau, verdict): PerformanceLabel;
```

The hazard is a stated, monotone function of the affordability ratio, the score band, defaults and arrears — written in the pack with its coefficients in a table beside the calibration rows, and checked by a test that the label's base rate across the book sits inside a cited range for UK unsecured lending arrears. It is drawn *for every application including declines* (so the counterfactual "would the declined have performed?" exists in truth), and it exists so that equal opportunity and equalised odds (§6.4.1) have a positive class that is not the rule itself. It is never fitted, never read by a desk, never shown to a bot, and the Model-risk lens labels it *synthetic hazard* wherever it appears (tenet 23).

**Tests.** Same seed → same population digest; customer *k* identical across sizes; the calibration test; `checkSynthetic` over the sample; the transaction stream's `between` equals the concatenation of `forAccount` over the range; the loan book's outcome mix inside the calibration row's tolerance; the performance base rate inside its cited range; a 20,000-customer population generates under a stated time on the CI runner (recorded in the roadmap).

### 6.2 Workflows: stages, executors and stage records (retires G45; decision D7 in part)

**Extends** `@craftabot/desk` (`43-…` §4.4) and the event catalogue. **Package** `@craftabot/workflow` (new).

#### 6.2.1 The spec

```ts
export type Executor =
  | { kind: 'rule'; rule: string }                                   // a pure function the pack registers by id
  | { kind: 'agent'; goalCardId: string; until: string /* predicate */; build?: string }
  | { kind: 'human'; prompt: string; options: string[]; default?: string }   // an approval-shaped pause
  | { kind: 'line'; lineId: string; operation: string };             // a service line called directly

export interface StageSpec<In, Out> {
  id: string; name: string;
  input: JsonSchema; output: JsonSchema;                              // validated at the boundary, both ways
  executor: Executor;                                                // the default; a WorkflowConfig overrides it
  guards?: { policyCards?: string[]; lanes?: ('pre-think' | 'pre-act' | 'post-act')[] };   // what runs at this stage's boundary in addition to the bot's own
  irreversible?: boolean;                                            // the stage commits something (disburse, freeze, SAR)
  next: (out: Out, state: DeskState) => string | 'end';              // the edge: which stage follows
}

export interface WorkflowSpec {
  id: string; name: string; worldId: string; purpose: string;
  intake: (item: WorkItem) => { layoutId: string; input: unknown };  // how a work item becomes a case and a first input
  stages: StageSpec[]; first: string;
  obligations: string[];                                             // the tags the workflow as a whole carries
}

export interface WorkflowConfig {                                    // what a campaign, a book run or the monitor varies
  executors?: Record<stageId, Executor>;                             // per-stage overrides
  context?: ContextSpec;                                             // §6.3
  knobs?: Record<string, number | string | boolean>;                 // passed to the world through configure(); §6.6.2
}
```

A stage's `executor: 'agent'` is **the existing desk bot** run against a goal card whose success predicate is the stage's `until` — `verify-identity` stage ends at `identity-verified`, `decide` at `decided`. The world instance is carried across stages (it is one `WorldInstance`; the agent stage runs a session over it and returns; the next stage picks up the same state through `restore` if it needs to re-enter). Nothing about a desk changes to be run as a workflow; the workflow is a schedule over what a desk already does.

A stage's `executor: 'rule'` calls a pure function of the stage's input and the desk state and applies its output through the desk's own action (`ctx.decide`, `reveal`), so a rules-only affordability stage performs `assess-affordability` exactly as a bot would, with the same `action.performed` on the trace. A `human` stage is an `approval.requested` with the stage's prompt and options, resolved by the host (a person in the browser, `--approve` policy in the harness, a scripted resolver in a campaign — the pattern `51-…` §8 set). A `line` stage calls a service line and records it as a `tool.executed` would.

#### 6.2.2 The runtime

```ts
export function runWorkflow(spec: WorkflowSpec, item: WorkItem, options: {
  config?: WorkflowConfig; packs; registry; brain: BrainSpec; principal?; random?; onStage?;
  fromStage?: { stageId: string; from: WorkflowRun }   // re-run from here (fork semantics)
}): Promise<WorkflowRun>;

export interface WorkflowRun {                                       // the artefact — docs/schemas/workflow-run.schema.json
  schemaVersion: 1; id: string; workflowId: string; itemId: string; populationDigest?: string;
  config: WorkflowConfig; startedAt; finishedAt; outcome: 'completed' | 'stopped' | 'abandoned';
  stages: StageRecord[]; runIds: string[];                          // every agent run the workflow made
  digest: string;
}
export interface StageRecord {
  stageId: string; executor: Executor; startedTick: number; endedTick: number; durationMs: number;
  input: { digest: string; value?: unknown };                        // value kept when under a size cap, else the digest only
  output: { digest: string; value?: unknown };
  guards: { checked: number; tripped: Array<{ guardrailId; disposition; cause? }> };
  runId?: string;                                                    // the agent run, when the executor was a bot
  approval?: { requested: true; by?: Principal; decision: string };
  status: 'ok' | 'blocked' | 'escalated' | 'error';
}
```

Two events join the catalogue (§8): `stage.started { workflowRunId, stageId, executor, input }` and `stage.completed { …, output, status }`, emitted on the *agent run's* trace when the executor is a bot (so the Run Lab shows the stage boundary on the timeline) and on a workflow-level event list otherwise; the `WorkflowRun` folds both. Stage input and output are validated against the stage's schemas at the boundary in both directions; a bot that ends its stage without producing the output (the `until` predicate holds but the desk state lacks the decision) is a `status: 'error'` stage with a finding, never a silent pass.

#### 6.2.3 The lending workflow, as content

`fs-lending/src/workflow.ts` — `LENDING_WORKFLOW`, nine stages over the existing desk:

| Stage | Default executor | Input → output | Irreversible |
|---|---|---|---|
| `intake` | `rule` (`intake-v1`) | work item → `application` record on the desk | |
| `identity` | `agent` until `identity-verified` (or `line` on `fs-bank/kyc`) | application → `{ verified, method }` | |
| `bureau` | `line` on `fs-bank/credit-bureau` | customer → `bureau` record | |
| `affordability` | `agent` until `affordability-assessed` (or `rule` `affordability-v1`) | application + bureau → worksheet | |
| `decision` | `agent` until `decided` (or `rule` = the verdict itself) | worksheet + bureau → `{ outcome, reasons }` | |
| `explanation` | `agent` until `explained` | decision → the words said | |
| `four-eyes` | `human` (options approve / return / decline) — only when `outcome = approve` or the knob `fourEyesOn: 'all'` | decision → approval | |
| `disbursement` | `agent` until `disbursed` (or `line`) | approval → ledger | **yes** |
| `appeal` | `agent` until `appealed` — only when the item carries an appeal | decision → grounds | |

The same file declares the **reference configurations** every comparison uses, each labelled with the autonomy level it is (§1.3), so the simulator and the thought experiment use one vocabulary:

| Configuration | Autonomy level | What it is |
|---|---|---|
| `rules-only` | *none* — the control | Every stage a rule or a line; the bot nowhere. The bank as it is today, and the baseline every effect is measured against. |
| `bot-explains-only` | **1–2**, Operator / Collaborator | Rules decide; the bot drafts the explanation and the human sends it (a `human` stage after `explanation`). |
| `bot-recommends` | **3**, Consultant | The bot assesses and recommends; the `decision` stage is `human`, choosing among the bot's recommendation and the rule's verdict. |
| `bot-with-a-person-at-the-decision` | **4**, Approver | The bot decides; `four-eyes` on every decision before anything executes. The shipped desk's default for approvals. |
| `bot-everywhere` | **5**, Observer | The bot decides and disburses within the knobs; `four-eyes: none`; the Monitor is the retrospective oversight. |

`WorkflowConfig` gains `autonomy?: { level: 1 | 2 | 3 | 4 | 5; ceilings?: Record<string, 1 | 2 | 3 | 4 | 5> }`. The ceilings default to the thought experiment's decision-rights table where a decision kind maps to one of the desk's actions — approve within policy at 4, an adverse decision at 3, a vulnerability pathway at 3, a SAR at 2 — carried here as configuration and *measured* as a breach rate (§6.4.1a), never enforced silently: the point of `bot-everywhere` is to see what a Level 5 decline costs, not to be prevented from running it. The fraud and advice workflows follow in the roadmap on the same contract, with their stages in `51-…` and `49-…`'s vocabulary.

> **Amended 2026-09-11 (WP80 built, `73-LENDING-WORKFLOW-AND-BOOKS.md`).** Built as written but for `73-…` §8: ten stages (a `record` stage performs a person's decision — a `human` executor answers, it does not act); `bot-explains-only` is Level 2 with `fourEyes: 'all'` rather than a stage after the explanation; a campaign's person at `bot-recommends` follows the stage's `suggest` (the rule's verdict); the ceilings are content in `fs-lending/src/decision-rights.ts` citing the page, and `LENDING_CEILINGS` rides every configuration. The `agent` executor's `until` is the predicate (WP79's `69-…` §9), the card synthesised per stage.

#### 6.2.4 The Pipeline view

`/workshop/workflows` lists workflow runs (a `CaseTable` with the stage statuses as a strip); `/workshop/workflows/<runId>` is the **Pipeline**: a horizontal rail of stage cards on the Control Room system, each card showing executor (a `Roundel`), status (a `Lamp`), duration, the guard tally, and beneath it two panes — *In* and *Out* — rendering the stage's input and output records on `CaseFile`. Clicking an agent stage opens the Run Lab at the stage's first tick with the stage boundary marked on the timeline. A **What if** drawer lets the reader change one stage's executor, one knob or the context and re-run from that stage (`fromStage`), opening the result beside the original in Compare with the stage rail synchronised — the fork pattern (`54-…`), lifted to stages.

#### 6.2.5 The Boundary map's workflow layer

The Boundary rewrite (G54) gives the map a second ring: the workflow's stages in order around the outside, lit as the run passes through them, with the stage's executor drawn as the actor (the bot at the centre, a person at the ring, a line outside it, a rule as a cog on the ring). The label engine becomes a force-free radial layout with collision resolution (labels leader-lined outward when they would overlap), which is the fix UX-7 asked for and the reason the rewrite waited for a reason to happen.

**Tests.** A workflow over the golden lending trace reproduces the desk run's events byte-for-byte when every executor is `agent` with one goal card (the workflow adds only `stage.*` events); `rules-only` over the whole loan book agrees with the rule on every row (it *is* the rule — the identity test); a `human` stage in a campaign resolves by the scripted resolver and records `by`; a stage whose bot ends without the output is `error` with a finding; `fromStage` at stage *n* reproduces stages 1…*n*−1 byte-identically; the schema validates a fixture; the Pipeline's e2e opens a run, changes an executor, re-runs, and shows two rails.

### 6.3 Context: the ladder and the ontology (retires G46)

**Extends** `DeskCase.revealed`, `configure`, `campaignSchema`. **Packages** `desk`, `fs-bank`, `evals`.

#### 6.3.1 The ladder

```ts
export type ContextLevel = 'minimal' | 'case-file' | 'relational' | 'ontology';
export interface ContextSpec {
  id: string; level: ContextLevel;
  include?: string[];                 // record kinds added at this level beyond the level's default
  exclude?: string[];
  ontology?: { scope: 'customer' | 'bank'; depth: number; relations?: string[] };   // ontology level only
  delivery: Array<'brief' | 'sense' | 'line'>;   // where the context reaches the bot: in the desk brief, as a sense channel, as a queryable line
  budgetTokens?: number;              // the brief is truncated to this with a note, so a level is comparable across cases
}
```

| Level | What the bot has at tick 0 | What it can reach |
|---|---|---|
| `minimal` | The work item alone — the application, the alert, the message | Only what its actions reveal |
| `case-file` | Today's `revealed` set — the desk brief, the record the journey reveals | As today |
| `relational` | The case file plus the customer's related records rendered flat: accounts, recent transactions, complaints, the bureau summary, the products held | As today |
| `ontology` | The case file plus a **knowledge card**: the customer's neighbourhood in the bank's ontology to `depth`, typed | A `graph` line: `neighbours(entityId, relation?)`, `path(a, b)`, `describe(class)` |

Purpose-gating is unchanged and enforced at every level: a `special-category` record never enters a brief, a sense or a graph answer for a purpose that does not allow it (`45-…`'s tenet-13 property, re-run over the ontology). The `data-minimised` evaluator already scores what a build read; under `relational` and `ontology` it is the evaluator that says what the extra context cost.

The desk runtime reads `extra.config.context` (fact 9) at `create` and composes `revealed` and the brief accordingly; `checkDesk` gains a property that every level's snapshot is a superset of the level below (a bot never loses a record by being given more).

#### 6.3.2 The ontology

`fs-bank/src/ontology.ts` — the bank's entities and relationships as a typed property graph, generated from a population (or a case) and never stored:

```ts
export interface Ontology {
  classes: Record<string, { description: string; attributes: string[]; specialCategory?: boolean }>;   // Customer, Account, Transaction, Product, Application, Decision, Complaint, Alert, Obligation, Control, ServiceLine, Desk
  relations: Record<string, { from: string; to: string; description: string; purposes?: string[] }>;  // holds, transacted, appliedFor, decided, complainedAbout, eligibleFor, governedBy, evidencedBy, reaches
  instances: (scope) => Iterable<{ id; class; attributes }>; edges: (scope) => Iterable<{ from; relation; to }>;
}
export function knowledgeCard(ont: Ontology, root: string, depth: number, purpose: string): string;   // the deterministic rendering a brief embeds
```

Two things make this an ontology rather than a JSON dump: the classes include the *governance* entities (an `Obligation` such as `fca:conc:affordability` is related to the `Control` rows that evidence it and to the `Desk` actions it governs), so a bot at the `ontology` level can be asked to *cite the obligation its action serves* and an evaluator can check it; and relations carry `purposes`, so the graph line refuses a traversal a purpose does not allow with the same finding the service lines raise. The `graph` line is a service line like the other nine (`47-…`), tier `observe`, recorded on the trace as any tool is.

#### 6.3.3 The campaign axis

`campaignSchema.contexts?: ContextSpec[]` (default: one `case-file` entry, so every existing campaign is unchanged). A cell gains `context: string`; slices, the case table, the cohort table and the drift series gain the axis; `gateWhereSchema.context?`. A `parity` gate across `context` is legal and is how "does the ontology help the bot decide alike?" is asked.

**Tests.** The superset property per level; the tenet-13 sweep over `knowledgeCard` and the `graph` line at every purpose; a knowledge card is byte-stable per seed and depth; the token budget truncates deterministically with a note; the Advice Desk's `data-minimised` fails a `relational` build on a plain savings case and passes a `minimal` one (the level is measurable); a campaign with two contexts produces slices per context and the report's summary carries them; a campaign with no `contexts` is byte-identical to today's report but for `schemaVersion`.

> **Amended 2026-09-11 (WP81 built, `70-CONTEXT-AND-ONTOLOGY.md`).** Built as written but for `70-…` §8: the `sense` delivery is a line the observation carries whatever senses are on (a desk whose senses each read one record would otherwise never see the rung), `brief` appends to the desk brief where one exists, `line` is the graph line; a special-category record never enters by context for any purpose (the desk reveals it by handler, as today); the report's `schemaVersion` does not move — a cell carries `context` only when the campaign named contexts. The desks' hook is `DeskWorldSpec.context(level, generated, spec)`; the bank's is `bankContextRecords`. `Application` and `Decision` instances come from a lending case's state.

### 6.4 The metrics: fairness, drift, intervals, validation (retires G47, G48; tenet 20)

**Extends** `parity`, `campaign-summary.ts`, `drift.ts`. **Package** `@craftabot/metrics` (new; depends on nothing but `core` types). Every function here is pure, takes plain arrays, returns a value *and* its provenance (`n`, interval, method), and has three tests: a hand-computed case, a planted effect, a null.

#### 6.4.1 Fairness

Over a set of decided cases each with `{ group, decision: 'approve' | 'decline' | 'refer', truth: { verdict, performance? } }`:

| Metric | Definition | Needs |
|---|---|---|
| **Demographic parity difference** | max − min over groups of P(approve \| group) | decisions |
| **Disparate impact ratio** | min / max over groups of P(approve \| group); the four-fifths rule is ≥ 0.8 | decisions |
| **Equal opportunity difference** | max − min of P(approve \| positive, group), positive = `performance.defaultedWithin12m === false` (the customer would have repaid) | performance (D6) |
| **Equalised odds** | the larger of the equal-opportunity difference and the false-positive-rate difference, FPR = P(approve \| defaulted, group) | performance |
| **Predictive parity** | max − min of P(repaid \| approved, group) | performance |
| **Conditional demographic parity** | demographic parity difference computed within strata of a legitimate factor (score band, income band) and pooled by stratum weight — the Equality Act's "objective justification" question, asked numerically | decisions, a stratifier |
| **Rule agreement by group** | max − min of P(decision = verdict \| group) — the fairness of the *bot* as distinct from the *policy* (tenet 23) | verdict |
| **Matched-pair discordance** | share of matched pairs decided differently; with the exact binomial interval; the two-sided sign test on the direction | pairs |
| **Counterfactual flip rate** | share of cases whose decision changed when the cohort was flipped and everything else held — obtained by fork (`54-…`) with a cohort override in truth; the strongest single number and the most expensive | forks |

Each returns `{ value, n: Record<group, number>, interval: [lo, hi], confidence, method, underpowered: boolean, groups }`. Rates carry Wilson intervals; differences carry Newcombe's hybrid-score interval; ratios carry the log-ratio interval; discordance carries Clopper–Pearson. `underpowered` is true when any group's *n* is below a stated floor (default 30) or the interval spans the gate's bound. A **statistical test** is reported (two-proportion z, Fisher's exact below the floor, the sign test on pairs) as `p`, but **a gate never passes or fails on p** — it fails on the bound, as today, and it is *inconclusive with the reason "underpowered"* when the interval spans the bound and the campaign asked for `power: 'required'` (§6.4.4). The four-fifths rule is a convention, stated as one.

#### 6.4.1a Human load and decision rights (retires G58; tenet 26)

Over a set of workflow runs, each with its stage records and its configuration:

| Metric | Definition | Needs |
|---|---|---|
| **Touches per case** | Mean count of occasions a person acted: `approval.requested` resolved by a person, `human` stages, escalations to a person, returned decisions — by touch kind | stage records |
| **Unattended rate** | Share of cases with zero touches | stage records |
| **Minutes per touch** | A stated assumption per touch kind (a four-eyes approval, a returned decision, a vulnerability pathway, a SAR consent) — a calibration-style row with its source or its stated basis, never measured by the simulator | the table |
| **Human load at volume** | touches per case × minutes per touch × arrivals per day (the clock's calibrated rate) ÷ productive minutes per FTE-day (a stated assumption) = FTE-days per day, with the interval carried from the touch rate | the clock |
| **Ceiling breach rate** | Share of decisions taken at an autonomy level above the decision kind's ceiling — a decline decided by a bot with no person after it, a SAR filed at Level 3 or above | `autonomy.ceilings` |
| **Oversight cost of a control** | The change in touches per case a control introduces, beside the change in outcomes it buys — the two columns the register shows together | effects (§6.8) |

Every value carries *n* and an interval as §6.4.1's do. These are the numbers the thought experiment's scenario model assumes; the simulator produces them and shows the two side by side (§6.9.3).

#### 6.4.2 Drift

Over a reference set and a current set of cases (or of a series' buckets):

| Metric | Definition | Over |
|---|---|---|
| **Population stability index** (PSI) per feature | Σ (cᵢ − rᵢ) ln(cᵢ / rᵢ) over bins fixed from the reference (deciles for continuous, categories for categorical), with the usual reading — < 0.10 stable, 0.10–0.25 watch, > 0.25 act — stated as a convention | application amount, term, declared income, ratio, score band, age band, income band, channel, alert amount, … |
| **Kolmogorov–Smirnov statistic** per continuous feature | with its asymptotic p | the same |
| **Outcome-mix distance** | total-variation distance over the decision (or label) mix — the existing trip-mix comparison, generalised | decisions, evaluator labels, guard trips |
| **Agreement drift** | P(decision = verdict) in the current window minus in the reference, with the difference's interval | verdict |
| **Fairness drift** | any §6.4.1 metric in the current window minus in the reference | as the metric |
| **Slow drift** | a Page–Hinkley detector over a series with stated δ and λ, for the ramp a window comparison misses | any series |

`driftIn` (`governance/reports/drift.ts`) keeps its signature and calls these; its `series` gains `psi:<feature>` and `agreement` and its flags gain `kind: 'psi' | 'agreement' | 'slow'`. **Reference windows** become explicit: `{ kind: 'fixed', reportId }` (the baseline campaign), `{ kind: 'rolling', days }`, `{ kind: 'population', digest }` (the book the bank was generated from — what the bank *should* look like); the default remains today's pooled-before.

#### 6.4.3 The validation suite

`packages/metrics/validation/` — fixtures and tests, one triple per metric:

- **Hand case.** Twenty rows, the value computed in the test by arithmetic a reviewer can follow, asserted equal.
- **Planted effect.** A generator with a known effect size (a 6-point approval gap; a PSI of 0.18 by shifting one decile; a 0.5-point-per-day ramp) — the metric recovers it within a stated tolerance, and the detector flags it within a stated delay.
- **Null.** A stationary, balanced generator at *n* = 5,000 over 200 seeds — the metric's false-alarm rate at the default thresholds is at most its stated bound (5% at 95%), recorded in the suite's README with the seeds.

The suite is a package test and a documented artefact (`docs/metrics.md`: every metric, its definition, its interval method, its planted-effect result and its null rate), because the audience for this phase will ask "how do you know your fairness number is right?" and the answer must be a page, not a person.

#### 6.4.4 The gates and the report

- `parity` gains `metric?: 'demographic-parity' | 'disparate-impact' | 'equal-opportunity' | 'equalised-odds' | 'predictive-parity' | 'conditional-parity' | 'rule-agreement' | 'discordance' | 'counterfactual-flip'` (default: today's behaviour), `stratify?: string`, `confidence?: number` (default 0.95), `power?: 'required' | 'reported'` (default `reported`). The verdict carries `interval`, `n`, `p`, `method`, `underpowered`.
- A `drift` gate kind: `{ kind: 'drift'; feature?: string; metric: 'psi' | 'ks' | 'outcome-mix' | 'agreement' | 'fairness'; reference: ReferenceWindow; atMost: number }`.
- The report's summary (`50-…` §4.5) gains `fairness: Array<{ metric; across; stratify?; value; interval; n; underpowered; slice }>` and `drift: Array<{ feature?; metric; reference; value; flagged }>`; the browser renders both on `Matrix`/`Meter` with the interval drawn (a `Meter` gains a range band) and *underpowered* as a `Lamp`. `CAMPAIGN_REPORT_SCHEMA_VERSION = 3`; the v2 reader stays; a v2 report renders with empty fairness and drift panes and says why.

**Tests.** The validation suite; `driftIn`'s existing snapshot unchanged when no new option is given; a `parity` gate with `power: 'required'` over twelve cells is inconclusive and over twelve hundred is not; the Fraud Desk's precision/recall (`51-…`) equal the metrics package's computation; a v2 report loads as v3 with the panes empty.

### 6.5 The bank in motion: the clock, the queues and the Monitor (retires G51; tenet 24)

**Extends** the population (§6.1), the workflows (§6.2), the Worker host (§6.6). **Packages** `fs-bank` (the clock), `workflow` (the scheduler), `workbench` (the Monitor).

#### 6.5.1 The clock

```ts
export interface ClockOptions {
  population: Population; from: string; to: string;          // calendar bounds inside the population's period
  rates?: Partial<ArrivalRates>;                              // per simulated hour, by kind and hour-of-day profile — default from the calibration table
  acceleration: number;                                       // simulated seconds per wall second; Infinity = as fast as possible
  seed: number;
}
export interface ArrivalRates { application: HourProfile; alert: HourProfile; complaint: HourProfile; adviceRequest: HourProfile }
export function bankClock(options): AsyncIterable<{ at: string; item: WorkItem }>;
```

Arrivals are a thinned Poisson process per kind with an hour-of-day profile, drawn from the seed, so a day's arrivals are the same list whatever the acceleration; the *transactions* do not arrive through the clock (they are the stream, §6.1.1) — what arrives is the *alert* the alert rule (§6.1.3) raised over them, so the alert stream is a fold over the transaction stream. An application arrives from the loan book at its `date`; a complaint from the register; an advice request from a calibrated share of customers who hold savings above a threshold.

#### 6.5.2 The scheduler and the desks

```ts
export interface DeskAssignment { workflowId: string; config: WorkflowConfig; brain: BrainSpec; concurrency: number; build: string }
export function runBank(clock, desks: DeskAssignment[], sink: MonitorSink, options: { stopAt?; onIncident? }): Promise<BankRun>;
```

Each work item is routed by kind to its desk's queue; each desk works items through `runWorkflow` with its configuration, up to `concurrency` at once; every `WorkflowRun` and every agent trace goes to the sink (IndexedDB in the browser through the Worker; the file store in the harness) and to the **monitor store**, a rolling set of folds the Monitor reads. A `BankRun` is an artefact: the clock's options, the desks' assignments, the population digest, the counts, the incidents, and the digest of every workflow run, so a day at the bank is reproducible from its `BankRun` alone (tenet 24).

#### 6.5.3 The Monitor

`/workshop/monitor` — the bank's day, live. On the Control Room system:

- **Strip:** the clock (simulated time, acceleration, a Play/Pause/Step), the population digest, the desks and their concurrency, *for simulation only*.
- **Readouts:** arrivals per hour by kind; decisions per hour by outcome; approval rate (Wilson band); referral rate; escalations; guardrail trips per decision; approvals per decision; mean stage durations; tokens per decision; incidents open.
- **Tapes:** each of the above over the day, with the reference window's value drawn as a hairline (the baseline's approval rate; the population's expected outcome mix).
- **Fairness now:** the §6.4.1 metrics over the rolling window, with intervals, greyed *underpowered* until the window fills.
- **Drift now:** PSI per feature against the reference, the flags as they raise.
- **Incidents:** the existing fold (`incidents.ts`) over the day's runs, with the workflow run beside each.
- **A queue view** per desk: waiting, in progress, done, with the oldest item's age.

Every number is the same fold the campaign report uses (tenet 20, tenet 25); the Monitor adds only a window and a clock. Pausing the clock freezes the numbers; **Replay** re-runs the same `BankRun` from its seed and draws the same picture. An **ingest seam** is designed and stubbed: `MonitorSink` has a second implementation reading `WorkflowRun`s and traces from the evidence store (`58-…`) by workspace and date, so a real feed of the same artefacts from bots running elsewhere would draw on the same screen — designed now, not connected (the brief's answer: a simulated bank with a seam).

**Tests.** Two clocks from one seed emit the same arrivals whatever the acceleration; `runBank` over one simulated day with `rules-only` desks and scripted brains is byte-stable (the `BankRun` digest); the monitor folds over a day equal the campaign-summary folds over the same runs; the Monitor's e2e runs a ten-minute simulated hour at `Infinity`, pauses, and reads a Readout that matches the fold; the tab answers a click during the run (the Worker test, §6.6).

### 6.6 The Worker host, books and batch runs (retires G50, G52; decision D7)

**Extends** the Campaigns screen, the harness, the lending pack. **Packages** `workbench`, `harness`, `evals`, `fs-lending`.

#### 6.6.1 The Worker

`apps/workbench/src/lib/worker/` — one module Worker hosting `runCampaign`, `runBook`, `runBank` behind a message protocol (`start`, `progress`, `cell`, `stage`, `trace`, `cancel`, `done`), with the packs registered inside the Worker from the same `packs.ts` the main thread uses (the edition's list). Storage writes happen on the main thread from the Worker's messages (IndexedDB is available in Workers, but one writer keeps the existing persistence code untouched). The Campaigns screen's runner moves to it and gains a **queue**: several campaigns or books queued, one running, the tab live throughout. `Cancel` and the estimate are unchanged.

#### 6.6.2 The lending knobs

`fs-lending/src/world/rules.ts` keeps `affordabilityVerdict(application, bureau)` and gains `affordabilityVerdictWith(policy: LendingPolicy)`, where

```ts
export interface LendingPolicy {
  rateBps: number;                       // default 790
  referRatioPercent: number;             // default 60
  declineRatioPercent: number;           // default 100
  declineOnDefaults: number;             // default 2
  referOnSearches: number;               // default 3
  referOnFair: boolean;                  // default true
  fourEyes: 'approve' | 'all' | 'none';  // default 'approve'
  documentBefore: 'never' | 'refer' | 'always';   // when the payslip is requested
}
export const DEFAULT_LENDING_POLICY: LendingPolicy;   // today's constants, so the default is byte-identical
```

read from `extra.config.knobs` (fact 9) at `create`, so the desk, the rule stage, the truth and the book's verdicts all use one policy. The five policy cards are parameterised the same way (a card's threshold from the knob, its default the card as shipped). A campaign's `builds[].overrides` or a `WorkflowConfig.knobs` sets them, and the report's slices carry `knobs` so a sweep — *approval rate and over-decline across `referRatioPercent` ∈ {50, 60, 70}* — is one campaign and one chart.

#### 6.6.3 Books and batch runs

`campaignSchema.source?: { kind: 'book'; book: Book | { population: { seed; size; period }; filter } }` — a campaign whose cells come from a book rather than from scenarios × seeds: one cell per work item per guard per brain per context, the item's truth as the cell's. The report is the same report; the cohort table is now over thousands of ordinary rows rather than designed ones, which is where the intervals stop being decoration. `craftabot book run --population <seed> --size <n> --workflow fs-lending --config <file> --jobs 8` runs a book through a workflow configuration in the harness and writes `WorkflowRun`s and a report; the browser's Books tab does the same in the Worker at a smaller default size. A **sweep** (`craftabot sweep --knob referRatioPercent=50,60,70 …`) is sugar over builds.

**Tests.** The Worker runs the injection baseline and produces a report byte-identical to the main-thread run of today; the tab answers during it (e2e clicks the rail mid-run); `DEFAULT_LENDING_POLICY` reproduces every existing lending test and the golden trace; a knob sweep over the loan book moves the approval rate monotonically in the expected direction; a book campaign of 2,000 items under `rules-only` agrees with the rule on every row; `--jobs 8` byte-identical to `--jobs 1` over a book (WP68's property, over the new source).

### 6.7 The three lenses (retires G53, G55-part; decision D9; tenet 25)

**Extends** `WorkshopRail.svelte`, the Workshop's routes, `docs/manual/`. **Package** `workbench`.

```ts
export type LensId = 'assurance' | 'conduct' | 'model-risk' | 'engineer';
export interface Lens {
  id: LensId; name: string; question: string;               // "Is it under control?" · "Were customers treated as the rules require?" · "Is it fair, and is it moving?" · "What did it do?"
  entry: string;                                            // the landing route
  rail: Array<{ group: string; routes: string[] }>;         // the routes this reader sees, in order
  vocabulary: Record<string, string>;                       // label overrides: 'trip' → 'control intervention', 'cell' → 'case', …
  firstRun: string[];                                       // the guided path (GAP-2): three steps to a first reading
}
```

`lens.ts` ships four; the rail shows the current lens's groups and a switcher; the Settings remember it; every route stays reachable by URL under every lens (a lens hides nothing, it orders). The `engineer` lens is today's Workshop unchanged.

| Lens | Entry page — composed from existing folds and instruments | Vocabulary |
|---|---|---|
| **Assurance** (board, CRO) | `/workshop/assurance` re-cut as the landing: the **Control Effectiveness Register** (§6.8) at the top as a `CaseTable` — control, what it changed, by how much, how sure; the safety case's four claims as Lamps; incidents this period; drift flags; the assurance pack's download; the inventory entry. Nothing on the page needs a run id to read; every number opens to one. | *control intervention*, *case*, *effect*, *confidence*, *evidence* |
| **Conduct** (compliance, MLRO) | `/workshop/conduct` (new route over existing folds): the Consumer Duty's four outcomes with the obligation table beneath each (pass rate, cases, the failing cases); vulnerability handled (the FG21/1 drivers × recognised × acted on); complaints within DISP timescales; tipping-off and KYC-before-money as Lamps; a case list per obligation opening the Pipeline at the stage the obligation governs. | *obligation*, *outcome*, *customer*, *treatment* |
| **Model-risk** (data science) | `/workshop/model-risk` (new): the **fairness workbench** — every §6.4.1 metric over the chosen population, window and stratifier, with intervals and *n*; matched pairs and the counterfactual flip rate; the **drift workbench** — PSI per feature against a chosen reference, the series, the detectors; rule agreement over time; the performance label's base rate labelled *synthetic hazard*; the inventory entry and the validation suite's page. GAP-3's cohort axis lives here. | *metric*, *interval*, *reference*, *feature* |

Each lens's `firstRun` is a three-step guided path rendered as a Strip on the entry page until dismissed — the answer to GAP-2, once per reader. Two campaign reports open side by side in Compare (GAP-6) from the Assurance and Model-risk lenses' report lists; it is the existing Compare route given a second artefact kind.

**Tests.** Every route renders under every lens (a matrix e2e); the vocabulary map is applied by one component and a test greps the rail and the entry pages for un-mapped terms; the Assurance entry renders for a bot with no experiment and says so; axe green on the three new entries; the visual baselines gain the three pages.

### 6.8 Experiments, effects and the Control Effectiveness Register (retires G49; decision D8; tenet 19)

**Extends** `evals` (the campaign), `governance/reports` (the pack), `evidence`. **Packages** `evals`, `governance`, `harness`, `workbench`.

#### 6.8.1 The experiment

```ts
export interface Experiment {                                   // docs/schemas/experiment.schema.json
  schemaVersion: 1; id: string; title: string;
  hypothesis: string;                                            // one sentence, pre-registered
  controls: string[];                                            // the control-map row ids (or policy-card / guard / evaluator ids) under test
  obligations: string[];
  design: {
    source: Campaign['source'] | { scenarios: … };                // the work: a book or designed scenarios
    factors: Array<{ axis: 'guard' | 'context' | 'executors' | 'knob' | 'brain'; levels: string[] }>;   // the factorial
    baseline: Record<axis, string>;                              // which level is the baseline
    metrics: Array<{ id: string; kind: 'outcome-rate' | 'label-rate' | 'evaluator-pass-rate' | 'fairness' | 'case-metric' | 'cost'; spec: … ; direction: 'lower-is-better' | 'higher-is-better' }>;
    seeds: number[]; replicates: number;
    confidence: number; minimumDetectableEffect?: number;        // for the power note
  };
  campaigns: string[];                                           // the campaign files the design expands to (generated, committed)
}

export interface EffectRecord {
  experimentId: string; metricId: string; controlIds: string[];
  factor: { axis; baseline; treatment };
  baseline: { value; n; interval }; treatment: { value; n; interval };
  delta: number; interval: [number, number]; p?: number; method: string; underpowered: boolean;
  slices?: Array<{ where: Record<string, string>; delta; interval; n }>;   // by cohort, by context, by stage
  cost: { tokensPerCase: { baseline; treatment }; approvalsPerCase; escalationRate; wallMsPerCase? };
  runIds: string[]; reportIds: string[];
}
export interface ExperimentResult { experimentId; ranAt; populationDigest?; effects: EffectRecord[]; verdict: 'supported' | 'not-supported' | 'inconclusive'; note: string; digest }
```

`craftabot experiment run <file>` expands the design to campaigns (one per level combination, sharing seeds), runs them (`--jobs`, `--resume` as any campaign), and `craftabot experiment analyse` folds the reports into effects with the intervals from `metrics` — differences of rates by Newcombe, of means by Welch, of matched pairs by the sign test — and a verdict: *supported* when every pre-registered metric's interval excludes zero in the stated direction, *not-supported* when one excludes it the other way, *inconclusive* otherwise, with the power note (the minimum detectable effect at the achieved *n*). Never a p-value threshold as the verdict (§6.4.1's rule holds). The browser's `/workshop/experiments` authors a design over a book, queues it on the Worker, and renders the result: one `Matrix` per metric (levels × slices, the delta with its band), the verdict as a Lamp, every effect opening its runs.

#### 6.8.2 The Control Effectiveness Register

`governance/reports/control-effectiveness.ts` — a pure fold over `ExperimentResult[]` and the control map:

```ts
export interface ControlEffectivenessRow {
  controlId: string; controlMapRow?: ControlMapRow; obligations: string[];
  effects: EffectRecord[];                                        // every effect that named this control
  headline: { metricId; delta; interval; n; experimentId } | undefined;   // the largest-n effect on the control's primary metric
  cost: { tokensPerCase?: number; approvalsPerCase?: number };
  coverage: { experiments: number; populations: string[]; contexts: string[]; workflows: string[] };
  status: 'evidenced' | 'inconclusive' | 'untested';
}
export function controlEffectiveness(results, controlMap): ControlEffectivenessRow[];
```

The register is what the Assurance lens opens on, what the assurance pack's §5 (*mitigants*, SS1/23 principle 5) renders — each mitigant now carrying its measured effect and the experiment that measured it — and what the design's end purpose names: *for every control a full-scale bank might implement, what it did, at what cost, how sure, over which populations and workflows.* A control the map lists that no experiment has tested is `untested` on the register, in the open (tenet 19); the register is a to-do list as much as a result.

#### 6.8.3 The reference experiments (content)

Shipped in `experiments/`, each a file, each run on demand and its result committed with its digest under `docs/evidence/<experiment>/`:

| Experiment | Hypothesis | Factors |
|---|---|---|
| `lending-stack` | The policy-card stack reduces over-approval and missed referral on the loan book, at a stated approval-load cost | guard × (rules-only, bot-everywhere, bot-with-a-person) |
| `lending-context` | Giving the bot the ontology raises rule agreement and explanation faithfulness without raising data-minimisation findings | context × guard |
| `lending-fairness` | No stack produces a demographic-parity gap above 0.05 or a discordance above 0.02 on matched pairs; and the *policy itself* has an equal-opportunity gap the register reports | guard, with the fairness metrics and the performance label |
| `lending-knobs` | Loosening `referRatioPercent` raises approvals and over-approval together; the four-eyes stage at `all` removes the latter at a stated escalation cost | knob × executors |
| `fraud-stack` | The tipping-off card and the four-eyes freeze remove tip-offs and lifted freezes at a stated precision cost | guard × executors |
| `advice-context` | The relational context lowers unsuitable recommendations on the vulnerable-customer deck and raises `data-minimised` findings on the plain deck | context × deck |
| `drift-day` | A bank day with a planted mid-day shift in application amounts is flagged by PSI within two hours of simulated time, and the agreement series does not move | the clock, one planted shift |
| `human-oversight` | Moving the lending journey from Level 3 to Level 5 cuts touches per case by a stated factor and raises the ceiling-breach rate on declines from zero; the policy-card stack at Level 4 recovers most of the outcome loss at a stated fraction of Level 3's touches — the bottom-up figures the thought experiment's scenario model assumes | autonomy level × guard, with the human-load metrics, over the loan book at the clock's calibrated volume |

These eight are the first pages of the register and the worked examples the manual will carry. Their results are evidence about *this* synthetic bank under *these* configurations, and the pack says so on every page.

**Tests.** The schemas validate fixtures; `experiment run` over a two-level design produces two campaigns sharing seeds; `analyse` recovers a planted 6-point effect with the right sign and an interval that contains it; a null design over 200 seeds gives *inconclusive* at least 95% of the time; the register marks an untested control `untested`; the assurance pack's §5 cites an effect's experiment and run ids; the eight reference experiments run in CI on a reduced size (`--size 500`) within a stated time and their reduced results are compared for shape, not value.

### 6.9 Publishing: the simulator on axiom-verity.com, beside the thought experiment (retires G57; tenet 26)

**Extends** `59-EDITIONS.md` and `docs/publishing.md`; touches the `axiomverity` repository. **Packages** `workbench`, `evidence`; the site.

#### 6.9.1 What "online" means here, and what it deliberately does not

The simulator is **client-only** in the site's own classification (§2 fact 17): the engine, the packs, the bank and every run execute in the visitor's browser against the visitor's key; no request reaches a server the site pays for. That is what makes it publishable now, and it is the posture to keep and to say out loud on the page — *your keys never leave your browser; nothing you run is seen by anyone* — because the audience is people whose job is to worry about exactly that. Three tiers of "online", of which this design commits to the first two:

| Tier | What it adds | Status |
|---|---|---|
| **0 — served and gated** | The three editions served as static sections of the site at `/simulator`, `/workshop` and `/playground`, gated at the `member` tier by the site's existing auth, each with its own service-worker cache (G56 first) | **In scope** |
| **1 — an account that remembers** | The site account *is* the evidence-store workspace: a member's runs, reports, bank days and experiments push to and pull from the store (`58-…`) under their own workspace, so work follows them across devices and can be shown to someone else | **In scope**, opt-in per §6.11's rule that nothing requires the store |
| **2 — hosted compute** | Campaigns run server-side; metered keys for members without their own; classrooms, shared cohorts, billing | **Out of scope** (§11): it would make the demo server-proxied under the Labs policy and put the site in the business of holding keys and traces on members' behalf |

#### 6.9.2 The mechanics

- **The build.** `npm run build:editions` already writes `apps/workbench/build/<edition>/` against a per-edition base and budget (WP69). The site's Node service (`adapter-node`) serves the three folders as static assets under their bases; a `hooks.server.ts` rule redirects an unauthenticated request for any of the three to `/login` with the return path — the pattern `/account` already uses. No route of the simulator is server-rendered; the gate is in front of the folder, exactly as D3 said.
- **The cache.** The service worker's cache is named `craftabot-shell-<editionId>-<version>` and its scope is the edition's base, so three sections on one origin never serve each other's shell (G56, CLOSE-2). An e2e serves two editions from one origin and switches between them.
- **The workspace.** On the site, a signed-in member's `profiles.id` maps to an evidence-store workspace and a token minted for it (a `SECURITY DEFINER` function in the site's project, the third after the two that exist, read-only in effect: it returns a scoped token, never data). The simulator's Evidence screen offers *Use my Axiom Verity workspace* when it is served from the site (`kit.paths.base` says so) and keeps the manual URL/token fields for everyone else. The store's RLS is unchanged; the site's anon key is unchanged; the standing rule — never a `service_role` key in the app — holds on both sides.
- **The keys.** Unchanged: the visitor's, in their browser's `localStorage`, read at the moment of a call, swept by the key-leak test over all three folders. The page says so.
- **The content site's posture** is unchanged by any of this: the simulator reads nothing from `risks`, `controls` or `profiles`, and writes nothing anywhere but its own workspace in the evidence store.

#### 6.9.3 The framing page: one question, two directions

A page under `/thought-experiment/simulator` (a fifth sub-page beside the assumptions register, the regulatory floor, the org structure and the scenario model) presents the two projects as one investigation:

- **Top-down** — the thought experiment's claims, as they stand: the autonomy spectrum, the decision-rights ceilings, the nine roles, the scenario model's FTEs and its own statement that it is unchallenged.
- **Bottom-up** — the simulator's measured figures for the same things, from the committed `docs/evidence/` results (§6.8.3): touches per thousand cases by autonomy level and stack, ceiling-breach rates, the outcome cost of each level, human load at the calibrated volume — each with its interval and *n*, each opening the experiment that produced it in the Workshop.
- **Side by side.** A table with the thought experiment's assumption in one column and the simulator's measurement in the next, and a third column that says *agree*, *disagree* or *not yet measured* — tenet 26. Where they disagree the page says which one the author now believes and why, in the thought experiment's own register ("solved in plain view, one beat at a time").
- **Try it** — the three sections, with the Conduct or Assurance lens's guided path as the first click for a visitor who is not an engineer.

`labs.ts`'s `craft-a-bot` entry links to the framing page and the sections; the simulator's *About* strip links back. The vocabulary is shared by construction: the configurations carry the autonomy levels (§6.2.3), the ceilings come from the site's decision-rights table (rendered into the pack as content with the page cited as its source), and the calibration table (§6.1.2) and the site's assumptions register cite the same publications where they overlap.

**Tests.** The three sections build, deploy to a preview and open under the gate; an unauthenticated request redirects and returns; the two-section service-worker e2e; the workspace token minted for a test profile lets the simulator push and pull one bundle and nothing else (the store's contract suite run against it); the key-leak sweep over the served folders; the framing page's side-by-side table is generated from `docs/evidence/` and fails the site build when an assumption cites a metric the evidence does not carry; axe green on the framing page.

---

## 7. Data model v5 (summary of record; `07-…` §5 gains)

| Artefact | Schema | Store | New |
|---|---|---|---|
| Population | — (regenerated; only `digest` + options stored) | — | ✓ |
| Calibration table | `calibration.schema.json` | pack content | ✓ |
| Book | `book.schema.json` | file / IndexedDB (browser keeps a sample) | ✓ |
| WorkflowRun | `workflow-run.schema.json` | file / IndexedDB / evidence store | ✓ |
| BankRun | `bank-run.schema.json` | file / IndexedDB / evidence store | ✓ |
| Campaign (v3) | `campaign.schema.json` | as today | `contexts`, `source`, gate kinds |
| Campaign report (v3) | `campaign-report.schema.json` | as today | `fairness`, `drift`, `context` slices |
| Experiment / ExperimentResult | `experiment.schema.json`, `experiment-result.schema.json` | file / evidence store | ✓ |
| Control Effectiveness Register | `control-effectiveness.schema.json` | folded; the pack embeds it | ✓ |
| Evidence item | `evidence-item.schema.json` | evidence store | `kind` gains `workflow-run`, `bank-run`, `experiment-result` |

Every new schema is generated by `scripts/json-schema.mjs` from Zod and checked in the build, as today.

## 8. Events catalogue changes (`02-…` §7, additive only)

| Event | Payload | Emitted by |
|---|---|---|
| `stage.started` | `{ workflowRunId, stageId, executor, input: { digest, value? } }` | `@craftabot/workflow`, on the agent run's trace when the executor is a bot |
| `stage.completed` | `{ workflowRunId, stageId, output: { digest, value? }, status, guards }` | the same |

Both are optional in every reader (a trace without them is a desk run, as today); the OTel mapping (`35-…`) gains two span kinds; the digest covers them.

## 9. Workshop surfaces (target IA, extending `41-…` §9)

New: `/workshop/workflows`, `/workshop/workflows/<runId>` (the Pipeline), `/workshop/monitor`, `/workshop/experiments`, `/workshop/experiments/<id>`, `/workshop/conduct`, `/workshop/model-risk`; the Campaigns screen gains **Books** and **Sweeps** tabs and a queue; the Playground's bank page gains *Where this bank's shape comes from* (the calibration table) and *The bank at scale* (a population's summary from a seed and a size). The rail is lens-ordered (§6.7). The Kit is untouched (`41-…` §11's "no Kit arc" holds). On the site: `/simulator`, `/workshop`, `/playground` behind the member gate, and `/thought-experiment/simulator` (§6.9.3).

## 10. Determinism and reproducibility (inherited, five additions)

- A population is a pure function of seed, size, period and calibration table; its digest is asserted.
- A book is a pure function of a population and a filter; a `BankRun` is a pure function of its seed, clock options and assignments under scripted brains and counterparts.
- Stage input and output digests are canonical-JSON SHA-256; a `WorkflowRun` digest covers them, so a re-run from stage *n* is checkable stage by stage.
- Every metric is deterministic over its input; the validation suite's null rates are recorded with their seeds.
- An experiment's campaigns are generated files, committed, so the runs an effect cites can be re-made.

## 11. Non-goals (recorded so they are decisions)

- Real data, anonymised data, or a dataset import seam. The population is synthetic and calibrated to *published aggregates*, never to records. (The import seam was offered and declined on 2026-09-09; tenet 15 stands unchanged.)
- A credit-scoring model, a fraud model, or any fitted model. The performance label is a stated hazard, not a fit (D6). A bank wanting to test *its* model tests it as a `rule` executor or a `line` — the seam exists; the model is theirs.
- A live feed into the Monitor. The ingest seam is designed and stubbed against the evidence store; connecting it is a hosting decision.
- Statistical significance as a pass/fail. Gates bound; intervals inform; p is reported.
- A fourth desk, a mortgage or a pensions workflow, or another jurisdiction. The three workflows exercise the contract; the pattern is the deliverable.
- A rules engine or BPMN. A workflow is a typed list with a `next`; anything more is a pack's business.
- RDF, OWL or a triple store. The ontology is a typed property graph as plain data; its value is in the classes and purposes, not the serialisation.
- A dashboard product. The Monitor is one screen on the existing system for one simulated bank.
- Multi-user, roles, or access control between lenses. A lens is a preference; a published section's gate is a hosting rule (D3).
- **Hosted compute** — running campaigns, books or bank days on a server the site pays for; metered or shared keys; classrooms; billing (the site's Stage 10 stays parked). Under the site's Labs security policy that would make the simulator *server-proxied* and put the site in the business of holding members' keys and traces. The simulator stays client-only; the workspace holds artefacts a member chose to push, and nothing else.

## 12. Divergences from earlier docs, with reasons

| Earlier | Now | Why |
|---|---|---|
| `50-…` §7: no statistical test on parity | Intervals and tests are computed and reported; the gate still bounds | The audience will ask how sure; the bound alone cannot say. The decision not to *gate* on p is kept. |
| `52-…` §7: one synthetic rate, one rule; no scorecard | One rule with knobs; still no scorecard | Comparing configurations needs the rule to vary; nothing fits. |
| `41-…` §6.5.4: the rule is the only judge | The rule judges decisions; a synthetic performance label judges the policy's outcomes (D6) | Equal opportunity and equalised odds are the fairness metrics a model-risk reader will ask for, and they need an outcome. Kept apart by tenet 23. |
| `43-…` §4.4: `configure` stored, unread | Read for context and knobs | The seam was left for exactly this. |
| `41-…` §6.15: one ring on the Boundary map | Two rings; a rewrite | UX-7 needed one; the workflow layer gives it a reason. |
| `docs/manual/UX-AND-GAPS.md` §4: the Worker as the first backlog item | The Worker is a Day 5 foundation (D7) | The bank in motion cannot exist without it. |
| `59-…`: service worker scoped to `base` | Cache name per edition (CLOSE-2) | Two sections on one origin. |
| `41-…` §11, D3: a gate is a hosting rule the app never knows | Still true; but the app may *notice* it is served from the site (`kit.paths.base`) and offer the member's workspace | An affordance, not a dependency: every screen works unchanged with the offer declined. |
| `52-…` §4.3: four reference configurations | Five, labelled with autonomy levels; `bot-recommends` added | Level 3 — the AI recommends, the human decides — is the thought experiment's most-cited ceiling and had no configuration. |

## 13. Risks

| Risk | Mitigation |
|---|---|
| The calibration table is built from memory rather than sources | The row schema requires a source with edition and retrieval date; `checkCalibration` refuses a row without one; the roadmap's first task is the sourcing note, before any generator changes. |
| The performance label is read as a credit model | Named `synthetic-hazard-v1` in the data, labelled on every screen, documented with its coefficients, and excluded from every bot's context by the tenet-13 sweep. |
| Fairness numbers are believed at small *n* | `underpowered` on every value; the four-fifths rule and the thresholds stated as conventions; the validation suite's null rates published. |
| The population's transaction volume swamps the browser | Lazy streams; the browser default size is small and the harness carries the large runs; the Monitor keeps a window. |
| A workflow's agent stage never reaches `until` | The stage's tick budget from the goal card; `error` with a finding; the Pipeline shows it. |
| The Worker forks the engine into two code paths | One runner module imported by both hosts; the byte-identity test between Worker and main thread stays in CI. |
| Lenses fragment the Workshop | A lens orders and renames only; the matrix e2e renders every route under every lens; one vocabulary component. |
| Seven reference experiments take too long in CI | Reduced-size runs in CI for shape; full runs on demand with results committed. |
| The register is read as a compliance verdict | Every row cites experiments, populations and workflows; `untested` shown; the pack's *not a claim of compliance* sentence on the register's page. |

## 14. Acceptance (the design as a whole)

1. `population(seed, { size: 20000 })` generates within the stated time, passes the calibration test row by row, and its digest is stable.
2. Every calibration row cites a publisher, title, edition and retrieval date, and the Playground's bank page renders the table.
3. The lending workflow runs `rules-only`, `bot-everywhere`, `bot-with-a-person-at-the-decision` and `bot-explains-only` over the same 2,000-item book, and the Pipeline shows every stage's input and output for any run.
4. A campaign with `contexts: [minimal, case-file, relational, ontology]` produces a report sliced by context, with `data-minimised` findings and token cost per level.
5. The ontology's knowledge card and `graph` line refuse a purpose-gated traversal, proven by the tenet-13 sweep.
6. Every §6.4.1 and §6.4.2 metric has a hand case, a planted effect recovered within tolerance, and a null rate at or under its bound, published in `docs/metrics.md`.
7. A `parity` gate reports an interval and *n*, and is inconclusive when underpowered and asked to be.
8. A bank day runs in the browser in the Worker with the tab responsive, is byte-stable from its seed, and the Monitor's numbers equal the campaign folds over the same runs.
9. The eight reference experiments run and their results and the register are committed under `docs/evidence/`, each effect citing its runs.
10. The Control Effectiveness Register renders on the Assurance lens, in the assurance pack's §5, and marks untested controls as such.
11. The three lenses render every route, pass axe, and open on their entry pages with a three-step guided path.
12. The Boundary map draws the workflow ring with no label collision on the bank's page.
13. The two-section service-worker collision does not reproduce.
14. A v2 campaign, a v2 report and every golden trace load unchanged.
15. `docs/manual/USER-MANUAL.md` carries a Part G (the bank in motion, the experiments, the lenses, the site) and a rebuilt PDF.
16. The human-load metrics and the ceiling-breach rate pass the validation suite, and the `human-oversight` experiment's result is committed with the other eight's.
17. The three sections are served from axiom-verity.com behind the member gate with per-edition caches, a member's workspace round-trips a bundle, and `/thought-experiment/simulator` shows the assumption-beside-measurement table generated from `docs/evidence/`.

---

*End of document.*
