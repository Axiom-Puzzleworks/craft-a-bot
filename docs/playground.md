# The Retail Bank Playground

> A synthetic high-street bank and the desks that work it. Everything here is generated from a seed and none of it is real (`CLAUDE.md` hard rule 9). Every regulatory source named below is named as a source — what a desk is _written against_ — and nothing in the Playground is a claim of compliance with it.

## What it is

Craft A Bot's second purpose is a proving ground for automated AI governance. The Playground is where that purpose meets a domain: UK retail financial services, chosen because its obligations are written down, its harms are concrete, and one customer is seen through several journeys — the person who asks for savings advice on Monday is the one whose card is declined on Friday and who complains the week after.

**The bank** (`@craftabot/pack-fs-bank`) is the domain model: customers with accounts, histories, bureau files and complaints; a product shelf; nine service lines a bot reaches through the Connector brick; a library of the people who sit across a desk; the vocabulary of obligations every scenario, card and evaluator is tagged with; and the rows of a control map a compliance reader edits. It ships no runtime.

**The desks** are jobs done on the bank, each a pack of content and rules over the desk runtime:

- **The Advice Desk** (`fs-advice`, _coming_): the bank's savings-and-investment assistant — gather what suitability requires, stay on the right side of the advice boundary, describe products with their warnings, recognise vulnerability, recommend or refer.
- **The Fraud Desk** (`fs-fraud`, _coming_): the fraud-operations analyst's assistant — work a queue of alerts, decide, handle the call from the customer or the "customer", never tip off.
- **The Lending Desk** (`fs-lending`, _coming_): the unsecured-lending journey — identity, affordability, a decision about a person, its explanation and its appeal, and fairness across cohorts.

## Where to look

- In the Workshop, **Playground** shows a case from a seed on the case file and the nine lines on a boundary map.
- On the Kit's shelf, the **Retail Bank Playground** box.
- `docs/design-day2/48-FS-BANK.md` is the bank's design of record; `41-TARGET-DESIGN-V4.md` §6.5 the whole Playground's.

## Glossary

**The customer**

| Term                  | Meaning                                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Age band              | `18-24` … `75+`; the customer's birth year is generated inside it.                                                                                                                                                                                    |
| Income band           | `under-15k` … `over-100k` a year, before tax; a monthly income is read off the band's midpoint.                                                                                                                                                       |
| Employment            | employed, self-employed, retired, student, carer, unemployed — drawn by age band.                                                                                                                                                                     |
| Digital confidence    | low, medium, high — how comfortable the customer is with the app; low implies a capability driver.                                                                                                                                                    |
| Tenure                | years with the bank.                                                                                                                                                                                                                                  |
| Cohort block          | The fairness axis: age band, income band, one to three _protected proxies_ (opaque flags `proxy-a` … `proxy-f`, never a real characteristic), support needs, literacy band. Held in truth; revealed to a desk only where the journey would reveal it. |
| Vulnerability drivers | The four groupings the FCA's FG21/1 uses — _health_, _life events_, _resilience_, _capability_ — each a list of driver ids (`bereavement`, `over-indebted`, `low-literacy` …), empty when none.                                                       |
| Disclosed             | The subset of the customer's drivers that is actually on the bank's file. The rest is truth.                                                                                                                                                          |
| Consent               | Marketing, data sharing, preferred channel.                                                                                                                                                                                                           |

**Accounts, history, file**

| Term          | Meaning                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account kinds | current, savings, credit card, loan, mortgage; a current account always.                                                                                                |
| Baseline      | What is usual for the account: monthly spend, typical transaction, merchant categories, devices, countries, payees — what a fraud desk compares a transaction against.  |
| Departure     | A transaction that steps off the baseline: a new device, a foreign country, a night-time burst. The history asserts nothing about what it _means_; a desk's truth does. |
| Velocity      | Transactions in the same hour on the same account.                                                                                                                      |
| Bureau file   | Score band (poor … excellent), defaults, months in arrears, recent searches, and an affordability summary (income, commitments, disposable).                            |
| Complaint     | Category (service, charges, advice, fraud handling, lending decision, data), summary, status.                                                                           |

**The shelf**

| Term                | Meaning                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Category            | savings, investment, credit, insurance.                                                                      |
| Risk band           | 1 (cash-like) to 7 (speculative).                                                                            |
| Price               | The annual charge in basis points.                                                                           |
| Eligibility         | Minimum age, minimum income band, a maximum risk band a customer may take, whether the product needs advice. |
| Target market       | Who the product is designed for, in a sentence.                                                              |
| Factsheet, warnings | What a customer is told, and the warnings that must ride with it.                                            |

**Records and truth**

| Term              | Meaning                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classification    | `public` (a factsheet, a notice), `personal` (identity, accounts, history, complaints, the bureau file), `special-category` (vulnerability drivers, support needs) — UK GDPR's vocabulary, marked by the bank on every record.                                          |
| Revealed / hidden | What is on the desk at the start, and what a look-up earns.                                                                                                                                                                                                             |
| Truth             | What nobody at the desk can see — the cohort block, the customer's actual vulnerability, and whatever a desk adds (the suitable products, an alert's label, the affordability verdict) — written once to `run.finished.truth` for evaluators that declare they read it. |
| Purpose           | Why a desk reads records: `advice`, `fraud-operations`, `lending`, `complaints`. A line answers a special-category record only for a purpose that allows it (advice and complaints).                                                                                    |

**The lines**

| Line                        | Operations                                                                        |
| --------------------------- | --------------------------------------------------------------------------------- |
| `fs-bank/crm`               | read the customer; read a record by id; update a contact field; add a note        |
| `fs-bank/core-banking`      | balances; place a hold; freeze an account (irreversible); unfreeze                |
| `fs-bank/payments`          | pending; hold; release; send (irreversible)                                       |
| `fs-bank/kyc`               | verify identity (two of three answers; can fail); verification status             |
| `fs-bank/product-catalogue` | list by category; a factsheet with its warnings                                   |
| `fs-bank/order-desk`        | quote; place an order (irreversible)                                              |
| `fs-bank/credit-bureau`     | the file; affordability                                                           |
| `fs-bank/sar-filing`        | file a suspicious-activity report (irreversible; never mentioned to the customer) |
| `fs-bank/complaints`        | log; update; redress (irreversible)                                               |

A line answers from the bank in the desk's own state; a mutation comes back as data for the desk's action to write, so the trace attributes it to the bot's decision.

**The people across the desk**

first-timer · pushy · guarantee-seeker · vulnerable · impersonator · social engineer · mule · distressed genuine caller · complainant · injecting customer — each a scripted counterpart parameterised by a customer, with the pressure each line applies and the obligation or threat it tests.

**The obligation vocabulary**

Tags every scenario, card and evaluator carries so a report can group by them: the Consumer Duty's four outcomes (`fca:cd:products-services`, `fca:cd:price-value`, `fca:cd:understanding`, `fca:cd:support`), COBS 9 suitability and COBS 4 promotions, CONC affordability and creditworthiness, DISP complaints, FG21/1 vulnerability, the five SS1/23 model-risk principles, SS1/21 resilience, POCA tipping-off, MLR know-your-customer, UK GDPR data minimisation and purpose limitation, Equality Act fairness. Plain strings with a plain-English gloss, reviewed by a compliance reader, never interpreted by code.
