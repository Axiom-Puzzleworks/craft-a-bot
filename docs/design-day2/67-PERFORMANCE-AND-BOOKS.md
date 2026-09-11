> **Amended 2026-09-11 (WP83, `71-THE-CLOCK.md` §3).** Two registers join the loan book and the alert book as `Book`s the clock schedules: `complaintBook(pop, { from, to })` — every complaint opened in the window (`Complaint.openedDay` is days ago at the period's end, so its calendar index is the last day less that), the register's own upheld rule in truth — and `adviceRequestBook(pop, { from, to })` — a calibrated share of savings holders above £1,000, one request each on a day from the customer's seed. A work item's payload carries the customer as the lines see them (`customerForTheDesk`).

# 67 — The performance label, the loan book, the alert rule and the books (WP75)

> **Status:** design of record for WP75 (`65-DAY5-ROADMAP.md` Phase R), opened 2026-09-10 on the `day5` branch after WP74 (the population). Stage A is this note — the hazard's form and coefficients, the cited range its base rate must sit in, the book contract, the alert rule; stage B is the code.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.1.3–§6.1.4 (decision D6; tenet 23 — *the rule judges the decision, the outcome judges the rule*). Retires the book half of G43. `fs-bank` still ships no runtime: a book is data, a rule is a pure function.

---

## 1. Where the code is

1. **The population exists** (WP74): `population(seed, options)` with eager customers and a lazy `TransactionStream`; `customerCase` for a desk; the cited `CALIBRATION` table and `DECK_WEIGHTS`.
2. **The lending rule is a policy** (WP78): `affordabilityVerdictWith(policy)(application, bureau) → { verdict, ratioPercent, repayment, reasons }` in `fs-lending`, which depends on `fs-bank`. The bank cannot import the rule; a book is judged by a `judge` the caller hands in, and `fs-lending` hands its own.
3. **The Fraud Desk's alerts are hand-built** (`fs-fraud/src/world/alerts.ts`: *"never a random departure the bank happened to generate"*) with a label in truth; the departure rate in `transactions.ts` is 12% with no label (`66-…` §2's `transaction-departure` row).
4. **Truth is held beside the state, never in it** (`45-…` §4.2; `checkDesk`'s truth rule): a planted label cannot ride on a `Transaction`, because a transaction reaches a desk's snapshot. The stream keeps the labels apart and hands them to the rule.
5. **`bankCase(seed)` is byte-identical to WP59's** (`66-…` §4.2's legacy digests) and must stay so: a draw the population makes and the deck does not must consume no random on the deck's path.

## 2. Principles

- **Nothing is fitted.** The hazard is a stated monotone function with coefficients in this note and in the code; the alert rule is a stated detector. `41-…` §11 stands (`64-…` §11): a bank that wants to test its model tests it as a rule.
- **The label is a function, not a fact.** `PerformanceLabel.hazard` carries the number the draw was made from; `basis: 'synthetic-hazard-v1'` names the function; every screen that shows it says *synthetic hazard*.
- **Drawn for every application, declines included**, so the counterfactual — would the declined have repaid — exists in truth and equal opportunity has a positive class among them.
- **A book is a pure function of a population and a filter**; its `source` names the population's digest and the oversampling it was made with, so a rate read off it is honest about the count.
- **The rule's own quality is a calibration row.** The alert rule's precision and recall over the population are measured and asserted, because the fraud workflow's `rules-only` configuration *is* the rule (`64-…` §6.1.3).

## 3. The performance label (`64-…` §6.1.4)

```ts
export interface PerformanceLabel { defaultedWithin12m: boolean; hazard: number; basis: 'synthetic-hazard-v1' }
export function performanceLabel(random, application, bureau, verdict): PerformanceLabel
```

**The hazard, v1** — a logistic over the affordability ratio and the bureau file, `p = 1 / (1 + e^(−z))`:

| Term | Coefficient | Why |
|---|---|---|
| intercept | −3.6 | a base near 2.7% for a clean file at a comfortable ratio |
| ratio above 30%, per point (capped at 120) | +0.022 | affordability strain is the main driver |
| score band `fair` | +0.7 | |
| score band `poor` | +1.5 | |
| each bureau default (capped at 3) | +0.6 | |
| each month in arrears (capped at 6) | +0.25 | |
| searches in twelve months ≥ 3 | +0.3 | |

A clean file at ratio 30 gives z = −3.6, p = 2.7%; at ratio 60, z = −2.94, p = 5.0%; `fair` with one default at ratio 60 gives z = −1.64, p = 16%; `poor` with two defaults at ratio 100 gives z = −3.6 + 1.54 + 1.5 + 1.2 = 0.64, p = 65%. The draw is `random() < p`, one `random` per application, from the book's own stream (never the desk's).

**The cited range** (`66-…` §2, `arrears-base-rate`): the Bank of England's *Financial Stability Report* (December 2025) puts consumer-credit accounts in arrears at around 4%; a twelve-month default is a stronger event than being in arrears, and it speaks of loans that were booked. So the base rate the range binds is the share of **approved** applications whose label is a default — **[2%, 6%]**, asserted by the calibration test — while the declined applications, drawn from the same hazard, default far more often, which is the counterfactual the label exists to carry (§2). Measured on the first run (2026-09-10, the shipped table, the default policy, 1,597 applications from 20,000 customers): approved **4.0%**, referred 7.0%, declined 25.1%, all applications 8.3%. The coefficients are not tuned to the range; the mix of the book puts the approved rate there.

**Never on a desk.** The label lives in the work item's truth (`facts.defaultedWithin12m`, `facts.hazard`) and nowhere else; the tenet-13 sweep (`checkDesk`'s truth rule on the lending desk under a book-fed case, WP80) and a test here that serialises every desk-facing record of a book and greps for `defaultedWithin12m`, `hazard` and `synthetic-hazard` prove it.

## 4. The loan book (`64-…` §6.1.3)

```ts
export interface LoanApplicationRecord {          // the plain record the desk's `Application` is
	amount: number; termMonths: number; purpose: string;
	declaredMonthlyIncome: number; declaredMonthlyOutgoings: number;
}
export interface RuleVerdict { verdict: 'approve' | 'decline' | 'refer'; ratioPercent: number; repayment: number; reasons: string[] }
export type Judge = (application: LoanApplicationRecord, bureau: BureauFile) => RuleVerdict;

export interface LoanApplication {
	id: string; customerId: string; date: string;
	application: LoanApplicationRecord;
	cohort: CohortBlock;                 // truth
	verdict: RuleVerdict;                // truth, the judge's
	performance: PerformanceLabel;       // truth
}
export interface LoanBook { rows: LoanApplication[]; byOutcome: Record<Outcome, number>; source: BookSource }
export function loanBook(pop: Population, judge: Judge, filter?: BookFilter): LoanBook
```

Who applies: each customer applies in the period with the `application-incidence` row's probability (an assumption — FLS 2024 has 14% of adults holding a personal loan now or in the last twelve months, so about a twelfth of that in a month; the row states 8% over the 180-day period), on a calendar date drawn uniformly over it. The application: `amount` from the `loan-amount` row, `termMonths` from `loan-term`, `purpose` from `loan-purpose` (all assumptions with the FLS *amount owed* bands as the nearest public shape, `66-…` §2 `loan-size-term`); `declaredMonthlyIncome` is the bureau's verified income × (1 + a declaration noise drawn from `declared-income-noise`, the "customers round up" effect, an assumption); `declaredMonthlyOutgoings` the commitments plus 30% of income as the desk's own case does. The judge's verdict and the performance label are computed at generation and held in truth. `byOutcome` counts the verdicts; the calibration test holds the mix against the `loan-outcome-mix` target row — an assumption set from the book's first run under the default policy (approve 49%, refer 36%, decline 15%; FLS's 8% of adults declined any product in two years bounds the decline share only loosely) so that a drift in the generators or the rule moves a test; the row says so.

`BookFilter`: `{ from?: date; to?: date; cohort?: Record<string, string>; amount?: [min, max]; outcome?: Outcome }` — a pure filter over the rows; `source.filter` records it.

## 5. The alert rule and the alert book (`64-…` §6.1.3)

**Planted truth.** `dayTransactions` draws, for a departure only and only when the table has a `fraud-incidence` row, a planted label at the row's rate — `fraudulent` (a card-fraud shape, kind by the `card-fraud-by-type` row) or `mule-in` (an APP-shaped credit) — and returns it **beside** the transactions (`{ transactions, planted }`), never on them; the stream memoises both and exposes `plantedLabel(transactionId)`. `DECK_WEIGHTS` has no `fraud-incidence` row, so `bankCase`'s path consumes no extra random and stays byte-identical. The incidence: UK Finance's 1 case per 10,000 card payments (`66-…` §2) × an **oversampling factor of 100** stated on the row, giving 1% of transactions — a departure is 12% of transactions, so about 8% of departures carry a label; the alert book's `source.oversample` carries the factor so a rate read off it can be scaled back.

**The rule** — `alertRule(account, day: Transaction[], plantedLabel)` — a pure detector over one account's day, raising an alert for a transaction when any of:

| Signal | Test |
|---|---|
| `velocity` | three or more payments in the same hour on the account |
| `new-device` | `device` is `app on a new phone` |
| `abroad` | `country` is not one of the account's baseline countries |
| `night-cnp` | `card-not-present` between 00:00 and 05:59 at more than three times the typical amount |
| `new-payee` | a `faster-payment` to `a new payee` |
| `large` | any debit above ten times the typical amount |

One alert per transaction (the signals it tripped listed), the alert's `truth.facts.label` the planted label or `legitimate`. Its precision and recall over the population's last thirty days are a calibration test: recall — the share of planted transactions the rule alerts — at least **0.5**; precision — the share of alerts that are planted — at least **0.05** (the rule fires on legitimate departures by design; the desk's job is to tell them apart). Measured on the first run (2026-09-10, 20,000 customers, the last thirty days): 96,194 alerts, 11,554 planted, 8,072 caught — **precision 0.084, recall 0.699**, in 3.8 s.

```ts
export interface AlertItemPayload { transaction: Transaction; account: { id; kind; masked }; signals: AlertSignal[]; typicalAmount: number; baseline: AccountBaseline }
export function alertBook(pop: Population, filter?: { from?: string; to?: string; customers?: number }): Book<'alert'>
```

`alertBook` scans the stream for the filter's window (default the last thirty days) over the first `customers` customers (default all — the harness's default; the browser passes fewer), raising items in date order.

## 6. The work item and the book (`64-…` §6.1.3)

```ts
export interface WorkItem<Kind extends WorkItemKind = WorkItemKind> {
	id: string; kind: Kind; customerId: string; arrivedAt: string;   // ISO datetime on the calendar
	payload: unknown;                                                   // the application, the alert, the complaint, the request
	truth: DeskTruth;                                                   // as a desk would compute it: records, facts, cohort
}
export type WorkItemKind = 'application' | 'alert' | 'complaint' | 'advice-request';
export interface BookSource { populationDigest: string; seed: number; size: number; filter?: unknown; oversample?: number }
export interface Book<Kind extends WorkItemKind = WorkItemKind> { schemaVersion: 1; kind: Kind; items: WorkItem<Kind>[]; source: BookSource }
```

`bookSchema` in `core/schemas/book.ts` (Zod; `docs/schemas/book.schema.json`, the tenth artefact) with `payload: unknown` and the truth's shape. A book is byte-stable per population and filter (the test serialises two makings and compares). The loan book's rows are its work items' payloads (`loanBook` builds the `Book<'application'>` too, with the verdict and the label in the item's truth); the alert book is a `Book<'alert'>`.

## 7. Stage plan

- **Stage A** — this note. _Done 2026-09-10._
- **Stage B** — `core/schemas/book.ts`; `fs-bank/src/book/` (`performance.ts`, `alert-rule.ts`, `books.ts`); the planted labels in `dayTransactions` and the stream; the new calibration rows; the tests. _Done 2026-09-10._ `bookSchema`/`workItemSchema` in `core` (`docs/schemas/book.schema.json`, the tenth artefact); `fs-bank/src/book/performance.ts` (`HAZARD_V1`, `hazardOf`, `performanceLabel`), `alert-rule.ts` (`signalsOf`, `alertRule`, six signals), `books.ts` (`loanBook(pop, judge, filter)` with the `Book` beside the rows, `applicationItem`, `alertBook(pop, options)` returning the book with the rule's precision and recall, `FRAUD_OVERSAMPLE`); `fs-lending/src/book.ts` (`lendingBook(pop, { policy, filter })` passing its own rule). `dayTransactions` returns `{ transactions, planted }` and plants on a departure only when the table has a `fraud-incidence` row; the stream keeps the labels apart (`plantedLabel`) and reads without memoising for a scan; seven rows joined `CALIBRATION` (`application-incidence`, `loan-amount`, `loan-term`, `loan-purpose`, `declared-income-noise`, `loan-outcome-mix`, `fraud-incidence`), none in `DECK_WEIGHTS`, so `bankCase` is what it was. Findings: the hazard's fourth hand value in the first draft was an arithmetic slip (0.64, 65%, corrected in §3); the cited arrears rate binds the *approved* book, and the first draft asked it of all applications — declines default at 25% by design, the counterfactual the label carries; the outcome-mix row is set from the first run as a drift check and says so.

## 8. Divergences from `64-…` §6.1.3–§6.1.4

- `LoanApplication.application` is a plain `LoanApplicationRecord` in `fs-bank`, structurally `fs-lending`'s `Application`; the verdict comes from a `judge` the caller passes, because the bank cannot import the desk's rule. `fs-lending` exports `lendingBook(pop, policy?)` that passes its own.
- The planted label is held beside the transactions in the stream, never on the `Transaction`, so a population's transactions can reach a desk's snapshot without carrying truth (§1 item 4). `64-…` §6.1.3 wrote `planted?` on the transaction.
- The performance label is drawn from the book's own seeded stream (one draw per application), not from the desk's random, so a desk run over a book item never consumes it.
