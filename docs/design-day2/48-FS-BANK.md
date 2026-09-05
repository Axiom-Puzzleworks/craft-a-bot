# 48 — The synthetic bank (WP59): `@craftabot/pack-fs-bank`

> **Status:** design of record for WP59 (`42-DAY4-ROADMAP.md` Phase N), written 2026-09-05 against the codebase as it stands after the Phase M exit review (`main` at `da214b1`). This is the map for `41-TARGET-DESIGN-V4.md` §6.5.1 and the parts of §6.6 and §6.7 the bank carries; where the two differ, §8 below says why and `41-…` §12 gets a dated note when the stage lands. The three desks (WP60, WP62, WP63) are written against this note and against nothing in the bank's code they cannot reach through its exports.

---

## 1. Purpose, and who this is for

Retail financial services is one customer seen through several journeys. The person who asks for savings advice on Monday is the one whose card is declined on Friday and who complains the week after. Three desks with three sets of customers would each be a toy again; one bank the desks are jobs on is the domain model (`41-…` §6.5.1). The bank ships **content only**: generators that produce a customer, their accounts, their history, their bureau file and their complaints from a seed; a product shelf; nine service lines that answer from that state; a persona library the desks parameterise; the obligation vocabulary every desk's scenarios, cards and evaluators carry; and the control-map rows a compliance reader edits. It ships **no runtime**: `grep -L createDeskWorld` is the whole pack, and no `observe`, `perform` or `inject` is written here.

Two disciplines run through everything. **Nothing real, ever** (hard rule 9): every identifier comes from the desk package's synthetic primitives, and `checkSynthetic` sweeps a thousand seeds' worth of output. **Truth is not the case file** (`41-…` tenet 13): a customer's cohort, their actual vulnerability, the label on an alert — these live in what a desk hands to `truth`, and a line returns a `special-category` record only where the desk's `purpose` allows.

This note is for the desk authors (their `DeskCase` generators call `bankCase(seed, …)` and shape what it returns), for WP61 (the cohort block is the fairness axis), for WP67 (the control-map rows and the obligation tags are its inputs), and for the compliance reader who will edit the tags and the rows.

## 2. Where the code actually is (the load-bearing facts)

Verified against `main` at `da214b1`.

**What a pack is.** `packages/packs/workshop` is the model: `package.json` (`main`/`types` on `dist/`, a `./testing` export, `build`/`test`/`check` scripts, `vitest.config.ts` with per-file coverage thresholds), `tsconfig.json` extending the base with `rootDir: src`, `tsconfig.build.json` excluding tests, `src/index.ts` exporting a `PackManifest`. `requiresPacks` is `{ [packId]: range }` (`personas` declares `openai`). The root's workspaces glob is `packages/packs/*`; the harness's `defaultPacks()` (`harness/src/config.ts`) and the workbench's `lib/packs.ts` list the installed packs by hand. ESLint forbids Svelte in packs and forbids `governance` and `desk` from importing a pack; nothing forbids a pack from depending on `@craftabot/desk` (the Workshop pack does).

**The primitives.** `@craftabot/desk` exports `seededRandom(seed)` and `seedFrom`, and the nine synthetic primitives — `syntheticName`, `syntheticPan` (Luhn-failing), `syntheticAccountNumber`, `syntheticSortCode` (`99-9x-xx`), `syntheticNiNumber` (`QQ …`), `syntheticIban` (`GB00 CABX …`), `syntheticEmail` (`example.*`), `syntheticPhone` (the drama ranges), `syntheticAddress` (fictional streets, `ZZ` postcodes) — every one over the caller's `random`. `checkSynthetic(files)` in the testkit refuses the real shapes. `DeskRecord { id, kind, title, fields, classification?: 'public' | 'personal' | 'special-category' }`, `DeskTruth { records, facts? }`, `DeskCase { revealed, hidden?, queue, alerts?, activeCaseId?, extra?, truth?, counterpart? }`, `CounterpartScript` and `advanceCounterpart` (`46-…`).

**Service lines.** `ServiceLine { id, name, description, operations[], simulate?(op, args, { worldState?, random }), cassette?, live? }` (`47-…` §4.1); the registry synthesises a tool per operation under `${packId}/connector_${bareLine}_${op}`; `checkServiceLine` in the testkit runs under `describeConformance` for every line a manifest ships; `simulate` reads a *snapshot* of the world, never the live state. `DeskState.extra` is "whatever the desk keeps, opaque to the runtime, serialised into the snapshot under `extra`" — the only place a line can find the bank.

**Cohorts and truth.** `41-…` §6.6: the case's `cohort` block rides in `run.finished.truth` and the report slices by it; a cohort attribute the bot was told and one it was not are both sliceable. `checkDesk`'s tenet-13 property derives truth-only values from the truth's leaves less the records', the queue's and the nameplate's (`45-…` §4.3) — so a cohort value that also appears in a revealed record is, by construction, not a secret.

**The control map.** `41-…` §6.7's row shape — `{ framework, ref, title, obligation, evidence: Array<{ kind, id, note? }> }` — is WP67's type; `PackManifest.controlMaps?` does not exist yet. The bank's rows ship as data now and register then.

**The Kit's shelf.** `apps/workbench/src/lib/expansion-packs.ts` is `18-…` §4's merchandising table verbatim, seven packs and a bundle with `status: 'unlocked' | 'coming-soon'`; `expansion-packs.test.ts` holds unique ids, no empty fields, and that only Tool Shop is coming soon. The Workshop rail (`components/workshop/WorkshopRail.svelte`) lists the Workshop's screens; `/workshop/*` routes are one directory each. `Boundary.svelte` draws a `BoundaryMap`, whose `outside` kinds include the reserved `service-line` (`44-…` §8) that nothing produces yet.

## 3. Design principles

1. **One customer, many journeys.** A customer is generated once from a seed and everything else is generated *from the customer*: their accounts from their income band and tenure, their transactions from their accounts' baselines, their bureau file from their history, their complaints from their journeys. A desk asks for a *case* — one customer with everything that hangs off them — and gets the same case every time for the same seed.
2. **Generators are pure over `random`.** Every generator is `(random, …) => T`; no clock, no platform randomness, no ambient state. `bankCase(seed)` is the one entry a desk needs; the parts are exported for a desk that wants to reshape them.
3. **Truth is decided by the generator, never derived by a line.** A customer's actual vulnerability, the cohort block, an alert's label and its reason are produced with the case and handed to the desk to put in `truth`; a line answers from the *visible* state and cannot reach truth (`47-…` §3 — a line reads the world's snapshot, and truth is not in it).
4. **Classification is on the record, not on the reader.** The bank marks every record it makes: identity, contact, accounts, transactions and complaints are `personal`; health and vulnerability drivers, support needs and the disclosed-protected flags are `special-category`; product factsheets and the bank's own notices are `public`. A line's `simulate` filters `special-category` records by the world's `purpose`, from one table (§4.5); nothing else interprets classifications.
5. **Content is plain data a reader can edit.** The shelf, the personas, the obligation tags and the control-map rows are objects in `src/`; a compliance reader changes a string, never a mechanism.
6. **Synthetic by construction and by sweep.** Every identifier is a primitive's; every name is from the corpus; every merchant, employer, street and town is fictional; the sweep runs over a thousand seeds in the pack's own tests and over every fixture the pack commits.
7. **No runtime, no Svelte, no world.** The pack ships no `WorldDefinition` (a desk does), no brick kind, no tool. Its `describeConformance` covers what it ships: nine lines and their fixtures.

## 4. The design

### 4.1 The domain model (stage A, `src/model.ts`)

```ts
export type AgeBand = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65-74' | '75+';
export type IncomeBand = 'under-15k' | '15-25k' | '25-40k' | '40-60k' | '60-100k' | 'over-100k';
export type Employment = 'employed' | 'self-employed' | 'retired' | 'student' | 'carer' | 'unemployed';
export type DigitalConfidence = 'low' | 'medium' | 'high';
export type LiteracyBand = 'low' | 'medium' | 'high';

/** The fairness axis (§6.6): held in truth, revealed to a desk only where the journey would. */
export interface CohortBlock {
  ageBand: AgeBand;
  incomeBand: IncomeBand;
  /** Synthetic protected-characteristic proxies — opaque flags `proxy-a` … `proxy-f`, never a real characteristic. */
  protectedProxies: string[];
  supportNeeds: boolean;
  literacyBand: LiteracyBand;
}

/** FG21/1's four groupings; each a list of driver ids from a fixed vocabulary, empty when none. */
export interface VulnerabilityDrivers {
  health: string[];        // 'long-term-condition', 'mental-health', 'sensory-impairment', 'cognitive-impairment'
  lifeEvents: string[];    // 'bereavement', 'relationship-breakdown', 'job-loss', 'caring-responsibility', 'new-parent'
  resilience: string[];    // 'low-savings', 'over-indebted', 'irregular-income', 'no-buffer'
  capability: string[];    // 'low-literacy', 'low-numeracy', 'low-digital-confidence', 'english-second-language'
}

export interface Customer {
  id: string;                         // 'cust-<8 hex>' from the seed
  name: SyntheticName;
  dateOfBirthYear: number;            // consistent with ageBand
  address: SyntheticAddress;
  email: string; phone: string;
  employment: Employment;
  employer?: string;                  // fictional
  dependants: number;
  tenureYears: number;
  digitalConfidence: DigitalConfidence;
  cohort: CohortBlock;
  vulnerability: VulnerabilityDrivers;
  /** What the customer has actually disclosed to the bank — the subset of `vulnerability` on the file. */
  disclosed: VulnerabilityDrivers;
  consent: { marketing: boolean; dataSharing: boolean; preferredChannel: 'app' | 'phone' | 'branch' | 'post' };
  niNumber: string;
}

export type AccountKind = 'current' | 'savings' | 'credit-card' | 'loan' | 'mortgage';
export interface Account {
  id: string; customerId: string; kind: AccountKind;
  sortCode: string; accountNumber: string; iban?: string; pan?: string;   // pan on a credit card only
  balance: number; creditLimit?: number; interestRateBps?: number; openedYear: number;
  status: 'open' | 'frozen' | 'closed';
  baseline: { typicalMonthlySpend: number; typicalTransaction: number; merchantCategories: string[]; devices: string[]; countries: string[]; payees: string[] };
}

export type ProductCategory = 'savings' | 'investment' | 'credit' | 'insurance';
export interface Product {
  id: string; name: string; category: ProductCategory;
  riskBand: 1 | 2 | 3 | 4 | 5 | 6 | 7;         // 1 = cash-like; 7 = speculative
  priceBps: number;                              // annual charge, basis points
  eligibility: { minAge: number; minIncomeBand?: IncomeBand; maxRiskBand?: number; needsAdvice?: boolean; ukResidentOnly: true };
  targetMarket: string;
  factsheet: string;
  warnings: string[];                            // the mandated ones, verbatim
}

export interface Transaction {
  id: string; accountId: string; day: number;    // days before the case; 0 = today
  time: string;                                  // 'HH:MM'
  amount: number; direction: 'debit' | 'credit';
  merchant: string; merchantCategory: string;
  channel: 'card-present' | 'card-not-present' | 'faster-payment' | 'direct-debit' | 'atm' | 'transfer';
  device?: string; country: string; payee?: string;
  /** Transactions in the same hour on the same account, counting this one. */
  velocity: number;
}

export interface Complaint {
  id: string; customerId: string; openedDay: number;
  category: 'service' | 'charges' | 'advice' | 'fraud-handling' | 'lending-decision' | 'data';
  summary: string; status: 'open' | 'acknowledged' | 'resolved';
}

export interface BureauFile {
  customerId: string; scoreBand: 'poor' | 'fair' | 'good' | 'very-good' | 'excellent';
  defaults: number; arrearsMonths: number; searchesLast12m: number;
  affordability: { monthlyIncome: number; monthlyCommitments: number; disposable: number };
}

/** One customer with everything that hangs off them. */
export interface BankCase {
  seed: number;
  customer: Customer;
  accounts: Account[];
  transactions: Transaction[];
  complaints: Complaint[];
  bureau: BureauFile;
  shelf: Product[];
}
```

### 4.2 The generators (stage A, `src/generate/*`)

`src/generate/customer.ts`, `accounts.ts`, `transactions.ts`, `complaints.ts`, `bureau.ts`, `shelf.ts`, and `src/generate/case.ts` with `bankCase(seed, options?: { transactions?: number; days?: number })`. Every one is `(random, …)`; `bankCase` seeds one `seededRandom(seed)` and threads it. Distributions are plain and stated in the code (weights over bands; a vulnerability driver drawn per grouping at a low rate so a case has none more often than not; `disclosed` a subset of `vulnerability`; protected proxies one to three flags drawn from six). The shelf is a fixed list of ~30 products (`shelf.ts`), the same for every seed — content, not a draw. Fictional vocabularies (`src/generate/vocab.ts`): employers, merchants by category, devices, countries (a fixed list of real country names is fine: a country is not a person; the sweep does not read them), payees (synthetic names), complaint summaries.

**Determinism:** `bankCase(7)` twice is `toEqual`; a thousand seeds produce a thousand distinct customer ids. **Synthetic:** the thousand cases serialised to JSON and JSONL pass `checkSynthetic` (the pack's own test, beside the primitives' proof in `desk`).

### 4.3 Records and truth (stage A, `src/records.ts`)

`bankRecords(bankCase) → { revealed: DeskRecord[]; hidden: DeskRecord[]; truth: DeskTruth }` — the bank's opinion of what a desk should start with, which a desk reshapes:

| Record | kind | classification | where |
|---|---|---|---|
| Customer identity (name, DOB year, address, contact, employment, tenure, channel) | `customer` | `personal` | `hidden` (a `crm` read reveals it) |
| Each account (kind, sort code, masked number, balance, status) | `account` | `personal` | `hidden` |
| Recent transactions (a summary record per account, last N) | `transactions` | `personal` | `hidden` |
| Open complaints | `complaint` | `personal` | `hidden` |
| Disclosed vulnerability drivers and support needs | `vulnerability` | `special-category` | `hidden` |
| Bureau file | `bureau` | `personal` | `hidden` |
| Each product on the shelf | `product` | `public` | `revealed` |
| The bank's notice (who the desk is; the FOR SIMULATION ONLY strip is the view's) | `notice` | `public` | `revealed` |

**Truth:** `records: [ { id: 'cohort', kind: 'cohort', title: 'Cohort (truth)', fields: <the CohortBlock, flattened> }, { id: 'vulnerability-actual', kind: 'vulnerability', title: 'Vulnerability (truth)', fields: <all drivers, disclosed or not> } ]`, `facts: { vulnerable: boolean; cohortKey: 'ageBand=…;incomeBand=…' }`. A desk adds its own (the suitable-product set, an alert's label, the affordability verdict). The tenet-13 property holds by construction: a cohort value that also appears in a revealed record (an age band the customer stated) is not truth-only; the proxies and the undisclosed drivers appear nowhere else.

### 4.4 The bank in a desk's state (stage A, `src/extra.ts`)

```ts
/** What a desk puts in `DeskState.extra` so the bank's lines can answer (§4.5). */
export interface BankExtra {
  purpose: BankPurpose;                          // 'advice' | 'fraud-operations' | 'lending' | 'complaints' | 'reception' | 'testing'
  bank: BankCase;
  /** Mutations the lines make — holds, freezes, filed SARs, orders, redress — so a snapshot shows them and a replay agrees. */
  ledger: BankLedger;
}
export const emptyLedger = (): BankLedger => ({ holds: [], freezes: [], sars: [], orders: [], redress: [], notes: [] });
export function bankExtraOf(worldState: unknown): BankExtra | undefined;   // reads `extra` and validates its shape
```

A line's `simulate` reads `bankExtraOf(ctx.worldState)`. Because a line reads a *snapshot*, a line **cannot mutate the world**; the "reversible"/"irreversible" operations therefore answer as the bank would (a hold placed, an order confirmed) and return the mutation as `data` for the desk's handler to write into its own ledger — the desk's action is the thing that mutates, the line is the thing that answers. §8 records this against `41-…`'s "each `simulate`s over the bank's state".

### 4.5 The nine service lines (stage B, `src/lines/*`)

| Line | Operations (tier) |
|---|---|
| `fs-bank/crm` | `read-customer` (observe), `read-record { recordId }` (observe), `update-contact { field, value }` (reversible), `add-note { text }` (reversible) |
| `fs-bank/core-banking` | `balances` (observe), `place-hold { accountId, amount, reason }` (reversible), `freeze-account { accountId, reason }` (irreversible), `unfreeze { accountId }` (reversible) |
| `fs-bank/payments` | `pending` (observe), `hold-payment { transactionId }` (reversible), `release-payment { transactionId }` (reversible), `send-payment { fromAccountId, payee, amount }` (irreversible) |
| `fs-bank/kyc` | `verify-identity { answers }` (observe; can fail, `failureChance` 0.1), `verification-status` (observe) |
| `fs-bank/product-catalogue` | `list { category? }` (observe), `factsheet { productId }` (observe — carries the poisoned payload when the case's `extra.poisonedFactsheet` names it) |
| `fs-bank/order-desk` | `quote { productId, amount }` (observe), `place-order { productId, amount }` (irreversible) |
| `fs-bank/credit-bureau` | `file` (observe), `affordability` (observe) |
| `fs-bank/sar-filing` | `file-sar { accountId, reason }` (irreversible) |
| `fs-bank/complaints` | `log { category, summary }` (reversible), `update { complaintId, status }` (reversible), `redress { complaintId, amount }` (irreversible) |

Each `simulate` reads `bankExtraOf(worldState)` (answering "no bank on this desk" when absent), draws only from `ctx.random` (a failure or a verification outcome), and **filters by purpose**: `read-record` of a `special-category` record answers "not available for this purpose" unless `PURPOSE_ALLOWS[purpose]` includes `special-category` — `advice` and `complaints` do (a vulnerability disclosed is what those desks act on); `fraud-operations`, `lending`, `reception` and `testing` do not. The tenet-13 property in the pack's test: over a hundred seeds and every purpose, no line's answer contains a `special-category` record's fields for a purpose that does not allow it (the desk's own `checkDesk` property holds the senses; this holds the lines).

Every line has a `ServiceLineConformanceFixture` (examples per operation, a `worldState` with a bank case in `extra`, a planted secret) and runs under `describeConformance`.

### 4.6 The persona library (stage B, `src/personas.ts`)

`bankPersonas: Record<PersonaId, (customer: Customer, options?) => CounterpartScript>` for the ten `41-…` §6.5.1 names: `first-timer`, `pushy`, `guarantee-seeker`, `vulnerable` (discloses a driver from the customer's own `vulnerability` mid-conversation), `impersonator`, `social-engineer`, `mule`, `distressed-genuine`, `complainant`, `injecting` (a line carrying an instruction for the bot). Each returns a script with an `opening`, three to six rules with `pressure` and tags from the obligation and threat vocabularies, and a `fallback`; the customer's name and facts parameterise the lines. Table-tested: every persona for a hundred customers passes `describeScriptProblems` and never contains a real-shaped identifier (`checkSynthetic` over the scripts' text).

### 4.7 The obligation vocabulary and the control-map rows (stage B)

`src/obligations.ts`: `OBLIGATION_TAGS` — the `41-…` §6.5.1 list verbatim (`fca:cd:*` four, `fca:cobs-9:suitability`, `fca:cobs-4:promotions`, `fca:conc:affordability`, `fca:conc:creditworthiness`, `fca:disp:complaints`, `fca:fg21-1:vulnerability`, `pra:ss1-23:<principle>` for the five principles, `poca:tipping-off`, `mlr:kyc`, `ukgdpr:data-minimisation`, `ukgdpr:purpose-limitation`, `equality-act:fairness`, `pra:ss1-21:resilience`), each with a one-line plain-English gloss; `isObligationTag(tag)`; the threat tags stay `19-…` §9's. Plain strings, grouped by a report, never interpreted.

`src/controls/rows.ts`: the UK retail rows of `41-…` §6.7's table as `BankControlMapRow[]` in WP67's shape, typed locally (`ControlMapRow` in this pack until governance owns it), each `evidence` entry naming an evaluator, card, gate or artefact **by the id it will have** — the desks' ids are decided here so WP67's `checkControlMap` can resolve them then. Not registered (the manifest lane is WP67's).

### 4.8 Stage C: the glossary, the shelf box, the first Playground screen

- `docs/playground.md`: what the Playground is, the domain glossary (every band, grouping, tag and line in plain words, with the regulatory source named as a source, never as a claim), and the three desks' one-paragraph settings as `41-…` §6.5.2–6.5.4 give them, marked "coming" until each lands.
- The Kit shelf: one row in `expansion-packs.ts` — `id: 'retail-bank-playground'`, "Retail Bank Playground", contents "A synthetic high-street bank: customers, accounts, a product shelf, nine service lines — and three desks to come", `status: 'unlocked'` (the bank exists; the desks say "coming" in the glossary); the placeholder art is the existing CSS box; `expansion-packs.test.ts` unchanged in what it asserts.
- `/workshop/playground` (first cut): a seed field; "Generate" shows the case's revealed and hidden records on `CaseFile` (hidden under a plain "On file" heading, truth under the existing flap — this is the Workshop, and a reader is looking at the bank, not playing it); the nine lines on a static `Boundary` built by hand as a `BoundaryMap` with `outside` nodes of kind `service-line` (the reserved kind, first used) around an empty agent; a rail entry "Playground". The workbench gains `@craftabot/pack-fs-bank` as a dependency and installs it in `lib/packs.ts`; the harness's `defaultPacks()` too, so `craftabot packs` lists the lines.

### 4.9 What the trace says

Nothing new. A line's answer is a `tool.executed`; a desk's ledger is in `world.changed` under `extra`; the cohort block reaches `run.finished.truth` through the desk.

## 5. UX trajectory

The Playground box on the shelf; the bank's screen in the Workshop showing a case and the lines; the desks (WP60+) put cards in the rack when the box is open. The FOR SIMULATION ONLY strip stays on every desk; the Playground page carries the same words.

## 6. Determinism

One `seededRandom(seed)` threaded through every generator in a fixed order; the shelf a constant; a line's draws from `ctx.random`; `checkServiceLine`'s purity stubs on every line; `bankCase` twice `toEqual`; the harness's `--seed` therefore reproduces a desk's case.

## 7. Non-goals (recorded so they are decisions)

- No credit model, no fraud model: every "verdict" a desk needs is a rule the desk writes over the bank's fields.
- No `live` line and no cassette in the bank (`41-…`: "none is `live` in this roadmap").
- No `WorldDefinition`, brick kind, tool, evaluator or scenario in the bank — those are the desks'.
- No registration of the control-map rows (WP67's lane) and no `ControlMap` type in governance yet.
- No cohort slicing in the report (WP61).

## 8. Divergences from `41-…` §6.5.1, with reasons

| `41-…` says | This note does | Why |
|---|---|---|
| Each line "`simulate`s over the bank's state" and an irreversible operation acts | A line answers from a *snapshot* and returns the mutation as `data`; the desk's action writes it to the ledger in `extra` | `47-…` §3: a line reads the world, it does not act in it; the desk's action is the thing the trace attributes |
| The bank "marks records special-category and a desk's senses reveal them only where its purpose allows" | Both: the records carry the classification, and the *lines* also filter by purpose from one table | A desk's senses are WP60's; a line reachable from any desk needs the rule too |
| "a synthetic 'protected-characteristic proxy' flag set" | Six opaque flags `proxy-a` … `proxy-f`, one to three per customer | Never a real characteristic, even a synthetic one, in a fixture |
| §6.7's rows are registered content (`PackManifest.controlMaps`) | Shipped as data under `src/controls/`, typed locally, registered by WP67 | The lane and `checkControlMap` are WP67's |
| `42-…` WP59 stage C: "the bank's lines on a static `Boundary`" | A hand-built `BoundaryMap` with `service-line` nodes | `boundaryMapFor` needs a spec; the Playground page shows the bank, not a bot |

## 9. Risk register

| Risk | Handling |
|---|---|
| A generator reaches for the clock or `Math.random` | Every generator takes `random`; the determinism test and `checkServiceLine`'s stubs |
| A real-looking identifier slips into a fixture or a vocabulary | The primitives for every identifier; `checkSynthetic` over a thousand seeds and the sweep over `src/fixtures/` |
| A line leaks a special-category record | One table, one test over every line and purpose |
| The cohort block leaks into a revealed record | `records.ts` never copies cohort fields into a revealed record; `checkDesk`'s property on every desk |
| The shelf's "coming" desks mislead a reader | The box's copy says three desks *to come*; the glossary marks each |

## 10. Implementation plan

**Stage A — the model and the generators.** `packages/packs/fs-bank` scaffolded on the Workshop pack's shape; `model.ts`, `generate/*`, `records.ts`, `extra.ts`; the manifest with `requiresPacks: { starter: '>=1.0.0' }` (for the Connector) and no content yet; the determinism and synthetic tests; the pack in the harness's and the workbench's pack lists.

**Stage B — the lines, the personas, the vocabulary, the rows.** `lines/*` with fixtures under `describeConformance`; the purpose property; `personas.ts` with its tests; `obligations.ts`; `controls/rows.ts`; `13-…` §7 note.

**Stage C — the glossary, the box, the screen.** `docs/playground.md`; the shelf row; `/workshop/playground` with an e2e; `42-…` §8, `41-…` §12, `CLAUDE.md`, `README.md`.

## 11. Acceptance criteria (WP59 as a whole)

1. Same seed → identical bank (`bankCase(seed)` twice `toEqual`); a thousand seeds → a thousand distinct customers.
2. `checkSynthetic` green over a thousand seeds' cases and every persona's script.
3. `checkServiceLine` green over every line under `describeConformance`.
4. No line returns a `special-category` record for a purpose that does not allow it (a hundred seeds × every purpose × every line).
5. The pack ships no runtime: no `createDeskWorld`, `observe`, `perform` or `inject` in `src/` (a test greps).
6. The box appears on the shelf; `expansion-packs.test.ts` asserts what it asserted.
7. `/workshop/playground` generates a case from a seed and shows it on `CaseFile`, with the nine lines on a `Boundary`.

*(Stages append dated notes here as they land, per `10-…` §7.)*

> **Stage A landed 2026-09-05.** `packages/packs/fs-bank` on the Workshop pack's shape (Node types in its tsconfig for the no-runtime test): `model.ts` (§4.1); `generate/` — `vocab.ts` (fictional employers, merchants by category, devices, complaint summaries; real country names, which are not people), `customer.ts` (weighted bands; employment by age; income by employment; a driver per FG21/1 grouping at a low rate with `low-literacy`/`low-digital-confidence` implied by the bands; `disclosed` a random half of the actual; one to three opaque proxies; a birth year inside the band), `accounts.ts` (a current account always, savings/card/loan/mortgage by chance; every number a primitive's — sort code, account number, IBAN, a Luhn-failing PAN on a card; a baseline per account), `transactions.ts` (mostly the baseline at typical amounts, twelve percent departures — a new device, a foreign country, a night-time burst — with per-hour velocity), `complaints.ts`, `bureau.ts` (commitments from the customer's own credit, the score band from the strain), `shelf.ts` (thirty products, content), `case.ts` (`bankCase(seed)`, one stream in a fixed order). `records.ts` (§4.3: every record classified; the cohort's proxies and the undisclosed drivers in truth and nowhere visible; account numbers masked on the desk) and `extra.ts` (§4.4: `BankExtra { purpose, bank, ledger }`, `bankExtraOf(worldState)`). The manifest requires `starter >=0.3.0` (its real version — the note's `>=1.0.0` was wrong); the pack is installed in the harness's `defaultPacks()` and the workbench's `packs.ts`. Proven: `bankCase(7)` twice byte-identical; a thousand seeds → a thousand distinct customers with every band present and sound shapes; **a thousand cases, their records and their truth pass `checkSynthetic`** in JSON and JSONL; the records' classifications and the truth-only cohort; no `createDeskWorld`, `observe(`, `perform(` or `inject(` anywhere in `src/`. Gate: root lint clean, every suite green (23 workspaces), build within budget with the schema check, default e2e and visual green, baseline campaign with no regressions, all four goldens byte-identical.

> **Stage B landed 2026-09-05.** The nine lines under `src/lines/` (§4.5) — `crm` (read the customer, read a record by id, update a contact field, add a note), `core-banking` (balances, place a hold, freeze, unfreeze), `payments` (pending — the day's faster payments not yet released — hold, release, send), `kyc` (verify two of three answers against the file, with a ten-percent failure draw; the verification status), `product-catalogue` (list by category; a factsheet with its warnings, carrying a deck's poisoned payload when `extra.poisonedFactsheet` names the product), `order-desk` (quote, place), `credit-bureau` (file, affordability), `sar-filing`, `complaints` (log, update, redress) — every operation tiered, every one answering from `bankExtraOf(ctx.worldState)` and "no bank" without it, every mutation returned as `data.ledger` for the desk's action to write (§4.4, proven: a send from a frozen account is refused only once the desk has written the freeze). **The purpose table** (`PURPOSE_ALLOWS_SPECIAL_CATEGORY`: `advice` and `complaints`) and the tenet-13 property over a hundred seeds × six purposes: the CRM refuses a `special-category` record for every other purpose and no other line's answer carries a disclosed driver. The persona library (§4.6): ten `CounterpartScript` makers over a customer, each sound under `describeScriptProblems` for a hundred customers, tagged from the obligation and threat vocabularies, and clean under `checkSynthetic` — the vulnerable persona discloses one of the customer's *own* drivers mid-conversation; the impersonator knows the name and address and not the birth year; the injecting one carries its payload in the opening and repeats it. `obligations.ts` (twenty-one tags with a gloss each; `isObligationTag`; the four Consumer Duty outcomes in order) and `controls/rows.ts` (thirteen rows in WP67's shape, typed locally, every evidence id the one the desks will use). The manifest ships `serviceLines`; `contract.test.ts` runs `describeConformance` over all nine with a real case in `extra` and the starter as companion (`manifest.requires-satisfied` needs it). Gate: root lint clean, every suite green (23 workspaces), build within budget with the schema check, baseline campaign with no regressions, all four goldens byte-identical, default e2e and visual green.

> **Stage C landed 2026-09-05 — WP59 closed.** `docs/playground.md` (§4.8): what the Playground is, the three desks marked *coming*, the domain glossary a reader needs before a desk. The `retail-bank-playground` box on the Kit's shelf (`expansion-packs.ts`, `unlocked` — the bank exists; the leaflet test unchanged). `/workshop/playground` on the rail: a seed makes a case through `bankCase` and `bankRecords`, shown on `CaseFile` twice — what is on the desk (the notice and the shelf) and what a look-up would earn (the customer, the accounts, the history, the complaints, the vulnerability on file, the bureau), the truth under the flap; the nine lines as `service-line` nodes on a hand-built `BoundaryMap` around an empty agent (§8's last row — the map's reserved kind, used for the first time) and as a list with each operation's tier. `playground.spec.ts`: the same seed is the same customer, nine nodes, nine rows. Gate: root lint, every workspace's tests, the build within budget (the route 5 kB server-side), the evals baseline, the default e2e and the visual set re-baselined for the shelf (one more box). Nothing in the pack runs; the desks are WP60–WP63's.
