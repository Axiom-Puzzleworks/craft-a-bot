# 73 — The lending workflow, the reference configurations, books and sweeps (WP80)

> **Status:** design of record for WP80 (`65-DAY5-ROADMAP.md` Phase S), opened and closed 2026-09-11 on the `day5` branch, after WP79. No stage A note was planned for WP80; this is the record written as the work was done, so the divergences are in place rather than reconstructed.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.2.3 (the lending workflow as content, the five reference configurations by autonomy level, the decision-rights ceilings carried as configuration), §6.6.3 (books and batch runs, `craftabot book run`, `craftabot sweep`, the Books and Sweeps tabs on the Worker) and §6.4.1a (the human-load rows a report carries). Retires G45 and G50 in part. The Pipeline view is WP86's; the report v3's fairness and drift panes are WP82's.

---

## 1. Where the code is

1. **The workflow runtime** is WP79's (`69-WORKFLOWS.md`): `runWorkflow(spec, item, options)` over one `WorldInstance`, four executors, `stage.*` events, a `WorkflowRun` with a digest. Three things joined the contract for this WP (§7): `StageSpec.suggest`, `WorkflowSpec.decisionKindOf`, `WorkflowSpec.book`.
2. **The Lending Desk** (`52-FS-LENDING.md`) has eight actions, nine predicates (`identity-verified`, `affordability-assessed`, `decided`, `explained`, `disbursed`, `appealed`, …), nine layouts built by `lendingCase(random, kind, policy)`, the rule as a policy with knobs (WP78), and the bank's own service lines (`fs-bank/credit-bureau` with `file` and `affordability`).
3. **The loan book** (`67-PERFORMANCE-AND-BOOKS.md`) is `lendingBook(pop, { policy, filter }).book` — a `Book` of `WorkItem`s whose `payload` was the application alone.
4. **A campaign's cells** are scenarios × builds × guards × brains × seeds (`28-CAMPAIGNS.md`); a build's `overrides.knobs` reach the world at `create` (WP78); the runner has an `execute` seam a worker pool uses (WP68); the Campaigns screen queues a campaign onto a Worker (WP77).
5. **The human-load metrics** (`68-METRICS.md` §2.3) take a structural `TouchedCase { id, touches: [{ kind }], decisions?: [{ kind, level }] }` and a ceilings table, and return a value with its interval and *n*.
6. **The decision-rights table** is the thought experiment's, in `axiomverity/src/lib/thought-experiment.ts` (`decisionRights[].autonomyCeiling`), read 2026-09-11 and never edited from here.

## 2. Principles

- **The workflow is a schedule over the desk** (`69-…` §2): no desk mechanism changed to be run as a journey; one layout joined (the work item's), one optional field on the desk's own state (`appealGrounds`).
- **A configuration is an autonomy level applied to the journey**, carried as data: which executor at which stage, which knobs, which level, which ceilings. The simulator and the thought experiment use one vocabulary (`64-…` §1.3).
- **Ceilings are measured, never enforced.** `bot-everywhere` runs a Level 5 decline so the breach rate can say what it costs.
- **A book run is a campaign.** One runner, one report, three hosts (`65-…` §5 item 3): a campaign whose `source` names a book and a workflow runs in the harness (`craftabot campaign`, the pool, shards, merge, resume — untouched), in the Worker (the same `runCampaign`) and, cell by cell, through the `execute` seam.
- **Determinism.** A book at a seed and size is the same bytes wherever it is drawn; a cell's ids depend only on its ordinal; `--jobs 8` is byte-identical to `--jobs 1` by construction (WP68's property over the new source, proved by the cells-one-at-a-time test).

## 3. The workflow (`fs-lending/src/workflow.ts`, `LENDING_WORKFLOW`)

Ten stages over the existing desk — the design's nine and `record` (§8 item 1):

| Stage | Default executor | Input → output | Notes |
|---|---|---|---|
| `intake` | `rule` `intake-v1` | the item's payload → `{ applicationId, amount, termMonths, purpose, applicant }` | the input schema refuses a malformed item with a finding; the layout put the case on the desk |
| `identity` | `agent` until `identity-verified` (`identity-v1` performs `verify-identity`) | → `{ verified: true }` | |
| `bureau` | `line` `fs-bank/credit-bureau` `file` | → the bureau file (`scoreBand`, `defaults`, `arrearsMonths`, `searchesLast12m`) | |
| `affordability` | `agent` until `affordability-assessed` (`affordability-v1`) | → the worksheet's five figures | |
| `decision` | `agent` until `decided` (`decision-v1` = the rule's verdict; or `human` choosing among approve / decline / refer) | → `{ outcome, reasons }`, or a person's `{ decision }` | `suggest` is the rule's verdict from the figures on the desk |
| `record` | `rule` `record-v1` | → `{ outcome, reasons }` | performs a person's decision on the desk; a no-op carrying a bot's or a rule's through — the one place the decision is counted for the ceilings |
| `explanation` | `agent` until `explained` (`explanation-v1`) | → `{ reasons, text }` | |
| `four-eyes` | `human` confirm / return / overturn | → `{ decision }` | entered when the outcome is `approve`, or the `fourEyes` knob is `all`; skipped under `none` |
| `disbursement` | `agent` until `disbursed` (`disburse-v1`) — irreversible | → `{ amount, accountId, monthlyRepayment }` | only after a confirmed approve |
| `appeal` | `agent` until `appealed` (`appeal-v1`) | → `{ grounds }` | only when the item arrived with an appeal |

The rules are pure functions over the desk's snapshot — `figuresOnTheDesk` reads the bureau record and the worksheet, `ruleVerdictOnTheDesk` applies the policy in force from `config.knobs` — and every rule performs the same action a bot would, so a `rules-only` run leaves the same `action.performed` events a bot's run leaves.

**The work-item layout** (`WORK_ITEM_LAYOUT = 'work-item'`): `intake` hands the item to `create` as `config.item`; `lendingCaseFromItem` builds the case from the payload — the application and, since this WP, the bank's view of the applicant (`customer` as the lines see them, `accounts`, `bureau`, put there by `applicationItem` in the bank) — with the truth recomputed under the policy in force, so a knob sweep moves the verdict and never the case. Bare (the conformance sweep creates every layout bare) it is the borderline case. `assembleLendingCase` is the part of `lendingCase` both roads share; the nine kinds are byte-identical to before (the golden traces, the baseline, `knobs.test.ts`).

**The scripted bot** reads the case: the stage cards' plans (`testing/plans.ts`, `STAGE_PLANS`) work the decision and the explanation out from the prompt at the turn — `PlanStep.argsFrom(request)` parses the bureau file and the worksheet the bot was shown and applies `verdictFromFigures` — since a book's cases differ and a fixed answer would be right for one of them. `obedient` and `scriptedNoisy` honour `argsFrom`; a plan without one is the list it always was.

## 4. The reference configurations and the ceilings

| Configuration | Level | Executors | Knobs |
|---|---|---|---|
| `rules-only` | none (the control) | every bot stage a rule; `four-eyes` a person | defaults (`fourEyes: 'approve'`) |
| `bot-explains-only` | 2 | rules decide; the bot explains | `fourEyes: 'all'` — a person confirms every decision before anything goes out |
| `bot-recommends` | 3 | the bot verifies, assesses and explains; `decision` a person's (following the suggestion, the rule's verdict); `disbursement` a rule | defaults |
| `bot-with-a-person-at-the-decision` | 4 | the bot everywhere | `fourEyes: 'all'` |
| `bot-everywhere` | 5 | the bot everywhere | `fourEyes: 'none'` |

`decision-rights.ts` carries the thought experiment's four rows that map to a desk — `in-policy-credit-approval` 4, `adverse-credit-decision` 3, `vulnerable-customer-support` 3, `sar-filing` 2 — with the page's own reasons quoted and the source cited (`DECISION_RIGHTS_SOURCE`, retrieved 2026-09-11), the five autonomy labels, and `LENDING_CEILINGS` as every configuration's `autonomy.ceilings`. `lendingDecisionKind(stageId, output)` names the `record` stage's outcome a kind; a decision's level is the configuration's, 1 for the control.

**Human load** (`@craftabot/workflow`'s `touchedCaseOf(run, decisionKindOf)`): a touch is a `human` stage answered (`human:<stageId>`), a stage that escalated (`escalated:<stageId>`), an approval a person answered (`approved-by:<stageId>`); the decisions carry the level. Structural, so `workflow` needs nothing of `metrics`.

## 5. Books in campaigns (`@craftabot/evals`)

`campaignSchema.source?: { kind: 'book'; workflowId; configuration?; book? | population?: { seed, size, periodDays? }; filter?; limit? }` — `scenarios` may be empty when a source is present. The cells are items × builds × guards × brains, the first seed seeding the seats; `prepareCampaign` draws the book through the workflow's own `book` when the source names a population, or takes it inline. `builds[].overrides.configuration` names the workflow's configuration a build runs (the source's by default); the report's `builds[]` carries it. A cell records `item { id, kind, customerId }` and `workflow { runId, configuration?, autonomy?, outcome, stages[], touches[], decisions[], breaches }`; its `runId` is the last agent run's, for the Run Lab. A book cell is scored over the workflow's events followed by every agent run's, with the desk's truth as the journey left it (`onFinished`), so the evaluators, assertions, world metrics and cohort read as a single-seat cell's do — a `rules-only` journey, which makes no agent run, hands its truth to `evaluateCell` directly.

`summary.humanLoad[]`: per build — configuration, level, cases, touches per case with its t interval and the kinds, the unattended rate, decisions, breaches, the breach rate with its Wilson interval, underpowered under thirty cases. Rendered as *Human load* in the scorecard and as a pane on the Campaigns screen.

**The committed campaign**, `campaigns/fs-lending-book.json` (`lendingBookCampaign()`): the population at seed 1, 500 customers; five builds, one per configuration; no guard; the scripted-optimal bot; `decision-matches-rules`; three gates — every journey completes, `rules-only` agrees with the rule on every row, the bots agree with the rule. Run in CI on every push.

## 6. The hosts

- **`craftabot book run --workflow <id> --population <seed> --size <n> [--config a,b] [--kit] [--brain] [--period-days] [--limit] [--jobs]`** writes the campaign (`<out>/<id>.campaign.json`) and runs it as `craftabot campaign` runs one; **`craftabot sweep --file <campaign.json> --knob <name>=<v1>,<v2>,…`** is sugar over builds. Both print the human-load rows.
- **The Campaigns screen** has a Books panel (workflow, customers, seed, the configurations to include) that draws the book on the main thread, puts a campaign with an inline `source.book` in the editor and queues it — the count exact before the run, the Worker drawing nothing — and a Sweeps panel that multiplies the editor's builds by a knob's values. The Worker's `work: 'book'` runs the campaign it carries.

## 7. Contract changes (all additive, `69-…` amended)

- `StageSpec.suggest?(input, state, truth)` — what a scripted person answers at a `human` stage; the runtime's default resolver and the harness's `--decide` fall back to it.
- `WorkflowSpec.decisionKindOf?(stageId, output)` and `WorkflowSpec.book?(request: BookRequest)`.
- `RunWorkflowOptions.onFinished(world, run)`; `read` applies to agent and line stages only — a rule and a person return their own output.
- `PlanStep.argsFrom?(request)` in `pack-starter`'s plans, honoured by `obedient` and `scriptedNoisy`.
- `PackRegistry.getWorkflow`/`listWorkflows` (WP79's amendment); `applicationItem(row, applicant)` and `customerForTheDesk` in the bank.

## 8. Divergences from `64-…`

1. **Ten stages, not nine.** A `human` executor answers; it does not act. `record` performs a person's decision on the desk and carries a bot's through, and is where a decision is counted once for the ceilings.
2. **`bot-explains-only` is Level 2 with `fourEyes: 'all'`** rather than a separate "send" stage after the explanation: the person who confirms the decision sends the words with it.
3. **`bot-recommends`' person follows the rule.** The design says "choosing among the bot's recommendation and the rule's verdict"; a campaign has no person, so the stage's `suggest` is the rule's verdict from the figures on the desk, and `--decide` in the harness overrides it. A person who overrides signs `rules-cannot-decide`.
4. **The work item carries the applicant.** A book's item was the application alone; it now carries the bank's view of the applicant so a book runs with no population in hand. Cohort proxies are stripped at the item, not only at the desk; the item's `truth` is unchanged.
5. **The Worker's `book` kind is a campaign with a `source`.** The Books tab queues a campaign; the protocol's `StartBook` carries one. The stub's message stays for `bank` (WP83).
6. **The book campaign's gate on the bots** — the scripted-optimal bot agrees with the rule because it applies the rule to what it is shown. A live bot would not always; the gate is the baseline's contract, not a claim about models.
7. **The ceiling-breach rate at Level 4** is non-zero for declines too (the ceiling is 3): Approver authorises, Consultant reviews. The metric says so; the design asked only that Level 3 be zero and Level 5 non-zero.

## 9. Tests (WP80's DoD, `65-…`)

- `fs-lending/src/workflow.test.ts`: `rules-only` agrees with the rule on every row of a 400-customer book's sample and touches a person only at a payout; the five configurations run the same items and agree on the outcome; every run parses; the breach count is zero at Level 3 and every decline at Level 5; the intake refuses a malformed item; a knob moves the outcome and never the case.
- `fs-lending/src/book-campaign.test.ts`: the committed file is the builder's; a 120-customer book runs green through every configuration with every gate passing; every cell carries its item and the workflow's account; the human-load rows by level; the cells run one at a time through the seam are the report's cells byte for byte.
- `harness/src/commands/book.test.ts`: `book run` and `sweep` end to end; the CLI's flags.
- `e2e/campaigns.spec.ts`: the Books panel runs a 60-customer book in the Worker and the human-load pane shows five rows.
- The desk's own suites unchanged: the golden traces, `knobs.test.ts`, the baseline campaign.
