# 66 — Calibration: the sourcing note and the population (WP74)

> **Status:** design of record for WP74 (`65-DAY5-ROADMAP.md` Phase R's first row), opened 2026-09-10 on the `day5` branch against `main` at `19ea515`. Stage 0 — this note's §2 — is the **sourcing note** `65-…` §8 item 1 asks for: every distribution the generators draw from, the publication it will be set to, the edition, the table within it, what it gives and what is simplified. `65-…` says the note is _reviewed by Andrew before step 2_; the sprint runs unattended, so the note is written, the values are typed in stage A from the retrieved documents, and **every row is marked `review: 'pending'` until Andrew has read it** — the bank page renders that status, and `checkCalibration` refuses a row with no source but not a row awaiting review, because a cited-but-unreviewed row is honest and a hidden one is not.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.1 in full: the calibration table (§6.1.2), the population (§6.1.1), the book contract's population half (§6.1.3 — the loan book, the alert rule and the performance label are WP75's, `67-…`). Decision D5. Retires G43 and G44.

---

## 1. Where the code is

1. **Twenty weighted draws, none cited.** `packages/packs/fs-bank/src/generate/customer.ts` — `AGE_WEIGHTS`, `employmentFor`, `incomeFor`, literacy, digital confidence by age, `driversFor(0.18)`, the proxies at 0.3, dependants, consent, channel; `accounts.ts` — product holding (savings 0.7, credit card 0.5, loan 0.25, mortgage 0.3), limits, rates; `transactions.ts` — 24 per account per 30 days, departure 0.12, channel mix, night-time and foreign shares, the 8% credit share; `bureau.ts` — the 5% stray default, searches; `complaints.ts` — 0/1/2 at 7/2/1, the categories flat, status. Every one of them is `weighted(random, [...])` or `random() < p` with the number inline.
2. **`bankCase(seed)` is the identity every desk and golden depends on.** One `seededRandom(seed)` in a fixed order; the desks, the campaigns, the golden traces and `checkSynthetic` all read it. The population must be built beside it, not through it, and `bankCase` must return byte-identical cases after this WP wherever a row keeps the shipped weights.
3. **`weighted` is the one seam.** Every row's `distribution` is a `Record<string, number>`; `weighted` takes an array of pairs. A row becomes `weightedRow(random, CALIBRATION.row('age-band'))` with the same draw arithmetic, so the _shape_ of the draw does not move — only where the numbers live.
4. **`PackManifest` carries content lists** (`controlMaps`, `campaigns`, `serviceLines`, …) and `pack-testkit/src/checks/` holds one `check*` per content type. `calibrations` and `checkCalibration` follow the pattern.
5. **`checkSynthetic` sweeps fixtures by shape**; a population of 20,000 is never a fixture, so §4.5's test samples it.

## 2. The sourcing note (stage 0)

Retrieval date for every row: **2026-09-10**. Each row names the publisher, the title, the edition, the table or figure, what it gives, and what the generator simplifies. Values are recorded here only where they were read from the document on the retrieval date, so stage A types them from this note and a reviewer checks the note against the source. Where the document gives no breakdown the row says so and states the assumption; a stated assumption is a row with `source.kind: 'assumption'` and a `note` that says why — it is never a silent number.

| Row id | Generator draw today | Publisher · title · edition | Table / figure | What it gives | Simplified how |
| --- | --- | --- | --- | --- | --- |
| `age-band` | `AGE_WEIGHTS` 8/18/20/18/16/12/8 | ONS · _Estimates of the population for the UK, England, Wales, Scotland and Northern Ireland_ · mid-2023 (published 8 Oct 2024) | `mye23tablesuk.xlsx`, sheet _MYE2 – Persons_, row _UNITED KINGDOM_ | Persons by single year of age. Summed to the model's seven bands over adults 18+: **18–24 10.5 · 25–34 16.8 · 35–44 16.8 · 45–54 15.8 · 55–64 16.3 · 65–74 12.2 · 75+ 11.7** (of 54.20m adults) | None. A bank's customers are assumed to have the adult population's age structure. |
| `employment-by-age` | `employmentFor` (three age groups) | ONS · _Labour market overview, UK_ · latest (A05 SA: employment, unemployment and inactivity by age; INAC01 SA: inactivity by reason) | A05 SA, INAC01 SA | Employment, unemployment and inactivity rates by age band; inactivity by reason (student, retired, looking after family, long-term sick) | The model's `carer` reads INAC01's _looking after family or home_; _long-term sick_ is folded into `unemployed` (the model has no such status) and noted; 65+ read as retired unless employed. **Values to be typed in stage A from the two datasets.** |
| `income-band` | the marginal `incomeFor` implies | HMRC · _Personal Incomes Statistics 2022 to 2023_ · published 12 Mar 2025 | `Collated_Tables_3_1_to_3_17_2223.ods`, Table 3.1 (before tax), row _2022 to 2023_ | Percentiles of total income, taxpayers only: 10th £15,500 · 25th £20,000 · 50th £28,400 · 75th £43,000 · 90th £64,800 · 95th £90,500 · 99th £201,000 | Taxpayers only — adults below the personal allowance are absent, so `under-15k` is under-stated; the band shares are read off the percentile curve by linear interpolation (stage A records the arithmetic in the row's `note`), and the `under-15k` share is lifted towards the FLS _household income under £15k_ figure where the two can be reconciled, the note saying which was used. |
| `income-band-by-employment` | `incomeFor` per employment | _stated assumption_ | — | No published individual-income-by-employment-status table gives the model's bands. | The conditional weights are kept as shipped but scaled so the marginal matches `income-band`; the row says so. FLS 2024 publishes _household_ income by employment status, which is the nearest public shape and is cited as the check. |
| `vulnerability-prevalence` | `driversFor(0.18)` | FCA · _Financial Lives 2024: Vulnerability & financial resilience_ (selected findings, May 2025) | p.21 (any), p.23 (the four drivers, updated algorithm, 2024) | **Any characteristic 49%** (26.4m); by driver (updated algorithm, 2024): **poor health 9% · negative life event 20% · low resilience 26% · low capability 17%** | The generator draws one rate per grouping; it becomes one rate _per driver grouping_ from this row. Overlap (37% of vulnerable adults have two or more drivers, p.24) emerges from independent draws and is checked, not set. |
| `vulnerability-by-age` | (none — age-blind today) | FCA · _Financial Lives 2024: Vulnerability & financial resilience_ | p.22 figure — any characteristic by age band | The figure's bars by seven age bands (the chart-data workbook published beside the PDF carries the values) | The extracted PDF text interleaves the bars; **stage A reads the chart-data workbook**, not the PDF text. The row scales the per-driver rate by age band. |
| `vulnerability-disclosure` | `disclosedFrom(…, 0.5)` | _stated assumption_, with FCA FG21/1's guidance that firms cannot rely on disclosure | — | No published share of vulnerable adults who have told their provider. | 0.5 kept and stated; the note names the FLS question set (_told your provider_) as where a figure would come from if published. |
| `digital-confidence` | by age, two tables | Lloyds Banking Group · _Consumer Digital Index 2024_ (the _lowest digital capability_ share) and FCA · _Financial Lives 2024 key findings_ (2% digitally excluded; 7% of current-account holders do not bank online or by app) | CDI 2024 headline; FLS key findings §2 (_Digital exclusion_) | 23% of adults have the lowest digital capability (CDI); 2% digitally excluded and 7% not banking online (FLS) | `low` set from CDI's lowest-capability share, skewed by age as FLS's digital-exclusion profile is (the majority 75+); the `medium`/`high` split is a stated assumption. |
| `literacy-band` | 2/5/3 | _stated assumption_ (OECD _Survey of Adult Skills (PIAAC) 2023_, England, is the nearest public measure of literacy proficiency levels) | PIAAC 2023 country note, England — literacy at or below level 1 | Share of adults at the lowest literacy level | The model's `low` is set to PIAAC's at-or-below-level-1 share when stage A can retrieve the country note; otherwise the row stays an assumption and says so. |
| `product-holding` | savings 0.7 · credit card 0.5 · loan 0.25 · mortgage 0.3 | FCA · _Financial Lives 2024 key findings_ and _Credit & loans_ (selected findings, May 2025) | Key findings §2 (current accounts 97%, residential mortgage 27%); Credit & loans p.24 (credit card 65%, overdraft 21%, personal loan 14%, now or in the last 12 months) | The share of UK adults holding each product | Savings-account share to be read from Annex A (_Product holdings_ workbook) in stage A; `credit-card` 0.65, `loan` 0.14, `mortgage` 0.27 replace the shipped weights; `current` stays universal (97% ≈ every bank customer). |
| `credit-limit` · `savings-rate` · `product-rates` | limits 1000/2500/5000/10000; rates 150/300/425 bps, CC 2290, loan 690, mortgage 450 | Bank of England · _Bankstats_ Table G1.4 / _Effective interest rates_ (household quoted rates, latest month) | Quoted rates on credit cards, personal loans (£10k), fixed mortgages; instant-access and fixed savings | The rates the model shows on accounts | Limits remain a stated assumption (no public distribution of limits); the three product rates and the savings rates become cited rows from the latest monthly table stage A retrieves. |
| `payments-per-account` | 24 per account per 30 days | UK Finance · _UK Payment Markets 2025_ (summary) | Summary: 49.7bn payments in the year; cards 64%; Faster Payments 6.2bn; cash 8% | Payments per adult per month ≈ 49.7bn ÷ 54.2m adults ÷ 12 ≈ 76, across every instrument and account | The model's per-account count is set from this per-adult figure divided across the accounts a customer holds, at a stated share for cards vs. direct debits vs. Faster Payments from the same summary; a `channel-mix` row records the instrument shares. |
| `channel-mix` | three `weighted` draws in `transactions.ts` | UK Finance · _UK Payment Markets 2025_ | Summary: cards 64% (debit more than half), Faster Payments, direct debit, cash | Instrument shares of payment volume | The model's channels (`card-present`, `card-not-present`, `faster-payment`, `direct-debit`, `atm`) map to the report's instruments; the present/not-present split within cards is read from the report's remote-vs-face-to-face card figures where the summary gives them, else stated. |
| `card-fraud-by-type` | (none — departures unlabelled) | UK Finance · _Annual Fraud Report 2025_ (2024 data) | _Card fraud — cases_ table, 2024 column | Cases 2024: **remote purchase 2,586,217 · lost & stolen 378,591 · card ID theft 109,344 · counterfeit 14,763 · card not received 6,772; total 3,095,687**; losses £572.6m | The alert rule's planted-fraud _kinds_ are drawn by these shares; the model's `mule-in` label maps to APP-enabled mule activity, not a card type, and is a separate row. |
| `fraud-incidence` | departure 0.12 (unlabelled) | UK Finance · _Annual Fraud Report 2025_ + _UK Payment Markets 2025_ | 3.10m unauthorised card cases against ≈ 31.8bn card payments (64% of 49.7bn) | ≈ **1 case per 10,000 card payments** | A book at this incidence has a few positives per thousand items, too few to evaluate a desk on; the population plants fraud at a **stated oversampling factor** (recorded on the row as `note` and on every book as `source.oversample`) so the _rate_ is honest and the _count_ is useful. The departure rate itself (0.12) stays a stated assumption for _unusual-but-legitimate_ activity. |
| `app-scam-by-type` | (none) | UK Finance · _Annual Fraud Report 2025_ | _Overall authorised payment fraud_ table (cases 185,733; value £450.7m; 2024) and Chart 3 (losses by scam type) | Cases and losses; purchase scams "seven in ten" cases; investment scams about a third of losses | The `mule-in` planted label and the fraud desk's APP-shaped alerts draw their scam type by the chart's shares; the per-type case counts are read from the report's per-type tables in stage A. |
| `complaint-category` | flat over six categories | FCA · _Aggregate complaints data: 2024 H2_ | Product group and sub-product tables | Banking & credit cards 839,526 of 1.78m (47.1%): current accounts 491,172 · credit cards 217,160 · savings 80,592 · other banking 21,404 · packaged accounts 15,959 · overdrafts 13,290; upheld 56.64% | The model's categories (`service`, `charges`, `advice`, `fraud-handling`, `lending-decision`, `data`) are causes, not products; the FCA's cause breakdown (_advising/selling_, _general admin/customer service_, _arrears_, _terms & disputed sums_, _other_) is on the same page's cause table and is what stage A maps, with the mapping written on the row. |
| `complaint-incidence` | 0/1/2 at 7/2/1 | FCA · _Aggregate complaints data: 2024 H2_ | 1.78m complaints per half-year | ≈ 3.3% of adults complain to a firm in a half-year (across all firms, so an upper bound for one bank) | The shipped 30% is a deliberate oversample so the complaints desk has a register; the row records the cited rate and the oversampling factor, as `fraud-incidence` does. |
| `declined-credit` | (implicit in the lending rule) | FCA · _Financial Lives 2024: Financial inclusion_ (selected findings) | §3.2 — 8% of adults declined any product in 2 years; 3.2m adults declined a regulated credit agreement; factors (credit history, existing debts, income) | The decline rate among applicants for regulated credit | The rule decides outcomes; this row is the **calibration check** on the loan book's outcome mix (WP75), not a draw. `refer` has no public share and is stated. |
| `loan-size-term` | (none) | Bank of England · _Money and Credit_ (monthly; consumer credit flows) and FCA · _Financial Lives 2024: Credit & loans_ | Aggregate net flows; FLS amounts owed on personal loans (banded) | Typical unsecured loan sizes and terms are not published as a distribution | Amount bands are set from the FLS _amount owed_ bands as the nearest public shape, term from the model's product terms (12–60 months), both stated. |
| `arrears-base-rate` | (none — WP75's hazard) | Bank of England · _Financial Stability Report_ December 2025 (household section) and FCA · _Financial Lives 2024 key findings_ §3 (missed payments, financial difficulty) | FSR: the share of consumer-credit accounts in arrears "levelled off at around 4%" | The range the performance label's 12-month default base rate must sit in: **2%–6%** across the book, the FSR figure as the centre | An account in arrears is not a 12-month default; the hazard's base rate is set so its default rate sits below the arrears rate, and `67-…` records the mapping. |
| `dependants` | 0/1/2/3 at 6/3/3/1 | ONS · _Families and households in the UK_ · 2023 | Households by number of dependent children | Share of families with 0, 1, 2, 3+ dependent children | Household-level figures applied per adult; stated. |
| `preferred-channel` | app 5 · phone 3 · branch 1 · post 1 | UK Finance · _UK Payment Markets 2025_ (91% use remote banking) and FCA · _Financial Lives 2024 key findings_ (7% of account holders do not bank online/app) | as named | The share who bank digitally | `app` set from the remote-banking share, `branch`/`post` from its complement split by a stated assumption; `phone` stated. |
| `arrival-rates` (WP83) | (none) | _stated assumption_, volumes from the rows above | — | The clock's hour-of-day profile has no public source | Recorded here so the clock's note (`71-…`) inherits a cited _daily_ volume (payments, complaints, applications per adult from the rows above) and states the _hourly_ shape. |
| `minutes-per-touch` (WP76) | (none) | _stated assumption_, in the thought experiment's register (`axiomverity` scenario model) | — | Minutes a person spends on a four-eyes approval, a returned decision, a vulnerability pathway, a SAR consent | Never measured by the simulator; a calibration-style row with `source.kind: 'assumption'` so the human-load metrics carry their basis. |

**Publications retrieved on 2026-09-10** (the files stage A reads; none is committed — the rows cite them):

- ONS, _Estimates of the population for the UK, England, Wales, Scotland and Northern Ireland_, mid-2023, `mye23tablesuk.xlsx` — https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatesforukenglandandwalesscotlandandnorthernireland
- HMRC, _Personal Incomes Statistics 2022 to 2023_, Tables 3.1–3.11 — https://www.gov.uk/government/statistics/personal-incomes-statistics-for-the-tax-year-2022-to-2023
- FCA, _Financial Lives 2024 survey_ — key findings; _Vulnerability & financial resilience_; _Credit & loans_; _Financial inclusion_ (selected findings, May 2025) — https://www.fca.org.uk/financial-lives/financial-lives-2024
- FCA, _Aggregate complaints data: 2024 H2_ — https://www.fca.org.uk/data/complaints-data/aggregate-complaints-data-2024-h2
- UK Finance, _Annual Fraud Report 2025_ — https://www.ukfinance.org.uk/policy-and-guidance/reports-and-publications/annual-fraud-report-2025
- UK Finance, _UK Payment Markets 2025_ (summary) — https://www.ukfinance.org.uk/system/files/2025-10/Payment%20Markets%20Report%20Summary.pdf
- Bank of England, _Financial Stability Report_, December 2025 — https://www.bankofengland.co.uk/financial-stability-report/2025/december-2025
- Lloyds Banking Group, _Consumer Digital Index 2024_ — https://www.lloydsbankinggroup.com/media/consumer-digital-index.html

**Review status:** `pending` on every row. When Andrew has read a row against its source, its `review` becomes `{ by, on }` and the bank page stops showing the _awaiting review_ mark for it. The calibration test does not depend on review.

## 3. Principles

- **A row is content with a citation or it is an assumption that says so.** `source.kind: 'publication'` needs publisher, title, edition, table and retrieval date; `source.kind: 'assumption'` needs a `note` that says why no publication serves. `checkCalibration` refuses anything else. Tenet 19.
- **The draw does not move; the number does.** `weighted` keeps its arithmetic. A generator that read `[['18-24', 8], …]` reads the row's entries in the row's declared order, so a row whose weights equal the shipped ones produces byte-identical cases. That is the first test of stage A, and it is how `bankCase(seed)` stays the identity every golden depends on (§1 fact 2).
- **The population is a fold, never a store** (D5). `population(seed, options)` derives per-customer seeds and generates on demand; only the digest and the options are ever persisted.
- **Customer _k_ is customer _k_ at any size.** The per-customer seed is `hash(seed, k)`; a population of 2,000 is the first 2,000 of 20,000. The harness shards by ordinal.
- Hard rules 5 (determinism), 8 (future-public) and 9 (nothing real — the population is shaped like the aggregates and contains no record from anywhere).

## 4. Design

### 4.1 The row and the table (stage A)

`fs-bank/src/calibration/` — `row.ts` (the types and the Zod schema, generated to `docs/schemas/calibration.schema.json`), `table.ts` (`CALIBRATION`, the shipped rows), `index.ts`.

```ts
export interface CalibrationSource {
	kind: 'publication' | 'assumption';
	publisher?: string;
	title?: string;
	edition?: string;
	table?: string;
	url?: string;
	retrieved: string; // ISO date
}
export interface CalibrationRow {
	id: string;
	distribution: Record<string, number>; // category → weight; the generator reads in this order
	source: CalibrationSource;
	note?: string;
	tolerance: number; // the calibration test's allowed absolute deviation per category
	review: 'pending' | { by: string; on: string };
}
export interface CalibrationTable {
	rows: CalibrationRow[];
	row(id: string): CalibrationRow;
}
export const CALIBRATION: CalibrationTable;
```

`PackManifest.calibrations?: CalibrationTable[]` (core, additive). `checkCalibration(table)` in `pack-testkit`: every row has an id unique in the table; a `publication` source has publisher, title, edition, table and a retrieval date; an `assumption` has a note; weights are finite and positive and at least two; `tolerance` in (0, 1); categories of a row whose id names a model enum (`age-band`, `income-band`, …) match that enum exactly.

### 4.2 The generators reading rows (stage A)

`weightedRow(random, row)` in `generate/customer.ts` — `weighted(random, Object.entries(row.distribution))`. Each inline table becomes a row read by id; the conditional tables (`employment-by-age`, `income-band-by-employment`, digital confidence by age) become rows with composite categories (`'employed@25-64'`) or several rows keyed by the conditioning band, chosen in stage A for the smallest diff. **The shipped values in stage A are the values this note records; where the note says _to be typed_, stage A types them from the named table and records the arithmetic in the row's `note`.**

The identity test: `bankCase(seed)` for seeds 1…200 before and after, byte-equal, run once with a table whose weights are the _old_ inline ones — proving the seam — and then the golden traces and every desk test with the _new_ values, where cases change by design and the goldens that embed a case are regenerated with a dated note (they embed a customer, so a new age distribution changes them; the note records which).

> The identity-with-old-weights test is kept as a permanent fixture (`calibration/legacy-weights.test.ts`) so the seam itself is regression-tested, separately from the values.

### 4.3 The population (stage B)

`fs-bank/src/population/` — `population.ts`, `stream.ts`, `digest.ts`, `seeds.ts`.

- `population(seed, options)` per `64-…` §6.1.1: `size` (default 2,000 in the browser, 20,000 in the harness — the _caller_ passes it; the function's default is 2,000), `periodDays` 180, `startDate` `'2026-01-05'`, `calibration` the shipped table.
- `customerSeed(seed, k)` — a 32-bit mix of `seed` and `k` (splitmix-style, in `seeds.ts`, with a fixed-vector test), fed to `seededRandom`; the customer, accounts, complaints and bureau are generated eagerly per customer in the existing order; **transactions are lazy** (`TransactionStream`), generated per account per day from a seed derived from `(customerSeed, accountIndex, day)` so `forAccount(id, day)` is pure and `between(from, to)` is the concatenation.
- `Transaction.date` — a calendar date beside `day`, computed from `startDate + periodDays − day`; `day` keeps its meaning (days before the period's end) so nothing that reads `day` changes.
- `customerCase(pop, customerId): BankCase` — the existing shape for a desk, its transactions the customer's last 30 days materialised.
- `digest` — SHA-256 over a canonical sample: the options, the table's row ids and weights, and customers at ordinals 0, 1, 2, 3, 5, 8, … (Fibonacci to the size) rendered as canonical JSON; a stability test asserts the shipped seed's digest.
- `checkSynthetic` over a 1,000-customer sample of the population (every record kind) and every book row (WP75).

### 4.4 The bank page (stage C)

`/workshop/playground` gains two Strips: _Where this bank's shape comes from_ — a `CaseTable` over the rows (id, categories with weights, publisher · title · edition, retrieved, the review mark); and _The bank at scale_ — a seed and a size, the population's digest, and the marginals as `Matrix` rows beside the table's targets. Both on the Control Room system, no new instrument.

### 4.5 Tests

Per `65-…` WP74's DoD, in order: `checkCalibration` refusals; the legacy-weights identity; the calibration test (20,000 customers, each row's marginal within `tolerance`); customer _k_ identical across sizes; `between` equals concatenated `forAccount`; the digest asserted; the 20,000-customer generation time recorded in `65-…` §3's _Done_ note; `checkSynthetic` over the sample; `bankCase(seed)` unchanged for every existing test and golden that does not embed a case, and every one that does regenerated with its note.

## 5. Stage plan

- **Stage 0** — this note. _Done 2026-09-10; review pending._
- **Stage A** — the row, the table, `checkCalibration`, the generators on rows, the identity test, the schema. _Done 2026-09-10._ `core/schemas/calibration.ts` (`calibrationRowSchema`, `calibrationTableSchema`, `calibrationRow`; `docs/schemas/calibration.schema.json`, the ninth artefact), `PackManifest.calibrations`, `checkCalibration` in the testkit (through `checkManifest`, the table id qualified), `fs-bank/src/calibration/` — `table.ts` (`CALIBRATION`, thirty-three rows, every one `review: 'pending'`), `deck-weights.ts` (`DECK_WEIGHTS`, §6), `rows.ts` (the builders and the per-draw inversion), `legacy-digests.json` and `calibration.test.ts`. Every inline weight in the five generators is a row read by id through `weightedRow`/`rateOf`; `bankCase(seed, { calibration })` threads the table. The calibration test reads every row off 20,000 customers drawn from `CALIBRATION` (2,000 with transactions), each within its tolerance, and names the three rows no case can show; the seam test holds seeds 1…200 byte-identical to the build before the rows existed. Three findings on the way: (1) the income marginal over *all adults* is not HMRC's taxpayer curve — 36% of adults pay no income tax and sit under £15k, so the `income-band` target is the taxpayer bands scaled by 0.64 with 36 points added to the lowest, and the three conditional rows are set to meet it (the working row carries 24% under £15k); (2) the generator files every low-literacy and low-digital-confidence customer under the low-capability driver, so with the WP59 literacy and digital splits the capability marginal was 49% against FLS's 17% — literacy `low` is 6% and digital `low` 10% (between FLS's 7% not banking online and the CDI's 23%), and the capability draw is the 1.9-point residual, all stated on the rows; (3) the four groupings drawn independently put *any characteristic* at 55% against FLS's 49%, the survey's 37% overlap — the target's tolerance is 0.1 and says why.
- **Stage B** — the population, the stream, the digest, the calibration and stability tests.
- **Stage C** — the bank page's two strips; visual baselines.

## 6. Divergences from `64-…`

- `CalibrationRow.review` is not in `64-…` §6.1.2; it exists because the sprint could not wait for the review the roadmap wanted, and it makes the wait visible rather than silent.
- **Two tables, not one.** `65-…` WP74's DoD wants `bankCase(seed)` unchanged for every existing test and golden, and `64-…` §6.1.2 wants the generators to read cited rows; both hold by giving the generators a table parameter with two shipped tables — `DECK_WEIGHTS` (the WP59 weights as typed assumptions, what `bankCase` reads by default, so every deck and golden is what it was) and `CALIBRATION` (the cited rows, what `population()` reads). A deck is a designed case, not a sample. The bank page shows the cited table and names the other.
- `CalibrationRow.kind: 'weights' | 'rates' | 'target'` is not in `64-…` §6.1.2, which has one `distribution`; the generators draw two ways (a categorical pick, an independent probability) and the calibration test needs rows that are checks rather than draws (the income marginal, the driver marginals), so the kind is typed rather than implied.
- `CalibrationSource.kind: 'assumption'` is not in `64-…` either; §6.1.2 says a row "says so in `note`" where no breakdown exists. A typed kind lets `checkCalibration` demand the note and lets the page mark the row, which a free-text note cannot.
