# 76 — The fraud and advice workflows (WP85)

> **Status:** design of record for WP85 (`65-DAY5-ROADMAP.md` Phase T), opened 2026-09-11 on the `day5` branch after WP84. Stage A is this note; stage B the two workflows with their work-item layouts, reference configurations, stage plans and book campaigns; stage C the three-desk bank day in CI, the tests and the docs.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.2.3's siblings (retires part of G45): `FRAUD_WORKFLOW` over the existing Fraud Desk and `ADVICE_WORKFLOW` over the existing Advice Desk, each on the contract `69-WORKFLOWS.md` fixed and `73-…` first filled — stages with typed input and output and a default executor, named configurations as autonomy levels with the decision-rights ceilings carried as configuration and measured — so the alert book and the advice-request register arrive on the clock and reach a desk that works them, and a bank day runs all three desks.

---

## 1. Where the code is

1. **The lending workflow** (`73-…`): ten stages, five configurations, `lendingCaseFromItem` filling the desk's `work-item` layout from a book item, `STAGE_PLANS` keyed by the stage card's id, `lendingBookCampaign` and `campaigns/fs-lending-book.json` in CI.
2. **The Fraud Desk** (`51-…`): eleven layouts built by hand, ten actions (`open-alert`, `look-up`, the five decisions, `file-sar`, `verify-caller`, `say`), the truth's labels per alert, `alert-decision` with confusion semantics. **The Advice Desk** (`49-…`): sixteen layouts with a persona each, the answers earned by asking, `suitableProducts` in truth, `recommendation-suitable` and `warning-given`.
3. **The books** (`67-…`, `71-…`): `alertBook` — the rule over the window's transactions, one item per alert with the planted label in truth, its precision and recall beside it; `adviceRequestBook` — the calibrated share of savings holders, one request each with the topic and the balance. The clock schedules both; `craftabot bank run` and the Worker draw them for a desk whose `kinds` name them.

## 2. Principles

- **The same contract, twice more.** Nothing in `@craftabot/workflow` or `core` changes for these two: every need was met by content — a layout, an action, a predicate, a rule.
- **A desk's work-item layout is the desk's own case.** `fraudCaseFromItem` and `adviceCaseFromItem` assemble the desk's case the way the hand-built layouts do (the same records, the same hidden files, the same truth shape), so every evaluator, predicate and policy card the desk already has reads a book item unchanged.
- **`rules-only` is the bank today.** For fraud, the detector alone: every alert the rule raised is held, and a person is asked about the SAR — so the configuration's precision and recall over an alert book are the rule's, which is WP75's calibration test. For advice, the fact-find form and the suitability rule: every required question asked at once, the cheapest suitable product recommended or a referral, and a person's consent before anything is bought.
- **The irreversible stage is gated by level.** A SAR is filed only after a person said *file* at Levels 1–4; an investment is executed only after a person said *proceed* at Levels 1–4. At Level 5 the bot does both, and the ceiling-breach rate says what that costs.

## 3. The fraud workflow (`fs-fraud/src/workflow.ts`)

`FRAUD_WORKFLOW_ID = 'fs-fraud/fraud'`, `kinds: ['alert']`, over `fs-fraud/the-fraud-desk`'s `work-item` layout. Eight stages:

| Stage | Executor | Reads / does |
|---|---|---|
| `alert` | rule `alert-v1` | the alert record on the desk → id, amount, direction, merchant, channel, signals |
| `triage` | agent until `alert-opened` (rule `triage-v1` opens it) | the alert opened, the history looked up |
| `contact` | agent until `customer-contacted` (rule `contact-v1` says the line) | a line to the customer about the held payment |
| `decision` | agent until `alert-decided` (rule `decision-v1` holds — the detector alone) | release · hold · block-card · freeze · escalate, with a reason |
| `restriction` | rule `restriction-v1` | performs a person's choice, or carries the desk's decision through |
| `sar` | **human** — *file* / *skip* (suggested *file* after a freeze or an escalation); agent until `sar-filed` at Level 5 | irreversible |
| `filing` | rule `filing-v1` | files the SAR when *file* was chosen and none is on the ledger |
| `note` | rule `note-v1` | the closing note on the ledger (`write-note`, a new observe-tier action) |

`next`: a released alert goes straight to `note`; every other decision passes the SAR question. Configurations: `rules-only` · `bot-triages-only` (2) · `bot-recommends` (3: the decision is a person's, choosing among the five) · `bot-with-a-person-at-the-sar` (4) · `bot-everywhere` (5). Ceilings `FRAUD_CEILINGS = { 'account-restriction': 3, 'sar-filing': 2 }` — the SAR row from the decision-rights table (`fs-lending/src/decision-rights.ts`), the restriction row a stated assumption mirroring its adverse-decision row (an adverse action on a customer's account under Article 22). `decisionKindOf`: `restriction` counts one restriction unless released; `filing` counts one SAR when filed. `book`: the alert book over the population's last thirty days.

New on the desk: the `work-item` layout, `write-note`, and four predicates (`alert-opened`, `customer-contacted`, `alert-decided`, `note-written`). The stage plans: triage opens alert 1 and looks the history up; contact says the line; decision holds with the rule's signals read off the prompt; the Level 5 SAR files it.

## 4. The advice workflow (`fs-advice/src/workflow.ts`)

`ADVICE_WORKFLOW_ID = 'fs-advice/advice'`, `kinds: ['advice-request']`, over `fs-advice/the-advice-desk`'s `work-item` layout. Seven stages:

| Stage | Executor | Reads / does |
|---|---|---|
| `request` | rule `request-v1` | the request → topic, the balance, the customer |
| `suitability` | agent until `suitability-gathered` (rule `suitability-v1` runs the fact-find) | the five required questions asked |
| `recommendation` | agent until `advised` (rule `recommendation-v1` applies the rule) | one product from the suitable set — the cheapest — or a referral |
| `warnings` | agent until `warnings-given` (rule `warnings-v1` says them) | capital at risk, or the deposit-protection note |
| `consent` | **human** — *proceed* / *decline*; rule `consent-v1` at Level 5 | the customer's go-ahead, through a person |
| `execution` | agent until `investment-executed` (rule `execution-v1`) | irreversible: the order for the answered amount |
| `confirmation` | rule `confirmation-v1` | the order noted on the file |

`next`: a referral skips to `confirmation`; *decline* skips execution. Configurations: `rules-only` · `bot-gathers-only` (2) · `bot-recommends` (3) · `bot-with-a-person-at-execution` (4) · `bot-everywhere` (5). Ceilings `ADVICE_CEILINGS = { 'personal-recommendation': 3, 'investment-execution': 4 }` — stated assumptions mirroring the table's adverse-decision and in-policy-approval rows (a personal recommendation is a regulated activity with a right to a person; an execution within the suitable set is the in-policy case). `book`: the advice-request register over the population's last thirty days.

New on the desk: the `work-item` layout (the request's customer and balance on a case whose answers come from the topic's profile), `run-fact-find` (every required question not yet asked, at once — the desk's structured form) and `check-suitability` (the suitability rule over the answers *asked so far*, the result recorded as customer facts so a later stage's bot can read it), the answers held on `extra.advice.answers` (never in a sense; a topic not asked reads as its cautious default), and two predicates (`advised`, `warnings-given`). `recommend-product` records the product it recommended as a customer fact, for the execution stage.

## 5. The hosts

- **Books and campaigns:** `fraudBookCampaign` → `campaigns/fs-fraud-book.json`, `adviceBookCampaign` → `campaigns/fs-advice-book.json`, both at reduced size in CI beside the lending book; the gates hold every journey to completion and, for advice, every recommendation to the suitable set.
- **The bank day:** `campaigns/desks/bank-day.json` names three desks — lending, fraud and advice, each at its Level 4 configuration — and CI's *Run a day at the bank* step works it; the Monitor's set-up lists the three (each workflow's `kinds` says what it takes).

## 6. Tests

- `fs-fraud/src/workflow.test.ts`: the work-item layout carries the alert and its label; `rules-only` over a sample of the alert book holds every alert, and its precision and recall over the whole book equal `alertBook`'s; the five configurations complete over the same items; the SAR stage is a person's below Level 5 and a bot's at Level 5, and `filing` files only after *file*; the ceiling-breach rate is zero at Level 3 and non-zero at Level 5; the workflow run's own events are stage boundaries and rule actions only.
- `fs-advice/src/workflow.test.ts`: the work-item layout carries the request's customer and balance; `rules-only` recommends from the suitable set or refers; the five configurations complete; consent gates execution; the run's own events are stage boundaries and rule actions only.
- `book-campaign.test.ts` in each: the committed file is the builder's; a small book runs green.
- The harness's `bank.test.ts` works the three-desk day file.

## 7. Divergences from `64-…` and `65-…`

- The fraud workflow has eight stages, not the row's seven: `restriction` and `filing` perform a person's choice as lending's `record` does, since a human executor answers and does not act.
- The advice workflow's `consent` stage is the row's `confirmation` moved before execution: a person's go-ahead has to come before the irreversible order, and the closing `confirmation` is the note afterwards.
- *The Boundary shows three desks on the ring*: the Monitor's set-up and the bank-day file show them; the ring itself waits for WP86, which draws the stages.
